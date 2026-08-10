import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Field } from './a11y'
import CountryClubWaiver, { WAIVER_VERSION, validateWaiver } from './CountryClubWaiver'
import InjuryRiskWaiver, { INJURY_WAIVER_VERSION, validateInjuryWaiver } from './InjuryRiskWaiver'
import TermsAgreement, { TERMS_VERSION } from './TermsAgreement'

const TRIAL_PRICE = 50 // ש"ח — סוכם עם דודי 26.07.2026, ספציפי לסניף חולון קאנטרי

const HEBREW = /[֐-׿]/
function validateHebrewFullName(raw) {
  const name = (raw || '').trim()
  if (/[A-Za-z]/.test(name) || !HEBREW.test(name)) return 'בעברית בלבד (ללא אותיות באנגלית)'
  if (name.split(/\s+/).filter(Boolean).length < 2) return 'יש להזין שם מלא — שם פרטי ושם משפחה'
  return null
}

// גיל מדויק לפי תאריך לידה — קובע אם המשתתף/ת קטין/ה שדורש/ת חתימת הורה/אפוטרופוס
function calcAge(birthDateStr) {
  if (!birthDateStr) return null
  const b = new Date(birthDateStr)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--
  return age
}

export default function TrialFormPage() {
  const [branch, setBranch] = useState(null)
  const [branchLoading, setBranchLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [waiver, setWaiver] = useState({})
  const [injuryWaiver, setInjuryWaiver] = useState({})
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [paymentUnavailable, setPaymentUnavailable] = useState(false)
  const errorRef = useRef(null)
  const age = calcAge(birthDate)
  const isMinor = age != null && age < 18
  // חותם/ת בפועל על ההצהרות — הקטין/ה עצמו/ה אינו כשיר/ה חוקית לחתום, לכן ההורה/אפוטרופוס
  // הוא מי שממלא ת"ז+חתימה בהצהרות (waiver / injuryWaiver) כשמדובר בקטין
  const signerName = isMinor ? guardianName : fullName

  useEffect(() => {
    supabase
      .from('branches')
      .select('id, name')
      .eq('requires_facility_waiver', true)
      .maybeSingle()
      .then(({ data }) => { setBranch(data); setBranchLoading(false) })
  }, [])

  useEffect(() => {
    if (error && errorRef.current) errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  async function handleSubmit() {
    const nameErr = validateHebrewFullName(fullName)
    if (nameErr) { setError('שם מלא: ' + nameErr); return }
    if ((phone.match(/\d/g) || []).length < 9) { setError('נא למלא מספר טלפון תקין'); return }
    if (!birthDate) { setError('נא למלא תאריך לידה'); return }
    if (isMinor) {
      const gErr = validateHebrewFullName(guardianName)
      if (gErr) { setError('שם ההורה/אפוטרופוס: ' + gErr); return }
    }
    const waiverErr = validateWaiver(waiver)
    if (waiverErr) { setError(waiverErr); return }
    const injuryErr = validateInjuryWaiver(injuryWaiver)
    if (injuryErr) { setError(injuryErr); return }
    if (!agreedToTerms) { setError('יש לאשר את תנאי השימוש לפני המשך לתשלום'); return }
    if (!branch?.id) { setError('לא נמצא סניף חולון קאנטרי במערכת — פנה למאמן'); return }

    setLoading(true)
    setError(null)

    const { data: visit, error: insertErr } = await supabase
      .from('trial_visits')
      .insert({
        branch_id: branch.id,
        visitor_name: fullName.trim(),
        visitor_phone: phone.trim(),
        birth_date: birthDate || null,
        guardian_name: isMinor ? guardianName.trim() : null,
        requested_date: requestedDate || null,
        id_number: waiver.idNumber,
        source: 'app_self_serve',
        payment_status: 'unpaid',
        notes: `נרשם עצמאית דרך האפליקציה — אישר תנאי שימוש (${TERMS_VERSION})`,
      })
      .select('id')
      .single()

    if (insertErr) {
      setLoading(false)
      setError('הייתה בעיה בשמירת הבקשה — נסה שוב או פנה למאמן')
      console.error('trial_visits insert error:', insertErr)
      return
    }

    const { error: waiverErr2 } = await supabase.from('club_waivers').insert({
      branch_id: branch.id,
      trial_visit_id: visit.id,
      full_name: fullName.trim(),
      id_number: waiver.idNumber,
      address: waiver.address || null,
      phone: phone.trim(),
      signature_typed_name: (waiver.signatureName || '').trim() || signerName.trim(),
      signature_image: waiver.signatureImage || null,
      waiver_type: 'facility',
      is_minor: isMinor,
      waiver_version: WAIVER_VERSION,
      user_agent: navigator.userAgent,
    })
    if (waiverErr2) console.error('club_waivers insert error (ממשיכים בכל זאת):', waiverErr2)

    // הצהרת סיכון בענף לחימה — הצהרה נפרדת, גם היא בשם החותם/ת בפועל (הורה אם קטין)
    const { error: injuryWaiverErr } = await supabase.from('club_waivers').insert({
      branch_id: branch.id,
      trial_visit_id: visit.id,
      full_name: fullName.trim(),
      id_number: injuryWaiver.idNumber,
      phone: phone.trim(),
      signature_typed_name: (injuryWaiver.signatureName || '').trim() || signerName.trim(),
      signature_image: injuryWaiver.signatureImage || null,
      waiver_type: 'injury_risk',
      is_minor: isMinor,
      waiver_version: INJURY_WAIVER_VERSION,
      user_agent: navigator.userAgent,
    })
    if (injuryWaiverErr) console.error('injury_risk waiver insert error (ממשיכים בכל זאת):', injuryWaiverErr)

    // ניסיון ליצור לינק תשלום — אם עדיין לא הוגדר חשבונית ירוקה (secrets), מציגים נפילה חלקה
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('green-invoice-create-payment-link', {
      body: {
        type: 'trial',
        reference_id: visit.id,
        amount: TRIAL_PRICE,
        description: 'אימון ניסיון — TeamPact חולון קאנטרי',
        customer_name: fullName.trim(),
        customer_phone: phone.trim(),
      },
    })

    setLoading(false)

    if (fnErr || !fnData?.payment_url) {
      console.warn('green-invoice payment link unavailable yet:', fnErr, fnData)
      setPaymentUnavailable(true)
      return
    }

    window.location.href = fnData.payment_url
  }

  if (branchLoading) return <div className="min-h-screen bg-emerald-50" dir="rtl" />

  if (paymentUnavailable) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <main className="max-w-sm w-full bg-white rounded-2xl shadow p-8 text-center space-y-4">
        <div className="text-5xl" aria-hidden="true">🥋</div>
        <h2 className="font-bold text-xl text-gray-800">הבקשה נקלטה!</h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          התשלום המקוון עדיין לא הופעל אצלנו. נציג של TeamPact ייצור איתך קשר להשלמת התשלום ({TRIAL_PRICE} ש"ח) ותיאום מועד האימון.
        </p>
      </main>
    </div>
  )

  return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <main id="main-content" className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-1" aria-hidden="true">🥋</div>
            <h1 className="font-bold text-xl text-gray-800">אימון ניסיון — TeamPact חולון קאנטרי</h1>
            <p className="text-sm text-gray-600 mt-0.5">{TRIAL_PRICE} ש"ח לאימון ניסיון בודד</p>
          </div>

          <Field label="שם מלא של המשתתף/ת" required hint="בעברית בלבד — שם פרטי ושם משפחה (גם אם קטין/ה)">
            {(props) => (
              <input {...props} type="text" lang="he" inputMode="text"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="ישראל ישראלי" value={fullName} onChange={e => setFullName(e.target.value)} />
            )}
          </Field>

          <Field label="תאריך לידה" required>
            {(props) => (
              <input {...props} type="date" max={new Date().toISOString().split('T')[0]}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={birthDate} onChange={e => setBirthDate(e.target.value)} />
            )}
          </Field>

          {isMinor && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-amber-800">👨‍👩‍👧 המשתתף/ת קטין/ה — נדרשים פרטי הורה/אפוטרופוס</p>
              <Field label="שם מלא של ההורה/אפוטרופוס" required hint="בעברית בלבד — הוא/היא יחתמו על ההצהרות למטה">
                {(props) => (
                  <input {...props} type="text" lang="he" inputMode="text"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="ישראל ישראלי" value={guardianName} onChange={e => setGuardianName(e.target.value)} />
                )}
              </Field>
            </div>
          )}

          <Field label="טלפון" required>
            {(props) => (
              <input {...props} type="tel" autoComplete="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="050-0000000" value={phone} onChange={e => setPhone(e.target.value)} />
            )}
          </Field>

          <Field label="תאריך מבוקש לאימון (לא חובה)">
            {(props) => (
              <input {...props} type="date" min={new Date().toISOString().split('T')[0]}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={requestedDate} onChange={e => setRequestedDate(e.target.value)} />
            )}
          </Field>

          <CountryClubWaiver value={waiver} onChange={setWaiver} prefilledName={signerName} />

          <InjuryRiskWaiver value={injuryWaiver} onChange={setInjuryWaiver} isMinor={isMinor} prefilledName={signerName} />

          <TermsAgreement checked={agreedToTerms} onChange={setAgreedToTerms} />

          {error && (
            <div ref={errorRef} role="alert" aria-live="assertive" className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-xl leading-none" aria-hidden="true">⚠️</span>
              <p className="text-red-700 text-sm font-bold text-right leading-relaxed">{error}</p>
            </div>
          )}

          <button type="button" onClick={handleSubmit} disabled={loading} aria-busy={loading || undefined}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300">
            {loading ? 'שולח...' : `המשך לתשלום — ${TRIAL_PRICE} ש"ח`}
          </button>
        </main>
      </div>
    </div>
  )
}
