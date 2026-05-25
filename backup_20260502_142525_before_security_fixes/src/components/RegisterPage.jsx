import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import InstallBanner from './InstallBanner'
import { notifyPush } from '../lib/notifyPush'
import { trainerUserIdsForMember } from '../lib/notifyTargets'
import { Field } from './a11y'

const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

export default function RegisterPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', passwordConfirm: '', branch_ids: [], subscription_type: '2x_week' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').eq('hidden', false).then(({ data }) => setBranches(data || []))
    // אם המשתמש כבר מחובר ומאושר — מעביר אותו לאפליקציה
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: member } = await supabase
        .from('members')
        .select('status')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!member) return
      if (member.status === 'approved' || member.status === 'active') {
        window.location.replace('/')
      } else if (member.status === 'pending') {
        setDone(true)
      }
    })
  }, [])

  // כשהמסך "הבקשה נשלחה" פעיל — בודקים כל 5 שניות אם המנהל אישר
  // ברגע שהסטטוס הופך ל-active — מעבירים אוטומטית לאפליקציה
  useEffect(() => {
    if (!done) return
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: member } = await supabase
        .from('members')
        .select('status')
        .eq('id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (member?.status === 'approved' || member?.status === 'active') {
        clearInterval(interval)
        window.location.replace('/')
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [done])

  function toggleBranch(id) {
    setForm(p => {
      const already = p.branch_ids.includes(id)
      return { ...p, branch_ids: already ? p.branch_ids.filter(b => b !== id) : [...p.branch_ids, id] }
    })
  }

  async function handleSubmit() {
    if (!form.full_name.trim() || !form.email.trim() || form.branch_ids.length === 0) {
      setError('נא למלא שם, אימייל ולבחור לפחות סניף אחד')
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
    setLoading(true)
    setError(null)
    const email = form.email.trim().toLowerCase()
    // 1. יצירת משתמש auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), role: 'athlete' },
      },
    })
    if (authErr) {
      setLoading(false)
      setError(authErr.message.includes('registered') ? 'האימייל כבר רשום במערכת' : authErr.message)
      return
    }
    const userId = authData?.user?.id
    // 2. יצירת רשומת member עם אותו id
    const memberPayload = {
      full_name: form.full_name.trim(),
      email,
      phone: form.phone.trim() || null,
      branch_ids: form.branch_ids,
      branch_id: form.branch_ids[0],
      subscription_type: form.subscription_type,
      status: 'pending',
    }
    if (userId) memberPayload.id = userId
    const { error: memberErr } = await supabase.from('members').insert(memberPayload)
    setLoading(false)
    if (memberErr) {
      setError('נרשמת אך הייתה בעיה בשמירת הפרטים - פנה למאמן')
      console.error(memberErr)
      return
    }
    // Push למאמנים הרלוונטיים (fire-and-forget)
    trainerUserIdsForMember(memberPayload)
      .then(userIds => notifyPush({
        userIds,
        title: 'בקשת הצטרפות חדשה',
        body: `${memberPayload.full_name} — ${SUB_LABELS[memberPayload.subscription_type] || memberPayload.subscription_type}`,
        url: '/#athletes',
        tag: `lead:${userId || Date.now()}`,
      }))
      .catch(() => {})
    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <main id="main-content" className="bg-white rounded-2xl shadow p-8 text-center space-y-3" role="status" aria-live="polite">
          <div className="text-5xl" aria-hidden="true">✅</div>
          <h2 className="font-bold text-xl text-gray-800">הבקשה נשלחה!</h2>
          <p className="text-gray-700 text-sm">הצוות יאשר אותך בקרוב.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 mt-2">
            <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>ממתין לאישור... הדף יתעדכן אוטומטית</span>
          </div>
          <a href="/" className="block mt-2 text-sm text-blue-700 underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded">
            כבר אושרת? לחץ כאן להיכנס
          </a>
          <div className="pt-4 mt-4 border-t border-gray-100">
            <p className="text-xs text-gray-600 mb-2">בינתיים — הכירו אותנו טוב יותר</p>
            <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
              <span aria-hidden="true">🌐 </span>לאתר המועדון — teampact.co.il
              <span className="sr-only"> (נפתח בחלון חדש)</span>
            </a>
            <a
              href="/accessibility"
              className="block mt-3 text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded"
            >
              <span aria-hidden="true">♿ </span>הצהרת נגישות
            </a>
          </div>
        </main>
        <InstallBanner />
      </div>
    </div>
  )

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

        <div className="space-y-3">
          <Field label="שם מלא" required>
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="ישראל ישראלי"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              />
            )}
          </Field>

          <Field label="אימייל" required>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="mail@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              />
            )}
          </Field>

          <Field label="טלפון">
            {(props) => (
              <input
                {...props}
                type="tel"
                autoComplete="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="050-0000000"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              />
            )}
          </Field>

          <Field label="סיסמה" required hint="לפחות 6 תווים">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="לפחות 6 תווים"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              />
            )}
          </Field>

          <Field label="אימות סיסמה" required>
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="הקלד שוב"
                value={form.passwordConfirm}
                onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))}
              />
            )}
          </Field>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-700 block mb-2">
              סניף <span aria-hidden="true">*</span><span className="sr-only"> (חובה)</span> (ניתן לבחור יותר מאחד)
            </legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="בחירת סניפים">
              {branches.map(b => {
                const selected = form.branch_ids.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleBranch(b.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-500 ${
                      selected
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-500'
                    }`}
                  >
                    <span aria-hidden="true">{selected ? '✓ ' : ''}</span>{b.name}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Field label="סוג מנוי מבוקש">
            {(props) => (
              <select
                {...props}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={form.subscription_type}
                onChange={e => setForm(p => ({ ...p, subscription_type: e.target.value }))}
              >
                <option value="2x_week">2× שבוע</option>
                <option value="4x_week">4× שבוע</option>
                <option value="unlimited">ללא הגבלה</option>
              </select>
            )}
          </Field>
        </div>

        {error && (
          <p role="alert" aria-live="assertive" className="text-red-600 text-sm text-center font-medium">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          aria-busy={loading || undefined}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300"
        >
          {loading ? 'שולח...' : 'שלח בקשת הצטרפות'}
        </button>

        {/* קישור לאתר המועדון — למי שרוצה להכיר לפני הרשמה */}
        <div className="text-center pt-2 border-t border-gray-100">
          <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-emerald-700 transition pt-3 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded">
            <span aria-hidden="true">🌐 </span>רוצים להכיר אותנו קודם? לאתר המועדון
            <span className="sr-only"> (נפתח בחלון חדש)</span>
          </a>
          <a
            href="/accessibility"
            className="block mt-2 text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-400 rounded"
          >
            <span aria-hidden="true">♿ </span>הצהרת נגישות
          </a>
        </div>
      </main>
      </div>
    </div>
  )
}
