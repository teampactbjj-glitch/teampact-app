import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPES = [
  { value: 'general', label: 'הודעה כללית', icon: '📢', color: 'bg-blue-100 text-blue-700' },
  { value: 'seminar',      label: 'סמינר',        icon: '🎓', color: 'bg-purple-100 text-purple-700' },
  { value: 'product',      label: 'מוצר למכירה',  icon: '🛒', color: 'bg-green-100 text-green-700' },
]

const EMPTY_FORM = {
  title: '', content: '', type: 'general',
  event_date: '', price: '', image_url: '',
}

function TypeBadge({ type }) {
  const t = TYPES.find(x => x.value === type) || TYPES[0]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>
      {t.icon} {t.label}
    </span>
  )
}

export default function AnnouncementsManager({ trainerId }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileRef = useRef()

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

  async function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageUploading(true)
    const ext = file.name.split('.').pop()
    const path = `announcements/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file)
    if (error) {
      console.error('image upload error:', error)
      alert('שגיאה בהעלאת התמונה')
      setImageUploading(false)
      return
    }
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    setForm(p => ({ ...p, image_url: data.publicUrl }))
    setImageUploading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      content: form.content.trim() || null,
      type: form.type,
      event_date: form.event_date || null,
      price: form.price ? Number(form.price) : null,
      image_url: form.image_url || null,
      trainer_id: trainerId,
    }
    const { error } = await supabase.from('announcements').insert(payload)
    setSaving(false)
    if (error) { console.error('insert error:', error); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    fetchAnnouncements()
  }

  async function deleteItem(id) {
    await supabase.from('announcements').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setConfirmDelete(null)
  }

  const needsDate  = form.type === 'seminar'
  const needsPrice = form.type === 'seminar' || form.type === 'product'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">הודעות וסמינרים</h2>
        <button
          onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM) }}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
        >
          + פרסם הודעה חדשה
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="font-semibold text-gray-700 text-sm">פרסום הודעה חדשה</h3>

          {/* Type selector */}
          <div className="flex gap-2">
            {TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(p => ({ ...p, type: t.value }))}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                  form.type === t.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="כותרת *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            required
          />

          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="תוכן / פרטים..."
            value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
          />

          {needsDate && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך ושעת האירוע</label>
              <input
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.event_date}
                onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))}
              />
            </div>
          )}

          {needsPrice && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">מחיר (₪)</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="0"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              />
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">תמונה (אופציונלי)</label>
            {form.image_url ? (
              <div className="relative inline-block">
                <img src={form.image_url} alt="" className="h-24 rounded-lg object-cover border" />
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, image_url: '' }))}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                >✕</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imageUploading}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:opacity-50"
              >
                {imageUploading ? 'מעלה תמונה...' : '📷 לחץ להוספת תמונה'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || imageUploading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'מפרסם...' : 'פרסם'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {/* List */}
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
            <li key={item.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
              {item.image_url && (
                <img src={item.image_url} alt="" className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <TypeBadge type={item.type} />
                      {item.event_date && (
                        <span className="text-xs text-purple-600 font-medium">
                          📅 {new Date(item.event_date).toLocaleDateString('he-IL', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })} · {new Date(item.event_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {item.price != null && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                          ₪{item.price}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800">{item.title}</p>
                    {item.content && <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{item.content}</p>}
                    <p className="text-xs text-gray-300 mt-2">
                      פורסם {new Date(item.created_at).toLocaleDateString('he-IL')}
                    </p>
                  </div>

                  {/* Delete */}
                  {confirmDelete === item.id ? (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg"
                      >
                        אשר מחיקה
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs border px-2 py-1 rounded-lg text-gray-500"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0"
                      title="מחק"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
