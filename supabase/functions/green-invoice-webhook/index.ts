// Supabase Edge Function — webhook שמקבל אישור תשלום מחשבונית ירוקה (Green Invoice)
// ומבצע אישור אוטומטי של הרשמה למנוי (חולון קאנטרי) כשהסכום ששולם תואם בדיוק
// למחיר האפקטיבי (custom_price ?? מחירון הסניף, אחרי discount_pct אם קיים —
// כמו SalaryReport.jsx getEffectivePrice), ואין בקשת הנחה עצמאית (wants_discount).
// אימון ניסיון מסומן כ"שולם".
//
// ⚠️ מבנה ה-payload של ה-webhook ואופן האימות (חתימה/סוד משותף) *לא אומתו בפועל* —
// כלל הברזל של הפרויקט (CLAUDE.md) אוסר לסמוך על ניחוש מהתיעוד בלבד. לפני הפעלה
// בפרודקשן: להירשם ל-webhook אמיתי ב-Sandbox של חשבונית ירוקה, לשלוח תשלום בדיקה,
// ולהדפיס את ה-payload בפועל (console.log(JSON.stringify(body))) כדי לוודא שהשדות
// למטה (reference, amount, id, url) באמת קיימים בשמות האלה.
//
// הגדרת secrets (בנוסף לאלו של green-invoice-create-payment-link):
//   supabase secrets set GREEN_INVOICE_WEBHOOK_SECRET=...   (אם חשבונית ירוקה תומכת בחתימת webhook)
//   supabase secrets set SUPABASE_URL=...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (מפתח service role — עוקף RLS, לא לחשוף בצד לקוח!)
//   supabase secrets set TRIAL_PRICE=50

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    console.log('green-invoice-webhook payload:', JSON.stringify(body))

    // ⚠️ שדות משוערים — לאמת מול payload אמיתי מ-Sandbox.
    const reference: string | undefined = body?.reference || body?.data?.reference
    const paidAmount: number | undefined = body?.amount ?? body?.data?.amount
    const docId: string | undefined = body?.documentId || body?.id
    const docUrl: string | undefined = body?.documentUrl || body?.url

    if (!reference || paidAmount == null) {
      return new Response(JSON.stringify({ error: 'webhook payload חסר reference/amount — ראה לוגים' }), { status: 400, headers: corsHeaders })
    }

    const [refType, refId] = reference.split(':')
    if (!refType || !refId) {
      return new Response(JSON.stringify({ error: 'reference לא בפורמט type:id' }), { status: 400, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY לא מוגדרים' }), { status: 500, headers: corsHeaders })
    }
    const admin = createClient(supabaseUrl, serviceKey)

    if (refType === 'trial') {
      const { error } = await admin.from('trial_visits').update({
        payment_status: 'paid',
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
        green_invoice_doc_id: docId || null,
        green_invoice_doc_url: docUrl || null,
      }).eq('id', refId)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, type: 'trial' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (refType === 'subscription') {
      // ✅ 06.08.2026 — תוקן: המחיר הצפוי מחושב עכשיו לפי "מחיר אפקטיבי" (כמו
      // SalaryReport.jsx getEffectivePrice), לא לפי מחיר מלא בלבד. זה נדרש כדי
      // שתשלומים שנוצרו דרך כלי "לינק תשלום עם הנחה" (CustomDiscountLink.jsx —
      // מנהל בלבד, discount_pct/custom_price כבר נקבעו מראש ע"י דודי) יאושרו
      // אוטומטית כשמשולם הסכום המוזל הנכון, בלי לדרוש אישור ידני נוסף.
      // נוסחה: base = custom_price ?? branch_subscription_prices[branch][type] ?? DEFAULT
      //        effective = base × (1 − discount_pct/100)
      // refId = registration_payment_ref — עשוי לקבץ כמה שורות members (הורה + כמה ילדים)
      const { data: rows, error: fetchErr } = await admin
        .from('members')
        .select('id, branch_id, subscription_type, wants_discount, discount_pct, discount_valid_until, custom_price, status')
        .eq('registration_payment_ref', refId)
      if (fetchErr) throw fetchErr
      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ error: `לא נמצאו רשומות members עם registration_payment_ref=${refId}` }), { status: 404, headers: corsHeaders })
      }

      const DEFAULT_SUB_PRICE: Record<string, number> = {
        '1x_week': 200, '2x_week': 365, '4x_week': 500, 'unlimited': 600,
      }

      // מחשבים את הסכום הצפוי (אפקטיבי, אחרי הנחה אם יש) לכל שורה, ומסכמים
      let expectedTotal = 0
      let anyDiscount = false
      for (const row of rows) {
        if (row.wants_discount) anyDiscount = true

        let base: number
        if (row.custom_price != null) {
          base = row.custom_price
        } else {
          const { data: priceRow } = await admin
            .from('branch_subscription_prices')
            .select('price')
            .eq('branch_id', row.branch_id)
            .eq('subscription_type', row.subscription_type)
            .maybeSingle()
          base = priceRow?.price ?? DEFAULT_SUB_PRICE[row.subscription_type] ?? 0
        }

        // ✅ 06.08.2026 — הנחה עם תוקף: אם discount_valid_until קיים ועבר, ההנחה
        // מתבטלת אוטומטית (מחיר מלא) — תואם ל-isDiscountExpired ב-SalaryReport.jsx.
        const today = new Date().toISOString().slice(0, 10)
        const discExpired = row.discount_valid_until && row.discount_valid_until < today
        const discPct = discExpired ? 0 : (row.discount_pct || 0)
        expectedTotal += Math.round(base * (1 - discPct / 100))
      }

      const amountMatches = expectedTotal > 0 && paidAmount === expectedTotal
      const shouldAutoApprove = amountMatches && !anyDiscount

      const patch: Record<string, unknown> = {
        payment_status: 'paid',
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
        green_invoice_doc_id: docId || null,
        green_invoice_doc_url: docUrl || null,
      }
      if (shouldAutoApprove) {
        patch.status = 'approved'
        patch.active = true
        patch.auto_approved = true
      }

      const { error: updErr } = await admin
        .from('members')
        .update(patch)
        .eq('registration_payment_ref', refId)
      if (updErr) throw updErr

      return new Response(JSON.stringify({
        ok: true, type: 'subscription', expectedTotal, paidAmount, autoApproved: shouldAutoApprove,
        note: shouldAutoApprove ? 'אושר אוטומטית' : (anyDiscount ? 'נדרשת בקשת הנחה — ממתין לאישור ידני' : 'הסכום לא תואם למחירון — ממתין לבדיקה ידנית'),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: `סוג reference לא מוכר: ${refType}` }), { status: 400, headers: corsHeaders })
  } catch (e) {
    console.error('green-invoice-webhook error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
