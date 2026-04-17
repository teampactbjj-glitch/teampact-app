import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = { pending: 'ממתין', done: 'טופל' }
const STATUS_COLORS = { pending: 'bg-orange-100 text-orange-700', done: 'bg-green-100 text-green-700' }

export default function ShopManager({ onOrdersChange }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [tab, setTab] = useState('orders')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', price: '', image_url: '', type: 'product' })
  const [loading, setLoading] = useState(true)

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

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      title: form.title,
      content: form.content,
      type: form.type,
      ...(form.price ? { price: parseFloat(form.price) } : {}),
      ...(form.image_url ? { image_url: form.image_url } : {}),
    }
    await supabase.from('announcements').insert(payload)
    setForm({ title: '', content: '', price: '', image_url: '', type: 'product' })
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
          מוצרים וסמינרים
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
                    <p className="font-semibold text-gray-800">{order.product_title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {order.members?.full_name || order.member_name}
                      {order.members?.phone && <span className="text-gray-400"> · {order.members.phone}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {order.status === 'pending' && (
                      <button onClick={() => markDone(order)}
                        className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg">
                        סמן כטופל ✓
                      </button>
                    )}
                    <button onClick={() => deleteOrder(order)}
                      className="text-xs text-red-400 hover:text-red-600 text-center">
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
            <button onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
              + הוסף מוצר / סמינר
            </button>
          </div>

          {showForm && (
            <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex gap-2">
                <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer text-sm ${form.type === 'product' ? 'border-blue-500 bg-blue-50 font-medium' : 'border-gray-200'}`}>
                  <input type="radio" name="type" value="product" checked={form.type === 'product'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="hidden" />
                  🛒 מוצר
                </label>
                <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer text-sm ${form.type === 'seminar' ? 'border-blue-500 bg-blue-50 font-medium' : 'border-gray-200'}`}>
                  <input type="radio" name="type" value="seminar" checked={form.type === 'seminar'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="hidden" />
                  🎓 סמינר
                </label>
              </div>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם המוצר / סמינר"
                value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
                placeholder="תיאור..." value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מחיר ₪"
                value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="קישור לתמונה (URL)"
                value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
              <div className="flex gap-2">
                <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm">שמור</button>
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
                  <button onClick={() => deleteProduct(item.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">מחק 🗑️</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
