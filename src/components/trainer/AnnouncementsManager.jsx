import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPE_OPTIONS = [
  { value: 'general',  label: '📢 הודעה כללית (שינוי לו"ז / סגירה)' },
  { value: 'seminar',  label: '🎓 סמינר / אירוע' },
]

const TYPE_LABELS = {
  general:      '📢 הודעה כללית',
  seminar:      '🎓 סמינר',
  product:      '🛒 מוצר',
  announcement: '📢 הודעה',
}

const TYPE_COLORS = {
  general:      'bg-yellow-100 text-yellow-800',
  seminar:      'bg-blue-100 text-blue-800',
  product:      'bg-green-100 text-green-800',
  announcement: 'bg-gray-100 text-gray-600',
}

export default function AnnouncementsManager({ trainerId }) {
  const [items, setItems]       = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ title: '', content: '', type: 'general', event_date: '', price: '' })
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAnnouncements() }, [])

  async function fetchAnnouncements() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*')
      .in('type', ['general', 'announcement', 'seminar'])
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      title: form.title, content: form.content, type: form.type, trainer_id: trainerId,
      ...(form.type === 'seminar' && form.event_date ? { event_date: form.event_date } : {}),
      ...(form.type === 'product' && form.price      ? { price: parseFloat(form.price) } : {}),
    }
    await supabase.from('announcements').insert(payload)
    setForm({ title: '', content: '', type: 'general', event_date: '', price: '' })
    setShowForm(false)
    fetchAnnouncements()
  }

  async function deleteItem(id) {
    await supabase.from('announcements').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">הודעות וסמינרים</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          + פרסם הודעה חדשה
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">סוג הפרסום</label>
            <div className="grid grid-cols-1 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${form.type === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" name="type" value={opt.value} checked={form.type === opt.value}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="accent-blue-600" />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="כותרת" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={3}
            placeholder="תוכן / תיאור..." value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
          {form.type === 'seminar' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">תאריך ושעה</label>
              <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
            </div>
          )}
          {form.type === 'product' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">מחיר (₪)</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
                value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium">פרסם</button>
            <button onClick={() => setShowForm(false)} className="flex-1 border py-2 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הודעות עדיין</p></div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.id} className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {item.event_date && <span className="text-xs text-gray-400">{new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}
                    {item.price != null && <span className="text-xs font-bold text-green-600">₪{item.price}</span>}
                  </div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  {item.content && <p className="text-sm text-gray-500 mt-1">{item.content}</p>}
                  <p className="text-xs text-gray-300 mt-2">{new Date(item.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">מחק 🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
