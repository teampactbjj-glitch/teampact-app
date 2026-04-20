import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import { allActiveAthleteUserIds, allAdminUserIds } from '../../lib/notifyTargets'

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

export default function AnnouncementsManager({ trainerId, isAdmin, onChange }) {
  const [items, setItems]       = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]         = useState({ title: '', content: '', type: 'general', event_date: '', price: '', image_url: '' })
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      content: item.content || '',
      type: item.type || 'general',
      event_date: item.event_date ? new Date(item.event_date).toISOString().slice(0, 16) : '',
      price: item.price != null ? String(item.price) : '',
      image_url: item.image_url || '',
    })
    setShowForm(true)
  }

  function openAdd() {
    setEditingId(null)
    setForm({ title: '', content: '', type: 'general', event_date: '', price: '', image_url: '' })
    setShowForm(true)
  }

  async function uploadImage(file) {
    if (!file) return null
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `seminars/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const buckets = ['images', 'products']
      for (const b of buckets) {
        const { error } = await supabase.storage.from(b).upload(path, file)
        if (!error) {
          const { data: pub } = supabase.storage.from(b).getPublicUrl(path)
          return pub.publicUrl
        }
      }
      alert('שגיאה בהעלאת תמונה — ודא שקיים bucket בשם images או products ב-Supabase Storage')
      return null
    } finally {
      setUploading(false)
    }
  }

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
      ...(form.type === 'seminar' && form.price      ? { price: parseFloat(form.price) } : {}),
      ...(form.image_url ? { image_url: form.image_url } : {}),
    }
    if (editingId) {
      await supabase.from('announcements').update(payload).eq('id', editingId)
    } else {
      const status = isAdmin ? 'approved' : 'pending'
      const insertPayload = {
        ...payload,
        status,
        ...(isAdmin ? { approved_by: trainerId, approved_at: new Date().toISOString() } : {}),
      }
      await supabase.from('announcements').insert(insertPayload)
      if (status === 'approved') {
        // אדמין פרסם ישירות — התראה למתאמנים
        allActiveAthleteUserIds()
          .then(userIds => notifyPush({
            userIds,
            title: form.type === 'seminar' ? 'סמינר חדש' : 'הודעה חדשה',
            body: form.title,
            url: '/#announcements',
            tag: `announcement:${Date.now()}`,
          }))
          .catch(() => {})
      } else {
        // מאמן רגיל — התראה למנהלים לאישור
        allAdminUserIds()
          .then(userIds => notifyPush({
            userIds,
            title: 'בקשה לאישור הודעה',
            body: form.title,
            url: '/#announcements',
            tag: `announcement-pending:${Date.now()}`,
          }))
          .catch(() => {})
      }
    }
    setForm({ title: '', content: '', type: 'general', event_date: '', price: '', image_url: '' })
    setEditingId(null)
    setShowForm(false)
    fetchAnnouncements()
    onChange?.()
  }

  async function approveItem(item) {
    await supabase.from('announcements').update({
      status: 'approved',
      approved_by: trainerId,
      approved_at: new Date().toISOString(),
    }).eq('id', item.id)
    // התראה למתאמנים על הפרסום
    allActiveAthleteUserIds()
      .then(userIds => notifyPush({
        userIds,
        title: item.type === 'seminar' ? 'סמינר חדש' : 'הודעה חדשה',
        body: item.title,
        url: '/#announcements',
        tag: `announcement:${item.id}`,
      }))
      .catch(() => {})
    fetchAnnouncements()
    onChange?.()
  }

  async function deleteItem(id) {
    await supabase.from('announcements').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    onChange?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">הודעות וסמינרים</h2>
        <button onClick={() => showForm ? setShowForm(false) : openAdd()} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          {showForm ? 'ביטול' : '+ פרסם הודעה חדשה'}
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
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">תאריך ושעה</label>
                <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">מחיר (₪)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
                  value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <label className="text-xs text-gray-500">תמונה (אופציונלי)</label>
            <div className="flex gap-2 items-center">
              <input type="file" accept="image/*"
                onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const url = await uploadImage(f)
                  if (url) setForm(p => ({ ...p, image_url: url }))
                }}
                className="flex-1 text-xs" />
              {uploading && <span className="text-xs text-blue-500">מעלה...</span>}
            </div>
            {form.image_url && (
              <div className="flex items-center gap-2">
                <img src={form.image_url} alt="preview" className="w-16 h-16 rounded-lg object-cover border" />
                <button type="button" onClick={() => setForm(p => ({ ...p, image_url: '' }))}
                  className="text-xs text-red-500">הסר</button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium">{editingId ? 'עדכן' : 'פרסם'}</button>
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
                    {item.status === 'pending' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">⏳ ממתין לאישור</span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  {item.content && <p className="text-sm text-gray-500 mt-1">{item.content}</p>}
                  <p className="text-xs text-gray-300 mt-2">{new Date(item.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                {(isAdmin || item.trainer_id === trainerId) && (
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    {isAdmin && item.status === 'pending' && (
                      <button onClick={() => approveItem(item)} className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-lg">✅ אשר</button>
                    )}
                    <button onClick={() => openEdit(item)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg">✏️ ערוך</button>
                    <button onClick={() => deleteItem(item.id)} className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg">🗑️ מחק</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
