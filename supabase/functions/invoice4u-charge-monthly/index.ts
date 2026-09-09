// Supabase Edge Function — חיוב חודשי אמיתי לכל מתאמן פעיל בסניף קאונטרי עם טוקן
// שמור ב-Invoice4u (invoice4u_token_status='active'), דרך ChargeWithToken.
// מפועל על ידי pg_cron+pg_net (ראו מיגרציית schedule_invoice4u_monthly_charge) — לא אמור
// לקרוא ידנית בלי הסוד x-cron-secret הנכון.
//
// פשטות מכוונת (v1, מסוכם עם דודי): חיוב פעם בחודש לכל מתאמן שלא חויב עדיין
// בחודש הנוכחי (לפי invoice4u_last_charge_at) — לא חיוב לפי תאריך הרשמה המדויק של כל מתאמן.
// אם דודי ירצה חיוב לפי תאריך הרשמה המדויק (anniversary billing) — זה שיפור נפרד לעתיד.
//
// v3 (06.09.2026):
//  - תוקן באג קריטי (לא היה ידוע קודם, לא נבדק חי כי ה-cron עוד לא רץ בפועל): התשובה
//    האמיתית של Invoice4u ל-ProcessApiRequestV2 עטופה ב-{"d": {...}} (מוסכמת ASP.NET/WCF
//    ישנה) בדיוק כמו שגילינו ב-invoice4u-create-payment-link. הקוד הישן קרא ל-
//    data?.ProcessApiRequestV2Result ישירות בלי unwrap — מה שהיה גורם לכל חיוב חודשי
//    *מוצלח* להירשם כ"נכשל" (result תמיד undefined). נוסף אותו unwrap() בדיוק כמו בפונקציה
//    השנייה.
//  - נוספה התראת Push לכל המנהלים (profiles.is_admin=true) אם היה חיוב שנכשל בפועל בריצה
//    הזו — כדי שדודי ידע מיד ולא רק אם יבדוק ידנית.
//
// v4 (08.09.2026) — חיוב יחסי (pro-rata) לביטולי מנוי באמצע מחזור:
//  - הבעיה שתוקנה: חבר מבטל מנוי (self_cancel_membership) → cancel_date = היום+חודש.
//    ה-cron של האכיפה (enforce_membership_cancellations, 01:00 כל יום) מבטל בפועל
//    (membership_status='cancelled') רק כש-cancel_date <= היום. אבל חיוב החודשי הזה
//    רץ בתאריך קבוע — ה-1 לחודש — בלי קשר ל-cancel_date הספציפי של כל חבר. אם cancel_date
//    נופל *בתוך* החודש שעליו מחייבים (למשל ביטול ב-8.9 → cancel_date 8.10 → החיוב של
//    ה-1.10 עדיין תופס אותו כ-active וגובה חודש מלא, כשבפועל השירות מסתיים ב-8.10)
//    החבר משלם על ימים שהוא לא יקבל בהם שירות.
//  - הפתרון: אם ל-member יש cancel_date שנופל בתוך החודש שמחייבים עליו כרגע (בין 1
//    לחודש לבין סוף החודש), מחייבים רק חלק יחסי — לפי מספר הימים מתחילת החודש ועד
//    (וכולל) יום הביטול, חלקי מספר הימים בחודש. זה החיוב האחרון שלו — אחרי
//    cancel_date ה-enforce cron יהפוך אותו ל-cancelled וה-query כאן כבר לא יבחר אותו
//    בחודש הבא (מסונן ל-membership_status='active').
//  - הגנה: אם cancel_date כבר עבר (לפני תחילת החודש הנוכחי) ועדיין 'active' — מצב תיאורטי
//    שאמור היה להיתפס ע"י ה-enforce cron קודם — לא מחייבים בכלל, מסמנים skipped.
//
// v5 (09.09.2026) — זכאות + מחיר מודעים ל-branch_ids (לא רק branch_id הראשי):
//  - הבעיה שתוקנה: השאילתה בדקה זכאות ומחיר רק לפי branch_id (הסניף הראשי/היחיד). מתאמן
//    שה"בית" שלו נשאר סניף אחר (למשל בגין) אבל הצטרף/משלם בנוסף לקאנטרי (קאנטרי נמצא לו
//    ב-branch_ids, לא ב-branch_id) — לא היה נתפס בכלל בחיוב החודשי, למרות שיש לו טוקן
//    תשלום פעיל! עכשיו הזכאות בודקת branch_id==קאנטרי *או* קאנטרי בתוך branch_ids.
//  - המחיר גם הוא — בדיוק כמו התיקון המקביל ב-invoice4u-callback — נבדק תמיד מול מחירון
//    סניף הקאנטרי הספציפי (לא m.branch_id, שיכול להיות סניף אחר לגמרי).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const BASE_URL = 'https://api.invoice4u.co.il/Services/ApiService.svc'

function effectiveAmount(basePrice: number, discountPct: number | null, discountValidUntil: string | null, customPrice: number | null): number {
  if (customPrice != null) return customPrice
  const today = new Date().toISOString().slice(0, 10)
  const discountActive = discountPct && discountPct > 0 && (!discountValidUntil || discountValidUntil >= today)
  if (discountActive) return Math.round(basePrice * (1 - (discountPct as number) / 100))
  return basePrice
}

function unwrap(data: unknown, namedKey?: string): Record<string, unknown> | null {
  const d = data as Record<string, unknown> | null | undefined
  if (!d || typeof d !== 'object') return null
  if (namedKey && d[namedKey] && typeof d[namedKey] === 'object') return d[namedKey] as Record<string, unknown>
  if (d.d && typeof d.d === 'object') return d.d as Record<string, unknown>
  return d
}

function computeChargeAmount(
  fullAmount: number,
  cancelDateStr: string | null,
  monthStart: Date,
): { amount: number; isProrated: boolean } | null {
  if (!cancelDateStr) return { amount: fullAmount, isProrated: false }

  const cancelDate = new Date(`${cancelDateStr}T00:00:00Z`)
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))

  if (cancelDate < monthStart) {
    return null
  }

  if (cancelDate >= nextMonthStart) {
    return { amount: fullAmount, isProrated: false }
  }

  const daysInPeriod = Math.round((nextMonthStart.getTime() - monthStart.getTime()) / 86400000)
  const rawDaysUsed = Math.round((cancelDate.getTime() - monthStart.getTime()) / 86400000) + 1
  const daysUsed = Math.max(0, Math.min(rawDaysUsed, daysInPeriod))
  if (daysUsed <= 0) return null

  const amount = Math.round((fullAmount * daysUsed) / daysInPeriod)
  return { amount, isProrated: true }
}

serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('CRON_SECRET')
    const gotSecret = req.headers.get('x-cron-secret')
    if (!cronSecret || gotSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }

    const apiKey = Deno.env.get('INVOICE4U_API_KEY')
    const supabaseUrl = 'https://pnicoluujpidguvniwub.supabase.co'
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey || !serviceKey) {
      return new Response(JSON.stringify({ error: 'INVOICE4U_API_KEY או SUPABASE_SERVICE_ROLE_KEY לא מוגדרים' }), { status: 500 })
    }
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: ccBranches, error: brErr } = await admin.from('branches').select('id').eq('requires_facility_waiver', true)
    if (brErr) throw brErr
    const branchIds = (ccBranches || []).map((b: { id: string }) => b.id)
    if (branchIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, charged: 0, failed: 0, skipped: 0, note: 'אין סניף קאונטרי מסומן (requires_facility_waiver)' }))
    }
    const countryBranchId = branchIds[0]

    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const orFilter = branchIds
      .map((id: string) => `branch_id.eq.${id}`)
      .concat(branchIds.map((id: string) => `branch_ids.cs.{${id}}`))
      .join(',')

    const { data: members, error: memErr } = await admin
      .from('members')
      .select('id, full_name, branch_id, branch_ids, subscription_type, custom_price, discount_pct, discount_valid_until, invoice4u_customer_id, invoice4u_token_status, invoice4u_last_charge_at, cancel_date')
      .or(orFilter)
      .eq('active', true)
      .eq('membership_status', 'active')
      .eq('status', 'approved')
      .eq('invoice4u_token_status', 'active')
      .not('invoice4u_customer_id', 'is', null)

    if (memErr) throw memErr

    const results: Array<Record<string, unknown>> = []
    let charged = 0, failed = 0, skipped = 0
    const failedNames: string[] = []

    for (const m of members || []) {
      if (m.invoice4u_last_charge_at && new Date(m.invoice4u_last_charge_at) >= monthStart) {
        skipped++
        results.push({ id: m.id, name: m.full_name, result: 'skipped_already_charged_this_month' })
        continue
      }

      const { data: priceRow } = await admin
        .from('branch_subscription_prices')
        .select('price')
        .eq('branch_id', countryBranchId)
        .eq('subscription_type', m.subscription_type)
        .maybeSingle()
      const basePrice = priceRow?.price
      if (basePrice == null && m.custom_price == null) {
        skipped++
        results.push({ id: m.id, name: m.full_name, result: 'skipped_no_price_found' })
        continue
      }

      const fullAmount = effectiveAmount(basePrice || 0, m.discount_pct, m.discount_valid_until, m.custom_price)
      const charge = computeChargeAmount(fullAmount, m.cancel_date ?? null, monthStart)
      if (!charge) {
        skipped++
        results.push({ id: m.id, name: m.full_name, result: 'skipped_cancel_date_already_passed', cancel_date: m.cancel_date })
        continue
      }
      const { amount, isProrated } = charge

      const monthLabel = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
      const description = isProrated
        ? `מנוי חודשי (חיוב יחסי לקראת ביטול, עד ${m.cancel_date}) — ${monthLabel}`
        : `מנוי חודשי — ${monthLabel}`

      try {
        const r = await fetch(`${BASE_URL}/ProcessApiRequestV2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request: {
              Invoice4UUserApiKey: apiKey,
              ChargeWithToken: true,
              CustomerId: m.invoice4u_customer_id,
              Sum: amount,
              Currency: 'NIS',
              Description: description,
              IsDocCreate: true,
              DocHeadline: description,
            },
          }),
        })
        const data = await r.json()
        const result = unwrap(data, 'ProcessApiRequestV2Result')
        const hasErrors = Array.isArray(result?.Errors) && (result!.Errors as unknown[]).length > 0

        if (!r.ok || !result || hasErrors) {
          failed++
          failedNames.push(String(m.full_name || m.id))
          await admin.from('members').update({
            invoice4u_last_charge_at: new Date().toISOString(),
            invoice4u_last_charge_status: 'failed',
          }).eq('id', m.id)
          results.push({ id: m.id, name: m.full_name, amount, isProrated, result: 'failed', details: result?.Errors || data })
          console.error(`invoice4u-charge-monthly: כישלון עבור ${m.full_name} (${m.id}):`, JSON.stringify(data))
          continue
        }

        charged++
        await admin.from('members').update({
          invoice4u_last_charge_at: new Date().toISOString(),
          invoice4u_last_charge_status: 'success',
          invoice4u_last_payment_id: (result as Record<string, unknown>).PaymentId || null,
          invoice4u_doc_id: (result as Record<string, unknown>).DocumentId || null,
        }).eq('id', m.id)
        results.push({ id: m.id, name: m.full_name, amount, isProrated, result: 'success', paymentId: (result as Record<string, unknown>).PaymentId })
      } catch (chargeErr) {
        failed++
        failedNames.push(String(m.full_name || m.id))
        results.push({ id: m.id, name: m.full_name, amount, isProrated, result: 'error', details: String(chargeErr) })
        console.error(`invoice4u-charge-monthly: חריגה עבור ${m.full_name} (${m.id}):`, chargeErr)
      }
    }

    if (failed > 0) {
      try {
        const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true)
        const adminIds = (admins || []).map((a: { id: string }) => a.id)
        if (adminIds.length) {
          const pub = Deno.env.get('VAPID_PUBLIC_KEY')
          const priv = Deno.env.get('VAPID_PRIVATE_KEY')
          const subj = Deno.env.get('VAPID_SUBJECT') || 'mailto:teampactbjj@gmail.com'
          if (pub && priv) {
            webpush.setVapidDetails(subj, pub, priv)
            const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', adminIds)
            const namesPreview = failedNames.slice(0, 5).join(', ') + (failedNames.length > 5 ? ` ועוד ${failedNames.length - 5}` : '')
            const payload = JSON.stringify({
              title: `⚠️ נכשלו ${failed} חיובים חודשיים`,
              body: `${namesPreview} — לא חויבו החודש (כרטיס/מסגרת אשראי כנראה). בדוק בדוח ההתאמה החודשית.`,
              url: '/#reports',
              tag: 'invoice4u-charge-failed',
              icon: '/icons/icon-192.png',
            })
            await Promise.allSettled((subs || []).map((s: { endpoint: string; p256dh: string; auth: string }) =>
              webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60, urgency: 'high' })
            ))
          } else {
            console.error('invoice4u-charge-monthly: VAPID keys missing — לא ניתן לשלוח התראת כישלון')
          }
        }
      } catch (notifyErr) {
        console.error('invoice4u-charge-monthly: שליחת התראת כישלון נכשלה:', notifyErr)
      }
    }

    return new Response(JSON.stringify({ ok: true, charged, failed, skipped, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('invoice4u-charge-monthly error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
