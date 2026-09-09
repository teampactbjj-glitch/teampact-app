// Supabase Edge Function — CallBackUrl שמקבל את תוצאת החיוב מ-Invoice4u.
//
// ✅ 06.09.2026 — נבדק סוף-סוף חי עם דודי (2 סבבי 1₪ מלאים) — הפורמט האמיתי של ה-CallBackUrl:
// ה-body הגולמ המלא הוא המחרוזת הטקסט המילולית (לא JSON תקין, לא form-urlencoded תקן):
//   Data={"Success":"True","OrderIdClientUsage":"subscription:xxx","Amount":"1","CustomerId":"...",
//         "PaymentId":"...","DocCreated":"True"/"False","DocumentId":"<guid>","DocumentNumber":"...",
//         "ErrorMessage":"","CustomerName":"...","CustomerMail":"...", ...}
// — כל הערכים מגיעים כ-string (גם מספרים ובוליאנים), אין עטיפת "d"/"...Result" כאן.
// Invoice4u שולחים את ה-callback הזה **פעמיים** עבור כל תשלום: פעם ראשונה מיד עם
// DocCreated:"False" (המסמך עדיין בהפקה), ופעם שנייה מעט אחר-כך עם DocCreated:"True" +
// DocumentId/DocumentNumber. העדכון שלנו אידמפוטנטי (UPDATE) כך שצניעת שתי הקריאות בסדר נותנת
// עדכון סופי נכון. אין שדה DocumentUrl בפורמט הזה בכלל — נשאר ריק, אבל החשבונית
// נשלחת במייל ישירות על ידי Invoice4u עצמם (אומת חי, ראה CustomerMail).
//
// המזהה (orderId) מגיע גם מ-query param על ה-URL עצמו (שלחנו אותו ב-invoice4u-create-payment-link)
// וגם מ-OrderIdClientUsage ב-body — השני אמור להתאים, אבל שומרים שניהם כגיבוי משנה.
//
// ✅ v9 (06.09.2026): נוסף חישוב יחסי (פרו-רייטה) לחודש ההרשמה — בדיוק כמו שהוסף ב-
// RegisterPage.jsx (מי שנרשם באמצע החודש משלם רק על הימים שנותרו עד סופו). expectedTotal
// כאן חייב להתחשב באותו יחס, אחרת כל הרשמה שלא בדיוק ב-1 לחודש הייתה נופלת סתם ל"ממתין
// לבדיקה ידני" (הסכום המשולם, שהוא כבר יחסי, לא היה תואם למחיר המלא מהמחירון). הנוסחה זהה
// בדיוק (אותו סדר פעולות חשבוני) לזו שבצד הלקוח, כדי שהעיגול יצא זהה.
//
// ✅ v10 (07.09.2026): נוספה התראת Push למנהלים כשמתקבל תשלום בפועל על אימון ניסיון —
// בדיוק כמו הבקשה של דודי: "אין טעם בהתראה על מי שלא שילם" — לכן ההתראה נשלחת רק כאן,
// ברגע שה-Success=True התקבל, ולא בשליחת הטופס. שומרים על idempotency (הכפילות הידועה
// של קריאות ה-callback מ-Invoice4u) ע"י בדיקת payment_status הקודם — נשלחת פעם אחת בלבד,
// גם אם ה-callback מגיע פעמיים לאותו תשלום.
//
// ✅ v11 (09.09.2026) — תיקון באג + תמיכה במתאמן קיים שמצטרף/משלם לקאנטרי דרך "הגדרות":
//  1. באג שתוקן: מחיר האימות (expectedTotal) חושב עד כה לפי branch_subscription_prices של
//     row.branch_id — אבל invoice4u הוא תמיד ורק קאנטרי (אין מסלול אחר שמשתמש בו בכלל),
//     בעוד ש-row.branch_id יכול להיות כל סניף (הבית הראשי של המתאמן, למשל בגין). מעכשיו
//     המחיר תמיד נבדק מול מחירון סניף הקאנטרי (branches.requires_facility_waiver=true),
//     בלי קשר ל-branch_id הראשי של המתאמן.
//  2. orderId יכול עכשיו להגיע גם בפורמט "subscription:<ref>:<subscription_type>" — המקטע
//     השלישי (targetSubType) מגיע רק ממסך "הצטרפות לקאנטרי" של מתאמן קיים ומחובר
//     (AthleteDashboard.jsx → join_country_start RPC → invoice4u-create-payment-link עם
//     target_subscription_type). הרשמה חדשה רגילה (RegisterPage.jsx) לא שולחת את זה בכלל,
//     ו-orderId שם נשאר בדיוק כמו היום (type:reference_id) — ההתנהגות שם לא משתנה.
//  3. כש-targetSubType קיים והתשלום תואם בדיוק למחירון (amountMatches) — ורק אז — מעדכנים
//     בפועל את subscription_type/membership_type, מוסיפים את סניף הקאנטרי ל-branch_ids
//     (בלי לגעת בסניפים קיימים אחרים כמו בגין/ת"א), ומחזירים membership_status ל-'active'
//     (+ מנקים cancel_date אם היה) — כדי שהחיוב החודשי האוטומטי (invoice4u-charge-monthly)
//     יתפוס אותם מהחודש הבא. אם הסכום לא תואם בדיוק — לא נוגעים בכלום מהשדות האלה, ונשאר
//     למצב "ממתין לבדיקה ידנית" הרגיל (בדיוק כמו כל אי-התאמת סכום אחרת).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseInvoice4uBody(rawText: string): Record<string, unknown> {
  if (!rawText) return {}
  let text = rawText
  const idx = text.indexOf('Data=')
  if (idx !== -1) text = text.slice(idx + 'Data='.length)
  text = text.trim()
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(decodeURIComponent(text))
    } catch {
      return {}
    }
  }
}

function toBool(v: unknown): boolean {
  return v === true || v === 'True' || v === 'true'
}

// זהה בדיוק ל-computeProration ב-RegisterPage.jsx (ולחישוב המקביל ב-AthleteDashboard.jsx).
function computeProrationFactor(now = new Date()): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const remainingDays = daysInMonth - now.getDate() + 1
  return remainingDays / daysInMonth
}

async function notifyAdminsTrialPaid(admin: ReturnType<typeof createClient>, visitorName: string, branchName: string, amount: number, refId: string) {
  try {
    const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true)
    const adminIds = (admins || []).map((a: { id: string }) => a.id)
    if (!adminIds.length) return
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subj = Deno.env.get('VAPID_SUBJECT') || 'mailto:teampactbjj@gmail.com'
    if (!pub || !priv) {
      console.error('invoice4u-callback: VAPID keys missing — לא ניתן לשלוח התראת תשלום ניסיון')
      return
    }
    webpush.setVapidDetails(subj, pub, priv)
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', adminIds)
    const payload = JSON.stringify({
      title: '💰 שולם אימון ניסיון',
      body: `${visitorName || 'מתאמן'}${branchName ? ' — ' + branchName : ''} (${amount}₪)`,
      url: '/#reports',
      tag: `trial-paid:${refId}`,
      icon: '/icons/icon-192.png',
    })
    await Promise.allSettled((subs || []).map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60, urgency: 'high' })
    ))
  } catch (notifyErr) {
    console.error('invoice4u-callback: שליחת התראת תשלום ניסיון נכשלה:', notifyErr)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const orderIdFromQuery = url.searchParams.get('orderId')

    const rawText = await req.text()
    console.log('invoice4u-callback raw body:', rawText || '(ריק)')

    const body = parseInvoice4uBody(rawText)

    const success = toBool(body.Success)
    const errorMessage = (body.ErrorMessage as string) || null
    const orderId = orderIdFromQuery || (body.OrderIdClientUsage as string) || null
    const paidAmount = body.Amount != null ? Number(body.Amount) : null
    const paymentId = (body.PaymentId as string) || null
    const docCreated = toBool(body.DocCreated)
    const docId = docCreated ? ((body.DocumentId as string) || null) : null
    const docNumber = docCreated ? ((body.DocumentNumber as string) || null) : null

    if (!success) {
      console.error('invoice4u-callback: הגיע עם Success=False:', errorMessage)
      return new Response(JSON.stringify({ ok: false, note: 'תשלום לא הצליח אצל Invoice4u, לא עודכן כלום', errorMessage }), { headers: corsHeaders })
    }

    if (!orderId) {
      console.error('invoice4u-callback: אין orderId לא ב-query ולא ב-body')
      return new Response(JSON.stringify({ error: 'אין orderId' }), { status: 400, headers: corsHeaders })
    }

    if (paidAmount == null || Number.isNaN(paidAmount)) {
      console.error('invoice4u-callback: Amount לא תקין ב-body:', JSON.stringify(body))
      return new Response(JSON.stringify({ error: 'Amount חסר/לא תקין' }), { status: 400, headers: corsHeaders })
    }

    // orderId: "type:refId" (מסלול רגיל) או "type:refId:targetSubType" (הצטרפות עצמאית
    // לקאנטרי דרך AthleteDashboard.jsx — ראו v11 בהערת הראש).
    const orderParts = String(orderId).split(':')
    const refType = orderParts[0] || null
    const refId = orderParts[1] || null
    const targetSubType = orderParts[2] || null
    if (!refType || !refId) {
      return new Response(JSON.stringify({ error: 'orderId לא בפורמט type:id' }), { status: 400, headers: corsHeaders })
    }

    const supabaseUrl = 'https://pnicoluujpidguvniwub.supabase.co'
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY לא מוגדר' }), { status: 500, headers: corsHeaders })
    }
    const admin = createClient(supabaseUrl, serviceKey)

    if (refType === 'trial') {
      const { data: existingRow, error: fetchErr } = await admin
        .from('trial_visits')
        .select('id, visitor_name, branch_id, payment_status')
        .eq('id', refId)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      const wasAlreadyPaid = existingRow?.payment_status === 'paid'

      const patch: Record<string, unknown> = {
        payment_status: 'paid',
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
        invoice4u_payment_id: paymentId,
      }
      if (docId) patch.invoice4u_doc_id = docId
      const { error } = await admin.from('trial_visits').update(patch).eq('id', refId)
      if (error) throw error

      if (!wasAlreadyPaid) {
        let branchName = ''
        if (existingRow?.branch_id) {
          const { data: branchRow } = await admin.from('branches').select('name').eq('id', existingRow.branch_id).maybeSingle()
          branchName = branchRow?.name || ''
        }
        await notifyAdminsTrialPaid(admin, existingRow?.visitor_name || '', branchName, paidAmount, refId)
      }

      return new Response(JSON.stringify({ ok: true, type: 'trial', docCreated, docNumber }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (refType === 'subscription') {
      const { data: rows, error: fetchErr } = await admin
        .from('members')
        .select('id, branch_id, branch_ids, subscription_type, wants_discount, status, membership_status, cancel_date')
        .eq('registration_payment_ref', refId)
      if (fetchErr) throw fetchErr
      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ error: `לא נמצאו רשומות members עם registration_payment_ref=${refId}` }), { status: 404, headers: corsHeaders })
      }

      const { data: ccBranchRow } = await admin.from('branches').select('id').eq('requires_facility_waiver', true).limit(1).maybeSingle()
      const countryBranchId = ccBranchRow?.id || null

      const prorationFactor = computeProrationFactor()
      let expectedTotal = 0
      let anyDiscount = false
      for (const row of rows) {
        if (row.wants_discount) anyDiscount = true
        const effSubType = targetSubType || row.subscription_type
        const { data: priceRow } = await admin
          .from('branch_subscription_prices')
          .select('price')
          .eq('branch_id', countryBranchId || row.branch_id)
          .eq('subscription_type', effSubType)
          .maybeSingle()
        const basePrice = priceRow?.price || 0
        expectedTotal += Math.round(basePrice * prorationFactor)
      }

      const amountMatches = expectedTotal > 0 && paidAmount === expectedTotal
      const alreadyApproved = rows.some((row) => row.status === 'approved' || row.status === 'active')
      const shouldAutoApprove = amountMatches && !anyDiscount

      const patch: Record<string, unknown> = {
        payment_status: 'paid',
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
        invoice4u_last_payment_id: paymentId,
        invoice4u_last_charge_at: new Date().toISOString(),
        invoice4u_last_charge_status: 'success',
        invoice4u_token_status: 'active',
      }
      if (docId) patch.invoice4u_doc_id = docId
      if (shouldAutoApprove && !alreadyApproved) {
        patch.status = 'approved'
        patch.active = true
        patch.auto_approved = true
      }

      const { error: updErr } = await admin.from('members').update(patch).eq('registration_payment_ref', refId)
      if (updErr) throw updErr

      let joinCountryApplied = false
      if (targetSubType && amountMatches && countryBranchId) {
        joinCountryApplied = true
        for (const row of rows) {
          const currentIds = Array.isArray(row.branch_ids) && row.branch_ids.length
            ? row.branch_ids
            : (row.branch_id ? [row.branch_id] : [])
          const mergedIds = Array.from(new Set([...currentIds, countryBranchId]))
          const memberPatch: Record<string, unknown> = {
            branch_ids: mergedIds,
            subscription_type: targetSubType,
            membership_type: targetSubType,
          }
          if (row.membership_status !== 'active') {
            memberPatch.membership_status = 'active'
            memberPatch.cancel_date = null
          }
          const { error: joinErr } = await admin.from('members').update(memberPatch).eq('id', row.id)
          if (joinErr) console.error(`invoice4u-callback: כשל בעדכון join-country עבור member ${row.id}:`, joinErr)
        }
      }

      return new Response(JSON.stringify({
        ok: true, type: 'subscription', expectedTotal, paidAmount, prorationFactor, autoApproved: shouldAutoApprove, joinCountryApplied, docCreated, docNumber,
        note: shouldAutoApprove ? 'אושר אוטומטית' : (anyDiscount ? 'נדרשת בקשת הנחה — ממתין לאישור ידני' : 'הסכום לא תואם למחירון (יחסי) — ממתין לבדיקה ידני'),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: `סוג reference לא מוכר: ${refType}` }), { status: 400, headers: corsHeaders })
  } catch (e) {
    console.error('invoice4u-callback error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
