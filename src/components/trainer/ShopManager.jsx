import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast, useConfirm } from '../a11y'
import { uploadToCloudinary } from '../../lib/cloudinary'

const STATUS_LABELS = { pending: 'ממתין', done: 'טופל' }
const STATUS_COLORS = { pending: 'bg-orange-100 text-orange-700', done: 'bg-green-100 text-green-700' }

// מפתח לשמירת טיוטה של מוצר חדש ב-localStorage. משותף לכל המאמנים במכשיר הזה.
const DRAFT_KEY = 'teampact_product_draft_v1'

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeDraft(form, variants) {
  try {
    // שומר רק אם יש בכלל משהו שכתוב (כדי לא להציק בטיוטה ריקה)
    const hasContent =
      (form.title && form.title.trim()) ||
      (form.content && form.content.trim()) ||
      (form.description_long && form.description_long.trim()) ||
      (form.price && String(form.price).trim()) ||
      (form.image_url && form.image_url.trim()) ||
      (Array.isArray(form.features) && form.features.some(f => f && f.trim())) ||
      (Array.isArray(form.available_sizes) && form.available_sizes.length > 0) ||
      (Array.isArray(form.available_colors) && form.available_colors.length > 0) ||
      (Array.isArray(form.available_lengths) && form.available_lengths.length > 0) ||
      (Array.isArray(form.purchase_options) && form.purchase_options.some(o => o && (o.name || o.price)))
    if (!hasContent) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, variants, savedAt: Date.now() }))
  } catch {
    // מתעלמים - localStorage מלא/חסום
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function ShopManager({ onOrdersChange, isAdmin = false, trainerId = null }) {
  const toast = useToast()
  const confirm = useConfirm()
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
    has_variants: false,    // האם יש מידות/צבעים/אורך
    available_sizes: [],    // ['A0','A1','A2','A3','A4']
    available_colors: [],   // ['שחור','לבן']
    available_lengths: [],  // ['ארוך','קצר']
    purchase_options: [],   // אפשרויות רכישה: [{name, price, note, is_featured}]
  })
  const [variants, setVariants] = useState([])  // [{size, color, stock, price_override, sku, active}]
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasDraft, setHasDraft] = useState(false)  // האם יש טיוטה שמורה ב-localStorage

  // מלאי - טאב ניהול מלאי
  const [inventoryData, setInventoryData] = useState({})      // { [productId]: variants[] }
  const [inventoryExpanded, setInventoryExpanded] = useState(null) // product id שפתוח
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventorySaving, setInventorySaving] = useState(false)

  // בדיקה בעת טעינה ראשונית - האם יש טיוטה לא שמורה של מוצר חדש?
  useEffect(() => {
    const draft = readDraft()
    if (draft && draft.form && draft.form.title !== undefined) {
      setHasDraft(true)
    }
  }, [])

  // שמירה אוטומטית של הטיוטה כשהטופס פתוח למוצר חדש (לא עריכה)
  useEffect(() => {
    if (showForm && !editingId) {
      writeDraft(form, variants)
    }
  }, [form, variants, showForm, editingId])

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
      available_lengths: product.available_lengths || [],
      purchase_options: Array.isArray(product.purchase_options) ? product.purchase_options : [],
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

  function openAdd(restoreDraft = false) {
    setEditingId(null)
    if (restoreDraft) {
      const draft = readDraft()
      if (draft && draft.form) {
        // שחזור עם ברירות מחדל להגנה מפני שדות חסרים
        setForm({
          title: draft.form.title || '',
          content: draft.form.content || '',
          description_long: draft.form.description_long || '',
          price: draft.form.price || '',
          image_url: draft.form.image_url || '',
          features: Array.isArray(draft.form.features) ? draft.form.features : [],
          has_variants: !!draft.form.has_variants,
          available_sizes: Array.isArray(draft.form.available_sizes) ? draft.form.available_sizes : [],
          available_colors: Array.isArray(draft.form.available_colors) ? draft.form.available_colors : [],
          available_lengths: Array.isArray(draft.form.available_lengths) ? draft.form.available_lengths : [],
          purchase_options: Array.isArray(draft.form.purchase_options) ? draft.form.purchase_options : [],
        })
        setVariants(Array.isArray(draft.variants) ? draft.variants : [])
        setShowForm(true)
        setHasDraft(false)  // לא להציע שחזור שוב אחרי שכבר שחזרו
        return
      }
    }
    setForm({
      title: '', content: '', description_long: '', price: '', image_url: '',
      features: [], has_variants: false, available_sizes: [], available_colors: [],
      available_lengths: [],
      purchase_options: [],
    })
    setVariants([])
    setShowForm(true)
  }

  function discardDraft() {
    clearDraft()
    setHasDraft(false)
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
    // מיזוג: orders (הישן) + requests (החדש) - שומר את כל הפרטים (מידה, צבע, מחיר, הערות)
    const merged = [
      ...(ords1 || []).map(o => ({ ...o, _source: 'order' })),
      ...(ords2 || []).map(o => ({
        ...o,  // שומר את כל השדות: selected_size, selected_color, notes, unit_price, total_price, quantity
        members: { full_name: o.athlete_name, phone: null },
        _source: 'request',
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setOrders(merged)
    const pending = merged.filter(o => o.status === 'pending').length
    onOrdersChange?.(pending)
    setLoading(false)
  }

  // ─── ניהול מלאי ───────────────────────────────────────────────
  async function loadInventory(productId) {
    if (inventoryData[productId]) {
      // כבר טעון - פשוט פתח/סגור
      setInventoryExpanded(prev => prev === productId ? null : productId)
      return
    }
    setInventoryLoading(true)
    setInventoryExpanded(productId)
    const { data } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
    setInventoryData(prev => ({ ...prev, [productId]: data || [] }))
    setInventoryLoading(false)
  }

  function updateInventoryStock(productId, variantId, newStock) {
    setInventoryData(prev => ({
      ...prev,
      [productId]: (prev[productId] || []).map(v =>
        v.id === variantId ? { ...v, stock: newStock } : v
      )
    }))
  }

  async function saveInventory(productId) {
    const vars = inventoryData[productId] || []
    if (!vars.length) return
    setInventorySaving(true)
    let hasError = false
    for (const v of vars) {
      const { error } = await supabase
        .from('product_variants')
        .update({ stock: parseInt(v.stock) || 0 })
        .eq('id', v.id)
      if (error) { hasError = true; break }
    }
    setInventorySaving(false)
    if (hasError) toast.error('שגיאה בשמירת המלאי')
    else toast.success('המלאי עודכן בהצלחה ✓')
  }

  async function deleteProduct(id) {
    // אבחון מלא: מחזירים את הרשומה שנמחקה. אם לא חזרה רשומה - המחיקה לא עברה (בד"כ RLS).
    const { data, error } = await supabase.from('announcements').delete().eq('id', id).select()
    console.log('[deleteProduct]', { id, data, error })
    if (error) {
      toast.error('שגיאה במחיקת המוצר: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      toast.error('המחיקה לא בוצעה - ייתכן שאין לך הרשאת מחיקה (RLS). בדוק את מדיניות ההרשאות ב-Supabase.')
      return
    }
    // לאחר מחיקה מוצלחת - מרעננים מהשרת כדי להיות 100% מסונכרנים (במקום רק לסנן state מקומי)
    setProducts(prev => prev.filter(p => p.id !== id))
    fetchAll()
  }

  async function compressImage(file, maxPx = 1200, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx }
          else { width = Math.round(width * maxPx / height); height = maxPx }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  async function uploadImage(file) {
    if (!file) return null
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const url = await uploadToCloudinary(compressed)
      return url
    } catch (e) {
      toast.error('שגיאה בהעלאת תמונה: ' + e.message)
      return null
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
      status: 'approved',           // חשוב: ברירת מחדל ב-DB היא 'pending' וזה מסתיר מתצוגת המתאמן
      price: form.price ? parseFloat(form.price) : null,
      image_url: form.image_url || null,
      trainer_id: trainerId || null,
      features: form.features || [],
      has_variants: !!form.has_variants,
      available_sizes: form.available_sizes || [],
      available_colors: form.available_colors || [],
      available_lengths: form.available_lengths || [],
      purchase_options: Array.isArray(form.purchase_options)
        ? form.purchase_options
            .filter(o => o && (o.name || o.price))
            .map(o => ({
              name: o.name || '',
              price: o.price !== '' && o.price != null ? parseFloat(o.price) : null,
              note: o.note || '',
              is_featured: !!o.is_featured,
              // שמירת רכיבי וריאציה (לחבילות עם מידה/צבע פר פריט)
              components: Array.isArray(o.components)
                ? o.components
                    .filter(c => c && c.name)
                    .map(c => ({
                      name: c.name || '',
                      sizes: Array.isArray(c.sizes) ? c.sizes.filter(Boolean) : [],
                      colors: Array.isArray(c.colors) ? c.colors.filter(Boolean) : [],
                      lengths: Array.isArray(c.lengths) ? c.lengths.filter(Boolean) : [],
                    }))
                : [],
            }))
        : [],
    }

    let productId = editingId
    if (editingId) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editingId)
      if (error) { toast.error('שגיאה בעדכון המוצר: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('announcements').insert(payload).select().single()
      if (error) { toast.error('שגיאה ביצירת המוצר: ' + error.message); return }
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
          length: v.length || null,
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
      available_lengths: [],
      purchase_options: [],
    })
    setVariants([])
    setEditingId(null)
    setShowForm(false)
    clearDraft()         // ניקוי טיוטה אחרי שמירה מוצלחת
    setHasDraft(false)
    fetchAll()
  }

  // מחולל אוטומטית וריאנטים מכל השילובים של מידות × צבעים × אורך
  function generateVariantsFromMatrix() {
    const sizes = form.available_sizes.length ? form.available_sizes : [null]
    const colors = form.available_colors.length ? form.available_colors : [null]
    const lengths = form.available_lengths.length ? form.available_lengths : [null]
    const newVariants = []
    for (const size of sizes) {
      for (const color of colors) {
        for (const length of lengths) {
          const exists = variants.find(v =>
            (v.size || null) === size &&
            (v.color || null) === color &&
            (v.length || null) === length
          )
          if (exists) { newVariants.push(exists); continue }
          newVariants.push({ size, color, length, stock: 0, sku: '', price_override: '', active: true })
        }
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
      toast.error('שגיאה במחיקת הבקשה: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      toast.error('המחיקה לא בוצעה - ייתכן שאין הרשאת מחיקה (RLS) על טבלת ' + table)
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
        <div className="flex gap-2 border-b pb-2 flex-wrap">
          <button onClick={() => setTab('orders')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'orders' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
            בקשות הזמנה {orders.filter(o => o.status === 'pending').length > 0 && `(${orders.filter(o => o.status === 'pending').length})`}
          </button>
          <button onClick={() => setTab('products')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'products' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
            מוצרים
          </button>
          <button onClick={() => setTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'inventory' ? 'bg-emerald-600 text-white' : 'text-gray-500'}`}>
            📦 מלאי
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
                    {/* באדג'ים של מידה/צבע/אורך/כמות */}
                    {(order.selected_size || order.selected_color || order.selected_length || (order.quantity && order.quantity > 1)) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {order.selected_size && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                            📏 מידה: {order.selected_size}
                          </span>
                        )}
                        {order.selected_color && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                            🎨 צבע: {order.selected_color}
                          </span>
                        )}
                        {order.selected_length && (
                          <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-medium">
                            📐 אורך: {order.selected_length}
                          </span>
                        )}
                        {order.quantity > 1 && (
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-medium">
                            × {order.quantity}
                          </span>
                        )}
                      </div>
                    )}
                    {/* הערות (אפשרות רכישה + פרטים נוספים) */}
                    {order.notes && (
                      <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-2 py-1 leading-relaxed">
                        💬 {order.notes}
                      </p>
                    )}
                    {/* מחיר */}
                    {(order.total_price != null || order.unit_price != null) && (
                      <p className="text-sm font-bold text-emerald-600 mt-2">
                        💰 ₪{order.total_price ?? order.unit_price}
                        {order.quantity > 1 && order.unit_price && (
                          <span className="text-xs text-gray-400 font-normal mr-1">
                            (₪{order.unit_price} × {order.quantity})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 flex-shrink-0 items-center">
                      {order.status === 'pending' && (
                        <button onClick={() => markDone(order)}
                          className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg">
                          סמן כטופל ✓
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'מחיקת בקשה', message: 'למחוק את הבקשה?', confirmText: 'מחק', danger: true })
                          if (ok) deleteOrder(order)
                        }}
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

      {/* ─── טאב מלאי ─── */}
      {tab === 'inventory' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 text-center">לחץ על מוצר כדי לראות ולעדכן את המלאי שלו</p>
          {products.filter(p => p.has_variants).length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">📦</div>
              <p>אין מוצרים עם וריאנטים עדיין</p>
              <p className="text-xs mt-1">עבור למוצרים וסמן "למוצר יש מידות / צבעים"</p>
            </div>
          )}
          {products.filter(p => p.has_variants).map(product => {
            const isOpen = inventoryExpanded === product.id
            const vars = inventoryData[product.id] || []
            const totalStock = vars.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
            return (
              <div key={product.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                {/* כותרת מוצר */}
                <button
                  type="button"
                  onClick={() => loadInventory(product.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition text-right"
                >
                  {product.image_url && (
                    <img src={product.image_url} alt={product.title}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800">{product.title}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(product.available_colors || []).map(c => (
                        <span key={c} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{c}</span>
                      ))}
                      {(product.available_lengths || []).map(l => (
                        <span key={l} className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{l}</span>
                      ))}
                      {(product.available_sizes || []).map(s => (
                        <span key={s} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-left">
                    {inventoryData[product.id] && (
                      <div className={`text-sm font-bold ${totalStock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {totalStock} יח׳
                      </div>
                    )}
                    <span className="text-gray-400 text-lg">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* טבלת מלאי */}
                {isOpen && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {inventoryLoading && !inventoryData[product.id] ? (
                      <p className="text-center text-gray-400 text-sm py-4">טוען...</p>
                    ) : vars.length === 0 ? (
                      <div className="text-center py-6 text-gray-400">
                        <p className="text-sm">אין וריאנטים — עבור לעריכת המוצר ולחץ "צור מטריצת וריאנטים"</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[300px]">
                            <thead>
                              <tr className="text-[10px] text-gray-500 font-bold border-b">
                                {vars.some(v => v.size) && <th className="text-right pb-1 pr-2">מידה</th>}
                                {vars.some(v => v.color) && <th className="text-right pb-1 pr-2">צבע</th>}
                                {vars.some(v => v.length) && <th className="text-right pb-1 pr-2">אורך</th>}
                                <th className="text-right pb-1 pr-2">במלאי</th>
                                <th className="pb-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {vars.map(v => {
                                const stock = parseInt(v.stock) || 0
                                return (
                                  <tr key={v.id} className="border-b border-gray-50">
                                    {vars.some(x => x.size) && (
                                      <td className="py-1.5 pr-2">
                                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                                          {v.size || '—'}
                                        </span>
                                      </td>
                                    )}
                                    {vars.some(x => x.color) && (
                                      <td className="py-1.5 pr-2">
                                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">
                                          {v.color || '—'}
                                        </span>
                                      </td>
                                    )}
                                    {vars.some(x => x.length) && (
                                      <td className="py-1.5 pr-2">
                                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                                          {v.length || '—'}
                                        </span>
                                      </td>
                                    )}
                                    <td className="py-1.5 pr-2">
                                      <input
                                        type="number"
                                        min="0"
                                        value={v.stock ?? 0}
                                        onChange={e => updateInventoryStock(product.id, v.id, e.target.value)}
                                        className={`w-16 border rounded px-2 py-1 text-sm text-center font-bold ${
                                          stock === 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        }`}
                                      />
                                    </td>
                                    <td className="py-1.5 pl-1">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                        stock === 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                                      }`}>
                                        {stock === 0 ? 'אזל' : 'יש'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-500">
                            סה״כ: <span className="font-bold text-gray-700">{totalStock} יחידות</span>
                          </span>
                          <button
                            type="button"
                            disabled={inventorySaving}
                            onClick={() => saveInventory(product.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                          >
                            {inventorySaving ? 'שומר...' : '💾 שמור מלאי'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-4">
          {/* באנר שחזור טיוטה - מוצג רק אם יש טיוטה שמורה והטופס סגור */}
          {isAdmin && hasDraft && !showForm && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xl flex-shrink-0">📝</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">יש לך טיוטה שמורה של מוצר חדש</p>
                  <p className="text-xs text-amber-700 truncate">לא סיימת למלא את הטופס בפעם הקודמת - רוצה להמשיך מאיפה שהפסקת?</p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openAdd(true)}
                  className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-bold whitespace-nowrap">
                  המשך
                </button>
                <button onClick={discardDraft}
                  className="text-xs bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 px-2 py-1.5 rounded-lg whitespace-nowrap">
                  מחק
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="flex justify-end">
              <button onClick={() => showForm ? setShowForm(false) : openAdd(false)}
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
                    <img src={form.image_url} alt={form.title ? `תצוגה מקדימה של ${form.title}` : 'תצוגה מקדימה של תמונת המוצר'} className="w-16 h-16 rounded-lg object-cover border" />
                    <button type="button" onClick={() => setForm(p => ({ ...p, image_url: '' }))}
                      className="text-xs text-red-500">הסר</button>
                  </div>
                )}
                <input className="w-full border rounded-lg px-3 py-2 text-xs text-gray-500" placeholder="או קישור חיצוני (אופציונלי)"
                  value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
              </div>

              {/* אפשרויות רכישה (לדוגמה: סט נו-גי = מכנס + ראשגארד בהנחה) */}
              <div className="space-y-2 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-amber-900">
                    💰 אפשרויות רכישה (אופציונלי)
                  </h4>
                  <span className="text-[10px] text-amber-700">
                    לדוגמה: "מכנס בלבד", "ראשגארד בלבד", "סט מלא - 10% הנחה"
                  </span>
                </div>

                {(form.purchase_options || []).map((opt, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-amber-200 p-2 space-y-1.5">
                    <div className="flex gap-1 items-center">
                      <input
                        className="flex-1 border rounded px-2 py-1 text-xs"
                        placeholder="שם האפשרות (למשל: מכנס בלבד)"
                        value={opt.name || ''}
                        onChange={e => setForm(p => ({
                          ...p,
                          purchase_options: p.purchase_options.map((o, i) => i === idx ? { ...o, name: e.target.value } : o),
                        }))} />
                      <input
                        type="number" step="0.01"
                        className="w-20 border rounded px-2 py-1 text-xs"
                        placeholder="₪ מחיר"
                        value={opt.price || ''}
                        onChange={e => setForm(p => ({
                          ...p,
                          purchase_options: p.purchase_options.map((o, i) => i === idx ? { ...o, price: e.target.value } : o),
                        }))} />
                      <button type="button" className="text-red-500 text-xs w-6"
                        onClick={() => setForm(p => ({
                          ...p,
                          purchase_options: p.purchase_options.filter((_, i) => i !== idx),
                        }))}>✕</button>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        className="flex-1 border rounded px-2 py-1 text-xs text-gray-600"
                        placeholder="הערה/תיאור קצר (למשל: חיסכון של 10%)"
                        value={opt.note || ''}
                        onChange={e => setForm(p => ({
                          ...p,
                          purchase_options: p.purchase_options.map((o, i) => i === idx ? { ...o, note: e.target.value } : o),
                        }))} />
                      <label className="flex items-center gap-1 text-[10px] text-amber-800 whitespace-nowrap">
                        <input type="checkbox"
                          checked={!!opt.is_featured}
                          onChange={e => setForm(p => ({
                            ...p,
                            purchase_options: p.purchase_options.map((o, i) => i === idx ? { ...o, is_featured: e.target.checked } : o),
                          }))} />
                        ⭐ מומלץ
                      </label>
                    </div>

                    {/* 🧩 רכיבי וריאציה (Components) - לבחירת מידה/צבע פר פריט בחבילה */}
                    <div className="mt-2 pt-2 border-t border-amber-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-emerald-800">
                          🧩 רכיבים (לחבילות - מידה/צבע לכל פריט)
                        </span>
                        <button type="button"
                          className="text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded font-bold"
                          onClick={() => setForm(p => ({
                            ...p,
                            purchase_options: p.purchase_options.map((o, i) => i === idx
                              ? { ...o, components: [...(o.components || []), { name: '', sizes: [], colors: [], lengths: [] }] }
                              : o),
                          }))}>
                          + הוסף רכיב
                        </button>
                      </div>

                      {(opt.components || []).map((comp, compIdx) => (
                        <div key={compIdx} className="bg-emerald-50 border border-emerald-200 rounded p-2 space-y-1">
                          <div className="flex gap-1 items-center">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                              {compIdx + 1}
                            </span>
                            <input
                              className="flex-1 border rounded px-2 py-1 text-xs"
                              placeholder="שם הרכיב (למשל: מכנס, רשגארד, חליפה)"
                              value={comp.name || ''}
                              onChange={e => setForm(p => ({
                                ...p,
                                purchase_options: p.purchase_options.map((o, i) => i === idx
                                  ? { ...o, components: o.components.map((c, ci) => ci === compIdx ? { ...c, name: e.target.value } : c) }
                                  : o),
                              }))} />
                            <button type="button" className="text-red-500 text-xs w-5"
                              onClick={() => setForm(p => ({
                                ...p,
                                purchase_options: p.purchase_options.map((o, i) => i === idx
                                  ? { ...o, components: o.components.filter((_, ci) => ci !== compIdx) }
                                  : o),
                              }))}>✕</button>
                          </div>
                          {/* מידות של הרכיב - tags עם Enter */}
                          <div>
                            <label className="text-[10px] text-gray-600 block mb-0.5">
                              📏 מידות - הקלד מידה ולחץ Enter
                            </label>
                            {Array.isArray(comp.sizes) && comp.sizes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {comp.sizes.map((s, si) => (
                                  <span key={si} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-[10px]">
                                    {s}
                                    <button type="button" className="text-blue-600 hover:text-red-500 font-bold"
                                      onClick={() => setForm(p => ({
                                        ...p,
                                        purchase_options: p.purchase_options.map((o, i) => i === idx
                                          ? { ...o, components: o.components.map((c, ci) => ci === compIdx
                                              ? { ...c, sizes: (c.sizes || []).filter((_, sj) => sj !== si) }
                                              : c) }
                                          : o),
                                      }))}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              placeholder="לדוגמה: M ואז Enter"
                              onKeyDown={e => {
                                if (['Enter', 'Tab', ',', '،', '、'].includes(e.key)) {
                                  e.preventDefault()
                                  const val = e.target.value.trim()
                                  const existing = Array.isArray(comp.sizes) ? comp.sizes : []
                                  if (val && !existing.includes(val)) {
                                    setForm(p => ({
                                      ...p,
                                      purchase_options: p.purchase_options.map((o, i) => i === idx
                                        ? { ...o, components: o.components.map((c, ci) => ci === compIdx
                                            ? { ...c, sizes: [...(c.sizes || []), val] }
                                            : c) }
                                        : o),
                                    }))
                                  }
                                  e.target.value = ''
                                } else if (e.key === 'Backspace' && !e.target.value && Array.isArray(comp.sizes) && comp.sizes.length) {
                                  setForm(p => ({
                                    ...p,
                                    purchase_options: p.purchase_options.map((o, i) => i === idx
                                      ? { ...o, components: o.components.map((c, ci) => ci === compIdx
                                          ? { ...c, sizes: c.sizes.slice(0, -1) }
                                          : c) }
                                      : o),
                                  }))
                                }
                              }}
                              onBlur={e => {
                                const val = e.target.value.trim()
                                const existing = Array.isArray(comp.sizes) ? comp.sizes : []
                                if (val && !existing.includes(val)) {
                                  setForm(p => ({
                                    ...p,
                                    purchase_options: p.purchase_options.map((o, i) => i === idx
                                      ? { ...o, components: o.components.map((c, ci) => ci === compIdx
                                          ? { ...c, sizes: [...(c.sizes || []), val] }
                                          : c) }
                                      : o),
                                  }))
                                }
                                e.target.value = ''
                              }} />
                          </div>
                          {/* צבעים של הרכיב - tags עם Enter */}
                          <div>
                            <label className="text-[10px] text-gray-600 block mb-0.5">
                              🎨 צבעים - הקלד צבע ולחץ Enter
                            </label>
                            {Array.isArray(comp.colors) && comp.colors.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {comp.colors.map((cl, ci) => (
                                  <span key={ci} className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 rounded-full px-2 py-0.5 text-[10px]">
                                    {cl}
                                    <button type="button" className="text-purple-600 hover:text-red-500 font-bold"
                                      onClick={() => setForm(p => ({
                                        ...p,
                                        purchase_options: p.purchase_options.map((o, i) => i === idx
                                          ? { ...o, components: o.components.map((c, cidx2) => cidx2 === compIdx
                                              ? { ...c, colors: (c.colors || []).filter((_, cj) => cj !== ci) }
                                              : c) }
                                          : o),
                                      }))}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              placeholder="לדוגמה: שחור ואז Enter"
                              onKeyDown={e => {
                                if (['Enter', 'Tab', ',', '،', '、'].includes(e.key)) {
                                  e.preventDefault()
                                  const val = e.target.value.trim()
                                  const existing = Array.isArray(comp.colors) ? comp.colors : []
                                  if (val && !existing.includes(val)) {
                                    setForm(p => ({
                                      ...p,
                                      purchase_options: p.purchase_options.map((o, i) => i === idx
                                        ? { ...o, components: o.components.map((c, cidx2) => cidx2 === compIdx
                                            ? { ...c, colors: [...(c.colors || []), val] }
                                            : c) }
                                        : o),
                                    }))
                                  }
                                  e.target.value = ''
                                } else if (e.key === 'Backspace' && !e.target.value && Array.isArray(comp.colors) && comp.colors.length) {
                                  setForm(p => ({
                                    ...p,
                                    purchase_options: p.purchase_options.map((o, i) => i === idx
                                      ? { ...o, components: o.components.map((c, cidx2) => cidx2 === compIdx
                                          ? { ...c, colors: c.colors.slice(0, -1) }
                                          : c) }
                                      : o),
                                  }))
                                }
                              }}
                              onBlur={e => {
                                const val = e.target.value.trim()
                                const existing = Array.isArray(comp.colors) ? comp.colors : []
                                if (val && !existing.includes(val)) {
                                  setForm(p => ({
                                    ...p,
                                    purchase_options: p.purchase_options.map((o, i) => i === idx
                                      ? { ...o, components: o.components.map((c, cidx2) => cidx2 === compIdx
                                          ? { ...c, colors: [...(c.colors || []), val] }
                                          : c) }
                                      : o),
                                  }))
                                }
                                e.target.value = ''
                              }} />
                          </div>
                          {/* אורך של הרכיב - ארוך/קצר */}
                          <div>
                            <label className="text-[10px] text-gray-600 block mb-0.5">
                              📐 אורך
                            </label>
                            <div className="flex gap-1.5">
                              {['ארוך', 'קצר'].map(len => {
                                const compLengths = Array.isArray(comp.lengths) ? comp.lengths : []
                                const isSelected = compLengths.includes(len)
                                return (
                                  <button
                                    key={len}
                                    type="button"
                                    onClick={() => setForm(p => ({
                                      ...p,
                                      purchase_options: p.purchase_options.map((o, i) => i === idx
                                        ? { ...o, components: o.components.map((c, cidx2) => cidx2 === compIdx
                                            ? { ...c, lengths: isSelected
                                                ? (c.lengths || []).filter(l => l !== len)
                                                : [...(c.lengths || []), len] }
                                            : c) }
                                        : o),
                                    }))}
                                    className={`flex-1 py-1 rounded border text-[10px] font-bold transition ${
                                      isSelected
                                        ? 'border-indigo-500 bg-indigo-500 text-white'
                                        : 'border-gray-200 bg-white text-gray-600'
                                    }`}
                                  >
                                    {len}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <button type="button"
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg text-xs font-bold"
                  onClick={() => setForm(p => ({
                    ...p,
                    purchase_options: [...(p.purchase_options || []), { name: '', price: '', note: '', is_featured: false }],
                  }))}>
                  + הוסף אפשרות רכישה
                </button>
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

                    {/* אורך זמין - ארוך/קצר */}
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        📐 אורך זמין
                      </label>
                      <div className="flex gap-2">
                        {['ארוך', 'קצר'].map(len => {
                          const isSelected = form.available_lengths.includes(len)
                          return (
                            <button
                              key={len}
                              type="button"
                              onClick={() => {
                                const newLengths = isSelected
                                  ? form.available_lengths.filter(l => l !== len)
                                  : [...form.available_lengths, len]
                                setForm(p => ({ ...p, available_lengths: newLengths }))
                                // הסרה מיידית מהטבלה אם הורדו האורך
                                if (isSelected) {
                                  setVariants(prev => prev.filter(v => (v.length || null) !== len))
                                }
                              }}
                              className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-bold transition ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-500 text-white'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                              }`}
                            >
                              {len}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <button type="button" onClick={generateVariantsFromMatrix}
                      className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs font-bold">
                      🔄 צור / עדכן מטריצת וריאנטים (מידה × צבע × אורך)
                    </button>
                    {variants.length > 0 && (
                      <p className="text-[10px] text-blue-600 text-center">
                        שינית מידה/צבע/אורך? לחץ כפתור ↑ לעדכון הטבלה
                      </p>
                    )}

                    {/* טבלת וריאנטים */}
                    {variants.length > 0 && (
                      <div className="space-y-1 overflow-x-auto">
                        <div className="grid grid-cols-[auto_auto_auto_1fr_1fr_auto] gap-1 text-[10px] font-bold text-gray-500 px-1 min-w-[420px]">
                          <span className="w-14">מידה</span>
                          <span className="w-14">צבע</span>
                          <span className="w-14">אורך</span>
                          <span>מלאי</span>
                          <span>מחיר מיוחד</span>
                          <span className="w-6"></span>
                        </div>
                        {variants.map((v, idx) => (
                          <div key={idx} className="grid grid-cols-[auto_auto_auto_1fr_1fr_auto] gap-1 items-center min-w-[420px]">
                            <input className="w-14 border rounded px-1 py-1 text-xs" placeholder="מידה"
                              value={v.size || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, size: e.target.value } : x))} />
                            <input className="w-14 border rounded px-1 py-1 text-xs" placeholder="צבע"
                              value={v.color || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, color: e.target.value } : x))} />
                            <input className="w-14 border rounded px-1 py-1 text-xs" placeholder="אורך"
                              value={v.length || ''}
                              onChange={e => setVariants(prev => prev.map((x, i) => i === idx ? { ...x, length: e.target.value } : x))} />
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
                          onClick={() => setVariants(prev => [...prev, { size: '', color: '', length: '', stock: 0, active: true }])}>
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
                      <button type="button" onClick={() => openEdit(item)} aria-label={`ערוך ${item.title}`} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg">✏️ ערוך</button>
                      <button
                        type="button"
                        aria-label={`מחק ${item.title}`}
                        onClick={async () => {
                          const ok = await confirm({ title: 'מחיקת מוצר', message: `למחוק את "${item.title}"?`, confirmText: 'מחק', danger: true })
                          if (ok) deleteProduct(item.id)
                        }}
                        className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg"
                      >
                        🗑️ מחק
                      </button>
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
