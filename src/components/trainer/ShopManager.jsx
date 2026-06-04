import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useToast, useConfirm } from '../a11y'
import { uploadToCloudinary } from '../../lib/cloudinary'

const STATUS_LABELS = { pending: 'ממתין', done: 'טופל', cancelled: 'בוטל' }
const STATUS_COLORS = { pending: 'bg-orange-100 text-orange-700', done: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' }

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

  // ─── חבילות ───────────────────────────────────────────────
  const [bundles, setBundles] = useState([])
  const [showBundleForm, setShowBundleForm] = useState(false)
  const [bundleForm, setBundleForm] = useState({ name: '', price: '', items: [] }) // items: [{product_id, product_name}]
  const [savingBundle, setSavingBundle] = useState(false)

  // מלאי - טאב ניהול מלאי
  const [inventoryData, setInventoryData] = useState({})      // { [productId]: variants[] }
  const [inventoryExpanded, setInventoryExpanded] = useState(null) // product id שפתוח
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventorySaving, setInventorySaving] = useState(false)
  const [localSetup, setLocalSetup] = useState({})
  // { [productId]: { colors:[], lengths:[], sizes:[], newSize:'' } }
  // סינון פעיל בממשק מלאי: { [productId]: { comp, color, length } }
  const [invFilter, setInvFilter] = useState({})

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

  useEffect(() => {
    fetchAll()
    // Realtime: עדכון אוטומטי כשהזמנה נוצרת/עודכנה/בוטלה
    const ch = supabase.channel('shop-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_requests' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // טעינת כל המלאי ברקע כשנכנסים לטאב inventory
  useEffect(() => {
    if (tab !== 'inventory' || products.length === 0) return
    const unloaded = products.filter(p => !inventoryData[p.id])
    if (unloaded.length === 0) return
    Promise.all(
      unloaded.map(p =>
        supabase.from('product_variants').select('*').eq('product_id', p.id)
          .then(({ data }) => ({ id: p.id, data: data || [] }))
      )
    ).then(results => {
      setInventoryData(prev => {
        const next = { ...prev }
        results.forEach(({ id, data }) => { if (!next[id]) next[id] = data })
        return next
      })
    })
  }, [tab, products])

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
    // טעינת חבילות
    const { data: bundleData } = await supabase
      .from('announcements').select('id, title, price, bundle_items, created_at')
      .eq('type', 'bundle').is('deleted_at', null).order('created_at', { ascending: false })
    setBundles(bundleData || [])
    setLoading(false)
  }

  // ─── פונקציות חבילות ───────────────────────────────────────────
  function toggleBundleItem(product) {
    setBundleForm(prev => {
      const exists = prev.items.find(i => i.product_id === product.id)
      return {
        ...prev,
        items: exists
          ? prev.items.filter(i => i.product_id !== product.id)
          : [...prev.items, { product_id: product.id, product_name: product.title, qty: 1 }],
      }
    })
  }

  async function handleSaveBundle() {
    if (!bundleForm.name.trim()) { toast.error('חובה שם לחבילה'); return }
    if (bundleForm.items.length < 2) { toast.error('חבילה צריכה לפחות 2 מוצרים'); return }
    setSavingBundle(true)
    const payload = {
      title: bundleForm.name.trim(),
      price: bundleForm.price ? parseFloat(bundleForm.price) : null,
      type: 'bundle',
      status: 'approved',
      bundle_items: bundleForm.items,
      content: '',
      trainer_id: trainerId || null,
    }
    const { error } = await supabase.from('announcements').insert(payload)
    setSavingBundle(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('החבילה נשמרה!')
    setBundleForm({ name: '', price: '', items: [] })
    setShowBundleForm(false)
    const { data } = await supabase.from('announcements').select('id, title, price, bundle_items, created_at')
      .eq('type', 'bundle').is('deleted_at', null).order('created_at', { ascending: false })
    setBundles(data || [])
  }

  async function handleDeleteBundle(id) {
    const ok = await confirm('למחוק את החבילה?')
    if (!ok) return
    await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setBundles(prev => prev.filter(b => b.id !== id))
  }

  // ─── ניהול מלאי ───────────────────────────────────────────────

  // מחלץ שמות פריטים ייחודיים מה-purchase_options
  // מחזיר [null] למוצר פשוט, או ['מכנס','ראשגארד'] למוצר עם חבילות
  function getProductComponents(product) {
    const names = new Set()
    if (Array.isArray(product.purchase_options)) {
      for (const opt of product.purchase_options) {
        if (Array.isArray(opt.components)) {
          for (const comp of opt.components) {
            if (comp && comp.name) names.add(comp.name)
          }
        }
      }
    }
    return names.size > 0 ? [...names] : [null]
  }

  // מחלץ הגדרת רכיב מ-purchase_options (צבעים/אורכים/מידות) — לא צריך הגדרה ידנית
  function getCompDef(product, compName) {
    let best = null
    for (const opt of (product.purchase_options || [])) {
      for (const comp of (opt.components || [])) {
        if ((comp.name || null) === compName) {
          if (!best || (comp.sizes?.length || 0) > (best.sizes?.length || 0)) {
            best = comp
          }
        }
      }
    }
    return best || { colors: [], lengths: [], sizes: [] }
  }

  const COMP_KEY_DEFAULT = '__default__'

  function getComponentSetup(productId, compName) {
    const key = compName || COMP_KEY_DEFAULT
    return ((localSetup[productId] || {})[key]) || { colors: [], lengths: [], sizes: [], newSize: '' }
  }

  function patchComponentSetup(productId, compName, patch) {
    const key = compName || COMP_KEY_DEFAULT
    setLocalSetup(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [key]: { ...((prev[productId] || {})[key] || {}), ...patch }
      }
    }))
  }

  async function loadInventory(product) {
    const pid = product.id
    if (inventoryExpanded === pid) { setInventoryExpanded(null); return }
    setInventoryExpanded(pid)

    // אתחל setup לכל פריט אם עוד לא הוגדר
    if (!localSetup[pid]) {
      const comps = getProductComponents(product)
      const setup = {}
      for (const comp of comps) {
        const key = comp || COMP_KEY_DEFAULT
        if (comp === null) {
          setup[key] = {
            colors: product.available_colors || [],
            lengths: product.available_lengths || [],
            sizes: product.available_sizes || [],
            newSize: '',
          }
        } else {
          // מחפש נתוני הפריט ב-purchase_options
          let compData = null
          for (const opt of (product.purchase_options || [])) {
            const found = (opt.components || []).find(c => c && c.name === comp)
            if (found) { compData = found; break }
          }
          setup[key] = {
            colors: compData?.colors || [],
            lengths: compData?.lengths || [],
            sizes: compData?.sizes || [],
            newSize: '',
          }
        }
      }
      setLocalSetup(prev => ({ ...prev, [pid]: setup }))
    }

    if (inventoryData[pid]) return
    setInventoryLoading(true)
    const { data } = await supabase
      .from('product_variants').select('*')
      .eq('product_id', pid).order('created_at', { ascending: true })
    setInventoryData(prev => ({ ...prev, [pid]: data || [] }))
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

  async function generateInventoryMatrix(product, compName) {
    // compName = null למוצר פשוט, 'מכנס'/'ראשגארד' לפריט ספציפי בחבילה
    // קורא הגדרות מ-purchase_options ישירות — אין צורך בהגדרה ידנית
    const compDef = getCompDef(product, compName)
    const setup = compDef.sizes?.length ? compDef
      : getComponentSetup(product.id, compName) // fallback לישן
    const sizes = (compDef.sizes?.length ? compDef.sizes : setup.sizes?.length ? setup.sizes : null) || [null]
    const colors = (compDef.colors?.length ? compDef.colors : setup.colors?.length ? setup.colors : null) || [null]
    const lengths = (compDef.lengths?.length ? compDef.lengths : setup.lengths?.length ? setup.lengths : null) || [null]

    setInventoryLoading(true)

    // עדכון has_variants במוצר
    await supabase.from('announcements').update({ has_variants: true }).eq('id', product.id)

    // טעינת וריאנטים קיימים לפריט הזה בלבד
    let existingQuery = supabase.from('product_variants').select('*').eq('product_id', product.id)
    if (compName === null) existingQuery = existingQuery.is('component_name', null)
    else existingQuery = existingQuery.eq('component_name', compName)
    const { data: existing } = await existingQuery

    // יצירת שילובים חסרים בלבד
    const toInsert = []
    for (const size of sizes) {
      for (const color of colors) {
        for (const length of lengths) {
          const exists = (existing || []).find(v =>
            (v.size || null) === size &&
            (v.color || null) === color &&
            (v.length || null) === length
          )
          if (!exists) toInsert.push({
            product_id: product.id,
            component_name: compName || null,
            size, color, length,
            stock: 0, active: true,
          })
        }
      }
    }
    if (toInsert.length) await supabase.from('product_variants').insert(toInsert)

    // טעינה מחדש של כל הוריאנטים למוצר
    const { data } = await supabase
      .from('product_variants').select('*')
      .eq('product_id', product.id).order('created_at', { ascending: true })
    setInventoryData(prev => ({ ...prev, [product.id]: data || [] }))
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, has_variants: true } : p))
    setInventoryLoading(false)
    toast.success(toInsert.length ? `נוצרו ${toInsert.length} שילובים חדשים ✓` : 'הטבלה עדכנית ✓')
  }

  async function saveInventory(productId) {
    const vars = inventoryData[productId] || []
    if (!vars.length) return
    setInventorySaving(true)
    let hasError = false
    for (const v of vars) {
      const { error } = await supabase
        .from('product_variants').update({ stock: parseInt(v.stock) || 0 }).eq('id', v.id)
      if (error) { hasError = true; break }
    }
    setInventorySaving(false)
    if (hasError) toast.error('שגיאה בשמירת המלאי')
    else toast.success('המלאי עודכן ✓')
  }

  const [exportingExcel, setExportingExcel] = useState(false)

  async function exportInventoryToExcel() {
    setExportingExcel(true)
    try {
      // שליפת כל הוריאנטים עם שם המוצר
      const { data: vars, error } = await supabase
        .from('product_variants')
        .select('product_id, component_name, color, length, size, stock, active')
        .eq('active', true)
        .order('product_id')

      if (error || !vars?.length) {
        toast.error('לא נמצאו נתוני מלאי')
        return
      }

      // מפה של product_id → שם מוצר (משתמשים ב-products שכבר טעינו)
      const productMap = {}
      for (const p of products) productMap[p.id] = p.title

      // בניית שורות לאקסל
      const rows = vars.map(v => ({
        'מוצר':    productMap[v.product_id] || v.product_id,
        'רכיב':    v.component_name || '—',
        'צבע':     v.color         || '—',
        'אורך':    v.length        || '—',
        'מידה':    v.size          || '—',
        'מלאי':    parseInt(v.stock) || 0,
        'סטטוס':   (parseInt(v.stock) || 0) > 0 ? 'יש במלאי' : 'אזל',
      }))

      // יצירת workbook
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false })

      // רוחב עמודות
      ws['!cols'] = [
        { wch: 30 }, // מוצר
        { wch: 20 }, // רכיב
        { wch: 10 }, // צבע
        { wch: 8  }, // אורך
        { wch: 8  }, // מידה
        { wch: 8  }, // מלאי
        { wch: 12 }, // סטטוס
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'מלאי')

      const date = new Date().toLocaleDateString('he-IL').replace(/\//g, '-')
      XLSX.writeFile(wb, `מלאי-TeamPact-${date}.xlsx`)
      toast.success('קובץ Excel הורד ✓')
    } catch (e) {
      toast.error('שגיאה ביצוא')
    } finally {
      setExportingExcel(false)
    }
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
              original_price: o.original_price !== '' && o.original_price != null ? parseFloat(o.original_price) : null,
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

    // ניכוי מלאי — רק אם יש product_id ונתוני בחירה
    if (order.product_id && order._source === 'request') {
      try {
        // חבילה עם רכיבים — מנכים לכל רכיב בנפרד
        if (Array.isArray(order.component_selections) && order.component_selections.length > 0) {
          for (const comp of order.component_selections) {
            if (!comp.component_name) continue
            let q = supabase.from('product_variants')
              .select('id, stock')
              .eq('product_id', order.product_id)
              .eq('component_name', comp.component_name)
            if (comp.size)   q = q.eq('size', comp.size)
            else             q = q.is('size', null)
            if (comp.color)  q = q.eq('color', comp.color)
            else             q = q.is('color', null)
            if (comp.length) q = q.eq('length', comp.length)
            else             q = q.is('length', null)
            const { data: varRows } = await q
            if (varRows && varRows.length > 0) {
              const v = varRows[0]
              const newStock = Math.max(0, (parseInt(v.stock) || 0) - (order.quantity || 1))
              await supabase.from('product_variants').update({ stock: newStock }).eq('id', v.id)
              setInventoryData(prev => {
                const pid = order.product_id
                if (!prev[pid]) return prev
                return { ...prev, [pid]: prev[pid].map(x => x.id === v.id ? { ...x, stock: newStock } : x) }
              })
            }
          }
        } else {
          // מוצר פשוט (לא חבילה)
          let q = supabase.from('product_variants')
            .select('id, stock')
            .eq('product_id', order.product_id)
            .is('component_name', null)
          if (order.selected_size)   q = q.eq('size', order.selected_size)
          else                       q = q.is('size', null)
          if (order.selected_color)  q = q.eq('color', order.selected_color)
          else                       q = q.is('color', null)
          if (order.selected_length) q = q.eq('length', order.selected_length)
          else                       q = q.is('length', null)
          const { data: varRows } = await q
          if (varRows && varRows.length > 0) {
            const v = varRows[0]
            const newStock = Math.max(0, (parseInt(v.stock) || 0) - (order.quantity || 1))
            await supabase.from('product_variants').update({ stock: newStock }).eq('id', v.id)
            setInventoryData(prev => {
              const pid = order.product_id
              if (!prev[pid]) return prev
              return { ...prev, [pid]: prev[pid].map(x => x.id === v.id ? { ...x, stock: newStock } : x) }
            })
          }
        }
      } catch (e) {
        console.warn('stock deduction failed', e)
      }
    }

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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2 flex-1 text-center">
              לחץ על מוצר → בחר פריט → בחר צבע ואורך → מלא כמויות → שמור
            </p>
            <button
              type="button"
              onClick={exportInventoryToExcel}
              disabled={exportingExcel}
              className="flex-shrink-0 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 transition whitespace-nowrap"
            >
              {exportingExcel ? '⏳ מייצא...' : '📊 יצא לאקסל'}
            </button>
          </div>
          {products.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">📦</div>
              <p>אין מוצרים עדיין</p>
            </div>
          )}
          {products.map(product => {
            const isOpen = inventoryExpanded === product.id
            const allVars = inventoryData[product.id] || []
            const totalStock = allVars.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
            const hasAnyVars = allVars.length > 0
            const comps = getProductComponents(product) // [null] או ['ראשגארד','מכנס']
            const isMultiComp = comps.length > 1 || comps[0] !== null

            // סיכום וריאנטים לתצוגה סגורה — קיבוץ לפי ממד עיקרי
            const variantSummary = (() => {
              if (!hasAnyVars) return null
              const hasColors = allVars.some(v => v.color)
              const hasSizes = allVars.some(v => v.size)
              // אם יש רב-רכיב, נחזיר מפת רכיב → פירוט
              if (isMultiComp) {
                return comps.filter(Boolean).map(comp => {
                  const cvars = allVars.filter(v => v.component_name === comp)
                  const cHasColors = cvars.some(v => v.color)
                  const cHasSizes = cvars.some(v => v.size)
                  const SIZE_ORDER_C = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','A0','A1','A2','A3','A4']
                  let groups = {}
                  if (cHasSizes) {
                    const sg = {}
                    cvars.forEach(v => { if (v.size) sg[v.size] = (sg[v.size] || 0) + (parseInt(v.stock) || 0) })
                    Object.keys(sg).sort((a,b) => {
                      const ai = SIZE_ORDER_C.indexOf(a), bi = SIZE_ORDER_C.indexOf(b)
                      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
                    }).forEach(k => { groups[k] = sg[k] })
                  } else if (cHasColors) {
                    cvars.forEach(v => { if (v.color) groups[v.color] = (groups[v.color] || 0) + (parseInt(v.stock) || 0) })
                  }
                  return { comp, groups }
                })
              }
              // מוצר רגיל — קיבוץ לפי מידה (עדיפות) ואם אין — לפי צבע
              let groups = {}
              if (hasSizes) {
                const SIZE_ORDER = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','A0','A1','A2','A3','A4']
                const sizeGroups = {}
                allVars.forEach(v => { if (v.size) sizeGroups[v.size] = (sizeGroups[v.size] || 0) + (parseInt(v.stock) || 0) })
                // מיון לפי סדר מידות
                Object.keys(sizeGroups).sort((a,b) => {
                  const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b)
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
                }).forEach(k => { groups[k] = sizeGroups[k] })
              } else if (hasColors) {
                allVars.forEach(v => { if (v.color) groups[v.color] = (groups[v.color] || 0) + (parseInt(v.stock) || 0) })
              }
              return Object.keys(groups).length ? [{ comp: null, groups }] : null
            })()

            // סינון פעיל למוצר זה
            const filter = invFilter[product.id] || {}
            const activeComp = filter.comp !== undefined ? filter.comp : (comps.filter(Boolean)[0] ?? null)
            const activeColor = filter.color ?? null
            const activeLength = filter.length ?? null

            // הגדרת הרכיב הפעיל מ-purchase_options
            const compDef = getCompDef(product, activeComp)
            const compColors = compDef.colors || []
            const compLengths = compDef.lengths || []
            const compSizes = compDef.sizes || []
            const hasLengths = compLengths.length > 0

            // וריאנטים מסוננים לפי רכיב + צבע + אורך
            const SIZE_ORDER = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','A0','A1','A2','A3','A4']
            const filteredVars = allVars
              .filter(v =>
                (v.component_name || null) === activeComp &&
                (!activeColor || v.color === activeColor) &&
                (!activeLength || v.length === activeLength)
              )
              .sort((a, b) => {
                const ai = SIZE_ORDER.indexOf(a.size)
                const bi = SIZE_ORDER.indexOf(b.size)
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
              })

            // האם מוכן להציג grid מידות
            const canShowGrid = (compColors.length === 0 || activeColor) && (!hasLengths || activeLength)

            // סה"כ מלאי לרכיב הפעיל
            const activeCompStock = allVars
              .filter(v => (v.component_name || null) === activeComp)
              .reduce((s, v) => s + (parseInt(v.stock) || 0), 0)

            return (
              <div key={product.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                {/* ─ כותרת מוצר ─ */}
                <button type="button" onClick={() => loadInventory(product)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition text-right">
                  {product.image_url && (
                    <img src={product.image_url} alt={product.title}
                      className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm">{product.title}</p>
                    {hasAnyVars && (
                      <>
                        <p className={`text-xs font-medium mt-0.5 ${totalStock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {totalStock > 0 ? `✓ ${totalStock} יחידות במלאי` : '⚠️ כל המלאי אזל'}
                        </p>
                        {variantSummary && !isOpen && (
                          <div className="mt-1 space-y-0.5">
                            {variantSummary.map(({ comp, groups }) => (
                              <div key={comp || '_'} className="flex flex-wrap gap-1 items-center">
                                {comp && <span className="text-[10px] text-blue-500 font-semibold">{comp}:</span>}
                                {Object.entries(groups).map(([label, qty]) => (
                                  <span key={label} className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    qty > 0 ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-400'
                                  }`}>
                                    {label}: {qty}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {!hasAnyVars && inventoryData[product.id] !== undefined && (
                      <p className="text-xs text-amber-600">טרם הוגדר מלאי — פתח והגדר</p>
                    )}
                    {isMultiComp && !hasAnyVars && (
                      <p className="text-[10px] text-blue-500 mt-0.5">
                        פריטים: {comps.filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-400 text-base flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* ─ תוכן מורחב ─ */}
                {isOpen && (
                  <div className="border-t px-4 pb-5 pt-4 space-y-4">
                    {inventoryLoading ? (
                      <p className="text-center text-sm text-gray-400 py-3">טוען...</p>
                    ) : (
                      <>
                        {/* טאבים לרכיבים */}
                        {isMultiComp && (
                          <div className="flex gap-2 border-b pb-3 flex-wrap">
                            {comps.filter(Boolean).map(comp => {
                              const cStock = allVars
                                .filter(v => v.component_name === comp)
                                .reduce((s, v) => s + (parseInt(v.stock) || 0), 0)
                              const isActive = activeComp === comp
                              return (
                                <button key={comp} type="button"
                                  onClick={() => setInvFilter(p => ({
                                    ...p,
                                    [product.id]: { comp, color: null, length: null }
                                  }))}
                                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${
                                    isActive
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {comp}
                                  {cStock > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                      isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {cStock}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* בחירת צבע */}
                        {compColors.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-700 mb-2">🎨 צבע:</p>
                            <div className="flex gap-2 flex-wrap">
                              {compColors.map(color => (
                                <button key={color} type="button"
                                  onClick={() => setInvFilter(p => ({
                                    ...p,
                                    [product.id]: { ...(p[product.id] || {}), color, length: null }
                                  }))}
                                  className={`px-5 py-2 rounded-xl border-2 text-sm font-bold transition ${
                                    activeColor === color
                                      ? 'border-purple-500 bg-purple-500 text-white shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300'
                                  }`}
                                >
                                  {color}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* בחירת אורך (רק אחרי צבע) */}
                        {hasLengths && activeColor && (
                          <div>
                            <p className="text-xs font-bold text-gray-700 mb-2">📐 אורך:</p>
                            <div className="flex gap-2">
                              {compLengths.map(len => (
                                <button key={len} type="button"
                                  onClick={() => setInvFilter(p => ({
                                    ...p,
                                    [product.id]: { ...(p[product.id] || {}), length: len }
                                  }))}
                                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition ${
                                    activeLength === len
                                      ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                                  }`}
                                >
                                  {len}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* הנחיות */}
                        {compColors.length > 0 && !activeColor && (
                          <p className="text-sm text-gray-400 text-center py-2">👆 בחר צבע להתחלה</p>
                        )}
                        {hasLengths && activeColor && !activeLength && (
                          <p className="text-sm text-gray-400 text-center py-2">👆 בחר אורך להמשך</p>
                        )}

                        {/* Grid מידות + כמויות */}
                        {canShowGrid && compSizes.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-gray-700">
                                📏 {activeComp || 'מלאי'} — {activeColor}{activeLength ? ` + ${activeLength}` : ''}:
                              </p>
                              <button type="button"
                                disabled={inventoryLoading}
                                onClick={() => generateInventoryMatrix(product, activeComp)}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                              >
                                {inventoryLoading ? 'יוצר...' : '+ צור שורות חסרות'}
                              </button>
                            </div>

                            {filteredVars.length === 0 ? (
                              <div className="text-center py-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <p className="text-xs text-gray-400">אין שורות מלאי לשילוב זה</p>
                                <p className="text-[10px] text-gray-400 mt-1">לחץ "+ צור שורות חסרות" ↑</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {filteredVars.map(v => {
                                  const stock = parseInt(v.stock) || 0
                                  return (
                                    <div key={v.id} className={`rounded-xl border-2 p-2.5 text-center transition ${
                                      stock === 0
                                        ? 'border-red-200 bg-red-50'
                                        : 'border-emerald-300 bg-emerald-50'
                                    }`}>
                                      <p className="text-xs font-bold text-gray-700 mb-1.5">{v.size || '—'}</p>
                                      <input
                                        type="number" min="0"
                                        value={v.stock ?? 0}
                                        onChange={e => updateInventoryStock(product.id, v.id, e.target.value)}
                                        className={`w-full text-center text-base font-bold rounded-lg border-0 bg-transparent outline-none ${
                                          stock === 0 ? 'text-red-500' : 'text-emerald-700'
                                        }`}
                                      />
                                      <p className={`text-[9px] mt-1 font-bold ${
                                        stock === 0 ? 'text-red-400' : 'text-emerald-600'
                                      }`}>
                                        {stock === 0 ? 'אזל' : `יש ${stock}`}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* כפתור שמירה */}
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-xs text-gray-500">
                            {isMultiComp && activeComp
                              ? <>{activeComp}: <strong className={activeCompStock > 0 ? 'text-emerald-600' : 'text-red-500'}>{activeCompStock} יח'</strong> · סה״כ: <strong>{totalStock}</strong></>
                              : <>סה״כ מלאי: <strong className={totalStock > 0 ? 'text-emerald-600' : 'text-red-500'}>{totalStock} יחידות</strong></>
                            }
                          </span>
                          <button type="button" disabled={inventorySaving || !hasAnyVars}
                            onClick={() => saveInventory(product.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-40 transition">
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
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowBundleForm(f => !f); setShowForm(false) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${showBundleForm ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-purple-600 text-white border-transparent hover:bg-purple-700'}`}>
                {showBundleForm ? 'ביטול חבילה' : '🎁 הוסף חבילה'}
              </button>
              <button onClick={() => { setShowForm(f => !f); setShowBundleForm(false) }}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                {showForm ? 'ביטול' : '+ הוסף מוצר'}
              </button>
            </div>
          )}

          {/* ── טופס הוספת חבילה ── */}
          {showBundleForm && (() => {
            const regularTotal = bundleForm.items.reduce((sum, i) => {
              const p = products.find(pr => pr.id === i.product_id)
              return sum + (p?.price ? parseFloat(p.price) * (i.qty || 1) : 0)
            }, 0)
            const bundlePrice = bundleForm.price ? parseFloat(bundleForm.price) : 0
            const saving = regularTotal > 0 && bundlePrice > 0 ? (regularTotal - bundlePrice).toFixed(0) : null
            return (
              <div className="bg-white border border-purple-200 rounded-xl p-4 space-y-4 shadow-sm">
                <h4 className="font-bold text-sm text-purple-700 border-b border-purple-100 pb-1">🎁 חבילה חדשה</h4>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם החבילה *"
                  value={bundleForm.name} onChange={e => setBundleForm(p => ({ ...p, name: e.target.value }))} />
                <div className="space-y-1">
                  <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מחיר החבילה ₪"
                    value={bundleForm.price} onChange={e => setBundleForm(p => ({ ...p, price: e.target.value }))} />
                  {saving !== null && (
                    <p className="text-xs text-emerald-600 font-bold">
                      💰 חיסכון: ₪{saving} לעומת קנייה בנפרד (₪{regularTotal.toFixed(0)})
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-600">בחר מוצרים (לפחות 2):</p>
                  <div className="space-y-1 max-h-52 overflow-y-auto border rounded-lg p-2">
                    {products.filter(p => p.type === 'product').map(p => {
                      const existing = bundleForm.items.find(i => i.product_id === p.id)
                      return (
                        <div key={p.id} className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded p-1">
                          <input type="checkbox" checked={!!existing}
                            onChange={() => toggleBundleItem(p)}
                            className="flex-shrink-0" />
                          <span className="flex-1 truncate">{p.title}</span>
                          {p.price != null && <span className="text-gray-400 text-xs">₪{p.price}</span>}
                          {existing && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button type="button" onClick={() => setBundleForm(prev => ({
                                ...prev, items: prev.items.map(i => i.product_id === p.id ? { ...i, qty: Math.max(1, (i.qty||1) - 1) } : i)
                              }))} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold hover:bg-gray-300">−</button>
                              <span className="w-5 text-center text-xs font-bold">{existing.qty || 1}</span>
                              <button type="button" onClick={() => setBundleForm(prev => ({
                                ...prev, items: prev.items.map(i => i.product_id === p.id ? { ...i, qty: (i.qty||1) + 1 } : i)
                              }))} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold hover:bg-gray-300">+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {bundleForm.items.length > 0 && (
                    <p className="text-xs text-purple-600">
                      {bundleForm.items.map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.product_name}`).join(' + ')}
                    </p>
                  )}
                </div>
                <button onClick={handleSaveBundle} disabled={savingBundle}
                  className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50">
                  {savingBundle ? 'שומר...' : '💾 שמור חבילה'}
                </button>
              </div>
            )
          })()}

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
                    <div className="flex gap-2 items-center flex-wrap">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">מחיר רגיל ₪</span>
                        <input
                          type="number" step="0.01"
                          className="w-20 border rounded px-2 py-1 text-xs"
                          placeholder="ללא חבילה"
                          value={opt.original_price || ''}
                          onChange={e => {
                            const orig = e.target.value
                            const bundlePrice = parseFloat(opt.price) || 0
                            const origNum = parseFloat(orig) || 0
                            const saving = origNum > bundlePrice ? (origNum - bundlePrice).toFixed(0) : 0
                            const note = saving > 0 ? `חיסכון ${saving}` : (opt.note || '')
                            setForm(p => ({
                              ...p,
                              purchase_options: p.purchase_options.map((o, i) => i === idx ? { ...o, original_price: orig, note } : o),
                            }))
                          }} />
                        {(() => {
                          const orig = parseFloat(opt.original_price) || 0
                          const bundle = parseFloat(opt.price) || 0
                          const saving = orig > bundle ? orig - bundle : 0
                          const pct = orig > 0 && saving > 0 ? Math.round((saving / orig) * 100) : 0
                          return pct > 0 ? (
                            <span className="text-[10px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded">-{pct}%</span>
                          ) : null
                        })()}
                      </div>
                      <input
                        className="flex-1 border rounded px-2 py-1 text-xs text-gray-600 min-w-0"
                        placeholder="הערה (יחושב אוטומטית מהמחיר הרגיל)"
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

          {/* ─── רשימת חבילות (בתוך טאב מוצרים) ─── */}
          {tab === 'products' && isAdmin && bundles.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-xs font-bold text-purple-700 uppercase tracking-wide">🎁 חבילות קיימות</h3>
              {bundles.map(b => {
                const regularTotal = (b.bundle_items || []).reduce((sum, i) => {
                  const p = products.find(pr => pr.id === i.product_id)
                  return sum + (p?.price ? parseFloat(p.price) * (i.qty || 1) : 0)
                }, 0)
                const saving = regularTotal > 0 && b.price != null ? (regularTotal - b.price).toFixed(0) : null
                return (
                  <div key={b.id} className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{b.title}</p>
                      <p className="text-xs text-gray-500">
                        {(b.bundle_items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.product_name}`).join(' + ')}
                      </p>
                      {b.price != null && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm text-emerald-600 font-bold">₪{b.price}</span>
                          {saving !== null && parseFloat(saving) > 0 && (
                            <span className="text-xs text-orange-500 font-bold">חיסכון ₪{saving}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleDeleteBundle(b.id)}
                      className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg flex-shrink-0">
                      🗑️
                    </button>
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}
