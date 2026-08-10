import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import InstallBanner from './InstallBanner'
import { notifyPush } from '../lib/notifyPush'
import { trainerUserIdsForMember } from '../lib/notifyTargets'
import { Field } from './a11y'
import CountryClubWaiver, { WAIVER_VERSION, validateWaiver } from './CountryClubWaiver'
import InjuryRiskWaiver, { INJURY_WAIVER_VERSION, validateInjuryWaiver } from './InjuryRiskWaiver'
import TermsAgreement, { TERMS_VERSION } from './TermsAgreement'

const SUB_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

// מחירון נספח א' (הסכם השכירות מול הקאנטרי, 26.07.2026) — עמודת "לקוח חיצוני" (מחיר מלא).
// ספציפי לסניף חולון קאנטרי. זה המחיר הבסיסי שמוצג/נגבה בטופס הציבורי הרגיל — הנחות
// (מנוי/עובד קאנטרי) לא נחשפות שם בכלל מטעמי פרטיות עסקית. ✅ 06.08.2026 — הנחות כן קיימות,
// אך רק דרך לינק נסתר (DISCOUNT_LINKS למטה) שדודי שולח פרטית: ?discount=member/employee
// מפעיל הנחה קבועה (20%/50%) על אותו מחירון בסיס, בלי לחשוף זאת בטופס הרגיל.
const COUNTRY_CLUB_PRICES = {
  '1x_week': 300,
  '2x_week': 400,
  '4x_week': 500,
  unlimited: 600,
}
// למי לפנות אחרי הרשמה לגבי הנחה — מספר דודי מהחוזה מול הקאנטרי (0542250993)
const DUDI_WHATSAPP_URL = 'https://wa.me/972542250993'

// ✅ 06.08.2026 — לינקים קבועים ונסתרים (לא מקושרים משום מקום פומבי באתר/באפליקציה)
// לשליחה פרטית של דודי בווטסאפ בלבד: ?discount=member (מנוי קאנטרי, 20%) או
// ?discount=employee (עובד/ת קאנטרי + בני משפחה, 50%). מי שנכנס דרך לינק כזה ממלא
// את פרטיו בעצמו כרגיל — הסניף וההנחה נקבעים אוטומטית לפי הלינק, בלי שדודי יזין
// שום פרט של המתאמן בעצמו. לא חושף לציבור הרחב ששני המסלולים קיימים בכלל.
const DISCOUNT_LINKS = {
  member:   { pct: 20, type: 'country_club_member', label: 'מנוי קאנטרי' },
  employee: { pct: 50, type: 'employee_family',      label: 'עובד/ת קאנטרי ובני משפחה' },
}

const HEBREW = /[֐-׿]/ // אות עברית כלשהי
// ולידציית שם מלא בעברית — דורש שם פרטי + שם משפחה (לפחות שתי מילים)
function validateHebrewFullName(raw) {
  const name = (raw || '').trim()
  if (/[A-Za-z]/.test(name) || !HEBREW.test(name)) return 'בעברית בלבד (ללא אותיות באנגלית)'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return 'יש להזין שם מלא — שם פרטי ושם משפחה'
  return null
}

const TODAY = new Date().toISOString().split('T')[0]

// גיל מדויק לפי תאריך לידה — משמש לחסימת קטין שמנסה להירשם עצמאית (בלי הורה)
// ולסימון is_minor הנכון בכל הצהרת סיכון שנשמרת.
function calcAge(birthDateStr) {
  if (!birthDateStr) return null
  const b = new Date(birthDateStr)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--
  return age
}

// טופס ילד/מתאמן בודד (שם, תאריך לידה, סניפים, מנוי)
function emptyChild() {
  return { full_name: '', birth_date: '', branch_ids: [], subscription_type: '2x_week' }
}

// כפתור הצגת/הסתרת סיסמה (נשמר עיצוב מקורי)
function EyeButton({ shown, onToggle }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onToggle}
      aria-label={shown ? 'הסתר סיסמה' : 'הצג סיסמה'}
      aria-pressed={shown}
      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-400 rounded"
    >
      {shown ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  )
}

// בורר סניפים (כפתורים) — משותף לעצמי ולכל ילד
function BranchPicker({ branches, selectedIds, onToggle, label = 'סניף' }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-gray-700 block mb-2">
        {label} <span aria-hidden="true">*</span><span className="sr-only"> (חובה)</span> (ניתן לבחור יותר מאחד)
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="בחירת סניפים">
        {branches.map(b => {
          const selected = selectedIds.includes(b.id)
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(b.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-500 ${
                selected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-500'
              }`}
            >
              <span aria-hidden="true">{selected ? '✓ ' : ''}</span>{b.name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

// showPrices=true (רק כשנבחר סניף חולון קאנטרי לאותו אדם) — מציג את מחירון נספח א'
// (מחיר מלא, לא כולל הנחות — הנחות קאנטרי/עובד לא מוצגות כאן בכלל, מטעמי פרטיות עסקית,
// ראו הערה למעלה ליד COUNTRY_CLUB_PRICES). מטרה: לחסוך שאלות חוזרות "כמה עולה מנוי X".
function SubscriptionSelect({ value, onChange, showPrices, discountPct = 0 }) {
  const priceLabel = (type, base) => {
    if (!showPrices) return base
    const full = COUNTRY_CLUB_PRICES[type]
    if (discountPct > 0) return `${base} — ₪${Math.round(full * (1 - discountPct / 100))}`
    return `${base} — ₪${full}`
  }
  return (
    <Field label="סוג מנוי מבוקש">
      {(props) => (
        <select
          {...props}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="1x_week">{priceLabel('1x_week', '1× שבוע (באישור מנהל בלבד)')}</option>
          <option value="2x_week">{priceLabel('2x_week', '2× שבוע')}</option>
          <option value="4x_week">{priceLabel('4x_week', '4× שבוע')}</option>
          <option value="unlimited">{priceLabel('unlimited', 'ללא הגבלה')}</option>
        </select>
      )}
    </Field>
  )
}

export default function RegisterPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({
    // פרטי החשבון (ההורה או המתאמן הבוגר) — אימייל + סיסמה פעם אחת
    account_name: '', email: '', phone: '', password: '', passwordConfirm: '',
    // הורה שרושם ילדים?
    is_guardian: false,
    // אם הורה — האם הוא גם מתאמן בעצמו
    parent_also_trains: false,
    // פרטי המתאמן-עצמו (כשלא הורה, או הורה שגם מתאמן)
    self_birth_date: '', self_branch_ids: [], self_subscription_type: '2x_week',
    // ✅ 10.08.2026 — מתאמן שנרשם עם חשבון (login) משלו, אבל הוא עצמו קטין (לדוגמה בן/בת 14
    // שמנהלים לבד את ההרשמה לאימונים בקאנטרי). לחשבון יש email/סיסמה של הקטין עצמו — אבל
    // את הצהרות ההסכמה (למטה) חייב למלא ולחתום עליהן הורה/אפוטרופוס, לא הקטין. השם כאן הוא
    // שם ההורה החותם, נפרד לגמרי משם החשבון (שם הקטין) ומהתשלום.
    self_guardian_name: '',
  })
  const [children, setChildren] = useState([emptyChild()])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false) // נרשם בהצלחה אך תשלום מקוון עדיין לא זמין
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  // הצהרת קאנטרי — חתימה אחת (של ההורה/המתאמן הבוגר) שמכסה את כל מי שנרשם בהגשה הזו
  const [waiver, setWaiver] = useState({})
  // הצהרת סיכון בענף לחימה — חתימה אחת שמכסה את כל מי שנרשם בהגשה הזו, בחולון קאנטרי בלבד
  // (אותו תנאי הצגה כמו CountryClubWaiver — anyCountryClub). ראו InjuryRiskWaiver.jsx.
  const [injuryWaiver, setInjuryWaiver] = useState({})
  // אישור תנאי שימוש — נדרש רק כשיש תשלום אמיתי בהגשה (כרגע: חולון קאנטרי בלבד)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  // גלילה אוטומטית להודעת שגיאה כשהיא מופיעה — הטופס ארוך, וההודעה (כולל
  // "הטלפון כבר קיים") הייתה יכולה להישאר מחוץ לתצוגה בלי שהמשתמש ישים לב
  // שמשהו בכלל קרה בלחיצה על שליחה.
  const errorRef = useRef(null)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [error])

  // לינק הנחה נסתר (?discount=member / ?discount=employee) — נקרא פעם אחת מה-URL.
  // אין UI ציבורי שמצביע על הפרמטר הזה; מי שמגיע לכאן קיבל את הלינק ישירות מדודי.
  const discountParam = new URLSearchParams(window.location.search).get('discount')
  const activeDiscount = DISCOUNT_LINKS[discountParam] || null

  useEffect(() => {
    supabase.from('branches').select('id, name, requires_facility_waiver').eq('hidden', false).then(({ data }) => setBranches(data || []))
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: member } = await supabase.from('members').select('status').eq('id', session.user.id).maybeSingle()
      if (!member) return
      if (member.status === 'approved' || member.status === 'active') window.location.replace('/')
      else if (member.status === 'pending') setDone(true)
    })
  }, [])

  // בדיקת אישור פעם אחת בכל חזרה למסך (חוסך egress) — כמו במקור
  useEffect(() => {
    if (!done) return
    let cancelled = false
    async function checkApproved() {
      if (cancelled || document.visibilityState !== 'visible') return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: member } = await supabase.from('members').select('status').eq('id', session.user.id).maybeSingle()
      if (cancelled) return
      if (member?.status === 'approved' || member?.status === 'active') window.location.replace('/')
    }
    document.addEventListener('visibilitychange', checkApproved)
    window.addEventListener('focus', checkApproved)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', checkApproved)
      window.removeEventListener('focus', checkApproved)
    }
  }, [done])

  function toggleSelfBranch(id) {
    setForm(p => ({
      ...p,
      self_branch_ids: p.self_branch_ids.includes(id) ? p.self_branch_ids.filter(x => x !== id) : [...p.self_branch_ids, id],
    }))
  }
  function updateChild(i, patch) {
    setChildren(list => list.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  function toggleChildBranch(i, id) {
    setChildren(list => list.map((c, idx) => idx === i
      ? { ...c, branch_ids: c.branch_ids.includes(id) ? c.branch_ids.filter(x => x !== id) : [...c.branch_ids, id] }
      : c))
  }
  function addChild() {
    setChildren(list => [...list, activeDiscount && countryClubBranchIds[0]
      ? { ...emptyChild(), branch_ids: [countryClubBranchIds[0]] }
      : emptyChild()])
  }
  function removeChild(i) { setChildren(list => list.length <= 1 ? list : list.filter((_, idx) => idx !== i)) }

  // סניפים שדורשים הצהרת קאנטרי (כרגע רק חולון קאנטרי) — נטען מה-DB, לא מקודד קשיח
  const countryClubBranchIds = branches.filter(b => b.requires_facility_waiver).map(b => b.id)
  const isCountryClub = (ids) => (ids || []).some(id => countryClubBranchIds.includes(id))
  const selfIsCountryClub = isCountryClub(form.self_branch_ids)
  const anyChildCountryClub = children.some(c => isCountryClub(c.branch_ids))
  const anyCountryClub = selfIsCountryClub || anyChildCountryClub

  // לינק הנחה פעיל: אוכפים אוטומטית את סניף חולון קאנטרי (עצמי + כל ילד שעדיין
  // בלי סניף) ברגע שהסניפים נטענים — כדי שדודי לא יצטרך להסביר "תבחר קאנטרי".
  useEffect(() => {
    if (!activeDiscount || countryClubBranchIds.length === 0) return
    const ccId = countryClubBranchIds[0]
    setForm(p => p.self_branch_ids.includes(ccId) ? p : { ...p, self_branch_ids: [ccId] })
    setChildren(list => list.map(c => c.branch_ids.includes(ccId) ? c : { ...c, branch_ids: [ccId] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, activeDiscount])

  // מחיר אפקטיבי (אחרי הנחה, אם הלינק הנוכחי כולל אחת) — לתצוגה ולסכום התשלום בפועל
  const discPct = activeDiscount?.pct || 0
  const effectivePrice = (type) => Math.round((COUNTRY_CLUB_PRICES[type] || 0) * (1 - discPct / 100))

  async function handleSubmit() {
    // --- ולידציה: פרטי חשבון ---
    if (!form.account_name.trim() || !form.email.trim()) {
      setError('נא למלא שם ואימייל')
      return
    }
    if ((form.phone.match(/\d/g) || []).length < 9) {
      setError('נא למלא מספר טלפון תקין')
      return
    }
    const accNameErr = validateHebrewFullName(form.account_name)
    if (accNameErr) {
      setError((form.is_guardian ? 'שם ההורה: ' : 'שם מלא: ') + accNameErr)
      return
    }
    if (!form.password || form.password.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    if (form.password !== form.passwordConfirm) {
      setError('הסיסמאות לא תואמות')
      return
    }

    // מי מתאמן בפועל: בוגר-עצמי (לא הורה) או הורה שגם מתאמן
    const selfIsAthlete = !form.is_guardian || form.parent_also_trains

    // --- ולידציה: המתאמן-עצמו ---
    // ✅ 10.08.2026 — דודי הבהיר: קטין כן יכול (וצריך) להירשם עם חשבון/login עצמאי משלו
    // (למשל בן/בת 14 שמנהלים לבד את ההרשמה לאימונים) — "אני הורה" זה רק למי שרושם כמה
    // ילדים במקום אחד. מה שחייב להיות של הורה זה החתימה על ההצהרות בקאנטרי (למטה),
    // לא בעלות החשבון עצמו. לכן אין כאן חסימה — רק, אם המתאמן-עצמו קטין ובחר קאנטרי,
    // נדרש בנוסף שם הורה/אפוטרופוס לצורך החתימה (ולידציה בהמשך, ליד anyCountryClub).
    if (selfIsAthlete) {
      if (!form.self_birth_date) { setError('נא למלא תאריך לידה'); return }
      if (form.self_branch_ids.length === 0) { setError('נא לבחור לפחות סניף אחד'); return }
    }
    const selfAge = selfIsAthlete ? calcAge(form.self_birth_date) : null
    const selfIsMinor = selfAge != null && selfAge < 18

    // --- ולידציה: ילדים ---
    if (form.is_guardian) {
      if (children.length === 0) { setError('נא להוסיף לפחות ילד אחד'); return }
      for (let i = 0; i < children.length; i++) {
        const c = children[i]
        const nameErr = validateHebrewFullName(c.full_name)
        if (nameErr) { setError(`ילד ${i + 1} — שם: ${nameErr}`); return }
        if (!c.birth_date) { setError(`ילד ${i + 1} — נא למלא תאריך לידה`); return }
        if (c.branch_ids.length === 0) { setError(`ילד ${i + 1} — נא לבחור לפחות סניף אחד`); return }
      }
    }

    // --- ולידציה: הצהרת קאנטרי + הצהרת סיכון + אישור תנאי שימוש ---
    // רק אם נבחר סניף חולון קאנטרי עבור מישהו — זה הסניף היחיד שדורש את כל זה (יש תשלום
    // ישיר וחשיפה דרך החוזה מול הקאנטרי). סניפים אחרים (חולון רגיל, תל אביב) — לא רלוונטי,
    // יש שם מזכירות ותהליך נפרד.
    if (anyCountryClub) {
      // אם המתאמן-עצמו קטין (חשבון משלו, לא במסלול "אני הורה") — צריך שם הורה/אפוטרופוס
      // נפרד לצורך החתימה על ההצהרות, כי שם החשבון (form.account_name) הוא שם הקטין עצמו.
      if (selfIsAthlete && !form.is_guardian && selfIsCountryClub && selfIsMinor) {
        const gErr = validateHebrewFullName(form.self_guardian_name)
        if (gErr) { setError('שם ההורה/אפוטרופוס (לצורך החתימה): ' + gErr); return }
      }
      const waiverErr = validateWaiver(waiver)
      if (waiverErr) { setError(waiverErr); return }
      const injuryErr = validateInjuryWaiver(injuryWaiver)
      if (injuryErr) { setError(injuryErr); return }
      if (!agreedToTerms) { setError('יש לאשר את תנאי השימוש לפני המשך לתשלום'); return }
    }

    setLoading(true)
    setError(null)
    const email = form.email.trim().toLowerCase()
    const parentName = form.account_name.trim()
    // שם החותם בפועל על הצהרות הקאנטרי: אם המתאמן-עצמו קטין עם חשבון משלו — ההורה שמולא
    // בשדה הנפרד; אחרת — בעל/ת החשבון עצמו/ה (הורה במסלול "אני הורה", או מתאמן/ת בוגר/ה).
    const waiverSignerName = (selfIsAthlete && !form.is_guardian && selfIsMinor)
      ? (form.self_guardian_name.trim() || parentName)
      : parentName
    const phoneTrim = form.phone.trim()

    // 0. מניעת בקשות כפולות — לפני שיוצרים auth+member, בודקים אם כבר קיימת
    //    בקשת pending פעילה לאותו שם+טלפון (RPC כבר מסנן deleted_at, ראה
    //    2026-06-15-purge-soft-deleted-members-and-rpc-fix.sql).
    //    בלי הבדיקה הזו, הגשה כפולה (לחיצה נוספת מרוב חוסר סבלנות בזמן
    //    שהמזכירות עוד בודקת את הבקשה הקודמת) יוצרת רשומת pending נוספת
    //    לאותו אדם — זה מה שגרם ל"איתי דביר קופץ כל הזמן" למרות דחיות.
    const namesToCheck = []
    if (selfIsAthlete) namesToCheck.push(parentName)
    if (form.is_guardian) for (const c of children) namesToCheck.push(c.full_name.trim())

    for (const name of namesToCheck) {
      const { data: existing, error: dupErr } = await supabase.rpc('check_member_registration_exists', {
        p_phone: phoneTrim,
        p_full_name: name,
      })
      if (dupErr) {
        console.warn('check_member_registration_exists error:', dupErr)
        continue // לא חוסמים על שגיאת בדיקה — רק על ממצא ודאי
      }
      if (existing?.exists && existing.status === 'pending') {
        setLoading(false)
        setError(`כבר קיימת בקשת הרשמה ממתינה לאישור עבור "${name}" ומספר טלפון זה. אין צורך להירשם שוב — יש להמתין לאישור הצוות.`)
        return
      }
    }

    // 0.5 בדיקה רחבה יותר — לפי טלפון בלבד, בלי קשר לשם ובלי קשר לסטטוס (גם אם
    // כבר approved/active, לא רק pending). מונעת רישום כפול כשמישהו שכבר יש לו
    // חשבון ממלא את הטופס הציבורי שוב (בטעות, או כי שכח שנרשם). לא חוסמת הורים
    // שרושמים כמה ילדים באותה הגשה — זה כבר נתמך בטופס הזה עצמו (checkbox
    // "אני הורה"), לא דרך הגשה חוזרת. מחזירה רק true/false, בלי שם — כדי לא
    // לחשוף מי רשום איזה טלפון למי שממלא את הטופס הציבורי.
    const { data: phoneCheck, error: phoneErr } = await supabase.rpc('check_phone_registrations', {
      p_phone: phoneTrim,
    })
    if (phoneErr) {
      console.warn('check_phone_registrations error:', phoneErr)
    } else if (phoneCheck?.exists) {
      setLoading(false)
      setError('מספר הטלפון הזה כבר רשום במערכת. כבר יש לך גישה לאפליקציה? היכנס והוסף ילד/ה נוסף/ת מהפרופיל שלך. אחרת — פנה למאמן או למזכירות.')
      return
    }

    // 1. signUp אחד בלבד (חשבון ההורה/הבוגר) — זה מה שמונע אימייל כפול
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: { data: { full_name: parentName, role: 'athlete' } },
    })
    if (authErr) {
      setLoading(false)
      setError(authErr.message.includes('registered') ? 'האימייל כבר רשום במערכת' : authErr.message)
      return
    }
    const userId = authData?.user?.id

    // מזהה משותף לכל רשומות ההגשה הזו שדורשות תשלום קאנטרי — כדי שה-webhook
    // יוכל לאשר יחד הורה+ילדים ששולמו בתשלום אחד מרוכז.
    const registrationPaymentRef = anyCountryClub ? crypto.randomUUID() : null

    // 2. בניית רשומות member
    const memberRows = []
    if (selfIsAthlete) {
      const isCC = selfIsCountryClub
      memberRows.push({
        id: userId || undefined,
        full_name: parentName,
        email,
        phone: form.phone.trim() || null,
        branch_ids: form.self_branch_ids,
        branch_id: form.self_branch_ids[0],
        subscription_type: form.self_subscription_type,
        membership_type: form.self_subscription_type,
        status: 'pending',
        birth_date: form.self_birth_date || null,
        // אם המתאמן-עצמו קטין/ה עם חשבון משלו/ה (לא במסלול "אני הורה") — שומרים את שם
        // ההורה גם כאן על כרטיס המתאמן, לא רק ברשומת ההצהרה החתומה, כדי שיהיה נגיש
        // ישירות מכרטיס המתאמן (AthleteManagement) בלי לחפש בטבלת club_waivers.
        parent_name: selfIsMinor ? (form.self_guardian_name.trim() || null) : null,
        ...(isCC ? {
          registration_payment_ref: registrationPaymentRef,
          ...(activeDiscount ? { discount_pct: activeDiscount.pct, discount_type: activeDiscount.type } : {}),
        } : {}),
      })
    }
    if (form.is_guardian) {
      for (const c of children) {
        const isCC = isCountryClub(c.branch_ids)
        memberRows.push({
          // אין id (gen_random_uuid) ואין email — email NULL כדי לא להתנגש ב-unique של מייל ההורה
          full_name: c.full_name.trim(),
          email: null,
          phone: form.phone.trim() || null,
          branch_ids: c.branch_ids,
          branch_id: c.branch_ids[0],
          subscription_type: c.subscription_type,
          membership_type: c.subscription_type,
          status: 'pending',
          birth_date: c.birth_date || null,
          guardian_id: userId || null,
          parent_name: parentName,
          ...(isCC ? {
            registration_payment_ref: registrationPaymentRef,
            ...(activeDiscount ? { discount_pct: activeDiscount.pct, discount_type: activeDiscount.type } : {}),
          } : {}),
        })
      }
    }

    // 3. הכנסה ל-DB. רשומת ה-self (id=userId) חייבת להיכנס ראשונה (policy self_register_auth);
    //    הילדים נכנסים עם guardian_id (policy members_insert_guardian_child).
    let insertErr = null
    const insertedRows = []
    for (const row of memberRows) {
      const { data: insertedRow, error } = await supabase.from('members').insert(row).select('id, full_name, branch_id, subscription_type').single()
      if (error) { insertErr = error; break }
      insertedRows.push(insertedRow)
    }
    if (insertErr) {
      setLoading(false)
      setError('נרשמת אך הייתה בעיה בשמירת הפרטים - פנה למאמן')
      console.error('member insert error:', insertErr)
      return
    }

    // 4. Push למאמנים (fire-and-forget) — הודעה אחת מסכמת
    const firstRow = memberRows[0]
    if (firstRow) {
      const count = memberRows.length
      trainerUserIdsForMember(firstRow)
        .then(userIds => notifyPush({
          userIds,
          title: 'בקשת הצטרפות חדשה',
          body: count > 1 ? `${parentName} — ${count} מתאמנים` : `${firstRow.full_name} — ${SUB_LABELS[firstRow.subscription_type] || firstRow.subscription_type}`,
          url: '/#athletes',
          tag: `lead:${userId || Date.now()}`,
        }))
        .catch(() => {})
    }

    // 5. חולון קאנטרי: הצהרת קאנטרי חתומה + תשלום מרוכז
    if (anyCountryClub) {
      // אינדקסים של שורות memberRows/insertedRows ששייכות לחולון קאנטרי (יש להן registration_payment_ref)
      const ccIndexes = memberRows.map((m, i) => m.registration_payment_ref ? i : -1).filter(i => i >= 0)
      const ccInsertedRows = ccIndexes.map(i => insertedRows[i])

      // full_name = שם המשתתף/ת (מי שהצהרה הזו מכסה) — לא בהכרח מי שחתם בפועל.
      // signature_typed_name = שם החותם/ת בפועל (waiverSignerName: ההורה אם מדובר בקטין
      // עם חשבון עצמאי, אחרת בעל/ת החשבון עצמו/ה — ראו החישוב למעלה ליד handleSubmit).
      const waiverInserts = ccInsertedRows.map(r => ({
        branch_id: r.branch_id,
        member_id: r.id,
        full_name: r.full_name,
        id_number: waiver.idNumber,
        address: waiver.address || null,
        phone: form.phone.trim() || null,
        signature_typed_name: (waiver.signatureName || '').trim() || waiverSignerName,
        signature_image: waiver.signatureImage || null,
        waiver_type: 'facility',
        waiver_version: WAIVER_VERSION,
        user_agent: navigator.userAgent,
      }))
      const { error: waiverErr } = await supabase.from('club_waivers').insert(waiverInserts)
      if (waiverErr) console.error('club_waivers insert error (ממשיכים בכל זאת):', waiverErr)

      // הצהרת סיכון בענף לחימה — גם היא רק לחולון קאנטרי, שורה אחת לכל מי ששייך לקאנטרי
      // בהגשה הזו. is_minor מחושב לפי תאריך הלידה של כל שורה בנפרד — כדי שהורה שגם מתאמן
      // (parent_also_trains) יסומן נכון כבוגר על עצמו וכקטין על ילדיו.
      const injuryInserts = ccIndexes.map((idx, k) => {
        const origRow = memberRows[idx]
        const r = ccInsertedRows[k]
        const age = calcAge(origRow.birth_date)
        return {
          branch_id: r.branch_id,
          member_id: r.id,
          full_name: r.full_name,
          id_number: injuryWaiver.idNumber,
          phone: form.phone.trim() || null,
          signature_typed_name: (injuryWaiver.signatureName || '').trim() || waiverSignerName,
          signature_image: injuryWaiver.signatureImage || null,
          waiver_type: 'injury_risk',
          is_minor: age != null && age < 18,
          waiver_version: INJURY_WAIVER_VERSION,
          user_agent: navigator.userAgent,
        }
      })
      const { error: injuryWaiverErr } = await supabase.from('club_waivers').insert(injuryInserts)
      if (injuryWaiverErr) console.error('injury_risk waiver insert error (ממשיכים בכל זאת):', injuryWaiverErr)

      // סכום לתשלום: מחיר מלא, אלא אם ההרשמה הגיעה דרך לינק הנחה נסתר (?discount=...)
      // — או-אז נגבה כבר הסכום המוזל בפועל (תואם למה שנשמר ב-discount_pct למעלה,
      // ולמה שה-webhook יחשב כ"מחיר אפקטיבי" כדי לאשר אוטומטית).
      let totalAmount = 0
      for (let k = 0; k < ccIndexes.length; k++) {
        const origRow = memberRows[ccIndexes[k]]
        totalAmount += effectivePrice(origRow.subscription_type)
      }

      const registrationPaymentRef = memberRows[ccIndexes[0]]?.registration_payment_ref

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('green-invoice-create-payment-link', {
        body: {
          type: 'subscription',
          reference_id: registrationPaymentRef,
          amount: totalAmount,
          description: `הרשמה למנוי — TeamPact חולון קאנטרי (${ccInsertedRows.map(r => r.full_name).join(', ')})`,
          customer_name: parentName,
          customer_phone: form.phone.trim(),
        },
      })

      setLoading(false)

      if (fnErr || !fnData?.payment_url) {
        console.warn('green-invoice payment link unavailable yet:', fnErr, fnData)
        setPaymentPending(true)
        return
      }
      window.location.href = fnData.payment_url
      return
    }

    setLoading(false)
    if (authData?.session) window.location.replace('/')
    else setDone(true)
  }

  if (paymentPending) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <main id="main-content" className="bg-white rounded-2xl shadow p-8 text-center space-y-4" role="status" aria-live="polite">
          <div className="text-5xl" aria-hidden="true">🥋</div>
          <h2 className="font-bold text-xl text-gray-800">הבקשה נשלחה!</h2>
          <p className="text-gray-700 text-sm leading-relaxed">
            הפרטים וההצהרה נשמרו בהצלחה. התשלום המקוון עדיין לא הופעל אצלנו —
            נציג של TeamPact ייצור איתך קשר להשלמת התשלום והפעלת המנוי.
          </p>
          <a href="/" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-base no-underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300">
            פתח את האפליקציה עכשיו ←
          </a>
        </main>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <main id="main-content" className="bg-white rounded-2xl shadow p-8 text-center space-y-4" role="status" aria-live="polite">
          <div className="text-5xl" aria-hidden="true">🥋</div>
          <h2 className="font-bold text-xl text-gray-800">הבקשה נשלחה!</h2>
          <p className="text-gray-700 text-sm leading-relaxed">
            ברוך הבא לעולם שלם של ג'יו־ג'יטסו.<br />
            עוד רגע אתה איתנו על המזרן.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800 font-medium">
            ⏳ ממתין לאישור מנהל לבדיקת המנוי.<br />
            לאחר האישור — תוכל להירשם לאימונים.
          </div>
          <a href="/" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-base no-underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300">
            פתח את האפליקציה עכשיו ←
          </a>
          <p className="text-xs text-gray-500">
            אפשר כבר להיכנס ולהתרשם — ההרשמה לאימונים תיפתח אוטומטית אחרי שהמנהל יאשר.
          </p>
          <p className="text-xs font-semibold text-gray-600 pt-1">וכדי לקבל התראות גם כשהאפליקציה סגורה — התקן אותה:</p>
          <InstallBanner variant="hero" />
          <div className="pt-4 mt-2 border-t border-gray-100">
            <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
              <span aria-hidden="true">🌐 </span>לאתר המועדון — teampact.co.il
              <span className="sr-only"> (נפתח בחלון חדש)</span>
            </a>
            <a href="/accessibility" className="block mt-3 text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
              <span aria-hidden="true">♿ </span>הצהרת נגישות
            </a>
          </div>
        </main>
      </div>
    </div>
  )

  const selfIsAthlete = !form.is_guardian || form.parent_also_trains
  // האם המתאמן-עצמו (בעל/ת החשבון) קטין/ה — רלוונטי רק כשלא במסלול "אני הורה"
  // (שם ההורה כבר הוא בעל/ת החשבון). קובע אם צריך שדה "שם הורה" נפרד לצורך החתימה.
  const selfIsMinor = selfIsAthlete && !form.is_guardian && (() => {
    const age = calcAge(form.self_birth_date)
    return age != null && age < 18
  })()

  // סה"כ לתשלום לתצוגה בלבד — מחיר אפקטיבי (אחרי הנחה, אם הלינק הנוכחי כולל אחת).
  // מחושב רק על אנשים שנרשמים לחולון קאנטרי ספציפית.
  const countryClubTotal =
    (selfIsAthlete && selfIsCountryClub ? effectivePrice(form.self_subscription_type) : 0) +
    children.reduce((sum, c) => sum + (isCountryClub(c.branch_ids) ? effectivePrice(c.subscription_type) : 0), 0)

  return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
      <InstallBanner />
      <main id="main-content" className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-1" aria-hidden="true">🥋</div>
          <h1 className="font-bold text-xl text-gray-800">הצטרפות ל-TeamPact</h1>
          <p className="text-sm text-gray-600 mt-0.5">מלא את הפרטים ונחזור אליך בהקדם</p>
        </div>

        {activeDiscount && (
          <div role="note" className="bg-emerald-50 border-2 border-emerald-400 rounded-xl px-3 py-2.5 text-center">
            <p className="text-sm font-bold text-emerald-800">🎉 הרשמה במסלול {activeDiscount.label} — TeamPact חולון קאנטרי</p>
            <p className="text-xs text-emerald-700 mt-0.5">המחיר המיוחד יחושב אוטומטית — פשוט מלא/י את הפרטים שלך</p>
          </div>
        )}

        <div role="note" className="bg-blue-50 border-2 border-blue-300 rounded-xl px-3 py-3 text-center">
          <p className="text-sm font-bold text-blue-900">כבר נרשמת בעבר?</p>
          <p className="text-xs text-blue-700 mt-0.5 mb-2">אין צורך למלא את הטופס שוב — פשוט היכנס לאפליקציה</p>
          <a href="/" className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl no-underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-400">
            פתח את האפליקציה ←
          </a>
        </div>

        <div role="note" className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-center">
          <p className="text-sm font-semibold text-amber-800">📝 יש למלא את הטופס בעברית בלבד</p>
          <p className="text-xs text-amber-700 mt-0.5">כדי שנוכל לזהות אתכם ולקשר לתשלום</p>
        </div>

        <div className="space-y-3">
          {/* הורה שרושם ילדים? */}
          <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_guardian}
              onChange={e => setForm(p => ({ ...p, is_guardian: e.target.checked }))}
              className="w-4 h-4 accent-emerald-600 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-400"
            />
            <span className="text-sm font-medium text-gray-700">👨‍👩‍👧 אני הורה שרושם/ת ילד/ים (חשבון אחד לכל הילדים)</span>
          </label>

          {/* ===== פרטי החשבון (הורה / בוגר) ===== */}
          <Field label={form.is_guardian ? 'שם מלא של ההורה' : 'שם מלא'} required hint="בעברית בלבד — שם פרטי ושם משפחה">
            {(props) => (
              <input {...props} type="text" autoComplete="name" lang="he" inputMode="text"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="ישראל ישראלי" value={form.account_name}
                onChange={e => setForm(p => ({ ...p, account_name: e.target.value }))} />
            )}
          </Field>

          <Field label="אימייל" required hint={form.is_guardian ? 'אימייל אחד לכל המשפחה' : undefined}>
            {(props) => (
              <input {...props} type="email" autoComplete="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="mail@example.com" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            )}
          </Field>

          <Field label="טלפון" required>
            {(props) => (
              <input {...props} type="tel" autoComplete="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="050-0000000" value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            )}
          </Field>

          <Field label="סיסמה" required hint="לפחות 6 תווים">
            {(props) => (
              <div className="relative">
                <input {...props} type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  className="w-full border rounded-lg px-3 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="לפחות 6 תווים" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                <EyeButton shown={showPassword} onToggle={() => setShowPassword(s => !s)} />
              </div>
            )}
          </Field>

          <Field label="אימות סיסמה" required>
            {(props) => (
              <div className="relative">
                <input {...props} type={showPasswordConfirm ? 'text' : 'password'} autoComplete="new-password"
                  className="w-full border rounded-lg px-3 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="הקלד שוב" value={form.passwordConfirm}
                  onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))} />
                <EyeButton shown={showPasswordConfirm} onToggle={() => setShowPasswordConfirm(s => !s)} />
              </div>
            )}
          </Field>

          {/* כשהורה — האם הוא גם מתאמן בעצמו */}
          {form.is_guardian && (
            <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.parent_also_trains}
                onChange={e => setForm(p => ({ ...p, parent_also_trains: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-400"
              />
              <span className="text-sm font-medium text-gray-700">אני גם מתאמן/ת בעצמי (לא רק רושם/ת את ילדיי)</span>
            </label>
          )}

          {/* ===== פרטי המתאמן-עצמו (בוגר, או הורה שגם מתאמן) ===== */}
          {selfIsAthlete && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              {form.is_guardian && <p className="text-sm font-bold text-gray-800">🥋 הפרטים שלך כמתאמן/ת</p>}
              <Field label="תאריך לידה" required>
                {(props) => (
                  <input {...props} type="date" max={TODAY}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.self_birth_date}
                    onChange={e => setForm(p => ({ ...p, self_birth_date: e.target.value }))} />
                )}
              </Field>
              {selfIsMinor && selfIsCountryClub && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-800">👨‍👩‍👧 את/ה קטין/ה — נדרש שם הורה/אפוטרופוס לצורך החתימה על ההצהרות למטה</p>
                  <Field label="שם מלא של ההורה/אפוטרופוס" required hint="ההורה הוא שממלא ת״ז וחותם בהצהרות למטה, לא את/ה">
                    {(props) => (
                      <input {...props} type="text" lang="he" inputMode="text"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="ישראל ישראלי" value={form.self_guardian_name}
                        onChange={e => setForm(p => ({ ...p, self_guardian_name: e.target.value }))} />
                    )}
                  </Field>
                </div>
              )}
              {activeDiscount ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800 font-semibold">
                  📍 סניף: {branches.find(b => b.requires_facility_waiver)?.name || 'חולון קאנטרי'} — מסלול {activeDiscount.label}
                </div>
              ) : (
                <BranchPicker branches={branches} selectedIds={form.self_branch_ids} onToggle={toggleSelfBranch} />
              )}
              <SubscriptionSelect value={form.self_subscription_type} onChange={v => setForm(p => ({ ...p, self_subscription_type: v }))} showPrices={selfIsCountryClub} discountPct={discPct} />
            </div>
          )}

          {/* ===== כרטיסי ילדים ===== */}
          {form.is_guardian && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-sm font-bold text-gray-800">👧 הילדים שלך</p>
              {children.map((c, i) => (
                <div key={i} className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-800">ילד/ה {i + 1}</span>
                    {children.length > 1 && (
                      <button type="button" onClick={() => removeChild(i)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-red-400 rounded">
                        הסר ✕
                      </button>
                    )}
                  </div>
                  <Field label="שם מלא של הילד/ה" required hint="בעברית בלבד — שם פרטי ושם משפחה">
                    {(props) => (
                      <input {...props} type="text" lang="he" inputMode="text"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="ישראל ישראלי" value={c.full_name}
                        onChange={e => updateChild(i, { full_name: e.target.value })} />
                    )}
                  </Field>
                  <Field label="תאריך לידה" required>
                    {(props) => (
                      <input {...props} type="date" max={TODAY}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={c.birth_date}
                        onChange={e => updateChild(i, { birth_date: e.target.value })} />
                    )}
                  </Field>
                  {activeDiscount ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800 font-semibold">
                      📍 סניף: {branches.find(b => b.requires_facility_waiver)?.name || 'חולון קאנטרי'} — מסלול {activeDiscount.label}
                    </div>
                  ) : (
                    <BranchPicker branches={branches} selectedIds={c.branch_ids} onToggle={id => toggleChildBranch(i, id)} />
                  )}
                  <SubscriptionSelect value={c.subscription_type} onChange={v => updateChild(i, { subscription_type: v })} showPrices={isCountryClub(c.branch_ids)} discountPct={discPct} />
                </div>
              ))}
              <button type="button" onClick={addChild}
                className="w-full py-2.5 border-2 border-dashed border-emerald-400 text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400">
                ➕ הוסף עוד ילד
              </button>
            </div>
          )}

          {anyCountryClub && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">סה״כ לתשלום{activeDiscount ? ' (לאחר הנחה)' : ''}</span>
                <span className="text-lg font-black text-emerald-700">₪{countryClubTotal}</span>
              </div>
              <CountryClubWaiver value={waiver} onChange={setWaiver} prefilledName={selfIsMinor ? form.self_guardian_name : form.account_name} />
              <InjuryRiskWaiver value={injuryWaiver} onChange={setInjuryWaiver} isMinor={form.is_guardian || selfIsMinor} prefilledName={selfIsMinor ? form.self_guardian_name : form.account_name} />
              <TermsAgreement checked={agreedToTerms} onChange={setAgreedToTerms} />
              {!activeDiscount && (
                <a
                  href={DUDI_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition no-underline"
                >
                  💬 מנוי מרכז הספורט (קאנטרי), עובד/ת שלו או בן/בת משפחה? יכול להיות שמגיע לך מחיר מותאם — צור/י קשר בוואטסאפ אחרי ההרשמה ונבדוק יחד.
                </a>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-2"
          >
            <span className="text-xl leading-none" aria-hidden="true">⚠️</span>
            <p className="text-red-700 text-sm font-bold text-right leading-relaxed">{error}</p>
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={loading} aria-busy={loading || undefined}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300">
          {loading ? 'שולח...' : (anyCountryClub ? 'המשך לתשלום' : 'שלח בקשת הצטרפות')}
        </button>

        <div className="text-center pt-2 border-t border-gray-100">
          <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-emerald-700 transition pt-3 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
            <span aria-hidden="true">🌐 </span>רוצים להכיר אותנו קודם? לאתר המועדון
            <span className="sr-only"> (נפתח בחלון חדש)</span>
          </a>
          <a href="/accessibility" className="block mt-2 text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
            <span aria-hidden="true">♿ </span>הצהרת נגישות
          </a>
        </div>
      </main>
      </div>
    </div>
  )
}
