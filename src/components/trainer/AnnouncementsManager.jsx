import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPE_LABELS = { announcement: '📢 הודעה', seminar: '🎓 סמינר' }

export default function AnnouncementsManager({ trainerId }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', type: 'announcement', event_date: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAnnouncements() }, [])

  async function fetchAnnouncements() {
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await supabase.from('announcements').insert({ ...form, trainer_id: trainerId })
    setForm({ title: '', content: '', type: 'announcement', event_date: '' })
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
        >
          + פרסם
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            <option value="announcement">הודעה</option>
            <option value="seminar">סמינר</option>
          </select>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="כותרת" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={3}
            placeholder="תוכן ההודעה..." value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
          {form.type === 'seminar' && (
            <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.event_date}
              onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
          )}
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm">פרסם</button>
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 border py-2 rounded-lg text-sm">ביטול</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p>אין הודעות עדיין</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.id} className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[item.type]}
                    </span>
                    {item.event_date && (
                      <span className="text-xs text-gray-400">
                        {new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  {item.content && <p className="text-sm text-gray-500 mt-1">{item.content}</p>}
                  <p className="text-xs text-gray-300 mt-2">
                    {new Date(item.created_at).toLocaleDateString('he-IL')}
                  </p>
                </div>
                <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 text-xs">מחק</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
