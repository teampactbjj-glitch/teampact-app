import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = { pending: 'ממתין', done: 'טופל' }
const STATUS_COLORS = { pending: 'bg-orange-100 text-orange-700', done: 'bg-green-100 text-green-700' }

export default function ShopManager({ onOrdersChange }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [tab, setTab] = useState('orders')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', price: '', image_url: '' })
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  function openEdit(product) {
    setEditingId(product.id)
    setForm({
      title: product.title || '',
      content: product.content || '',
      price: product.price != null ? String(product.price) : '',
      image_url: product.image_url || '',
    })
    setShowForm(true)
  }

  function openAdd() {
    setEditingId(null)
    setForm({ title: '', content: '', price: '', image_url: '' })
    setShowForm(true)
  }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: prods }, { data: ords1 }, { data: ords2 }] = await Promise.all([
      supabase.from('announcements').select('*').eq('type', 'product').order('created_at', { ascending: false }),
      supabase.from('product_orders').select('*, members(full_name, phone)').order('created_at', { ascending: false }),
      supabase.from('product_requests').select('*').order('created_at', { ascending: false }),
    ])
    setProducts(prods || [])
    // מיזוג: orders (הישן) + requests (החדש)
    const merged = [
      ...(ords1 || []).map(o => ({ ...o, _source: 'order' })),
      ...(ords2 || []).map(o => ({
        id: o.id,
        product_name: o.product_name,
        status: o.status,
        created_at: o.created_at,
        members: { full_name: o.athlete_name, phone: null },
        _source: 'request',
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setOrders(merged)
    const pending = merged.filter(o => o.status === 'pending').length
    onOrdersChange?.(pending)
    setLoading(false)
  }

  async function deleteProduct(id) {
    await supabase.from('announcements').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  async function uploadImage(file) {
    if (!file) return null
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('products').upload(path, file)
      if (upErr) {
        const { error: upErr2 } = await supabase.storage.from('images').upload(path, file)
        if (upErr2) { alert('שגיאת העלאה: ' + upErr2.message); return null }
        const { data: pub } = supabase.storage.from('images').getPublicUrl(path)
        return pub.publicUrl
      }
      const { data: pub } = supabase.storage.from('products').getPublicUrl(path)
      return pub.publicUrl
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      title: form.title,
      content: form.content,
      type: 'product',
      price: form.price ? parseFloat(form.price) : null,
      image_url: form.image_url || null,
    }
    if (editingId) {
      await supabase.from('announcements').update(payload).eq('id', editingId)
    } else {
      await supabase.from('announcements').insert(payload)
    }
    setForm({ title: '', content: '', price: '', image_url: '' })
    setEditingId(null)
    setShowForm(false)
    fetchAll()
  }

  async function markDone(order) {
    const table = order._source === 'request' ? 'product_requests' : 'product_orders'
    await supabase.from(table).update({ status: 'done' }).eq('id', order.id)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'done' } : o))
    const pending = orders.filter(o => o.id !== order.id && o.status === 'pending').length
    onOrdersChange?.(pending)
  }

  async function deleteOrder(order) {
    const table = order._source === 'request' ? 'product_requests' : 'product_orders'
    await supabase.from(table).delete().eq('id', order.id)
    setOrders(prev => prev.filter(o => o.id !== order.id))
    const pending = orders.filter(o => o.id !== order.id && o.status === 'pending').length
    onOrdersChange?.(pending)
  }

  if (loading) return <p className="text-center text-gray-400 py-10">טוען...</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setTab('orders')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'orders' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
          בקשות הזמנה {orders.filter(o => o.status === 'pending').length > 0 && `(${orders.filter(o => o.status === 'pending').length})`}
        </button>
        <button onClick={() => setTab('products')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'products' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
          מוצרים
        </button>
      </div>

      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הזמנות עדיין</p></div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('he-IL')}</span>
                    </div>
                    <p className="font-semibold text-gray-800">🛒 {order.product_name || order.product_title || 'מוצר'}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      <span className="text-gray-500">מבקש: </span>
                      <span className="font-medium">{order.members?.full_name || order.member_name || 'לא ידוע'}</span>
                      {order.members?.phone && <span className="text-gray-400"> · {order.members.phone}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 items-center">
                    {order.status === 'pending' && (
                      <button onClick={() => markDone(order)}
                        className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg">
                        סמן כטופל ✓
                      </button>
                    )}
                    <button onClick={() => deleteOrder(order)}
                      className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg">
                      מחק
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => showForm ? setShowForm(false) : openAdd()}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
              {showForm ? 'ביטול' : '+ הוסף מוצר'}
            </button>
          </div>

          {showForm && (
            <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם המוצר"
                value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
                placeholder="תיאור..." value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מחיר ₪"
                value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              <div className="space-y-2">
                <label className="text-xs text-gray-500">תמונה</label>
                <div className="flex gap-2 items-center">
                  <input type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
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
                <input className="w-full border rounded-lg px-3 py-2 text-xs text-gray-500" placeholder="או קישור חיצוני (אופציונלי)"
                  value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSubmit} disabled={uploading} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">שמור</button>
                <button onClick={() => setShowForm(false)} className="flex-1 border py-2 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          )}

          {products.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🛍️</div><p>אין מוצרים עדיין</p></div>
          ) : (
            <ul className="space-y-3">
              {products.map(item => (
                <li key={item.id} className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {item.image_url && <img src={item.image_url} alt={item.title} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{item.title}</p>
                      {item.price != null && <p className="text-sm text-emerald-600 font-bold">₪{item.price}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(item)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg">✏️ ערוך</button>
                    <button onClick={() => deleteProduct(item.id)} className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg">🗑️ מחק</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
