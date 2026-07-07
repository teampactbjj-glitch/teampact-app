import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import InstallBanner from './InstallBanner'
import { notifyPush } from '../lib/notifyPush'
import { trainerUserIdsForMember } from '../lib/notifyTargets'
import { Field } from './a11y'

const SUB_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

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

function SubscriptionSelect({ value, onChange }) {
  return (
    <Field label="סוג מנוי מבוקש">
      {(props) => (
        <select
          {...props}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="1x_week">1× שבוע (באישור מנהל בלבד)</option>
          <option value="2x_week">2× שבוע</option>
          <option value="4x_week">4× שבוע</option>
          <option value="unlimited">ללא הגבלה</option>
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
  })
  const [children, setChildren] = useState([emptyChild()])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  // גלילה אוטומטית להודעת שגיאה כשהיא מופיעה — הטופס ארוך, וההודעה (כולל
  // "הטלפון כבר קיים") הייתה יכולה להישאר מחוץ לתצוגה בלי שהמשתמש ישים לב
  // שמשהו בכלל קרה בלחיצה על שליחה.
  const errorRef = useRef(null)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [error])

  useEffect(() => {
    supabase.from('branches').select('id, name').eq('hidden', false).then(({ data }) => setBranches(data || []))
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
  function addChild() { setChildren(list => [...list, emptyChild()]) }
  function removeChild(i) { setChildren(list => list.length <= 1 ? list : list.filter((_, idx) => idx !== i)) }

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
    if (selfIsAthlete) {
      if (!form.self_birth_date) { setError('נא למלא תאריך לידה'); return }
      if (form.self_branch_ids.length === 0) { setError('נא לבחור לפחות סניף אחד'); return }
    }

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

    setLoading(true)
    setError(null)
    const email = form.email.trim().toLowerCase()
    const parentName = form.account_name.trim()
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

    // 2. בניית רשומות member
    const memberRows = []
    if (selfIsAthlete) {
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
        parent_name: null,
      })
    }
    if (form.is_guardian) {
      for (const c of children) {
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
        })
      }
    }

    // 3. הכנסה ל-DB. רשומת ה-self (id=userId) חייבת להיכנס ראשונה (policy self_register_auth);
    //    הילדים נכנסים עם guardian_id (policy members_insert_guardian_child).
    let insertErr = null
    for (const row of memberRows) {
      const { error } = await supabase.from('members').insert(row)
      if (error) { insertErr = error; break }
    }
    setLoading(false)
    if (insertErr) {
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

    if (authData?.session) window.location.replace('/')
    else setDone(true)
  }

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
              <BranchPicker branches={branches} selectedIds={form.self_branch_ids} onToggle={toggleSelfBranch} />
              <SubscriptionSelect value={form.self_subscription_type} onChange={v => setForm(p => ({ ...p, self_subscription_type: v }))} />
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
                  <BranchPicker branches={branches} selectedIds={c.branch_ids} onToggle={id => toggleChildBranch(i, id)} />
                  <SubscriptionSelect value={c.subscription_type} onChange={v => updateChild(i, { subscription_type: v })} />
                </div>
              ))}
              <button type="button" onClick={addChild}
                className="w-full py-2.5 border-2 border-dashed border-emerald-400 text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400">
                ➕ הוסף עוד ילד
              </button>
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
          {loading ? 'שולח...' : 'שלח בקשת הצטרפות'}
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
