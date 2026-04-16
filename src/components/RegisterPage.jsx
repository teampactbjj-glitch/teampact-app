import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function RegisterPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', branch_ids: [], subscription_type: '2x_week' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => setBranches(data || []))
  }, [])

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
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.from('members').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      branch_ids: form.branch_ids,
      branch_id: form.branch_ids[0],
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
              onChange={e => setForm(p => ({ ...p, subscription_type: e.target.value }))}
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
