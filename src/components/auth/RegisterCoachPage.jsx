import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'

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

    // 2. יצירת רשומת profiles עם role=trainer (הטריגר ב-DB יכפה is_approved=false)
    const profilePayload = {
      id: userId,
      full_name: form.full_name.trim(),
      email,
      phone: form.phone.trim(),
      role: 'trainer',
      requested_branch_id: form.branch_id,
    }
    const { error: profileErr } = await supabase.from('profiles').insert(profilePayload)
    setLoading(false)

    if (profileErr) {
      console.error('profile insert error:', profileErr)
      setError('נרשמת אך הייתה בעיה בשמירת הפרטים — פנה למנהל')
      return
    }

    setDone(true)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.replace('/register-coach')
  }

  if (done) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-3">
        <div className="bg-white rounded-2xl shadow p-8 text-center space-y-3">
          <div className="text-5xl">🥋</div>
          <h2 className="font-bold text-xl text-gray-800">בקשת המאמן נשלחה!</h2>
          <p className="text-gray-500 text-sm">המנהל קיבל התראה ויאשר אותך בקרוב.</p>
          <p className="text-gray-400 text-xs">לאחר האישור תקבל גישה מלאה כמאמן עם כל הכלים.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-blue-600 mt-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>ממתין לאישור... הדף יתעדכן אוטומטית</span>
          </div>
          <button onClick={handleSignOut} className="mt-3 text-sm text-gray-500 underline">
            התנתק
          </button>
        </div>
        <InstallBanner />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-3">
        <InstallBanner />
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-1">🥋</div>
            <h1 className="font-bold text-xl text-gray-800">הצטרפות כמאמן</h1>
            <p className="text-sm text-gray-400 mt-0.5">מלא את הפרטים — המנהל יאשר אותך</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">שם מלא *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="ישראל ישראלי"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">אימייל *</label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="coach@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">טלפון *</label>
              <input
                type="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="050-0000000"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">סניף *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.branch_id}
                onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}
              >
                <option value="">בחר סניף</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">סיסמה *</label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="לפחות 6 תווים"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">אימות סיסמה *</label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="הקלד שוב"
                value={form.passwordConfirm}
                onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50"
          >
            {loading ? 'שולח...' : 'שלח בקשת הצטרפות'}
          </button>

          <div className="text-center pt-2 border-t border-gray-100">
            <a href="/" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-700 transition pt-3">
              ← חזרה לכניסה רגילה
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
