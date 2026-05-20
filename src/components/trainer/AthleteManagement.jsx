import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ImportAthletes from './ImportAthletes'
import ImportBelts from './ImportBelts'
import BeltHistoryEditor from './BeltHistoryEditor'
import { notifyPush } from '../../lib/notifyPush'
import { allAdminUserIds } from '../../lib/notifyTargets'
import { useToast, useConfirm } from '../a11y'
import { ADULT_BELTS, KIDS_BELTS, getBeltMeta, getMaxStripes } from '../../lib/belts'

const MEMBERSHIP_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const SESSION_LIMITS = { '1x_week': 1, '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatClassOption(cls) {
  const day = typeof cls.day_of_week === 'number' ? DAYS_HE[cls.day_of_week] : (cls.day_of_week || '')
  const time = cls.start_time ? cls.start_time.slice(0, 5) : ''
  return [cls.name, day, time].filter(Boolean).join(' · ')
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  membership_type: '2x_week',
  group_ids: [],
  active: true,
  branch_ids: [],
  birth_date: '',
  // Belt fields
  trains_gi: true,
  trains_nogi: false,
  belt_category: 'adult',
  belt: '',
  belt_received_at: '',
  belt_stripes: 0,
  bjj_start_date: '',
}

function calcAge(birthDate) {
  if (!birthDate) return null
  const bd = new Date(birthDate)
  if (isNaN(bd.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - bd.getFullYear()
  const m = today.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--
  return age
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function endOfMonthDate() {
  const today = new Date()
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return last.toISOString().split('T')[0]
}

export default function AthleteManagement({ trainerId, isAdmin, branchFilter = null, hideSchedule = false, registerLinkCard = null, onPendingChange = null, stackedLayout = false, extraTop = null }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [athletes, setAthletes] = useState([])
  const [pendingAthletes, setPendingAthletes] = useState([])
  const [pendingDeletions, setPendingDeletions] = useState([])
  const [branches, setBranches] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState(stackedLayout ? 'active' : 'active')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [saveError, setSaveError] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    (async () => {
      let bq = supabase.from('branches').select('id, name').order('name')
      if (!isAdmin) bq = bq.eq('hidden', false)
      const { data: all } = await bq
      if (!all) return
      if (isAdmin || !trainerId) { setBranches(all); return }
      const { data: coaches } = await supabase.from('coaches').select('branch_id').eq('user_id', trainerId)
      const allowed = new Set((coaches || []).map(c => c.branch_id).filter(Boolean))
      setBranches(all.filter(b => allowed.has(b.id)))
    })()
  }, [isAdmin, trainerId])

  useEffect(() => { fetchAthletes() }, [trainerId, isAdmin])

  useEffect(() => {
    if (form.branch_ids.length > 0) fetchClasses(form.branch_ids)
    else setClasses([])
  }, [form.branch_ids])

  async function fetchClasses(branchIds) {
    const { data } = await supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, hall, class_type')
      .in('branch_id', branchIds)
      .order('day_of_week')
    setClasses(data || [])
  }

  async function fetchAthletes() {
    setLoading(true)

    // מאמן רגיל — סנן לסניפים שהוא מאמן בהם; admin רואה הכל
    let allowedBranchIds = null
    let myCoachIds = []
    let myCoachNames = []
    if (!isAdmin && trainerId) {
      const { data: coaches } = await supabase.from('coaches').select('id, branch_id, name').eq('user_id', trainerId)
      allowedBranchIds = [...new Set((coaches || []).map(c => c.branch_id).filter(Boolean))]
      myCoachIds   = (coaches || []).map(c => c.id).filter(Boolean)
      myCoachNames = (coaches || []).map(c => c.name).filter(Boolean)
    }

    const pendingQ     = supabase.from('members').select('*').eq('status', 'pending').is('deleted_at', null).order('created_at', { ascending: false })
    const deletionReqQ = supabase.from('members').select('*').eq('status', 'pending_deletion').is('deleted_at', null).order('full_name')
    const activeQ      = supabase.from('members').select('*').neq('status', 'pending').neq('status', 'pending_deletion').is('deleted_at', null).order('full_name')

    const [{ data: pendingData }, { data: deletionData }, { data, error }] = await Promise.all([pendingQ, deletionReqQ, activeQ])
    if (error) console.error('fetchAthletes error:', error)

    // בדיקה אוטומטית: מתאמנים שתאריך הביטול שלהם הגיע
    const todayStr = new Date().toISOString().split('T')[0]
    const toCancel = (data || []).filter(m => m.cancel_date && m.cancel_date <= todayStr && m.membership_status !== 'cancelled')
    if (toCancel.length > 0) {
      const ids = toCancel.map(m => m.id)
      await supabase.from('members').update({ membership_status: 'cancelled', cancel_date: null }).in('id', ids)
      toCancel.forEach(m => { m.membership_status = 'cancelled'; m.cancel_date = null })
    }

    const matchesAllowed = (m) => {
      if (!allowedBranchIds) return true
      const bids = m.branch_ids?.length ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
      return bids.some(b => allowedBranchIds.includes(b))
    }

    // למאמן רגיל — pending רק של מי שבחר אותו כמאמן. unlimited למנהל בלבד
    const matchesPendingCoach = (m) => {
      if (isAdmin) return true
      if (m.subscription_type === 'unlimited') return false
      if (m.coach_id && myCoachIds.includes(m.coach_id)) return true
      if (m.requested_coach_name && myCoachNames.includes(m.requested_coach_name)) return true
      if (Array.isArray(m.requested_coach_names) && m.requested_coach_names.some(n => myCoachNames.includes(n))) return true
      return false
    }

    setPendingAthletes((pendingData || []).filter(m => matchesAllowed(m) && matchesPendingCoach(m)))
    setPendingDeletions((deletionData || []).filter(matchesAllowed))
    setAthletes((data || []).filter(matchesAllowed))
    setLoading(false)
  }

  async function saveAthlete(e) {
    e.preventDefault()
    setSaveError('')
    const payload = {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      membership_type: form.membership_type,
      subscription_type: form.membership_type,
      group_ids: form.group_ids.length > 0 ? form.group_ids : null,
      group_id: form.group_ids[0] || null,
      active: form.active,
      branch_ids: form.branch_ids,
      branch_id: form.branch_ids[0] || null,
      // Belt fields — שדות חגורה נשמרים אם trains_gi=true OR trains_nogi=true
      // (NoGi-בלבד גם מקבל דרגה — Gi/NoGi הם אותה הדרגה)
      trains_gi: !!form.trains_gi,
      trains_nogi: !!form.trains_nogi,
      belt_category: (form.trains_gi || form.trains_nogi) ? (form.belt_category || 'adult') : null,
      belt: (form.trains_gi || form.trains_nogi) && form.belt ? form.belt : null,
      belt_received_at: (form.trains_gi || form.trains_nogi) && form.belt_received_at ? form.belt_received_at : null,
      belt_stripes: (form.trains_gi || form.trains_nogi) && form.belt ? Number(form.belt_stripes || 0) : 0,
      bjj_start_date: (form.trains_gi || form.trains_nogi) && form.bjj_start_date ? form.bjj_start_date : null,
      birth_date: form.birth_date || null,
    }
    let error
    if (editing === 'new') {
      // מאמן מוסיף מתאמן = מאושר אוטומטית (לא pending)
      ;({ error } = await supabase.from('members').insert({ ...payload, status: 'approved' }))
    } else {
      ;({ error } = await supabase.from('members').update(payload).eq('id', editing))
    }
    if (error) { setSaveError(error.message); return }
    setEditing(null)
    fetchAthletes()
    onPendingChange?.()
  }

  async function deleteAthlete(id) {
    const athleteObj = athletes.find(a => a.id === id) || pendingDeletions.find(a => a.id === id)
    if (isAdmin) {
      const ok = await confirm({ title: 'מחיקת מתאמן', message: 'למחוק את המתאמן לצמיתות?', confirmText: 'מחק', danger: true })
      if (!ok) return
      const { error } = await supabase.from('members').delete().eq('id', id)
      if (error) { toast.error('שגיאה במחיקה: ' + error.message); return }
    } else {
      const ok = await confirm({ title: 'בקשת מחיקה', message: 'לשלוח בקשת מחיקה למנהל?', confirmText: 'שלח בקשה' })
      if (!ok) return
      const { error } = await supabase.from('members').update({ status: 'pending_deletion' }).eq('id', id)
      if (error) { toast.error('שגיאה בשליחת הבקשה: ' + error.message); return }
      // Push למנהל (עובד גם כשהאפליקציה סגורה)
      allAdminUserIds().then(ids => notifyPush({
        userIds: ids,
        title: 'בקשת מחיקת מתאמן',
        body: `${athleteObj?.full_name || 'מתאמן'} — ממתין לאישור מחיקה`,
        url: '/#athletes',
        tag: `member-deletion:${id}`,
      })).catch(() => {})
    }
    setSelectedIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id); return next
    })
    fetchAthletes()
  }

  async function approveDeletion(id) {
    const ok = await confirm({ title: 'אישור מחיקה', message: 'לאשר מחיקה? המתאמן יימחק לצמיתות. הפעולה לא הפיכה.', confirmText: 'אשר מחיקה', danger: true })
    if (!ok) return
    const { error } = await supabase.from('members').delete().eq('id', id)
    if (error) { toast.error('שגיאה במחיקה: ' + error.message); return }
    fetchAthletes()
  }

  async function rejectDeletion(id) {
    const ok = await confirm({ title: 'דחיית בקשה', message: 'לדחות את בקשת המחיקה?', confirmText: 'דחה' })
    if (!ok) return
    const { error } = await supabase.from('members').update({ status: 'approved' }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    fetchAthletes()
  }

  async function cancelDeletionRequest(id) {
    const ok = await confirm({ title: 'ביטול בקשה', message: 'לבטל את בקשת המחיקה?', confirmText: 'בטל בקשה' })
    if (!ok) return
    const { error } = await supabase.from('members').update({ status: 'approved' }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    fetchAthletes()
  }

  async function freezeAthlete(id) {
    const ok = await confirm({ title: 'הקפאת מנוי', message: 'להקפיא את המנוי? המתאמן לא יוכל להירשם לאימונים עד שתפעיל מחדש.', confirmText: 'הקפא' })
    if (!ok) return
    const { error } = await supabase.from('members').update({ membership_status: 'frozen' }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('המנוי הוקפא בהצלחה')
    fetchAthletes()
  }

  async function unfreezeAthlete(id) {
    const { error } = await supabase.from('members').update({ membership_status: 'active', cancel_date: null }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('המנוי הופעל מחדש')
    fetchAthletes()
  }

  async function cancelAthleteAtMonthEnd(id) {
    const cancelDate = endOfMonthDate()
    const ok = await confirm({
      title: 'ביטול מנוי',
      message: `המנוי יבוטל ב-${formatDate(cancelDate)}. עד אז המתאמן ממשיך להיות פעיל.`,
      confirmText: 'אשר ביטול',
    })
    if (!ok) return
    const { error } = await supabase.from('members').update({ cancel_date: cancelDate }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success(`המנוי יבוטל ב-${formatDate(cancelDate)}`)
    fetchAthletes()
  }

  async function undoCancelAthlete(id) {
    const ok = await confirm({ title: 'ביטול הביטול', message: 'לבטל את הביטול? המתאמן יישאר פעיל.', confirmText: 'כן, בטל' })
    if (!ok) return
    const { error } = await supabase.from('members').update({ cancel_date: null }).eq('id', id)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('הביטול בוטל')
    fetchAthletes()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids) {
    setSelectedIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      }
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }

  function clearSelection() { setSelectedIds(new Set()) }

  async function bulkDeleteAthletes() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    if (isAdmin) {
      // אישור דו-שלבי למנהל למניעת מחיקה בטעות
      const ok1 = await confirm({ title: 'מחיקה מרובה', message: `אתה עומד למחוק ${ids.length} מתאמנים לצמיתות. להמשיך?`, confirmText: 'המשך', danger: true })
      if (!ok1) return
      if (ids.length >= 5) {
        const ok2 = await confirm({ title: 'אישור סופי', message: `אישור סופי: מחיקה של ${ids.length} מתאמנים. הפעולה לא הפיכה.`, confirmText: 'אשר מחיקה', danger: true })
        if (!ok2) return
      }
      setBulkDeleting(true)
      try {
        const CHUNK = 200
        for (let i = 0; i < ids.length; i += CHUNK) {
          const part = ids.slice(i, i + CHUNK)
          const { error } = await supabase.from('members').delete().in('id', part)
          if (error) { console.error('bulk delete error:', error); toast.error('שגיאה במחיקה: ' + error.message); break }
        }
        clearSelection()
        await fetchAthletes()
      } finally {
        setBulkDeleting(false)
      }
    } else {
      // מאמן: שליחת בקשות מחיקה למנהל (לא מחיקה ישירה)
      const ok = await confirm({ title: 'שליחת בקשות', message: `לשלוח ${ids.length} בקשות מחיקה למנהל?`, confirmText: 'שלח בקשות' })
      if (!ok) return
      setBulkDeleting(true)
      try {
        const CHUNK = 200
        for (let i = 0; i < ids.length; i += CHUNK) {
          const part = ids.slice(i, i + CHUNK)
          const { error } = await supabase.from('members').update({ status: 'pending_deletion' }).in('id', part)
          if (error) { console.error('bulk request error:', error); toast.error('שגיאה בשליחת הבקשות: ' + error.message); break }
        }
        // Push למנהל (עובד גם כשהאפליקציה סגורה)
        allAdminUserIds().then(adminIds => notifyPush({
          userIds: adminIds,
          title: 'בקשות מחיקת מתאמנים',
          body: `${ids.length} מתאמנים ממתינים לאישור מחיקה`,
          url: '/#athletes',
          tag: 'member-deletion-bulk',
        })).catch(() => {})
        clearSelection()
        await fetchAthletes()
      } finally {
        setBulkDeleting(false)
      }
    }
  }

  async function approvePending(id, subType) {
    const lead = pendingAthletes.find(a => a.id === id)
    const patch = { status: 'approved', active: true }
    if (subType) { patch.subscription_type = subType; patch.membership_type = subType }
    await supabase.from('members').update(patch).eq('id', id)
    if (lead?.email) {
      supabase.functions.invoke('send-approval-email', {
        body: { email: lead.email, full_name: lead.full_name },
      }).catch(err => console.warn('send-approval-email skipped:', err?.message || err))
    }
    fetchAthletes()
    onPendingChange?.()
  }

  async function rejectPending(id) {
    // Bug 1.3: מאמן רגיל לא יכול לבצע DELETE על members.
    // אדמין → מחיקה לצמיתות. מאמן → soft-delete (UPDATE deleted_at).
    if (isAdmin) {
      await supabase.from('members').delete().eq('id', id)
    } else {
      await supabase.from('members').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    }
    fetchAthletes()
    onPendingChange?.()
  }

  function toggleBranch(id) {
    setForm(p => {
      const already = p.branch_ids.includes(id)
      const next = already ? p.branch_ids.filter(b => b !== id) : [...p.branch_ids, id]
      return { ...p, branch_ids: next, group_ids: [] }
    })
  }

  function toggleGroupId(id) {
    const limit = SESSION_LIMITS[form.membership_type] ?? 2
    setForm(p => {
      const already = p.group_ids.includes(id)
      if (already) return { ...p, group_ids: p.group_ids.filter(g => g !== id) }
      if (p.group_ids.length >= limit) return p
      return { ...p, group_ids: [...p.group_ids, id] }
    })
  }

  function handleMembershipChange(val) {
    const newLimit = SESSION_LIMITS[val] ?? 2
    setForm(p => ({
      ...p,
      membership_type: val,
      group_ids: p.group_ids.slice(0, newLimit === Infinity ? undefined : newLimit),
    }))
  }

  function startEdit(athlete) {
    setSaveError('')
    const branchIds = athlete.branch_ids?.length
      ? athlete.branch_ids
      : athlete.branch_id ? [athlete.branch_id] : []
    setForm({
      full_name: athlete.full_name || '',
      email: athlete.email || '',
      phone: athlete.phone || '',
      membership_type: athlete.membership_type || athlete.subscription_type || '2x_week',
      group_ids: athlete.group_ids || (athlete.group_id ? [athlete.group_id] : []),
      active: athlete.active ?? true,
      branch_ids: branchIds,
      // Belt fields
      trains_gi: athlete.trains_gi ?? true,
      trains_nogi: athlete.trains_nogi ?? false,
      belt_category: athlete.belt_category || (athlete.belt?.startsWith?.('kids_') ? 'kids' : 'adult'),
      belt: athlete.belt || '',
      belt_received_at: athlete.belt_received_at || '',
      belt_stripes: athlete.belt_stripes ?? 0,
      bjj_start_date: athlete.bjj_start_date || '',
      birth_date: athlete.birth_date || '',
    })
    setEditing(athlete.id)
  }

  function openAdd() {
    setSaveError('')
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  const limit = SESSION_LIMITS[form.membership_type] ?? 2
  const limitLabel = limit === Infinity ? 'בחר כמה שיעורים שתרצה' : `בחר עד ${limit} שיעורים`

  const filtered = athletes.filter(a =>
    (!branchFilter || (a.branch_ids || []).includes(branchFilter) || a.branch_id === branchFilter) &&
    (a.full_name?.includes(search) || a.email?.includes(search) || a.group_name?.includes(search))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">ניהול מתאמנים</h2>
        {/* הוספה/ייבוא — מנהל בלבד. מאמן רגיל = קריאה בלבד */}
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <ImportAthletes onImported={fetchAthletes} isAdmin={isAdmin} />
            <ImportBelts onImported={fetchAthletes} existingAthletes={athletes} />
            <button onClick={openAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
              + הוסף מתאמן
            </button>
          </div>
        )}
      </div>

      {stackedLayout && registerLinkCard && <div>{registerLinkCard}</div>}
      {stackedLayout && extraTop && <div>{extraTop}</div>}

      {!stackedLayout && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button type="button" onClick={() => setSubTab('pending')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition relative ${subTab === 'pending' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
            ממתינים לאישור
            {pendingAthletes.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingAthletes.length}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setSubTab('active')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${subTab === 'active' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
            מתאמנים ({athletes.length})
          </button>
          {registerLinkCard && (
            <button type="button" onClick={() => setSubTab('link')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${subTab === 'link' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
              קישור הרשמה
            </button>
          )}
        </div>
      )}

      {!stackedLayout && subTab === 'active' && (
        <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="חיפוש לפי שם, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {editing && (
        <form onSubmit={saveAthlete} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="font-semibold text-gray-700">{editing === 'new' ? 'הוספת מתאמן' : 'עריכת מתאמן'}</h3>

          {/* Multi-branch selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">סניפים (ניתן לבחור יותר מאחד)</label>
            <div className="flex gap-2 flex-wrap">
              {branches.map(b => (
                <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.branch_ids.includes(b.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}>
                  {form.branch_ids.includes(b.id) ? '✓ ' : ''}{b.name}
                </button>
              ))}
            </div>
          </div>

          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם מלא *"
            value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required />
          <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="אימייל"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="טלפון"
            value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              תאריך לידה (אופציונלי)
              {form.birth_date && calcAge(form.birth_date) != null && (
                <span className="mr-2 text-blue-700 font-bold">· גיל: {calcAge(form.birth_date)}</span>
              )}
            </label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.birth_date || ''}
              onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))} />
            <p className="text-[11px] text-gray-400 mt-1">משמש למעבר אוטומטי לקטגוריית בוגרים בגיל 16.</p>
          </div>

          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.membership_type} onChange={e => handleMembershipChange(e.target.value)}>
            <option value="1x_week">1× שבוע</option>
            <option value="2x_week">2× שבוע</option>
            <option value="4x_week">4× שבוע</option>
            <option value="unlimited">ללא הגבלה</option>
          </select>

          {!hideSchedule && form.branch_ids.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">{limitLabel} ({form.group_ids.length} נבחרו)</p>
              {classes.length === 0 ? (
                <p className="text-xs text-gray-400">טוען שיעורים...</p>
              ) : (
                classes.map(cls => {
                  const selected = form.group_ids.includes(cls.id)
                  const atLimit = !selected && form.group_ids.length >= limit
                  return (
                    <label key={cls.id} className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer transition ${
                      selected ? 'bg-blue-50 text-blue-700' : atLimit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white text-gray-700'
                    }`}>
                      <input type="checkbox" checked={selected} disabled={atLimit}
                        onChange={() => toggleGroupId(cls.id)} className="w-4 h-4 accent-blue-600" />
                      <span>{formatClassOption(cls)}</span>
                    </label>
                  )
                })
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
            מתאמן פעיל
          </label>

          {/* === BJJ Gi / NoGi belt section === */}
          <div className="border rounded-lg p-3 space-y-3 bg-amber-50/30">
            <p className="text-xs font-medium text-gray-600">סוג אימון BJJ (ניתן לבחור שניהם)</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer bg-white border rounded-lg px-3 py-2">
                <input type="checkbox" checked={!!form.trains_gi}
                  onChange={e => setForm(p => {
                    const trainsGi = e.target.checked
                    const stillTrains = trainsGi || p.trains_nogi
                    return {
                      ...p,
                      trains_gi: trainsGi,
                      // אם ביטל את שניהם → מנקים שדות חגורה
                      belt: stillTrains ? p.belt : '',
                      belt_received_at: stillTrains ? p.belt_received_at : '',
                      belt_stripes: stillTrains ? p.belt_stripes : 0,
                      bjj_start_date: stillTrains ? p.bjj_start_date : '',
                    }
                  })} className="w-4 h-4 accent-amber-600" />
                🥋 מתאמן Gi
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer bg-white border rounded-lg px-3 py-2">
                <input type="checkbox" checked={!!form.trains_nogi}
                  onChange={e => setForm(p => {
                    const trainsNogi = e.target.checked
                    const stillTrains = p.trains_gi || trainsNogi
                    return {
                      ...p,
                      trains_nogi: trainsNogi,
                      belt: stillTrains ? p.belt : '',
                      belt_received_at: stillTrains ? p.belt_received_at : '',
                      belt_stripes: stillTrains ? p.belt_stripes : 0,
                      bjj_start_date: stillTrains ? p.bjj_start_date : '',
                    }
                  })} className="w-4 h-4 accent-blue-600" />
                🤼 מתאמן NoGi
              </label>
            </div>
            <p className="text-[11px] text-gray-500 -mt-1">Gi ו-NoGi נחשבים אותה דרגה — מתאמן יכול לעשות את שניהם.</p>

            {(form.trains_gi || form.trains_nogi) && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">קטגוריה</label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, belt_category: 'adult', belt: '' }))}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm border transition ${
                        form.belt_category === 'adult'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}>
                      מבוגרים (16+)
                    </button>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, belt_category: 'kids', belt: '' }))}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm border transition ${
                        form.belt_category === 'kids'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}>
                      ילדים (4-15)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">חגורה נוכחית</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={form.belt}
                    onChange={e => {
                      const val = e.target.value
                      const max = getMaxStripes(val)
                      setForm(p => ({
                        ...p,
                        belt: val,
                        belt_stripes: Math.min(p.belt_stripes || 0, max),
                      }))
                    }}>
                    <option value="">— בחר חגורה —</option>
                    {(form.belt_category === 'kids' ? KIDS_BELTS : ADULT_BELTS).map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>


                <div>
                  <label className="block text-xs text-gray-500 mb-1">תאריך קבלת חגורה נוכחית</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.belt_received_at || ''}
                    onChange={e => setForm(p => ({ ...p, belt_received_at: e.target.value }))} />
                  <p className="text-[11px] text-gray-400 mt-1">
                    אם יש רק חודש ושנה — בחר את ה-1 לחודש (למשל: 01/06/2018)
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">תאריך התחלת BJJ (חגורה לבנה)</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.bjj_start_date || ''}
                    onChange={e => setForm(p => ({ ...p, bjj_start_date: e.target.value }))} />
                </div>

                {/* היסטוריית חגורות — רק למתאמן קיים (לא ב-'new') */}
                {editing && editing !== 'new' && (
                  <BeltHistoryEditor
                    memberId={editing}
                    memberName={form.full_name}
                    memberCategory={form.belt_category || 'adult'}
                  />
                )}
              </>
            )}
          </div>

          {saveError && <p className="text-red-500 text-xs bg-red-50 rounded p-2">{saveError}</p>}

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">שמור</button>
            <button type="button" onClick={() => { setEditing(null); setSaveError('') }}
              className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">ביטול</button>
          </div>
        </form>
      )}

      {!stackedLayout && subTab === 'link' && registerLinkCard}

      {stackedLayout && pendingAthletes.length > 0 && (
        <h3 className="font-bold text-blue-900 text-sm">📝 בקשות הצטרפות ({pendingAthletes.length})</h3>
      )}

      {(stackedLayout ? pendingAthletes.length > 0 : subTab === 'pending') && (
        pendingAthletes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">✅</div>
            <p>אין נרשמים ממתינים לאישור</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pendingAthletes.map(a => (
              <PendingLeadCard
                key={a.id}
                lead={a}
                branches={branches}
                onApprove={(sub) => approvePending(a.id, sub)}
                onReject={() => rejectPending(a.id)}
              />
            ))}
          </ul>
        )
      )}

      {/* סקשן בקשות מחיקה — גלוי למנהל (אישור/דחיה) ולמאמן (ביטול בקשה שלו) */}
      {pendingDeletions.length > 0 && (stackedLayout || subTab === 'active') && (
        <div className="space-y-2">
          <h3 className="font-bold text-red-800 text-sm flex items-center gap-2">
            🗑 בקשות מחיקה ({pendingDeletions.length})
            {isAdmin && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-normal">טיפול מנהל</span>}
          </h3>
          <ul className="bg-white rounded-xl border border-red-200 shadow-sm divide-y overflow-hidden">
            {pendingDeletions.map(a => {
              const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
              const bnames = bids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')
              return (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3 bg-red-50/40">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{a.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {MEMBERSHIP_LABELS[a.membership_type || a.subscription_type] || '—'}
                      {a.phone && <span> · {a.phone}</span>}
                      {bnames && <span> · 📍 {bnames}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {isAdmin ? (
                      <>
                        <button
                          onClick={() => approveDeletion(a.id)}
                          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
                        >אשר מחיקה</button>
                        <button
                          onClick={() => rejectDeletion(a.id)}
                          className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                        >דחה</button>
                      </>
                    ) : (
                      <button
                        onClick={() => cancelDeletionRequest(a.id)}
                        className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                      >בטל בקשה</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(stackedLayout || subTab === 'active') && (() => {
        // ספירה לכל סניף (לפני פילטר הסניף אבל אחרי חיפוש)
        const bySearch = athletes.filter(a =>
          !search.trim() ||
          a.full_name?.includes(search) || a.email?.includes(search) || a.group_name?.includes(search) || a.phone?.includes(search)
        )
        const branchCount = {}
        let noBranchCount = 0
        bySearch.forEach(a => {
          const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
          if (bids.length === 0) noBranchCount++
          else bids.forEach(bid => { branchCount[bid] = (branchCount[bid] || 0) + 1 })
        })

        // סינון סופי לפי סניף נבחר
        const finalList = bySearch.filter(a => {
          if (selectedBranch === 'all') return true
          if (selectedBranch === 'none') {
            const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
            return bids.length === 0
          }
          const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
          return bids.includes(selectedBranch)
        })

        return (
          <div className="space-y-3">
            {stackedLayout && (
              <h3 className="font-bold text-gray-800 text-sm pt-2 border-t">👥 רשימת מתאמנים ({athletes.length})</h3>
            )}
            {stackedLayout && (
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="חיפוש לפי שם, אימייל..."
                value={search} onChange={e => setSearch(e.target.value)} />
            )}
            {/* שורת chips לסינון לפי סניף */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              <style>{`.branch-chips::-webkit-scrollbar { display: none }`}</style>
              <button type="button" onClick={() => setSelectedBranch('all')}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                  selectedBranch === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>
                הכל ({bySearch.length})
              </button>
              {branches.map(b => {
                const count = branchCount[b.id] || 0
                const active = selectedBranch === b.id
                return (
                  <button key={b.id} type="button" onClick={() => setSelectedBranch(b.id)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}>
                    📍 {b.name} ({count})
                  </button>
                )
              })}
              {noBranchCount > 0 && (
                <button type="button" onClick={() => setSelectedBranch('none')}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                    selectedBranch === 'none'
                      ? 'bg-orange-500 text-white border-orange-500 shadow'
                      : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'
                  }`}>
                  ⚠️ ללא סניף ({noBranchCount})
                </button>
              )}
            </div>

            {/* סרגל בחירה מרובה — רק למנהל, כי הפעולה היחידה היא מחיקה (Bug 1.3) */}
            {isAdmin && !loading && finalList.length > 0 && (() => {
              const visibleIds = finalList.map(a => a.id)
              const allSelected = visibleIds.every(id => selectedIds.has(id))
              const selCount = selectedIds.size
              return (
                <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectAll(visibleIds)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span>{allSelected ? 'נקה בחירה' : 'בחר הכל ברשימה'}</span>
                  </label>
                  {/* בקרת מחיקה רב-מתאמנים — מוצגת רק למנהל (Bug 1.3) */}
                  {isAdmin && selCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{selCount} נבחרו</span>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        בטל
                      </button>
                      <button
                        type="button"
                        onClick={bulkDeleteAthletes}
                        disabled={bulkDeleting}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-60"
                      >
                        {bulkDeleting ? 'מוחק...' : `🗑 מחק ${selCount}`}
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* הרשימה */}
            {loading ? (
              <p className="text-center text-gray-400 py-8">טוען מתאמנים...</p>
            ) : finalList.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">👥</div>
                <p>לא נמצאו מתאמנים</p>
              </div>
            ) : (
              <ul className="bg-white rounded-xl border shadow-sm divide-y overflow-hidden">
                {finalList.map(a => {
                  const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
                  const bnames = bids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')
                  const checked = selectedIds.has(a.id)
                  return (
                    <li key={a.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${checked ? 'bg-blue-50' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* תיבת בחירה — רק למנהל (Bug 1.3) */}
                        {isAdmin && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(a.id)}
                            className="w-4 h-4 accent-blue-600 shrink-0"
                            aria-label={`בחר את ${a.full_name}`}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-800 text-sm">{a.full_name}</p>
                            {!a.active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 rounded">לא פעיל</span>}
                            {a.membership_status === 'frozen' && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">❄️ מוקפא</span>
                            )}
                            {a.membership_status === 'cancelled' && (
                              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">🚫 מבוטל</span>
                            )}
                            {a.cancel_date && a.membership_status !== 'cancelled' && (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">⏳ ביטול {formatDate(a.cancel_date)}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {MEMBERSHIP_LABELS[a.membership_type || a.subscription_type] || '—'}
                            {a.phone && <span> · {a.phone}</span>}
                            {bnames && <span> · 📍 {bnames}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end items-center">
                        {isAdmin && (
                          <>
                            <button onClick={() => startEdit(a)}
                              className="text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition">
                              עריכה
                            </button>
                            {a.membership_status === 'cancelled' || a.membership_status === 'frozen' ? (
                              <button onClick={() => unfreezeAthlete(a.id)}
                                className="text-xs px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition font-medium">
                                ✅ הפעל
                              </button>
                            ) : (
                              <button onClick={() => freezeAthlete(a.id)}
                                className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition">
                                ❄️ הקפא
                              </button>
                            )}
                            {a.cancel_date && a.membership_status !== 'cancelled' ? (
                              <button onClick={() => undoCancelAthlete(a.id)}
                                className="text-xs px-2 py-1 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 transition">
                                ↩️ בטל ביטול
                              </button>
                            ) : a.membership_status !== 'cancelled' && a.membership_status !== 'frozen' && (
                              <button onClick={() => cancelAthleteAtMonthEnd(a.id)}
                                className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition">
                                🚫 ביטול
                              </button>
                            )}
                            <button onClick={() => deleteAthlete(a.id)}
                              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition">
                              מחק
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })()}
    </div>
  )
}


function PendingLeadCard({ lead, branches, onApprove, onReject }) {
  const confirm = useConfirm()
  const [subType, setSubType] = useState(lead.subscription_type || lead.membership_type || '2x_week')
  const [busy, setBusy] = useState(null)
  const bids = lead.branch_ids?.length ? lead.branch_ids : (lead.branch_id ? [lead.branch_id] : [])
  const bnames = bids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')
  const coachName = lead.requested_coach_name
    || (Array.isArray(lead.requested_coach_names) ? lead.requested_coach_names.filter(Boolean).join(', ') : '')
  const original = lead.subscription_type || lead.membership_type

  async function handleApprove() {
    setBusy('approve')
    try { await onApprove(subType) } finally { setBusy(null) }
  }
  async function handleReject() {
    const ok = await confirm({ title: 'מחיקת בקשה', message: 'למחוק את הבקשה?', confirmText: 'מחק', danger: true })
    if (!ok) return
    setBusy('reject')
    try { await onReject() } finally { setBusy(null) }
  }

  return (
    <li className="bg-white rounded-xl border px-4 py-3 shadow-sm space-y-3">
      <div>
        <p className="font-semibold text-gray-800">{lead.full_name}</p>
        <p className="text-xs text-gray-500">
          {lead.email && <span>{lead.email}</span>}
          {lead.phone && <span> · {lead.phone}</span>}
        </p>
        {bnames && <p className="text-xs text-blue-600 mt-0.5">📍 {bnames}</p>}
        {coachName && <p className="text-xs text-purple-600 mt-0.5">👤 מאמן מבוקש: {coachName}</p>}
        {original && (
          <p className="text-xs text-emerald-700 mt-0.5">
            🏋️ נרשם ל-: {MEMBERSHIP_LABELS[original] || original}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">סוג מנוי לאישור</label>
          {subType !== original && (
            <span className="text-[11px] text-orange-600 font-semibold">שונה מהבקשה</span>
          )}
        </div>
        <select
          className="w-full border rounded-lg px-3 py-1.5 text-sm"
          value={subType}
          onChange={e => setSubType(e.target.value)}
        >
          {Object.entries(MEMBERSHIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">ניתן לערוך לפני אישור</p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={handleApprove} disabled={!!busy}
          className="flex-1 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {busy === 'approve' ? '...' : '✓ אשר'}
        </button>
        <button type="button" onClick={handleReject} disabled={!!busy}
          className="flex-1 py-1.5 border border-red-300 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50">
          {busy === 'reject' ? '...' : '✕ דחה'}
        </button>
      </div>
    </li>
  )
}
