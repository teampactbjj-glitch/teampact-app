import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import { allTrainerUserIds, allAdminUserIds } from '../../lib/notifyTargets'

const WEEKLY_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const DAYS_HE_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function formatTime(timeStr) {
  return timeStr ? timeStr.slice(0, 5) : ''
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekRange(refDate) {
  const d = startOfDay(refDate || new Date())
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - d.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() }
}

function formatDateLabel(date) {
  const today = startOfDay(new Date())
  const d = startOfDay(date)
  const diff = Math.round((d - today) / 86400000)
  const dayName = `יום ${DAYS_HE[date.getDay()]}`
  const dateStr = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
  if (diff === 0) return `היום · ${dayName} · ${dateStr}`
  if (diff === 1) return `מחר · ${dayName} · ${dateStr}`
  if (diff === -1) return `אתמול · ${dayName} · ${dateStr}`
  return `${dayName} · ${dateStr}`
}

export default function TodayClasses({ trainerId, isAdmin, onChange }) {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const todayBtnRef = useRef(null)
  const selectedBtnRef = useRef(null)
  const sliderContainerRef = useRef(null)
  const didInitialScroll = useRef(false)
  const [classes, setClasses] = useState([])
  const [expanded, setExpanded] = useState(null)
  // classData[classId] = { members: [...], checkedIds: Set, absentIds: Set, weeklyCount: {memberId: n}, loading: bool }
  const [classData, setClassData] = useState({})
  const [memberCounts, setMemberCounts] = useState({}) // { classId: number }
  const [regCountsByClass, setRegCountsByClass] = useState({}) // { classId: number } רישומים לשבוע
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newClass, setNewClass] = useState({ name: '', coach_id: '', date: '', start_time: '', duration_minutes: 60 })
  const [addError, setAddError] = useState('')
  const [coaches, setCoaches] = useState([])
  const [actionLoading, setActionLoading] = useState({}) // { `${classId}_${memberId}`: bool }
  // Visitor search state per class
  const [visitorSearch, setVisitorSearch] = useState({}) // { classId: query }
  const [visitorResults, setVisitorResults] = useState({}) // { classId: [member] }
  const [visitorLoading, setVisitorLoading] = useState({}) // { classId: bool }
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [pendingRequests, setPendingRequests] = useState([])
  const [showPending, setShowPending] = useState(true)

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name').then(({ data }) => setBranches(data || []))
    supabase.from('coaches').select('id, name, branch_id, user_id').order('name').then(({ data }) => setCoaches(data || []))
  }, [])

  // שליפת כל הבקשות הממתינות (כל הימים) — להצגה למנהל בראש המסך
  async function fetchPendingRequests() {
    if (!isAdmin) { setPendingRequests([]); return }
    const { data, error } = await supabase
      .from('classes')
      .select('*, branches(name)')
      .or('status.eq.pending,deletion_requested_at.not.is.null')
      .order('day_of_week')
      .order('start_time')
    if (error) { console.warn('fetchPendingRequests error:', error); setPendingRequests([]); return }
    setPendingRequests((data || []).map(c => ({
      ...c,
      branchName: c.branches?.name || '',
      coachName: c.coach_name || '',
    })))
  }

  useEffect(() => { fetchPendingRequests() }, [isAdmin])

  // Realtime: ריענון הרשימה עם כל שינוי בטבלת classes
  useEffect(() => {
    if (!isAdmin) return
    const ch = supabase.channel('classes-pending-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => fetchPendingRequests())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isAdmin])

  useEffect(() => {
    setExpanded(null)
    setClassData({})
    fetchDayClasses(selectedDate)
  }, [trainerId, selectedDate])

  // רענון ספירת רישומים כל 15 שניות (כדי שמאמן יראה רישום שנרשם בזמן אמת)
  useEffect(() => {
    if (classes.length === 0) return
    const i = setInterval(() => fetchMemberCounts(classes.map(c => c.id)), 15000)
    return () => clearInterval(i)
  }, [classes, selectedDate])

  // גלול תמיד אל התאריך הנבחר בסלייד — עם retry שממשיך 2 שניות
  // פתרון ל-fetchDayClasses שמשנה state כמה פעמים ודורס את הגלילה
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 20
    const tick = () => {
      if (cancelled) return
      attempts++
      const btn = selectedBtnRef.current
      const container = sliderContainerRef.current
      if (btn && container) {
        try {
          btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: didInitialScroll.current && attempts > 1 ? 'smooth' : 'auto' })
          didInitialScroll.current = true
        } catch {
          const btnRect = btn.getBoundingClientRect()
          const contRect = container.getBoundingClientRect()
          if (btnRect.width > 0) {
            const delta = (btnRect.left + btnRect.width / 2) - (contRect.left + contRect.width / 2)
            container.scrollTo({ left: container.scrollLeft + delta })
          }
        }
      }
      if (attempts < MAX_ATTEMPTS) setTimeout(tick, 100)
    }
    tick()
    return () => { cancelled = true }
  }, [selectedDate])

  function navigate(delta) {
    setSelectedDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + delta)
      return d
    })
  }

  async function fetchDayClasses(date) {
    setLoading(true)
    const todayDow = date.getDay()

    if (isAdmin) {
      const { data, error } = await supabase
        .from('classes')
        .select('*, branches(name)')
        .eq('day_of_week', todayDow)
        .order('branch_id')
        .order('start_time')
      if (error) console.error('fetchTodayClasses error:', error)
      const mapped = (data || []).map(cls => ({
        ...cls,
        branchName: cls.branches?.name || cls.branch_id || '',
        coachName: cls.coach_name || '',
      }))
      setClasses(mapped)
      fetchMemberCounts(mapped.filter(c => c.status !== 'pending').map(c => c.id))
      setLoading(false)
      return
    }

    const { data: coaches, error: coachErr } = await supabase
      .from('coaches')
      .select('id, branch_id, branches(name)')
      .eq('user_id', trainerId)

    if (coachErr) console.error('fetchCoaches error:', coachErr)
    if (!coaches || coaches.length === 0) { setClasses([]); setLoading(false); return }

    const coachBranchMap = {}
    coaches.forEach(c => { coachBranchMap[c.id] = c.branches?.name || c.branch_id })
    const coachIds = coaches.map(c => c.id)

    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .in('coach_id', coachIds)
      .eq('day_of_week', todayDow)
      .order('start_time')

    if (error) console.error('fetchTodayClasses error:', error)
    // מאמן רואה רק שיעורים מאושרים + שיעורים שלו הממתינים
    const filtered = (data || []).filter(c => c.status !== 'pending' || coachIds.includes(c.coach_id))
    const mapped = filtered.map(cls => ({
      ...cls,
      branchName: coachBranchMap[cls.coach_id] || '',
      coachName: cls.coach_name || '',
    }))
    setClasses(mapped)
    fetchMemberCounts(mapped.filter(c => c.status !== 'pending').map(c => c.id))
    setLoading(false)
  }

  async function fetchMemberCounts(classIds) {
    if (!classIds.length) return
    const counts = Object.fromEntries(classIds.map(id => [id, 0]))
    const regCounts = Object.fromEntries(classIds.map(id => [id, 0]))
    const { data, error } = await supabase
      .from('member_classes')
      .select('class_id')
      .in('class_id', classIds)
    if (error) console.error('fetchMemberCounts error:', error)
    ;(data || []).forEach(r => { counts[r.class_id] = (counts[r.class_id] || 0) + 1 })
    // רישומים שבועיים של המתאמנים (class_registrations) לשבוע של היום הנבחר
    const weekStartStr = (() => {
      const d = startOfDay(selectedDate)
      d.setDate(d.getDate() - d.getDay())
      return d.toISOString().split('T')[0]
    })()
    const { data: regs, error: regsErr } = await supabase
      .from('class_registrations')
      .select('class_id')
      .in('class_id', classIds)
      .eq('week_start', weekStartStr)
    if (regsErr) console.error('[trainer] class_registrations count error (check RLS!):', regsErr)
    console.log('[trainer] weekly regs fetched:', { weekStart: weekStartStr, classIds: classIds.length, regsFound: regs?.length || 0 })
    ;(regs || []).forEach(r => { regCounts[r.class_id] = (regCounts[r.class_id] || 0) + 1 })
    setMemberCounts(counts)
    setRegCountsByClass(regCounts)
  }

  async function fetchClassDetails(classId) {
    setClassData(prev => ({ ...prev, [classId]: { ...prev[classId], loading: true } }))

    // 1. Members registered to this class via member_classes
    const { data: mcRows, error: mcErr } = await supabase
      .from('member_classes')
      .select('member_id, members(id, full_name, membership_type, subscription_type, group_name)')
      .eq('class_id', classId)

    if (mcErr) console.error('member_classes error:', mcErr)
    const members = (mcRows || []).map(r => r.members).filter(Boolean)

    // 2. Selected-date check-ins for this class
    const dayStart = startOfDay(selectedDate)
    const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999)
    const { data: dayChks, error: chkErr } = await supabase
      .from('checkins')
      .select('athlete_id, status')
      .eq('class_id', classId)
      .gte('checked_in_at', dayStart.toISOString())
      .lte('checked_in_at', dayEnd.toISOString())

    if (chkErr) console.error('checkins error:', chkErr)

    const checkedIds = new Set()
    const absentIds = new Set()
    ;(dayChks || []).forEach(c => {
      if (c.status === 'absent') absentIds.add(c.athlete_id)
      else checkedIds.add(c.athlete_id)
    })

    // 4. מי רשום שבועית (class_registrations) לשיעור הזה — שליפה דו-שלבית
    const weekStartStr = (() => {
      const d = startOfDay(selectedDate)
      d.setDate(d.getDate() - d.getDay())
      return d.toISOString().split('T')[0]
    })()
    const { data: regRows, error: regErr } = await supabase
      .from('class_registrations')
      .select('athlete_id')
      .eq('class_id', classId)
      .eq('week_start', weekStartStr)
    if (regErr) console.error('class_registrations error:', regErr)
    const regMemberIds = (regRows || []).map(r => r.athlete_id).filter(Boolean)
    let weeklyRegistrants = []
    if (regMemberIds.length > 0) {
      const { data: regMembers, error: rmErr } = await supabase
        .from('members')
        .select('id, full_name, membership_type, subscription_type, group_name')
        .in('id', regMemberIds)
      if (rmErr) console.error('weekly reg members error:', rmErr)
      weeklyRegistrants = regMembers || regMemberIds.map(id => ({ id, full_name: '(לא ידוע)' }))
    }

    // 3. Weekly checkin counts per member (for over-limit detection)
    // כולל גם מתאמנים קבועים וגם נרשמים שבועיים
    const { weekStart, weekEnd } = getWeekRange(selectedDate)
    const memberIds = members.map(m => m.id)
    const allAthleteIds = Array.from(new Set([...memberIds, ...regMemberIds]))
    let weeklyCount = {}
    if (allAthleteIds.length > 0) {
      const { data: weekChks, error: wErr } = await supabase
        .from('checkins')
        .select('athlete_id')
        .in('athlete_id', allAthleteIds)
        .gte('checked_in_at', weekStart)
        .lte('checked_in_at', weekEnd)
        .neq('status', 'absent')

      if (wErr) console.error('weekly checkins error:', wErr)
      ;(weekChks || []).forEach(c => {
        weeklyCount[c.athlete_id] = (weeklyCount[c.athlete_id] || 0) + 1
      })
    }

    setClassData(prev => ({
      ...prev,
      [classId]: { members, checkedIds, absentIds, weeklyCount, weeklyRegistrants, loading: false },
    }))
    setMemberCounts(prev => ({ ...prev, [classId]: members.length }))
    setRegCountsByClass(prev => ({ ...prev, [classId]: weeklyRegistrants.length }))
  }

  // ============================================================
  // Optimistic updates — מעדכנים את ה-UI מיד, כותבים ל-DB ברקע
  // ללא "טוען..." וללא re-fetch מלא של השיעור.
  // במקרה של כשל — מתחזרים למצב הקודם ומציגים שגיאה.
  // ============================================================
  async function markPresent(classId, memberId /* , membershipType */) {
    // שמור מצב קודם לצורך rollback במקרה של כשל
    const prevSnapshot = classData[classId]

    // עדכון אופטימי: הוסף ל-checkedIds, הסר מ-absentIds, והעלה מונה שבועי ב-1 (אם לא היה present כבר)
    setClassData(p => {
      const d = p[classId]
      if (!d) return p
      const wasPresent = d.checkedIds.has(memberId)
      const newChecked = new Set(d.checkedIds); newChecked.add(memberId)
      const newAbsent = new Set(d.absentIds); newAbsent.delete(memberId)
      const newWeekly = { ...d.weeklyCount }
      if (!wasPresent) newWeekly[memberId] = (newWeekly[memberId] || 0) + 1
      return { ...p, [classId]: { ...d, checkedIds: newChecked, absentIds: newAbsent, weeklyCount: newWeekly } }
    })

    // כתיבה ל-DB ברקע
    const dayStart = startOfDay(selectedDate)
    const { error: delErr } = await supabase.from('checkins').delete()
      .eq('class_id', classId).eq('athlete_id', memberId)
      .gte('checked_in_at', dayStart.toISOString())
    if (delErr) console.error('markPresent delete error:', delErr)

    const checkedAt = new Date(selectedDate); checkedAt.setHours(12, 0, 0, 0)
    const { error: insErr } = await supabase.from('checkins').insert({
      class_id: classId,
      athlete_id: memberId,
      status: 'present',
      checked_in_at: checkedAt.toISOString(),
    })
    if (insErr) {
      console.error('markPresent insert error:', insErr)
      // Rollback למצב הקודם
      setClassData(p => ({ ...p, [classId]: prevSnapshot }))
      alert('שגיאה בסימון נוכחות:\n' + (insErr.message || JSON.stringify(insErr)))
    }
  }

  async function markAbsent(classId, memberId) {
    const prevSnapshot = classData[classId]

    // עדכון אופטימי: הוסף ל-absentIds, הסר מ-checkedIds, הורד מונה שבועי ב-1 (אם היה present)
    setClassData(p => {
      const d = p[classId]
      if (!d) return p
      const wasPresent = d.checkedIds.has(memberId)
      const newChecked = new Set(d.checkedIds); newChecked.delete(memberId)
      const newAbsent = new Set(d.absentIds); newAbsent.add(memberId)
      const newWeekly = { ...d.weeklyCount }
      if (wasPresent && newWeekly[memberId]) newWeekly[memberId] = Math.max(0, newWeekly[memberId] - 1)
      return { ...p, [classId]: { ...d, checkedIds: newChecked, absentIds: newAbsent, weeklyCount: newWeekly } }
    })

    const dayStart = startOfDay(selectedDate)
    const { error: delErr } = await supabase.from('checkins').delete()
      .eq('class_id', classId).eq('athlete_id', memberId)
      .gte('checked_in_at', dayStart.toISOString())
    if (delErr) console.error('markAbsent delete error:', delErr)

    const checkedAt = new Date(selectedDate); checkedAt.setHours(12, 0, 0, 0)
    const { error: insErr } = await supabase.from('checkins').insert({
      class_id: classId,
      athlete_id: memberId,
      status: 'absent',
      checked_in_at: checkedAt.toISOString(),
    })
    if (insErr) {
      console.error('markAbsent insert error:', insErr)
      setClassData(p => ({ ...p, [classId]: prevSnapshot }))
      alert('שגיאה בסימון היעדרות:\n' + (insErr.message || JSON.stringify(insErr)))
    }
  }

  async function addNewVisitor(classId, branchId, name) {
    const trimmed = name.trim()
    if (!trimmed) return

    // Create new member with trial membership
    const { data: newMember, error } = await supabase
      .from('members')
      .insert({ full_name: trimmed, membership_type: 'trial', subscription_type: 'trial', branch_id: branchId, active: true })
      .select('id, full_name, membership_type')
      .single()

    if (error) { console.error('addNewVisitor insert error:', error); return }

    // Clear search
    setVisitorSearch(p => ({ ...p, [classId]: '' }))
    setVisitorResults(p => ({ ...p, [classId]: [] }))

    // Register and mark present
    await addVisitor(classId, newMember)
  }

  async function addVisitor(classId, member) {
    // First register them to the class in member_classes
    const { error: regErr } = await supabase
      .from('member_classes')
      .upsert({ class_id: classId, member_id: member.id }, { onConflict: 'class_id,member_id' })

    if (regErr) console.error('addVisitor registration error:', regErr)

    // Then mark present
    await markPresent(classId, member.id, member.membership_type)

    // Clear visitor search
    setVisitorSearch(p => ({ ...p, [classId]: '' }))
    setVisitorResults(p => ({ ...p, [classId]: [] }))
  }

  async function searchVisitor(classId, query) {
    setVisitorSearch(p => ({ ...p, [classId]: query }))
    if (!query.trim()) { setVisitorResults(p => ({ ...p, [classId]: [] })); return }

    setVisitorLoading(p => ({ ...p, [classId]: true }))
    const { data, error } = await supabase
      .from('members')
      .select('id, full_name, membership_type, subscription_type')
      .ilike('full_name', `%${query}%`)
      .eq('active', true)
      .limit(8)

    if (error) console.error('searchVisitor error:', error)

    // Filter out already-registered members
    const registered = new Set((classData[classId]?.members || []).map(m => m.id))
    const results = (data || []).filter(m => !registered.has(m.id))
    setVisitorResults(p => ({ ...p, [classId]: results }))
    setVisitorLoading(p => ({ ...p, [classId]: false }))
  }

  async function addClass(e) {
    e.preventDefault()
    setAddError('')
    if (!newClass.name?.trim()) { setAddError('יש להזין שם לשיעור'); return }
    if (!newClass.coach_id) { setAddError('יש לבחור מאמן'); return }
    if (!newClass.date) { setAddError('יש לבחור תאריך'); return }
    if (!newClass.start_time) { setAddError('יש לבחור שעה'); return }
    const coach = coaches.find(c => c.id === newClass.coach_id)
    const d = new Date(newClass.date + 'T00:00:00')
    // בונים payload ומסירים שדות שה-schema cache של Supabase לא מכיר
    async function insertWithFallback(obj) {
      let res = await supabase.from('classes').insert(obj)
      while (res.error) {
        const msg = res.error.message || ''
        // דפוס: "Could not find the 'X' column of 'classes' in the schema cache"
        const match = msg.match(/Could not find the '([^']+)' column/i)
        if (!match) return res
        const badCol = match[1]
        if (!(badCol in obj)) return res
        const { [badCol]: _, ...next } = obj
        console.warn(`[addClass] dropping unknown column "${badCol}" and retrying`)
        res = await supabase.from('classes').insert(next)
        obj = next
      }
      return res
    }

    const duration = Number(newClass.duration_minutes) || 60
    // מחשבים end_time על סמך start_time + duration
    const [sh, sm] = (newClass.start_time || '00:00').split(':').map(Number)
    const totalMin = sh * 60 + sm + duration
    const eh = Math.floor((totalMin / 60) % 24)
    const em = totalMin % 60
    const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`

    const basePayload = {
      name: newClass.name.trim(),
      start_time: newClass.start_time,
      end_time: endTime,
      duration_minutes: duration,
      coach_id: newClass.coach_id,
      coach_name: coach?.name || null,
      branch_id: coach?.branch_id || null,
      day_of_week: d.getDay(),
      status: isAdmin ? 'approved' : 'pending',
      // שדות NOT NULL שאין לנו בטופס — ממלאים ברירות מחדל סבירות
      class_type: 'regular',
      hall: '',
    }
    let { error } = await insertWithFallback(basePayload)

    if (error) {
      console.error('addClass error:', error)
      setAddError(error.message || 'שגיאה בשמירה')
      return
    }
    // Push למאמנים אחרים על שינוי לו"ז
    allTrainerUserIds()
      .then(ids => notifyPush({
        userIds: ids.filter(id => id !== trainerId),
        title: 'שינוי לו"ז',
        body: `שיעור חדש: ${basePayload.name} — ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })} ${basePayload.start_time}`,
        url: '/#schedule',
        tag: `class:${Date.now()}`,
      }))
      .catch(() => {})
    // Push למנהל כשמאמן (לא-אדמין) מוסיף שיעור שממתין לאישור
    if (!isAdmin) {
      allAdminUserIds()
        .then(ids => notifyPush({
          userIds: ids,
          title: 'שיעור חדש ממתין לאישור',
          body: `${basePayload.name} — ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })} ${basePayload.start_time}`,
          url: '/#schedule',
          tag: `class-pending:${Date.now()}`,
        }))
        .catch(() => {})
    }
    setShowAdd(false)
    setNewClass({ name: '', coach_id: '', date: '', start_time: '', duration_minutes: 60 })
    alert(isAdmin ? 'השיעור נוסף ומאושר' : 'השיעור נשלח לאישור מנהל')
    fetchDayClasses(selectedDate)
  }

  function openAddForm() {
    if (showAdd) { setShowAdd(false); return }
    const defaultCoach = !isAdmin ? coaches.find(c => c.user_id === trainerId) : null
    const isoDate = (() => {
      const d = startOfDay(selectedDate)
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
    setNewClass(p => ({
      ...p,
      date: p.date || isoDate,
      coach_id: p.coach_id || defaultCoach?.id || '',
    }))
    setAddError('')
    setShowAdd(true)
  }

  async function approveClass(classId) {
    const { error } = await supabase.from('classes').update({ status: 'approved' }).eq('id', classId)
    if (error) { console.error('approveClass error:', error); alert('שגיאה באישור'); return }
    setPendingRequests(prev => prev.filter(r => r.id !== classId))
    fetchDayClasses(selectedDate)
  }

  async function rejectClass(classId) {
    if (!confirm('למחוק את השיעור הממתין?')) return
    const { error } = await supabase.from('classes').delete().eq('id', classId)
    if (error) { console.error('rejectClass error:', error); alert('שגיאה במחיקה'); return }
    setPendingRequests(prev => prev.filter(r => r.id !== classId))
    fetchDayClasses(selectedDate)
  }

  async function performHardDelete(cls) {
    // ניקוי תלויות לפני מחיקת השיעור (במקרה שאין ON DELETE CASCADE)
    await supabase.from('class_registrations').delete().eq('class_id', cls.id)
    await supabase.from('member_classes').delete().eq('class_id', cls.id)
    await supabase.from('checkins').delete().eq('class_id', cls.id)
    return await supabase.from('classes').delete().eq('id', cls.id)
  }

  async function deleteClass(cls) {
    const label = `${cls.name || cls.title || 'ללא שם'}${cls.coachName ? ` · ${cls.coachName}` : ''}`
    if (isAdmin) {
      if (!confirm(`למחוק את השיעור "${label}"?\n\nפעולה זו תמחק גם את כל הרישומים והנוכחות של השיעור.`)) return
      const { error } = await performHardDelete(cls)
      if (error) { console.error('deleteClass error:', error); alert('שגיאה במחיקה: ' + (error.message || '')); return }
      setExpanded(null)
      fetchDayClasses(selectedDate)
      return
    }
    // מאמן — שולח בקשת מחיקה למנהל
    if (!confirm(`לשלוח בקשת מחיקה של "${label}" לאישור מנהל?`)) return
    const { error } = await supabase.from('classes')
      .update({ deletion_requested_at: new Date().toISOString() })
      .eq('id', cls.id)
    if (error) {
      console.error('request deletion error:', error)
      if (/deletion_requested_at/i.test(error.message || '')) {
        alert('המסד לא מעודכן עדיין — יש להריץ את migration-classes-deletion-requests.sql ב-Supabase')
      } else {
        alert('שגיאה: ' + (error.message || ''))
      }
      return
    }
    // Push למנהל (עובד גם כשהאפליקציה סגורה)
    allAdminUserIds()
      .then(ids => notifyPush({
        userIds: ids,
        title: 'בקשת מחיקת שיעור',
        body: `${label} — ממתין לאישור מחיקה`,
        url: '/#schedule',
        tag: `class-deletion:${cls.id}`,
      }))
      .catch(() => {})
    alert('בקשת המחיקה נשלחה לאישור מנהל')
    setExpanded(null)
    fetchDayClasses(selectedDate)
  }

  async function approveDeletion(cls) {
    if (!confirm(`לאשר מחיקה של "${cls.name || cls.title || 'ללא שם'}"? הפעולה בלתי הפיכה.`)) return
    const { error } = await performHardDelete(cls)
    if (error) { console.error('approveDeletion error:', error); alert('שגיאה: ' + (error.message || '')); return }
    setPendingRequests(prev => prev.filter(r => r.id !== cls.id))
    setExpanded(null)
    fetchDayClasses(selectedDate)
  }

  async function cancelDeletionRequest(cls) {
    const { error } = await supabase.from('classes')
      .update({ deletion_requested_at: null })
      .eq('id', cls.id)
    if (error) { console.error('cancelDeletionRequest error:', error); alert('שגיאה: ' + (error.message || '')); return }
    setPendingRequests(prev => prev.filter(r => r.id !== cls.id))
    fetchDayClasses(selectedDate)
  }

  function handleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!classData[id]) fetchClassDetails(id)
  }

  // סליידר של שבוע אחד — יום א' עד יום ו' (אין אימונים בשבת)
  const today0 = startOfDay(new Date())
  const weekStart0 = new Date(today0)
  weekStart0.setDate(today0.getDate() - today0.getDay())
  const sliderCells = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(weekStart0)
    d.setDate(weekStart0.getDate() + i)
    sliderCells.push(d)
  }
  const isSelected = (d) => d.toDateString() === selectedDate.toDateString()
  const isToday = (d) => d.toDateString() === new Date().toDateString()

  // ניווט אל היום של השבוע של השיעור (ההופעה הבאה של day_of_week)
  function jumpToClassDay(dayOfWeek) {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const diff = (dayOfWeek - now.getDay() + 7) % 7
    const target = new Date(now); target.setDate(now.getDate() + diff)
    setSelectedDate(target)
  }

  return (
    <div className="space-y-4">
      {/* Admin — בקשות ממתינות (כל הימים) */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 border-2 border-rose-200 rounded-2xl p-4 shadow-sm">
          <button
            onClick={() => setShowPending(s => !s)}
            className="w-full flex items-center justify-between text-right mb-2"
          >
            <span className="text-base font-black text-rose-900">
              🔔 בקשות ממתינות לאישור ({pendingRequests.length})
            </span>
            <span className="text-rose-700 text-lg">{showPending ? '▲' : '▼'}</span>
          </button>
          {showPending && (
            <ul className="space-y-2">
              {pendingRequests.map(req => {
                const isDeletionReq = !!req.deletion_requested_at
                const isNewAddReq = req.status === 'pending'
                return (
                  <li key={req.id} className="bg-white border border-rose-200 rounded-xl p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isNewAddReq && (
                            <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">➕ שיעור חדש</span>
                          )}
                          {isDeletionReq && (
                            <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">🗑️ בקשת מחיקה</span>
                          )}
                          <p className="font-bold text-gray-800 text-sm">
                            {req.name || req.title || 'ללא שם'}
                            {req.coachName ? ` · ${req.coachName}` : ''}
                          </p>
                        </div>
                        {(() => {
                          const now = new Date(); now.setHours(0, 0, 0, 0)
                          const diff = (req.day_of_week - now.getDay() + 7) % 7
                          const nextDate = new Date(now); nextDate.setDate(now.getDate() + diff)
                          const dateStr = nextDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
                          const relLabel = diff === 0 ? 'היום' : diff === 1 ? 'מחר' : `יום ${DAYS_HE[req.day_of_week]}`
                          return (
                            <p className="text-xs text-gray-600 mt-1 font-semibold">
                              📅 {relLabel} · {dateStr} · 🕐 {formatTime(req.start_time)}
                              {req.branchName ? ` · 📍 ${req.branchName}` : ''}
                            </p>
                          )
                        })()}
                      </div>
                      <button
                        onClick={() => jumpToClassDay(req.day_of_week)}
                        className="text-[11px] bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-2 py-1 rounded-lg font-semibold"
                        title="עבור ליום השיעור"
                      >
                        📅 עבור
                      </button>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {isNewAddReq && (
                        <>
                          <button onClick={() => approveClass(req.id)}
                            className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold">
                            ✓ אשר ופרסם
                          </button>
                          <button onClick={() => rejectClass(req.id)}
                            className="flex-1 text-xs bg-white border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg font-bold">
                            ✕ דחה
                          </button>
                        </>
                      )}
                      {isDeletionReq && (
                        <>
                          <button onClick={() => approveDeletion(req)}
                            className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold">
                            ✓ אשר מחיקה
                          </button>
                          <button onClick={() => cancelDeletionRequest(req)}
                            className="flex-1 text-xs bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-bold">
                            ✕ בטל בקשה
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
      )}

      {/* Header with date label + add button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-black text-gray-800 text-base leading-tight">{formatDateLabel(selectedDate)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddForm}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
            + הוסף שיעור
          </button>
        </div>
      </div>

      {/* Horizontal date slider */}
      <div ref={sliderContainerRef} className="bg-white rounded-2xl border shadow-sm p-3 overflow-x-auto" dir="ltr">
        <div className="flex gap-1.5 justify-center" dir="rtl">
          {sliderCells.map((d, i) => {
            const today = isToday(d)
            const selected = isSelected(d)
            return (
              <button key={i} onClick={() => setSelectedDate(startOfDay(d))}
                ref={el => {
                  if (!el) return
                  if (today) todayBtnRef.current = el
                  if (selected) selectedBtnRef.current = el
                }}
                className={`flex-shrink-0 rounded-xl transition text-center ${
                  today
                    ? 'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg ring-4 ring-red-300 scale-110 py-2.5 px-3.5 min-w-[68px] font-black'
                    : selected
                      ? 'bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md ring-2 ring-blue-400 py-2 px-3 min-w-[56px]'
                      : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 py-2 px-3 min-w-[56px]'
                }`}>
                <p className={`text-[10px] font-semibold ${today || selected ? 'opacity-95' : 'text-gray-400'}`}>
                  {DAYS_HE_SHORT[d.getDay()]}
                </p>
                <p className={`font-black leading-none mt-0.5 ${today ? 'text-2xl' : 'text-lg'}`}>
                  {d.getDate()}
                </p>
                <p className={`text-[9px] mt-0.5 ${today || selected ? 'opacity-80' : 'text-gray-400'}`}>
                  {d.toLocaleDateString('he-IL', { month: 'short' })}
                </p>
                {today && <p className="text-[9px] font-black mt-1 bg-white/30 rounded px-1">היום</p>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Branch filter chips — מציג רק סניפים שיש בהם שיעורים שהמאמן רואה */}
      {(() => {
        const branchCount = {}
        classes.forEach(c => { if (c.branch_id) branchCount[c.branch_id] = (branchCount[c.branch_id] || 0) + 1 })
        const visibleBranches = branches.filter(b => branchCount[b.id] > 0)
        if (visibleBranches.length <= 1) return null  // אין מה לסנן
        return (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none }`}</style>
            <button type="button" onClick={() => setSelectedBranch('all')}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                selectedBranch === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}>
              הכל ({classes.length})
            </button>
            {visibleBranches.map(b => {
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
          </div>
        )
      })()}

      {showAdd && (() => {
        // dedupe coaches by normalized name — עדיפות לרשומה שמקושרת ל־user_id.
        // מנרמל רווחים, תווים בלתי-נראים (zero-width, BOM), וגרסאות אותיות עברית.
        const normalizeCoachName = (n) => (n || '')
          .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '') // zero-width / bidi marks
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
        const byName = new Map()
        for (const c of coaches) {
          const key = normalizeCoachName(c.name)
          if (!key) continue
          const existing = byName.get(key)
          if (!existing || (!existing.user_id && c.user_id)) byName.set(key, c)
        }
        const uniqueCoaches = Array.from(byName.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        return (
        <form onSubmit={addClass} className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4 shadow-lg">
          <h3 className="font-black text-lg text-gray-800">➕ הוספת שיעור חדש</h3>
          {!isAdmin && (
            <p className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">
              שיעור שתוסיף יישלח לאישור מנהל לפני שיופיע למתאמנים.
            </p>
          )}
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-1.5">שם השיעור</label>
            <input
              className="w-full border-2 border-gray-200 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2.5 text-sm transition"
              placeholder="לדוגמה: No-Gi מתקדמים"
              value={newClass.name}
              onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-1.5">שם המאמן</label>
            <select
              className="w-full border-2 border-gray-200 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2.5 text-sm bg-white transition"
              value={newClass.coach_id}
              onChange={e => setNewClass(p => ({ ...p, coach_id: e.target.value }))}
              required
            >
              <option value="">בחר מאמן…</option>
              {uniqueCoaches.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                <span>📅</span><span>תאריך האימון</span>
              </label>
              <input
                type="date"
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2.5 text-base font-semibold text-gray-800 bg-blue-50/40 transition"
                value={newClass.date}
                onChange={e => setNewClass(p => ({ ...p, date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                <span>🕐</span><span>שעת האימון</span>
              </label>
              <input
                type="time"
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2.5 text-base font-semibold text-gray-800 bg-blue-50/40 transition"
                value={newClass.start_time}
                onChange={e => setNewClass(p => ({ ...p, start_time: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-1.5">משך (דקות)</label>
            <input
              type="number"
              min="15"
              step="5"
              className="w-full border-2 border-gray-200 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2.5 text-sm transition"
              value={newClass.duration_minutes}
              onChange={e => setNewClass(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
            />
          </div>
          {addError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-semibold">
              ⚠️ {addError}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold shadow-sm transition">
              {isAdmin ? 'שמור ופרסם' : 'שלח לאישור'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border-2 border-gray-200 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-bold text-gray-600 transition">
              ביטול
            </button>
          </div>
        </form>
        )
      })()}

      {(() => {
        if (loading) return <p className="text-center text-gray-400 py-10">טוען שיעורים...</p>
        const visibleClasses = selectedBranch === 'all' ? classes : classes.filter(c => c.branch_id === selectedBranch)
        if (visibleClasses.length === 0) {
          return (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📭</div>
              <p>אין שיעורים ביום {DAYS_HE[selectedDate.getDay()]}{selectedBranch !== 'all' ? ' בסניף זה' : ''}</p>
            </div>
          )
        }
        return visibleClasses.map(cls => {
        const data = classData[cls.id]
        const isOpen = expanded === cls.id
        const presentCount = data?.checkedIds?.size ?? 0
        // הספירה הכוללת: מתאמנים קבועים + נרשמים שבועיים (ללא כפילויות)
        const totalCount = (() => {
          if (!data) return 0
          const ids = new Set((data.members || []).map(m => m.id))
          ;(data.weeklyRegistrants || []).forEach(r => ids.add(r.id))
          return ids.size
        })()

        return (
          <div key={cls.id} className={`bg-white rounded-xl shadow-sm overflow-hidden border ${cls.status === 'pending' ? 'border-amber-300 ring-1 ring-amber-200' : ''} ${cls.deletion_requested_at ? 'border-rose-300 ring-1 ring-rose-200' : ''}`}>
            {cls.status === 'pending' && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-900">⏳ ממתין לאישור מנהל</span>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => approveClass(cls.id)}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg font-bold">
                      ✓ אשר ופרסם
                    </button>
                    <button onClick={() => rejectClass(cls.id)}
                      className="text-xs bg-white border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg font-bold">
                      ✕ דחה
                    </button>
                  </div>
                )}
              </div>
            )}
            {cls.deletion_requested_at && (
              <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-rose-900">📝 בקשת מחיקה ממתינה לאישור מנהל</span>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => approveDeletion(cls)}
                      className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg font-bold">
                      ✓ אשר מחיקה
                    </button>
                    <button onClick={() => cancelDeletionRequest(cls)}
                      className="text-xs bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1 rounded-lg font-bold">
                      ✕ בטל בקשה
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Class header */}
            <button
              onClick={() => handleExpand(cls.id)}
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition"
            >
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">
                    {cls.name || cls.title}{cls.coachName ? ` · ${cls.coachName}` : ''}
                  </p>
                  {cls.branchName && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                      {cls.branchName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{formatTime(cls.start_time)}{cls.duration_minutes ? ` · ${cls.duration_minutes} דקות` : ''}</p>
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {(regCountsByClass[cls.id] || 0) > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                    🙋 {regCountsByClass[cls.id]} נרשמו
                  </span>
                )}
                {data && !data.loading ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    {presentCount}/{totalCount} נוכחים
                  </span>
                ) : cls.id in memberCounts ? (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {memberCounts[cls.id]} רשומים
                  </span>
                ) : null}
                <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-4 py-3 space-y-3">
                {!data || data.loading ? (
                  <p className="text-sm text-gray-400 text-center py-2">טוען...</p>
                ) : (
                  <>
                    {/* רשימת משתתפים מאוחדת: מתאמנים קבועים + נרשמים שבועיים */}
                    {(() => {
                      const permanentIds = new Set((data.members || []).map(m => m.id))
                      const weeklyOnly = (data.weeklyRegistrants || []).filter(r => !permanentIds.has(r.id))
                      const combined = [
                        ...(data.members || []).map(m => ({ ...m, _source: 'permanent' })),
                        ...weeklyOnly.map(r => ({ ...r, _source: 'weekly' })),
                      ]

                      if (combined.length === 0) {
                        return <p className="text-sm text-gray-400 text-center py-4">אין מתאמנים רשומים לשיעור זה</p>
                      }

                      return (
                        <ul className="divide-y border border-gray-100 rounded-lg overflow-hidden bg-white">
                          {combined.map(member => {
                            const membershipType = member.membership_type || member.subscription_type
                            const limit = WEEKLY_LIMITS[membershipType] ?? 2
                            const weekCount = data.weeklyCount[member.id] || 0
                            const isPresent = data.checkedIds.has(member.id)
                            const isAbsent = data.absentIds.has(member.id)
                            const isOverLimit = limit !== Infinity && weekCount >= limit && !isPresent
                            const key = `${cls.id}_${member.id}`
                            const busy = actionLoading[key]
                            const isWeekly = member._source === 'weekly'

                            return (
                              <li key={member.id} className="py-3 px-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-sm font-medium text-gray-800">{member.full_name}</p>
                                      {isWeekly && (
                                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                          🙋 נרשם השבוע
                                        </span>
                                      )}
                                      {isOverLimit && (
                                        <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                          ⚠️ חרג ממנוי ({weekCount}/{limit})
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {membershipType === '2x_week' ? '2× שבוע'
                                        : membershipType === '4x_week' ? '4× שבוע'
                                        : membershipType === 'unlimited' ? 'ללא הגבלה'
                                        : membershipType || '—'}
                                      {limit !== Infinity && ` · ${weekCount}/${limit} השבוע`}
                                    </p>
                                  </div>

                                  <div className="flex gap-1.5 shrink-0">
                                    {/* נוכח button */}
                                    <button
                                      onClick={() => markPresent(cls.id, member.id, membershipType)}
                                      disabled={busy}
                                      title="סמן נוכח"
                                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-40 ${
                                        isPresent
                                          ? 'bg-green-500 text-white shadow-sm'
                                          : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
                                      }`}
                                    >
                                      {busy ? '...' : '✓ נוכח'}
                                    </button>

                                    {/* נעדר button */}
                                    <button
                                      onClick={() => markAbsent(cls.id, member.id)}
                                      disabled={busy}
                                      title="סמן נעדר"
                                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-40 ${
                                        isAbsent
                                          ? 'bg-red-500 text-white shadow-sm'
                                          : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                                      }`}
                                    >
                                      {busy ? '...' : '✕ נעדר'}
                                    </button>
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    })()}

                    {/* Visitor / walk-in section */}
                    <div className={`pt-2 ${data.members.length > 0 ? 'border-t' : ''}`}>
                      <p className="text-xs font-medium text-gray-500 mb-2">הוסף מבקר (לא רשום לשיעור)</p>
                      <div className="relative">
                        <input
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          placeholder="חפש מתאמן לפי שם..."
                          value={visitorSearch[cls.id] || ''}
                          onChange={e => searchVisitor(cls.id, e.target.value)}
                        />
                        {visitorLoading[cls.id] && (
                          <span className="absolute left-3 top-2.5 text-xs text-gray-400">טוען...</span>
                        )}
                      </div>

                      {(visitorResults[cls.id] || []).length > 0 && (
                        <ul className="mt-1 border rounded-lg divide-y bg-white shadow-sm">
                          {visitorResults[cls.id].map(m => {
                            const mtype = m.membership_type || m.subscription_type
                            return (
                              <li key={m.id} className="flex items-center justify-between px-3 py-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{m.full_name}</p>
                                  <p className="text-xs text-gray-400">
                                    {mtype === '2x_week' ? '2× שבוע'
                                      : mtype === '4x_week' ? '4× שבוע'
                                      : mtype === 'unlimited' ? 'ללא הגבלה'
                                      : mtype || '—'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => addVisitor(cls.id, m)}
                                  className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 px-2.5 py-1 rounded-lg font-medium transition"
                                >
                                  + הוסף כמבקר
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      {visitorSearch[cls.id] && !visitorLoading[cls.id] && (visitorResults[cls.id] || []).length === 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-400 text-center mb-2">לא נמצאו מתאמנים קיימים</p>
                          <button
                            onClick={() => addNewVisitor(cls.id, cls.branch_id, visitorSearch[cls.id])}
                            className="w-full text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-2 rounded-lg font-medium transition text-right"
                          >
                            + הוסף מבקר חדש: <span className="font-bold">{visitorSearch[cls.id]}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Danger zone — מחיקת שיעור */}
                    <div className="pt-3 border-t">
                      {cls.deletion_requested_at && !isAdmin ? (
                        <div className="w-full text-sm bg-rose-50 border-2 border-rose-200 text-rose-700 px-3 py-2 rounded-lg font-bold text-center">
                          📝 בקשת מחיקה נשלחה — ממתין לאישור מנהל
                        </div>
                      ) : (
                        <button
                          onClick={() => deleteClass(cls)}
                          className="w-full text-sm bg-white hover:bg-red-50 border-2 border-red-200 hover:border-red-400 text-red-600 hover:text-red-700 px-3 py-2 rounded-lg font-bold transition"
                        >
                          {isAdmin ? '🗑️ מחק שיעור זה' : '🗑️ בקש מחיקת שיעור (דרוש אישור מנהל)'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
        })
      })()}
    </div>
  )
}
