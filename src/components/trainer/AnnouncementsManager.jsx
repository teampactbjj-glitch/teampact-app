import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPES = [
  { value: 'general', label: 'הודעה כללית', icon: '📢', color: 'bg-blue-100 text-blue-700' },
  { value: 'seminar', label: 'סמינר', icon: '🎓', color: 'bg-purple-100 text-purple-700' },
  { value: 'product', label: 'מוצר למכירה', icon: '🛒', color: 'bg-green-100 text-green-700' },
]

const EMPTY_FORM = { title: '', content: '', type: 'general', event_date: '', price: '', image_url: '' }

export default function AnnouncementsManager({ trainerId }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem('announcementDraft')
      return saved ? JSON.parse(saved) : EMPTY_FORM
    } catch { return EMPTY_FORM }
  })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    try { localStorage.setItem('announcementDraft', JSON.stringify(form)) } catch {}
  }, [form])
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
    if (editingId) {
      await supabase.from('announcements').update({ ...form }).eq('id', editingId)
    } else {
      await supabase.from('announcements').insert({ ...form, trainer_id: trainerId })
    }
    setForm(EMPTY_FORM)
    localStorage.removeItem('announcementDraft')
    setShowForm(false)
    setEditingId(null)
    fetchAnnouncements()
  }

  function startEdit(item) {
    setForm({
      title: item.title || '',
      content: item.content || '',
      type: item.type || 'general',
      event_date: item.event_date || '',
      price: item.price || '',
      image_url: item.image_url || '',
    })
    setEditingId(item.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  async function deleteItem(id) {
    await supabase.from('announcements').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const typeInfo = (type) => TYPES.find(t => t.value === type) || TYPES[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">הודעות וסמינרים</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
          >
            + פרסם הודעה חדשה
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <p className="font-semibold text-gray-700 text-sm">{editingId ? '✏️ עריכת הודעה' : 'פרסום הודעה חדשה'}</p>
          <div className="flex gap-2">
            {TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => setForm(p => ({ ...p, type: t.value }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${form.type === t.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
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
          {form.type === 'product' && (
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מחיר (₪)"
              value={form.price}
              onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
          )}
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm">
              {editingId ? 'שמור שינויים' : 'פרסם'}
            </button>
            <button type="button" onClick={cancelForm} className="flex-1 border py-2 rounded-lg text-sm">ביטול</button>
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
          {items.map(item => {
            const t = typeInfo(item.type)
            return (
              <li key={item.id} className="bg-white border rounded-xl p-4 shadow-sm">
                {item.image_url && (
                  <img src={item.image_url} alt="" className="w-full rounded-lg mb-3 object-cover max-h-48" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.color}`}>{t.icon} {t.label}</span>
                      {item.event_date && (
                        <span className="text-xs text-gray-400">
                          {new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {item.price && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">₪{item.price}</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800">{item.title}</p>
                    {item.content && <p className="text-sm text-gray-500 mt-1">{item.content}</p>}
                    <p className="text-xs text-gray-300 mt-2">{new Date(item.created_at).toLocaleDateString('he-IL')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => startEdit(item)} className="text-blue-400 hover:text-blue-600 text-xs">✏️ ערוך</button>
                    <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 text-xs">🗑️ מחק</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
