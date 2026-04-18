import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// רשימת המאמנים הזמינים בטופס — גם אם עדיין אין להם רשומה בטבלת coaches
const COACHES_FALLBACK = [
  { name: 'דודי בן זקן' },
  { name: 'סהר גפלא' },
  { name: 'מושיק קידר' },
  { name: 'איתי ליפשיץ' },
  { name: 'אולגה רובין' },
]

export default function RegisterPage() {
  const [branches, setBranches] = useState([])
  const [coaches, setCoaches] = useState([])  // מהדב — משתמש ב-id אם קיים, אחרת לפי שם
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', passwordConfirm: '', branch_ids: [], subscription_type: '2x_week', coach_ids: [], coach_names: [], all_coaches: false })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => setBranches(data || []))
    supabase.from('coaches').select('id, name').then(({ data }) => setCoaches(data || []))
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

  function toggleCoach(coach) {
    setForm(p => {
      const max = p.subscription_type === '4x_week' ? 2 : 1
      const already = p.coach_names.includes(coach.name)
      if (already) {
        return {
          ...p,
          coach_names: p.coach_names.filter(n => n !== coach.name),
          coach_ids: p.coach_ids.filter(id => id !== coach.id),
        }
      }
      // אם הגענו למקסימום — מחליפים את האחרון (ב-2x) או לא מוסיפים
      if (p.coach_names.length >= max) {
        if (max === 1) {
          return { ...p, coach_names: [coach.name], coach_ids: coach.id ? [coach.id] : [] }
        }
        return p
      }
      return {
        ...p,
        coach_names: [...p.coach_names, coach.name],
        coach_ids: coach.id ? [...p.coach_ids, coach.id] : p.coach_ids,
      }
    })
  }

  async function handleSubmit() {
    if (!form.full_name.trim() || !form.email.trim() || form.branch_ids.length === 0) {
      setError('נא למלא שם, אימייל ולבחור לפחות סניף אחד')
      return
    }
    // בחירת מאמן חובה רק למנויי 2x/4x (לא ל-unlimited)
    if (form.subscription_type !== 'unlimited' && form.coach_names.length === 0) {
      setError(form.subscription_type === '4x_week' ? 'נא לבחור מאמן אחד או שניים' : 'נא לבחור מאמן')
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
      coach_id: form.coach_ids[0] || null,
      requested_coach_name: form.subscription_type === 'unlimited' ? null : (form.coach_names[0] || null),
      requested_coach_names: form.subscription_type === 'unlimited' ? null : (form.coach_names.length ? form.coach_names : null),
    }
    if (userId) memberPayload.id = userId
    const { error: memberErr } = await supabase.from('members').insert(memberPayload)
    setLoading(false)
    if (memberErr) {
      setError('נרשמת אך הייתה בעיה בשמירת הפרטים - פנה למאמן')
      console.error(memberErr)
      return
    }
    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center space-y-3">
        <div className="text-5xl">✅</div>
        <h2 className="font-bold text-xl text-gray-800">הבקשה נשלחה!</h2>
        <p className="text-gray-500 text-sm">הצוות יאשר אותך בקרוב.</p>
        <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 mt-2">
          <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>ממתין לאישור... הדף יתעדכן אוטומטית</span>
        </div>
        <a href="/" className="block mt-2 text-sm text-blue-600 underline">כבר אושרת? לחץ כאן להיכנס</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-1">🥋</div>
          <h1 className="font-bold text-xl text-gray-800">הצטרפות ל-TeamPact</h1>
          <p className="text-sm text-gray-400 mt-0.5">מלא את הפרטים ונחזור אליך בהקדם</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">שם מלא *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="ישראל ישראלי"
              value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">אימייל *</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="mail@example.com"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">טלפון</label>
            <input
              type="tel"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="050-0000000"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">סיסמה *</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="לפחות 6 תווים"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">אימות סיסמה *</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="הקלד שוב"
              value={form.passwordConfirm}
              onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">סניף * (ניתן לבחור יותר מאחד)</label>
            <div className="flex flex-wrap gap-2">
              {branches.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBranch(b.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                    form.branch_ids.includes(b.id)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {form.branch_ids.includes(b.id) ? '✓ ' : ''}{b.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">סוג מנוי מבוקש</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.subscription_type}
              onChange={e => setForm(p => ({ ...p, subscription_type: e.target.value, coach_ids: [], coach_names: [], all_coaches: false }))}
            >
              <option value="2x_week">2× שבוע</option>
              <option value="4x_week">4× שבוע</option>
              <option value="unlimited">ללא הגבלה</option>
            </select>
          </div>

          {/* בחירת מאמן — חובה רק למנויי 2x/4x */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">
              {form.subscription_type === 'unlimited'
                ? 'מאמן'
                : form.subscription_type === '4x_week'
                  ? 'מאמן * (ניתן לבחור עד 2)'
                  : 'מאמן *'}
            </label>
            {form.subscription_type === 'unlimited' ? (
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, coach_ids: [], coach_names: [], all_coaches: true }))}
                className={`w-full px-4 py-2 rounded-xl text-sm font-medium border transition ${
                  form.all_coaches
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                }`}
              >
                {form.all_coaches ? '✓ ' : ''}כל המאמנים
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(() => {
                  // מיזוג: מאמנים מהדב לפי שם, ו-fallback אם לא קיימים ברשימה
                  const byName = new Map()
                  coaches.forEach(c => { if (c.name) byName.set(c.name, c) })
                  const display = COACHES_FALLBACK.map(fb => byName.get(fb.name) || { id: null, name: fb.name })
                  return display.map(c => {
                    const selected = form.coach_names.includes(c.name)
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleCoach(c)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{c.name}
                      </button>
                    )
                  })
                })()}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50"
        >
          {loading ? 'שולח...' : 'שלח בקשת הצטרפות'}
        </button>
      </div>
    </div>
  )
}
