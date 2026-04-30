import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'
import { Field } from '../a11y'

export default function RegisterCoachPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    branch_id: '',
    password: '',
    passwordConfirm: '',
  })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').eq('hidden', false).order('name')
      .then(({ data }) => setBranches(data || []))

    // אם המאמן כבר רשום ומחובר — נבדוק את הסטטוס שלו
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_approved')
        .eq('id', session.user.id)
        .maybeSingle()
      if (profile?.role === 'trainer') {
        if (profile.is_approved) {
          window.location.replace('/')
        } else {
          setDone(true)
        }
      }
    })
  }, [])

  // ממתין לאישור — בודק כל 5 שניות
  useEffect(() => {
    if (!done) return
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (profile?.is_approved) {
        clearInterval(interval)
        window.location.replace('/')
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [done])

  async function handleSubmit() {
    setError(null)
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim() || !form.branch_id) {
      setError('נא למלא שם, אימייל, טלפון וסניף')
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
    const email = form.email.trim().toLowerCase()

    // 1. יצירת משתמש Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), role: 'trainer' },
      },
    })
    if (authErr) {
      setLoading(false)
      setError(authErr.message.includes('registered') ? 'האימייל כבר רשום במערכת' : authErr.message)
      return
    }
    const userId = authData?.user?.id
    if (!userId) {
      setLoading(false)
      setError('שגיאה ביצירת משתמש — נסה שוב')
      return
    }

    // 2. UPSERT לרשומת profiles — חסין לחלוטין:
    //    - אם הטריגר handle_new_user יצר שורה: יעדכן אותה עם השדות החסרים.
    //    - אם הטריגר לא רץ (סיבה כלשהי): ייצור שורה חדשה.
    //    is_approved=false נשלח ידנית (גם אם הטריגר enforce_pending_coach_approval
    //    לא רץ ב-UPDATE — עבור UPSERT שמתפקד כ-INSERT הוא כן ירוץ).
    const profilePayload = {
      id: userId,
      email,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      role: 'trainer',
      requested_branch_id: form.branch_id,
      is_approved: false,
    }
    const { data: upsertData, error: profileErr } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select()
    setLoading(false)

    if (profileErr) {
      console.error('profile upsert error:', profileErr)
      setError('נרשמת אך הייתה בעיה בשמירת הפרטים — פנה למנהל')
      return
    }
    // וודא שהשורה אכן נוצרה/עודכנה — אחרת המאמן יהיה תקוע בלי לדעת
    if (!upsertData || upsertData.length === 0) {
      console.error('profile upsert returned no rows')
      setError('הרישום נכשל — פנה למנהל')
      return
    }

    setDone(true)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.replace('/register-coach')
  }

  if (done) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <main id="main-content" className="bg-white rounded-2xl shadow p-8 text-center space-y-3" role="status" aria-live="polite">
          <div className="text-5xl" aria-hidden="true">🥋</div>
          <h2 className="font-bold text-xl text-gray-800">בקשת המאמן נשלחה!</h2>
          <p className="text-gray-700 text-sm">המנהל קיבל התראה ויאשר אותך בקרוב.</p>
          <p className="text-gray-600 text-xs">לאחר האישור תקבל גישה מלאה כמאמן עם כל הכלים.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-blue-700 mt-2">
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>ממתין לאישור... הדף יתעדכן אוטומטית</span>
          </div>
          <button type="button" onClick={handleSignOut} className="mt-3 text-sm text-gray-700 underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded">
            התנתק
          </button>
        </main>
        <InstallBanner />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-sm w-full space-y-3">
        <InstallBanner />
        <main id="main-content" className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-1" aria-hidden="true">🥋</div>
            <h1 className="font-bold text-xl text-gray-800">הצטרפות כמאמן</h1>
            <p className="text-sm text-gray-600 mt-0.5">מלא את הפרטים — המנהל יאשר אותך</p>
          </div>

          <div className="space-y-3">
            <Field label="שם מלא" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoComplete="name"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="coach@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
              )}
            </Field>

            <Field label="טלפון" required>
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  autoComplete="tel"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="050-0000000"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                />
              )}
            </Field>

            <Field label="סניף" required>
              {(props) => (
                <select
                  {...props}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.branch_id}
                  onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}
                >
                  <option value="">בחר סניף</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="סיסמה" required hint="לפחות 6 תווים">
              {(props) => (
                <input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="הקלד שוב"
                  value={form.passwordConfirm}
                  onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))}
                />
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
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-300"
          >
            {loading ? 'שולח...' : 'שלח בקשת הצטרפות'}
          </button>

          <div className="text-center pt-2 border-t border-gray-100">
            <a href="/" className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-blue-700 transition pt-3 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded">
              ← חזרה לכניסה רגילה
            </a>
          </div>
        </main>
      </div>
    </div>
  )
}
