// Supabase Edge Function — יוצר לינק תשלום ב-Invoice4u עבור הרשמה למנוי חולון קאנטרי,
// או עבור אימון ניסיון. מחליף את green-invoice-create-payment-link.
//
// ✅ 06.09.2026: בדיקה חיה מלאה עם תשלום של 1₪ — CreateCustomer+AddTokenAndCharge עבדו,
// החיוב הצליח, והלקוח קיבל חשבונית במייל בפועל (בזכות customer_email).
//
// ✅ 06.09.2026: הוסף orderId כ-query param על גבי CallBackUrl — כדי ש-invoice4u-callback
// ידע בוודאות לאיזה רשומה זה שייך, בלי תלות בפורמט ה-body הלא-מתועד
// ש-Invoice4u שולחים לשם (נבדק בפועל שהגיע ריק בבדיקת 1₪).
//
// ✅ 06.09.2026: הרצת עטיפת תשובות Invoice4u ב-{"d":{...}} (מוסכם ASP.NET/WCF) עם פונקציה
// unwrap() שמטפלת גם ב-{"CreateCustomerResult":...} וגם ב-{"d":...}.
//
// ✅ 09.09.2026: נוסף פרמטר אופציונלי target_subscription_type — משמש רק את מסך "הצטרפות
// לקאנטרי" של מתאמן קיים ומחובר (AthleteDashboard.jsx, RPC join_country_start). כשקיים,
// הוא נוסף כמקטע שלישי ל-orderId (type:reference_id:target_subscription_type) כדי
// ש-invoice4u-callback ידע איזו תוכנית באמת נבחרה ונשלמה, ורק אז (אחרי תשלום שתואם בדיוק
// למחירון) יעדכן branch_ids/subscription_type/membership_status של המתאמן. לא משפיע בכלל
// על מסלול ההרשמה הרגיל (RegisterPage.jsx) — שם הפרמטר פשוט לא נשלח, ו-orderId נשאר
// בדיוק כמו היום (type:reference_id).
//
// contract זהה בכוונה ל-green-invoice-create-payment-link כדי לא לשנות כלום ב-frontend:
//   body: { type, reference_id, amount, description, customer_name, customer_phone, customer_email?, target_subscription_type? }
//   response: { payment_url } | { error }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL = 'https://api.invoice4u.co.il/Services/ApiService.svc'

function unwrap(data: unknown, namedKey?: string): Record<string, unknown> | null {
  const d = data as Record<string, unknown> | null | undefined
  if (!d || typeof d !== 'object') return null
  if (namedKey && d[namedKey] && typeof d[namedKey] === 'object') return d[namedKey] as Record<string, unknown>
  if (d.d && typeof d.d === 'object') return d.d as Record<string, unknown>
  return d
}

async function createCustomer(apiKey: string, name: string, phone: string, email: string): Promise<number> {
  const r = await fetch(`${BASE_URL}/CreateCustomer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cu: {
        Name: name || 'לקוח TeamPact',
        Phone: phone || undefined,
        Email: email || undefined,
        IsNonUniqueNameCreation: true,
      },
      token: apiKey,
    }),
  })
  const data = await r.json()
  const result = unwrap(data, 'CreateCustomerResult')
  const idVal = result?.ID
  if (!r.ok || !result || typeof idVal !== 'number' || idVal <= 0) {
    throw new Error(`invoice4u CreateCustomer error: ${JSON.stringify(data)}`)
  }
  return idVal
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { type, reference_id, amount, description, customer_name, customer_phone, customer_email, target_subscription_type } = await req.json()

    if (!type || !['trial', 'subscription'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type חייב להיות trial או subscription' }), { status: 400, headers: corsHeaders })
    }
    if (!reference_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'חסר reference_id או amount לא תקין' }), { status: 400, headers: corsHeaders })
    }

    const apiKey = Deno.env.get('INVOICE4U_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'INVOICE4U_API_KEY לא מוגדר' }), { status: 500, headers: corsHeaders })
    }

    const supabaseUrl = 'https://pnicoluujpidguvniwub.supabase.co'
    const orderId = (type === 'subscription' && target_subscription_type)
      ? `${type}:${reference_id}:${target_subscription_type}`
      : `${type}:${reference_id}`
    const callBackUrl = `${supabaseUrl}/functions/v1/invoice4u-callback?orderId=${encodeURIComponent(orderId)}`
    const appUrl = Deno.env.get('APP_URL')
    const returnUrl = appUrl ? `${appUrl}/#payment-success` : `${supabaseUrl}/functions/v1/invoice4u-callback`
    const docHeadline = description || (type === 'trial' ? 'אימון ניסיון — TeamPact חולון קאנטרי' : 'הרשמה למנוי — TeamPact חולון קאנטרי')

    let customerId: number | null = null

    if (type === 'subscription') {
      customerId = await createCustomer(apiKey, customer_name, customer_phone, customer_email)

      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey)
        const { error: updErr } = await admin
          .from('members')
          .update({ invoice4u_customer_id: customerId, invoice4u_token_status: 'pending' })
          .eq('registration_payment_ref', reference_id)
        if (updErr) console.error('invoice4u-create-payment-link: כשל בשמירת customerId על members:', updErr)
      } else {
        console.error('invoice4u-create-payment-link: SUPABASE_SERVICE_ROLE_KEY לא זמין, customerId לא נשמר')
      }
    }

    const requestPayload: Record<string, unknown> = {
      Invoice4UUserApiKey: apiKey,
      Sum: amount,
      Currency: 'NIS',
      Description: docHeadline,
      OrderIdClientUsage: orderId,
      FullName: customer_name || '',
      Phone: customer_phone || '',
      Email: customer_email || undefined,
      IsDocCreate: true,
      DocHeadline: docHeadline,
      ReturnUrl: returnUrl,
      CallBackUrl: callBackUrl,
      IsQaMode: false,
    }

    if (type === 'subscription') {
      requestPayload.CustomerId = customerId
      requestPayload.AddTokenAndCharge = true
    }

    const r = await fetch(`${BASE_URL}/ProcessApiRequestV2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: requestPayload }),
    })
    const data = await r.json()
    const result = unwrap(data, 'ProcessApiRequestV2Result')

    if (!r.ok || !result || (Array.isArray(result.Errors) && result.Errors.length > 0)) {
      console.error('invoice4u ProcessApiRequestV2 error:', JSON.stringify(data))
      return new Response(JSON.stringify({ error: 'שגיאה ביצירת לינק תשלום ב-Invoice4u', details: data }), { status: r.status || 500, headers: corsHeaders })
    }

    if (!result.ClearingRedirectUrl) {
      console.error('invoice4u ProcessApiRequestV2: אין ClearingRedirectUrl בתגובה:', JSON.stringify(data))
      return new Response(JSON.stringify({ error: 'לא התקבל לינק תשלום מ-Invoice4u', details: data }), { status: 502, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ payment_url: result.ClearingRedirectUrl, raw: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('invoice4u-create-payment-link error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
