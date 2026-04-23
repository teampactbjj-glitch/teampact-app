import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = { pending: 'ממתין', done: 'טופל' }
const STATUS_COLORS = { pending: 'bg-orange-100 text-orange-700', done: 'bg-green-100 text-green-700' }

export default function ShopManager({ onOrdersChange, isAdmin = false, trainerId = null }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [tab, setTab] = useState(isAdmin ? 'orders' : 'products')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    description_long: '',
    price: '',
    image_url: '',
    features: [],           // רשימת תכונות (bullets)
    has_variants: false,    // האם יש מידות/צבעים
    available_sizes: [],    // ['A0','A1','A2','A3','A4']
    available_colors: [],   // ['שחור','לבן']
  })
  const [variants, setVariants] = useState([])  // [{size, color, stock, price_override, sku, active}]
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  async function openEdit(product) {
    setEditingId(product.id)
    setForm({
      title: product.title || '',
      content: product.content || '',
      description_long: product.description_long || '',
      price: product.price != null ? String(product.price) : '',
      image_url: product.image_url || '',
      features: Array.isArray(product.features) ? product.features : [],
      has_variants: !!product.has_variants,
      available_sizes: product.available_sizes || [],
      available_colors: product.available_colors || [],
    })
    // טוען וריאנטים קיימים
    const { data: vars } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: true })
    setVariants(vars || [])
    setShowForm(true)
  }

  function openAdd() {
    setEditingId(null)
    setForm({
      title: '', content: '', description_long: '', price: '', image_url: '',
      features: [], has_variants: false, available_sizes: [], available_colors: [],
    })
    setVariants([])
    setShowForm(true)
  }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    // מאמן רגיל (לא אדמין) רואה רק מוצרים — לא מושכים בקשות הזמנה בכלל
    // חשוב: מסננים deleted_at is null בצד הלקוח כי במצב אדמין ה-RLS לא מסנן soft-deleted
    if (!isAdmin) {
      const { data: prods } = await supabase
        .from('announcements').select('*').eq('type', 'product').is('deleted_at', null).order('created_at', { ascending: false })
      setProducts(prods || [])
      setOrders([])
      onOrdersChange?.(0)
      setLoading(false)
      return
    }
    const [{ data: prods }, { data: ords1 }, { data: ords2 }] = await Promise.all([
      supabase.from('announcements').select('*').eq('type', 'product').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('product_orders').select('*, members(full_name, phone)').is('deleted_at', null).order('created_at', { ascending: false }),
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
    // אבחון מלא: מחזירים את הרשומה שנמחקה. אם לא חזרה רשומה - המחיקה לא עברה (בד"כ RLS).
    const { data, error } = await supabase.from('announcements').delete().eq('id', id).select()
    console.log('[deleteProduct]', { id, data, error })
    if (error) {
      alert('שגיאה במחיקת המוצר: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('המחיקה לא בוצעה - ייתכן שאין לך הרשאת מחיקה (RLS). בדוק את מדיניות ההרשאות ב-Supabase.')
      return
    }
    // לאחר מחיקה מוצלחת - מרעננים מהשרת כדי להיות 100% מסונכרנים (במקום רק לסנן state מקומי)
    setProducts(prev => prev.filter(p => p.id !== id))
    fetchAll()
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
      description_long: form.description_long || null,
      type: 'product',
      price: form.price ? parseFloat(form.price) : null,
      image_url: form.image_url || null,
      trainer_id: trainerId || null,
      features: form.features || [],
      has_variants: !!form.has_variants,
      available_sizes: form.available_sizes || [],
      available_colors: form.available_colors || [],
    }

    let productId = editingId
    if (editingId) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editingId)
      if (error) { alert('שגיאה בעדכון המוצר: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('announcements').insert(payload).select().single()
      if (error) { alert('שגיאה ביצירת המוצר: ' + error.message); return }
      productId = data.id
    }

    // סנכרון וריאנטים (רק אם המוצר תומך בוריאנטים)
    if (form.has_variants && productId) {
      // מוחקים וריאנטים קיימים לא ברשימה
      const keepIds = variants.filter(v => v.id).map(v => v.id)
      if (editingId && keepIds.length > 0) {
        await supabase.from('product_variants').delete()
          .eq('product_id', productId).not('id', 'in', `(${keepIds.join(',')})`)
      } else if (editingId) {
        await supabase.from('product_variants').delete().eq('product_id', productId)
      }

      // upsert לכל וריאנט
      for (const v of variants) {
        const row = {
          product_id: productId,
          size: v.size || null,
          color: v.color || null,
          sku: v.sku || null,
          stock: parseInt(v.stock) || 0,
          price_override: v.price_override ? parseFloat(v.price_override) : null,
          active: v.active !== false,
        }
        if (v.id) {
          await supabase.from('product_variants').update(row).eq('id', v.id)
        } else {
          await supabase.from('product_variants').insert(row)
        }
      }
    } else if (productId && editingId) {
      // בוטלו הוריאנטים - מנקים אותם
      await supabase.from('product_variants').delete().eq('product_id', productId)
    }

    setForm({
      title: '', content: '', description_long: '', price: '', image_url: '',
      features: [], has_variants: false, available_sizes: [], available_colors: [],
    })
    setVariants([])
    setEditingId(null)
    setShowForm(false)
    fetchAll()
  }

  // מחולל אוטומטית וריאנטים מכל השילובים של מידות × צבעים
  function generateVariantsFromMatrix() {
    const sizes = form.available_sizes.length ? form.available_sizes : [null]
    const colors = form.available_colors.length ? form.available_colors : [null]
    const newVariants = []
    for (const size of sizes) {
      for (const color of colors) {
        // אם כבר קיים השילוב - לא להוסיף שוב
        const exists = variants.find(v => (v.size || null) === size && (v.color || null) === color)
        if (exists) { newVariants.push(exists); continue }
        newVariants.push({ size, color, stock: 0, sku: '', price_override: '', active: true })
      }
    }
    setVariants(newVariants)
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
    const { data, error } = await supabase.from(table).delete().eq('id', order.id).select()
    console.log('[deleteOrder]', { id: order.id, table, data, error })
    if (error) {
      alert('שגיאה במחיקת הבקשה: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('המחיקה לא בוצעה - ייתכן שאין הרשאת מחיקה (RLS) על טבלת ' + table)
      return
    }
    setOrders(prev => prev.filter(o => o.id !== order.id))
    const pending = orders.filter(o => o.id !== order.id && o.status === 'pending').length
    onOrdersChange?.(pending)
  }

  if (loading) return <p className="text-center text-gray-400 py-10">טוען...</p>

  return (
    <div className="space-y-4">
      {isAdmin && (
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
      )}

      {isAdmin && tab === 'orders' && (
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
                  {isAdmin && (
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
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button onClick={() => showForm ? setShowForm(false) : openAdd()}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                {showForm ? 'ביטול' : '+ הוסף מוצר'}
              </button>
            </div>
          )}

          {showForm && (
            <div className="bg-white border rounded-xl p-4 space-y-4 shadow-sm">
              {/* פרטים בסיסיים */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-600 border-b pb-1">פרטים בסיסיים</h4>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם המוצר *"
                  value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
                  placeholder="תיאור קצר (שורה-שתיים)" value={form.content}
                  onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
                <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מחיר בסיס ₪"
                  value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </div>

              {/* תיאור מלא */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-600 border-b pb-1">תיאור מלא (יוצג בדף המוצר)</h4>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={5}
                  placeholder="פירוט מלא - חומרים, גזרה, איכות התפרים, שימוש מומלץ, הדגשים של המותג..."
                  value={form.description_long}
                  onChange={e => setForm(p => ({ ...p, description_long: e.target.value }))} />
              </div>

              {/* תכונות בולטות (features/bullets) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-600 border-b pb-1">תכונות בולטות (יוצגו כרשימה)</h4>
                {form.features.map((feat, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-gray-400">•</span>
                    <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="לדוגמה: תפרים מחוזקים, כיס נסתר, בד נושם"
                      value={feat}
                      onChange={e => setForm(p => {
                        const next = [...p.features]; next[idx] = e.target.value
                        return { ...p, features: next }
                      })} />
                    <button type="button" className="text-red-500 text-xs"
                      onClick={() => setForm(p => ({ ...p, features: p.features.filter((_, i) => i !== idx) }))}>✕</button>
                  </div>
                ))}
                <button type="button" className="text-xs text-blue-600"
                  onClick={() => setForm(p => ({ ...p, features: [...p.features, ''] }))}>+ הוסף תכונה</button>
              </div>

              {/* תמונה */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-600 border-b pb-1">תמונה</h4>
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

              {/* וריאנטים - מידות וצבעים */}
              <div className="space-y-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
                <label className="flex items-center gap-2 text-sm font-bold text-blue-900">
                  <input type="checkbox" checked={form.has_variants}
                    onChange={e => setForm(p => ({ ...p, has_variants: e.target.checked }))} />
                  למוצר יש מידות / צבעים (וריאנטים)
                </label>

                {form.has_variants && (
                  <div className="space-y-3 pt-2">
                    {/* מידות זמינות */}
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        מידות זמינות - הקלד מידה ולחץ Enter (או פסיק)
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1 min-h-[28px]">
                        {form.available_sizes.map((size, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs">
                            {size}
                            <button type="button" className="text-blue-600 hover:text-red-500 font-bold"
                              onClick={() => setForm(p => ({ ...p, available_sizes: p.available_sizes.filter((_, i) => i !== idx) }))}>×</button>
                          </span>
                        ))}
                      </div>
                      <input className="w-full border rounded-lg px-3 py-1.5 text-sm"
                        placeholder="לדוגמה: A1 ואז Enter"
                        onKeyDown={e => {
                          // Enter, Tab, או כל סוג של פסיק/רווח מוסיפים תג
                          if (['Enter', 'Tab', ',', '،', '、'].includes(e.key) || (e.key === ' ' && e.target.value.trim())) {
                            e.preventDefault()
                            const val = e.target.value.trim()
                            if (val && !form.available_sizes.includes(val)) {
                              setForm(p => ({ ...p, available_sizes: [...p.available_sizes, val] }))
                            }
                            e.target.value = ''
                          } else if (e.key === 'Backspace' && !e.target.value && form.available_sizes.length) {
                            setForm(p => ({ ...p, available_sizes: p.available_sizes.slice(0, -1) }))
                          }
                        }}
                        onBlur={e => {
                          // גם כשיוצאים מהשדה - להוסיף מה שכתוב
                          const val = e.target.value.trim()
                          if (val && !form.available_sizes.includes(val)) {
                            setForm(p => ({ ...p, available_sizes: [...p.available_sizes, val] }))
                          }
                          e.target.value = ''
                        }} />
                    </div>

                    {/* צבעים זמינים */}
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        צבעים זמינים - הקלד צבע ולחץ Enter
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1 min-h-[28px]">
                        {form.available_colors.map((color, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 rounded-full px-2 py-0.5 text-xs">
                            {color}
                            <button type="button" className="text-purple-600 hover:text-red-500 font-bold"
                              onClick={() => setForm(p => ({ ...p, available_colors: p.available_colors.filter((_, i) => i !== idx) }))}>×</button>
                          </span>
                        ))}
                      </div>
                      <input className="w-full border rounded-lg px-3 py-1.5 text-sm"
                        placeholder="לדוגמה: שחור ואז Enter"
                        onKeyDown={e => {
                          if (['Enter', 'Tab', ',', '،', '、'].includes(e.key)) {
                            e.preventDefault()
                            const val = e.target.value.trim()
                            if (val && !form.available_colors.includes(val)) {
                              setForm(p => ({ ...p, available_colors: [...p.available_colors, val] }))
                            }
                            e.target.value = ''
                          } else if (e.key === 'Backspace' && !e.target.value && form.available_colors.length) {
                            setForm(p => ({ ...p, available_colors: p.available_colors.slice(0, -1) }))
                          }
                        }}
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val && !form.available_colors.includes(val)) {
                            setForm(p => ({ ...p, available_colors: [...p.available_colors, val] }))
                          }
                          e.target.value = ''
                        }} />
                    </div>

                    <button type="button" onClick={generateVariantsFromMatrix}
                      className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs">
                      🔄 צור מטריצת וריאנטים (מידה × צבע)
                    </button>

                    {/* טבלת וריאנטים */}
                    {variants.length > 0 && (
                      <div className="space-y-1">
                        <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-1 text-[10px] font-bold text-gray-500 px-1">
                          <span className="w-14">מידה</span>
                          <span className="w-14">צבע</span>
                          <span>מלאי</span>
                          <span>מחיר מיוחד (אופ')</span>
                          <span className="w-6"></span>
                        </div>
                        {variants.map((v, idx) => (
                          <div key={idx} className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-1 items-center">
                            <input className="w-14 border rounded px-1 py-1 text-xs" placeholder="מידה"
                              value={v.size || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, size: e.target.value } : x))} />
                            <input className="w-14 border rounded px-1 py-1 text-xs" placeholder="צבע"
                              value={v.color || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, color: e.target.value } : x))} />
                            <input type="number" className="border rounded px-1 py-1 text-xs" placeholder="0"
                              value={v.stock || 0}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, stock: e.target.value } : x))} />
                            <input type="number" step="0.01" className="border rounded px-1 py-1 text-xs" placeholder="="
                              value={v.price_override || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, price_override: e.target.value } : x))} />
                            <button type="button" className="text-red-500 text-xs w-6"
                              onClick={() => setVariants(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                          </div>
                        ))}
                        <button type="button" className="text-xs text-blue-600 mt-1"
                          onClick={() => setVariants(prev => [...prev, { size: '', color: '', stock: 0, active: true }])}>
                          + הוסף וריאנט ידנית
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* כפתורי שמירה */}
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={handleSubmit} disabled={uploading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50 font-bold">
                  💾 שמור מוצר
                </button>
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
                  {isAdmin && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openEdit(item)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg">✏️ ערוך</button>
                      <button onClick={() => deleteProduct(item.id)} className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg">🗑️ מחק</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
