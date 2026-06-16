import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { notifyPush } from '../../lib/notifyPush'
import { allActiveAthleteUserIds, allAdminUserIds, athleteUserIdsForBranches } from '../../lib/notifyTargets'
import { useToast, useConfirm } from '../a11y'

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
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems]       = useState([])
  // הרשמות לסמינרים (product_requests) — מוצגות למנהל מתחת לכל סמינר
  const [seminarRequests, setSeminarRequests] = useState([])
  const [expandedSeminarId, setExpandedSeminarId] = useState(null)
  const [togglingPaidId, setTogglingPaidId] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]         = useState({ title: '', content: '', type: 'general', event_date: '', price: '', early_price: '', early_price_deadline: '', image_url: '', branch_ids: [], links: [] })
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [branches, setBranches] = useState([])
  // סינון תצוגה: הכל / אירועים / הודעות
  const [mgrFilter, setMgrFilter] = useState('all')
  // אירועים שעברו — מקופלים כברירת מחדל
  const [showMgrPast, setShowMgrPast] = useState(false)

  useEffect(() => {
    let q = supabase.from('branches').select('id, name').order('name')
    if (!isAdmin) q = q.eq('hidden', false)
    q.then(({ data }) => setBranches(data || []))
  }, [isAdmin])

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      content: item.content || '',
      type: item.type || 'general',
      event_date: item.event_date ? new Date(item.event_date).toISOString().slice(0, 16) : '',
      event_location: item.event_location || '',
      price: item.price != null ? String(item.price) : '',
      early_price: item.early_price != null ? String(item.early_price) : '',
      early_price_deadline: item.early_price_deadline || '',
      image_url: item.image_url || '',
      branch_ids: Array.isArray(item.branch_ids) ? item.branch_ids : [],
      links: Array.isArray(item.links) ? item.links : [],
      allow_app_registration: item.allow_app_registration !== false,
    })
    setShowForm(true)
    // גלילה אוטומטית לטופס העריכה אחרי שהוא מרונדר מתחת לאירוע
    setTimeout(() => {
      document.getElementById('announcement-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function openAdd() {
    setEditingId(null)
    setForm({ title: '', content: '', type: 'general', event_date: '', event_location: '', price: '', early_price: '', early_price_deadline: '', image_url: '', branch_ids: [], links: [], allow_app_registration: true })
    setShowForm(true)
  }

  function toggleBranch(id) {
    setForm(p => {
      const has = p.branch_ids.includes(id)
      return { ...p, branch_ids: has ? p.branch_ids.filter(b => b !== id) : [...p.branch_ids, id] }
    })
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

  useEffect(() => { fetchAnnouncements() }, [])

  async function fetchAnnouncements() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('id, type, title, content, image_url, status, created_at, price, early_price, early_price_deadline, event_date, event_location, branch_ids, links, allow_app_registration')
      .in('type', ['general', 'announcement', 'seminar'])
      .order('created_at', { ascending: false })
    setItems(data || [])
    // הרשמות לסמינרים — רק למנהל
    if (isAdmin) {
      const { data: reqs } = await supabase.from('product_requests').select('*').order('created_at', { ascending: false })
      setSeminarRequests(reqs || [])
    }
    setLoading(false)
  }

  // ===== ניהול נרשמים לסמינר =====
  function requestsForSeminar(item) {
    return seminarRequests.filter(r => r.product_name === item.title)
  }

  // שולם = status 'done' (המתאמן רואה "✅ נרשמת — התשלום אושר"). לא שולם = 'pending'.
  async function togglePaid(reg) {
    const newStatus = reg.status === 'done' ? 'pending' : 'done'
    setTogglingPaidId(reg.id)
    const { error } = await supabase.from('product_requests').update({ status: newStatus }).eq('id', reg.id)
    setTogglingPaidId(null)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    setSeminarRequests(prev => prev.map(r => r.id === reg.id ? { ...r, status: newStatus } : r))
  }

  // שליחת התראת push מחדש על הודעה/סמינר קיימים — למקרה שההתראה המקורית פוספסה
  // (למשל כשטאב ההודעות קרס אצל המתאמנים). היעד: לפי הסניפים של ההודעה או כולם.
  async function resendNotification(item) {
    const target = Array.isArray(item.branch_ids) && item.branch_ids.length
      ? `למתאמני ${item.branch_ids.length} הסניפים של ההודעה` : 'לכל המתאמנים הפעילים'
    const ok = await confirm({
      title: 'שליחת התראה מחדש',
      message: `לשלוח שוב התראה על "${item.title}" ${target}?`,
      confirmText: 'שלח התראה',
    })
    if (!ok) return
    setResendingId(item.id)
    try {
      const branchIds = Array.isArray(item.branch_ids) ? item.branch_ids.filter(Boolean) : []
      const userIds = await (branchIds.length ? athleteUserIdsForBranches(branchIds) : allActiveAthleteUserIds())
      if (!userIds.length) { toast.error('לא נמצאו מתאמנים פעילים לשליחה (בדוק שיוך סניפים)'); setResendingId(null); return }
      const res = await notifyPush({
        userIds,
        title: item.type === 'seminar' ? '🎓 תזכורת: סמינר' : '📢 תזכורת: הודעה',
        body: item.title,
        url: `/#announcements?focus=${item.id}`,
        tag: `announcement-resend:${Date.now()}`,
      })
      // דיאגנוסטיקה מלאה מהשרת — כדי שיהיה ברור איפה זה נתקע
      if (res?.error) {
        toast.error(`שגיאת שרת בשליחה: ${res.error}`)
      } else if (res?.reason === 'no_subscriptions') {
        toast.error(`נמענים: ${userIds.length}, אבל לאף אחד מהם אין מנוי התראות פעיל — צריך ללחוץ "הפעל התראות" במכשיר של המתאמן`)
      } else {
        toast.success(`נמענים: ${userIds.length} · נשלחו בפועל: ${res?.sent ?? '?'} · נכשלו: ${res?.failed ?? 0}`)
      }
    } catch (e) {
      toast.error('שגיאה בשליחת ההתראה: ' + (e.message || 'לא ידוע'))
    }
    setResendingId(null)
  }

  async function deleteRegistration(reg) {
    const ok = await confirm({ title: 'מחיקת הרשמה', message: `למחוק את ההרשמה של ${reg.athlete_name}?`, confirmText: 'מחק', danger: true })
    if (!ok) return
    const { error } = await supabase.from('product_requests').delete().eq('id', reg.id)
    if (error) { toast.error('שגיאה במחיקה: ' + error.message); return }
    setSeminarRequests(prev => prev.filter(r => r.id !== reg.id))
  }

  // ===== קיצורי מבחן ילדים יוני =====
  // 3 טמפלייטים: חודש לפני / שבוע לפני (כולל סילבוס) / יום אחרי.
  async function applyKidsTestTemplate(which) {
    setEditingId(null)
    // תאריך מבחן יוני קרוב — שישי האחרון של יוני בשנה הקרובה
    const today = new Date()
    let year = today.getFullYear()
    const juneEnd = new Date(year, 5, 30)
    if (today > juneEnd) year += 1
    const d = new Date(year, 5, 30)
    while (d.getDay() !== 5) d.setDate(d.getDate() - 1)
    const dateStr = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

    let title = '', content = ''
    if (which === 'month_before') {
      title = `📅 חודש לפני המבחן השנתי — ${dateStr}`
      content = [
        `שלום הורים יקרים!`,
        ``,
        `עוד חודש (${dateStr}) יתקיים מבחן הדרגות השנתי לילדים.`,
        ``,
        `כל ילד יעבור מבחן — לא רק "המוכנים". מי שיש לו אחוז נוכחות תקין יקודם לחגורה הבאה,`,
        `ומי שזקוק לתרגול נוסף יקבל פס נוסף או יישאר באותה דרגה לבדיקה.`,
        ``,
        `🎯 חשוב להגיע לכל האימונים החודש — זה הבסיס להצלחה במבחן.`,
        ``,
        `נשמח לראות את כל הילדים על המזרון!`,
      ].join('\n')
    } else if (which === 'week_before') {
      // טוען סילבוס + מצרף לתוכן
      const { data: syl } = await supabase.from('belt_test_syllabus')
        .select('belt_family, age_range_label, content, level_notes, display_order')
        .order('display_order', { ascending: true })
      title = `🥋 שבוע לפני המבחן — תוכן הסילבוס`
      const sylLines = []
      for (const s of (syl || [])) {
        const familyLabels = { gray: 'אפורה', yellow: 'צהובה', orange: 'כתומה', green: 'ירוקה' }
        sylLines.push(`\n=== חגורה ${familyLabels[s.belt_family] || s.belt_family} (גילאי ${s.age_range_label}) ===`)
        if (Array.isArray(s.content?.sections)) {
          for (const sec of s.content.sections) {
            sylLines.push(`• ${sec.title}: ${(sec.items || []).join(', ')}`)
          }
        }
      }
      content = [
        `שלום הורים יקרים!`,
        ``,
        `המבחן השנתי בעוד שבוע (${dateStr}). זה תוכן הסילבוס שלפיו הילדים נבחנים:`,
        sylLines.join('\n'),
        ``,
        `הילדים יודעים את החומר — חשוב שיהיו רגועים ומלאי ביטחון.`,
        `מי שמרגיש שצריך תרגול נוסף — מוזמנים להגיע לאימונים האחרונים השבוע.`,
        ``,
        `בהצלחה לכולם! 🥋`,
      ].join('\n')
    } else if (which === 'day_after') {
      title = `🎉 כל הכבוד למתבחנים!`
      content = [
        `שלום הורים יקרים!`,
        ``,
        `אתמול התקיים מבחן הדרגות השנתי וכל הילדים השקיעו ועבדו קשה. גאים בכל אחד ואחת מהם!`,
        ``,
        `🥋 חגורות חדשות + פסים יחולקו באימון הקרוב.`,
        `📋 דוח אישי של כל ילד נשלח להורים לאפליקציה — מי קודם, מי קיבל פס, ומי הוזמן לחזור על הדרגה לעוד תרגול.`,
        ``,
        `תודה לכל המשפחות על התמיכה לאורך השנה. נמשיך לעבוד יחד גם בשנה הבאה!`,
      ].join('\n')
    }

    setForm({
      title,
      content,
      type: 'general',
      event_date: '',
      event_location: '',
      price: '',
      early_price: '',
      early_price_deadline: '',
      image_url: '',
      branch_ids: [],
      links: [],
      allow_app_registration: true,
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const branchIds = Array.isArray(form.branch_ids) ? form.branch_ids.filter(Boolean) : []
    // ניקוי קישורים: רק שורות עם URL, ונרמול https:// אם חסר
    const cleanLinks = (Array.isArray(form.links) ? form.links : [])
      .map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() }))
      .filter(l => l.url)
      .map(l => ({ ...l, url: /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}` }))
    const payload = {
      title: form.title, content: form.content, type: form.type, trainer_id: trainerId,
      branch_ids: branchIds.length ? branchIds : null,
      links: cleanLinks.length ? cleanLinks : null,
      ...(form.type === 'seminar' && form.event_date ? { event_date: form.event_date } : {}),
      ...(form.type === 'seminar' ? { event_location: form.event_location?.trim() || null } : {}),
      ...(form.type === 'seminar' && form.price      ? { price: parseFloat(form.price) } : {}),
      ...(form.type === 'seminar' ? { early_price: form.early_price ? parseFloat(form.early_price) : null } : {}),
      ...(form.type === 'seminar' ? { early_price_deadline: form.early_price_deadline || null } : {}),
      ...(form.type === 'seminar' ? { allow_app_registration: form.allow_app_registration !== false } : {}),
      ...(form.image_url ? { image_url: form.image_url } : {}),
    }
    if (editingId) {
      const { error: updErr } = await supabase.from('announcements').update(payload).eq('id', editingId)
      if (updErr) { toast.error('שגיאה בשמירה: ' + updErr.message); return }
    } else {
      const status = isAdmin ? 'approved' : 'pending'
      const insertPayload = {
        ...payload,
        status,
        ...(isAdmin ? { approved_by: trainerId, approved_at: new Date().toISOString() } : {}),
      }
      const { data: inserted, error: insErr } = await supabase.from('announcements').insert(insertPayload).select('id').single()
      if (insErr) { toast.error('שגיאה בפרסום: ' + insErr.message); return }
      if (status === 'approved') {
        // אדמין פרסם ישירות — התראה למתאמנים (לפי סניף או לכולם)
        const targetIdsPromise = branchIds.length
          ? athleteUserIdsForBranches(branchIds)
          : allActiveAthleteUserIds()
        targetIdsPromise
          .then(userIds => notifyPush({
            userIds,
            title: form.type === 'seminar' ? 'סמינר חדש' : 'הודעה חדשה',
            body: form.title,
            url: `/#announcements${inserted?.id ? `?focus=${inserted.id}` : ''}`,
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
    setForm({ title: '', content: '', type: 'general', event_date: '', event_location: '', price: '', early_price: '', early_price_deadline: '', image_url: '', branch_ids: [], links: [], allow_app_registration: true })
    setEditingId(null)
    setShowForm(false)
    fetchAnnouncements()
    onChange?.()
  }

  async function approveItem(item) {
    // הגנה: שלח push פעם אחת בלבד. אם כבר אושר — אל תשלח שוב (מונע ספאם בלחיצה כפולה).
    if (item.status === 'approved') {
      console.warn('approveItem: item already approved, skipping push notification')
      return
    }
    const { error } = await supabase.from('announcements').update({
      status: 'approved',
      approved_by: trainerId,
      approved_at: new Date().toISOString(),
    }).eq('id', item.id)
    if (error) {
      console.error('approveItem error:', error)
      return
    }
    // התראה למתאמנים על הפרסום (לפי סניף אם הוגדר, אחרת לכולם)
    const branchIds = Array.isArray(item.branch_ids) ? item.branch_ids.filter(Boolean) : []
    const targetIdsPromise = branchIds.length
      ? athleteUserIdsForBranches(branchIds)
      : allActiveAthleteUserIds()
    targetIdsPromise
      .then(userIds => notifyPush({
        userIds,
        title: item.type === 'seminar' ? 'סמינר חדש' : 'הודעה חדשה',
        body: item.title,
        url: `/#announcements?focus=${item.id}`,
        tag: `announcement:${item.id}`,
      }))
      .catch(e => console.warn('notifyPush failed:', e))
    fetchAnnouncements()
    onChange?.()
  }

  async function deleteItem(id) {
    const item = items.find(i => i.id === id)
    // אזהרה מוגברת לסמינר עם נרשמים
    const regsCount = item?.type === 'seminar' ? requestsForSeminar(item).length : 0
    const ok = await confirm({
      title: item?.type === 'seminar' ? 'מחיקת סמינר' : 'מחיקת הודעה',
      message: regsCount > 0
        ? `לסמינר "${item?.title}" יש ${regsCount} נרשמים! למחוק בכל זאת? (ההרשמות יישארו אבל יאבדו את הקישור לסמינר)`
        : `למחוק את "${item?.title || 'ההודעה'}"? פעולה זו אינה הפיכה.`,
      confirmText: 'מחק',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) { toast.error('שגיאה במחיקה: ' + error.message); return }
    setItems(prev => prev.filter(i => i.id !== id))
    onChange?.()
  }

  // טופס פרסום/עריכה — מרונדר למעלה (הודעה חדשה) או מתחת לאירוע שנערך (עריכה)
  const editorCard = (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-gray-600">סוג הפרסום</legend>
            <div className="grid grid-cols-1 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${form.type === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" name="type" value={opt.value} checked={form.type === opt.value}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="accent-blue-600" />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">סניף יעד</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setForm(p => ({ ...p, branch_ids: [] }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.branch_ids.length === 0
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>
                כל הסניפים
              </button>
              {branches.map(b => {
                const on = form.branch_ids.includes(b.id)
                return (
                  <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      on
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}>
                    {on ? '✓ ' : ''}{b.name}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {form.branch_ids.length === 0
                ? 'ההודעה תישלח לכל המתאמנים'
                : `ההודעה תישלח ל-${form.branch_ids.length} סניפים נבחרים`}
            </p>
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
                <label className="text-xs text-gray-500 mb-1 block">📍 מיקום (אופציונלי)</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="למשל: Fight TLV, דרך מנחם בגין 150 תל אביב"
                  value={form.event_location} onChange={e => setForm(p => ({ ...p, event_location: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">מחיר רגיל (₪)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
                  value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">מחיר מוקדם (₪) — אופציונלי</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="למשל 100"
                    value={form.early_price} onChange={e => setForm(p => ({ ...p, early_price: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">מחיר מוקדם בתוקף עד (כולל)</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.early_price_deadline} onChange={e => setForm(p => ({ ...p, early_price_deadline: e.target.value }))} />
                </div>
              </div>
              {form.early_price && form.early_price_deadline && form.price && (
                <p className="text-[11px] text-blue-600">
                  המתאמנים יראו: עד {new Date(form.early_price_deadline + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} — ₪{form.early_price} · אחרי — ₪{form.price}
                </p>
              )}
              {/* הרשמה דרך האפליקציה: לכבות כשהאירוע חיצוני (תחרות/אינטרקלאב) וההרשמה/תשלום בקישור חיצוני */}
              <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${form.allow_app_registration !== false ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                <input type="checkbox" checked={form.allow_app_registration !== false}
                  onChange={e => setForm(p => ({ ...p, allow_app_registration: e.target.checked }))}
                  className="accent-emerald-600 mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">הרשמה דרך האפליקציה</span>
                  <span className="block text-[11px] text-gray-500">
                    מציג למתאמן כפתור ירוק "להירשם לסמינר" והתשלום באקדמיה. לכבות כשההרשמה חיצונית (תחרות / אינטרקלאב עם קישור הרשמה ותשלום) — יוצגו רק כפתורי הקישור.
                  </span>
                </span>
              </label>
            </>
          )}
          {/* קישורים מובנים — מוצגים למתאמן ככפתורים. אופציונלי: לינק שמודבק בטקסט התוכן ממילא הופך לחיץ אוטומטית. */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 block">🔗 כפתורי קישור (אופציונלי) — למשל "הרשמה" או "תשלום"</label>
            {(form.links || []).map((lnk, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input className="w-1/3 border rounded-lg px-2 py-2 text-sm" placeholder="תיאור (למשל: תשלום)"
                  value={lnk.label || ''}
                  onChange={e => setForm(p => { const links = [...p.links]; links[idx] = { ...links[idx], label: e.target.value }; return { ...p, links } })} />
                <input className="flex-1 border rounded-lg px-2 py-2 text-sm" placeholder="https://..." dir="ltr"
                  value={lnk.url || ''}
                  onChange={e => setForm(p => { const links = [...p.links]; links[idx] = { ...links[idx], url: e.target.value }; return { ...p, links } })} />
                <button type="button" onClick={() => setForm(p => ({ ...p, links: p.links.filter((_, i) => i !== idx) }))}
                  className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setForm(p => ({ ...p, links: [...(p.links || []), { label: '', url: '' }] }))}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ הוסף קישור</button>
          </div>
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
                <img src={form.image_url} alt={form.title ? `תצוגה מקדימה של ${form.title}` : 'תצוגה מקדימה של תמונת ההודעה'} className="w-16 h-16 rounded-lg object-cover border" />
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
  )

  // ארגון לשני אזורים — כמו בתצוגת המתאמן, אך עם כל כלי הניהול.
  // אירועים (סמינרים) לפי תאריך האירוע, הודעות לפי תאריך פרסום (הסדר שכבר נטען מה-DB).
  const nowMgr = new Date()
  const mgrEventRank = item => {
    const d = item.event_date ? new Date(item.event_date) : null
    if (!d) return [1, -(new Date(item.created_at || 0).getTime())]
    return d >= nowMgr ? [0, d.getTime()] : [2, -d.getTime()]
  }
  const managerEvents  = items.filter(i => i.type === 'seminar').sort((a, b) => { const ra = mgrEventRank(a), rb = mgrEventRank(b); return ra[0] - rb[0] || ra[1] - rb[1] })
  const managerNotices = items.filter(i => i.type !== 'seminar')
  // אירוע שעבר — מוסתר עד שלוחצים "אירועים שעברו"
  const isMgrPast = item => !!(item.event_date && new Date(item.event_date) < nowMgr)
  const mgrPastCount = managerEvents.filter(isMgrPast).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">הודעות וסמינרים</h2>
        <button onClick={() => showForm ? setShowForm(false) : openAdd()} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          {showForm ? 'ביטול' : '+ פרסם הודעה חדשה'}
        </button>
      </div>

      {/* קיצורי מבחן ילדים יוני */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <div className="text-xs font-bold text-amber-900 mb-2">🥋 קיצורים — מבחן ילדים יוני</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyKidsTestTemplate('month_before')}
            className="text-xs bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold px-3 py-1.5 rounded-lg"
          >📅 חודש לפני המבחן</button>
          <button
            type="button"
            onClick={() => applyKidsTestTemplate('week_before')}
            className="text-xs bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold px-3 py-1.5 rounded-lg"
          >🥋 שבוע לפני (כולל סילבוס)</button>
          <button
            type="button"
            onClick={() => applyKidsTestTemplate('day_after')}
            className="text-xs bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold px-3 py-1.5 rounded-lg"
          >🎉 יום אחרי המבחן</button>
        </div>
      </div>

      {showForm && !editingId && editorCard}

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הודעות עדיין</p></div>
      ) : (
        <div className="space-y-4">
          {/* סרגל סינון: הכל / אירועים / הודעות */}
          <div className="flex bg-gray-100 rounded-full p-1 text-sm max-w-xs">
            {[{ key: 'all', label: 'הכל' }, { key: 'events', label: 'אירועים' }, { key: 'notices', label: 'הודעות' }].map(t => (
              <button key={t.key} onClick={() => setMgrFilter(t.key)}
                className={`flex-1 py-1.5 rounded-full font-medium transition ${mgrFilter === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="space-y-5">
          {[
            { key: 'events',  label: '📅 אירועים (סמינרים / תחרויות)', rows: managerEvents },
            { key: 'notices', label: '📢 הודעות',                      rows: managerNotices },
          ].filter(sec => sec.rows.length > 0 && (mgrFilter === 'all' || mgrFilter === sec.key)).map(sec => (
            <div key={sec.key} className="space-y-3">
              <h3 className="font-bold text-gray-700 text-base flex items-center gap-2">
                {sec.label}<span className="text-xs font-normal text-gray-400">({sec.key === 'events' ? sec.rows.length - mgrPastCount : sec.rows.length})</span>
              </h3>
              <ul className="space-y-3">
                {sec.rows.map(item => (
            <li key={item.id} className="bg-white border rounded-xl overflow-hidden shadow-sm"
              style={isMgrPast(item) && !showMgrPast ? { display: 'none' } : undefined}>
              {/* תמונת ההודעה/הסמינר — כמו בתצוגת המתאמן */}
              {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-72 object-contain bg-gray-50" loading="lazy" />}
              <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {item.event_date && <span className="text-xs text-gray-400">{new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}
                    {item.event_location && <span className="text-xs text-gray-500">📍 {item.event_location}</span>}
                    {item.price != null && <span className="text-xs font-bold text-green-600">₪{item.price}</span>}
                    {item.early_price != null && item.early_price_deadline && (
                      <span className="text-xs text-blue-600">
                        מוקדם: ₪{item.early_price} עד {new Date(item.early_price_deadline + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">⏳ ממתין לאישור</span>
                    )}
                    {Array.isArray(item.branch_ids) && item.branch_ids.length > 0 ? (
                      item.branch_ids.map(bid => {
                        const name = branches.find(b => b.id === bid)?.name || ''
                        return name ? (
                          <span key={bid} className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">📍 {name}</span>
                        ) : null
                      })
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">📍 כל הסניפים</span>
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
                    {isAdmin && item.status !== 'pending' && (
                      <button onClick={() => resendNotification(item)} disabled={resendingId === item.id}
                        className="text-xs bg-amber-50 text-amber-600 hover:bg-amber-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {resendingId === item.id ? '...' : '🔔 שלח התראה'}
                      </button>
                    )}
                    <button onClick={() => deleteItem(item.id)} className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg">🗑️ מחק</button>
                  </div>
                )}
              </div>
              {/* ===== נרשמים לסמינר (מנהל בלבד) ===== */}
              {isAdmin && item.type === 'seminar' && (() => {
                const regs = requestsForSeminar(item)
                const paid = regs.filter(r => r.status === 'done')
                const unpaid = regs.filter(r => r.status === 'pending')
                const sum = rows => rows.reduce((s, r) => s + (Number(r.total_price ?? r.unit_price) || 0), 0)
                const isOpen = expandedSeminarId === item.id
                return (
                  <div className="mt-3 border-t pt-3">
                    <button type="button" onClick={() => setExpandedSeminarId(isOpen ? null : item.id)}
                      className="w-full flex flex-wrap items-center gap-2 text-right">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">👥 נרשמו: {regs.length}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✓ שולם: {paid.length} (₪{sum(paid)})</span>
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">⏳ לא שולם: {unpaid.length} (₪{sum(unpaid)})</span>
                      <span className="text-xs text-blue-600 font-medium mr-auto">{isOpen ? 'הסתר ▲' : 'הצג נרשמים ▼'}</span>
                    </button>
                    {isOpen && (
                      regs.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-4">אין נרשמים עדיין</p>
                      ) : (
                        <ul className="divide-y mt-2">
                          {regs.map(reg => {
                            const isPaid = reg.status === 'done'
                            const isCancelled = reg.status === 'cancelled'
                            return (
                              <li key={reg.id} className="flex items-center justify-between gap-2 py-2.5">
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-medium ${isCancelled ? 'text-red-400 line-through' : 'text-gray-800'}`}>
                                    {reg.athlete_name || 'לא ידוע'}
                                  </p>
                                  <p className="text-[11px] text-gray-400">
                                    נרשם: {new Date(reg.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                                    {(reg.total_price ?? reg.unit_price) != null && <> · ₪{reg.total_price ?? reg.unit_price}</>}
                                    {(reg.notes || '').includes('מחיר מוקדם') && <span className="text-blue-500"> · מחיר מוקדם</span>}
                                  </p>
                                </div>
                                <div className="flex gap-2 shrink-0 items-center">
                                  {/* ברירת מחדל: "לא שולם" (תג אדום) + כפתור פעולה ירוק. אחרי תשלום: תג "שולם" + ביטול קטן */}
                                  {!isCancelled && (isPaid ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold">✓ שולם</span>
                                      <button onClick={() => togglePaid(reg)} disabled={togglingPaidId === reg.id}
                                        className="text-[11px] text-gray-400 hover:text-gray-600 underline disabled:opacity-50">
                                        {togglingPaidId === reg.id ? '...' : 'בטל'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs bg-red-100 text-red-600 px-2 py-1.5 rounded-lg font-medium">לא שולם</span>
                                      <button onClick={() => togglePaid(reg)} disabled={togglingPaidId === reg.id}
                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50">
                                        {togglingPaidId === reg.id ? '...' : '💰 סמן כשולם'}
                                      </button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => deleteRegistration(reg)}
                                    className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1.5 rounded-lg">
                                    מחק
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    )}
                  </div>
                )
              })()}
              {/* טופס עריכה — נפתח מתחת לאירוע שנערך */}
              {showForm && editingId === item.id && <div id="announcement-edit-form" className="mt-3 border-t pt-3 scroll-mt-4">{editorCard}</div>}
              </div>
            </li>
                ))}
              </ul>
              {sec.key === 'events' && mgrPastCount > 0 && (
                <button type="button" onClick={() => setShowMgrPast(v => !v)}
                  className="w-full flex items-center justify-between text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-2.5 font-medium transition mt-1">
                  <span>🗂️ אירועים שעברו ({mgrPastCount})</span>
                  <span>{showMgrPast ? '▲' : '▼'}</span>
                </button>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
