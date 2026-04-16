import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    branch_id: '',
    class_id: '',
  })
  const [branches, setBranches] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name').then(({ data }) => {
      if (data?.length) {
        setBranches(data)
        setForm(p => ({ ...p, branch_id: data[0].id }))
      }
    })
    supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, branch_id')
      .order('name')
      .then(({ data }) => setClasses(data || []))
  }, [])

  function normalizePhone(p) {
    return p.replace(/[\s\-\(\)]/g, '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const phone = normalizePhone(form.phone)

    // Check if already registered with this phone
    const { data: existing } = await supabase
      .from('members')
      .select('id, status, full_name')
      .eq('phone', phone)
      .eq('full_name', form.full_name)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'pending') {
        setError('בקשת הרשמה כבר קיימת עבור שם ומספר זה — ממתינה לאישור.')
      } else {
        setError('מתאמן עם שם ומספר טלפון זה כבר קיים במערכת. פנה למנהל.')
      }
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('members').insert({
      full_name: form.full_name,
      phone,
      email: form.email || null,
      branch_id: form.branch_id || null,
      status: 'pending',
      active: false,
      group_ids: form.class_id ? [form.class_id] : null,
      group_id: form.class_id || null,
    })

    if (insertError) {
      console.error('register error:', insertError)
      setError('אירעה שגיאה בשמירת הבקשה. נסה שוב.')
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-800 to-emerald-600 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-xl font-bold text-gray-800">הבקשה התקבלה!</h2>
          <p className="text-gray-600 text-sm">בקשת ההרשמה שלך נשמרה.</p>
          <p className="text-gray-500 text-sm">המנהל יאשר את חשבונך ויגדיר את תוכנית האימונים שלך.</p>
          <p className="text-gray-400 text-xs mt-2">לאחר האישור תוכל להיכנס באמצעות מספר הטלפון שלך.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-800 to-emerald-600 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">💪</div>
          <h1 className="text-2xl font-bold text-gray-800">TeamPact</h1>
          <p className="text-gray-500 mt-1 text-sm">הרשמה לחדר הכושר</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
              placeholder="ישראל ישראלי"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון *</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
              placeholder="050-0000000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              אימייל <span className="text-gray-400 font-normal">(לא חובה)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סניף *</label>
            <div className="flex gap-2 flex-wrap">
              {branches.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, branch_id: b.id, class_id: '' }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    form.branch_id === b.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קבוצה / שיעור</label>
            <select
              value={form.class_id}
              onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right bg-white"
            >
              <option value="">בחר קבוצה (לא חובה)</option>
              {classes.filter(c => !form.branch_id || c.branch_id === form.branch_id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg p-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'שולח...' : 'שלח בקשת הרשמה'}
          </button>
        </form>
      </div>
    </div>
  )
}
