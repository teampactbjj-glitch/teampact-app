import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function RegisterPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', branch_id: '', subscription_type: '2x_week' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => setBranches(data || []))
  }, [])

  function set(field, val) { setForm(p => ({ ...p, [field]: val })) }

  async function handleSubmit() {
    if (!form.full_name.trim() || !form.email.trim() || !form.branch_id) {
      setError('נא למלא שם, אימייל וסניף')
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.from('members').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      branch_ids: [form.branch_id],
      branch_id: form.branch_id,
      subscription_type: form.subscription_type,
      status: 'pending',
    })
    setLoading(false)
    if (err) { setError('שגיאה בשליחה, ייתכן שהאימייל כבר קיים במערכת'); console.error(err); return }
    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center space-y-3">
        <div className="text-5xl">✅</div>
        <h2 className="font-bold text-xl text-gray-800">הבקשה נשלחה!</h2>
        <p className="text-gray-500 text-sm">הצוות יאשר אותך בקרוב ותוכל להתחבר לאפליקציה.</p>
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
              onChange={e => set('full_name', e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">אימייל *</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="mail@example.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">טלפון</label>
            <input
              type="tel"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="050-0000000"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">סניף *</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.branch_id}
              onChange={e => set('branch_id', e.target.value)}
            >
              <option value="">בחר סניף...</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">סוג מנוי מבוקש</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.subscription_type}
              onChange={e => set('subscription_type', e.target.value)}
            >
              <option value="2x_week">2× שבוע</option>
              <option value="4x_week">4× שבוע</option>
              <option value="unlimited">ללא הגבלה</option>
            </select>
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
