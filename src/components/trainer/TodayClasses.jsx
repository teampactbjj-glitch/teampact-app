import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const WEEKLY_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

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

export default function TodayClasses({ trainerId, isAdmin }) {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [classes, setClasses] = useState([])
  const [expanded, setExpanded] = useState(null)
  // classData[classId] = { members: [...], checkedIds: Set, absentIds: Set, weeklyCount: {memberId: n}, loading: bool }
  const [classData, setClassData] = useState({})
  const [memberCounts, setMemberCounts] = useState({}) // { classId: number }
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newClass, setNewClass] = useState({ name: '', start_time: '', duration_minutes: 60 })
  const [actionLoading, setActionLoading] = useState({}) // { `${classId}_${memberId}`: bool }
  // Visitor search state per class
  const [visitorSearch, setVisitorSearch] = useState({}) // { classId: query }
  const [visitorResults, setVisitorResults] = useState({}) // { classId: [member] }
  const [visitorLoading, setVisitorLoading] = useState({}) // { classId: bool }

  useEffect(() => {
    setExpanded(null)
    setClassData({})
    fetchDayClasses(selectedDate)
  }, [trainerId, selectedDate])

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
      fetchMemberCounts(mapped.map(c => c.id))
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
    const mapped = (data || []).map(cls => ({
      ...cls,
      branchName: coachBranchMap[cls.coach_id] || '',
      coachName: cls.coach_name || '',
    }))
    setClasses(mapped)
    fetchMemberCounts(mapped.map(c => c.id))
    setLoading(false)
  }

  async function fetchMemberCounts(classIds) {
    if (!classIds.length) return
    // Pre-fill all with 0 so classes with no members still show a badge
    const counts = Object.fromEntries(classIds.map(id => [id, 0]))
    const { data, error } = await supabase
      .from('member_classes')
      .select('class_id')
      .in('class_id', classIds)
    if (error) { console.error('fetchMemberCounts error:', error); return }
    ;(data || []).forEach(r => { counts[r.class_id] = (counts[r.class_id] || 0) + 1 })
    setMemberCounts(counts)
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

    // 3. Weekly checkin counts per member (for over-limit detection)
    const { weekStart, weekEnd } = getWeekRange(selectedDate)
    const memberIds = members.map(m => m.id)
    let weeklyCount = {}
    if (memberIds.length > 0) {
      const { data: weekChks, error: wErr } = await supabase
        .from('checkins')
        .select('athlete_id')
        .in('athlete_id', memberIds)
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
      [classId]: { members, checkedIds, absentIds, weeklyCount, loading: false },
    }))
    setMemberCounts(prev => ({ ...prev, [classId]: members.length }))
  }

  async function markPresent(classId, memberId, membershipType) {
    const key = `${classId}_${memberId}`
    setActionLoading(p => ({ ...p, [key]: true }))

    const dayStart = startOfDay(selectedDate)
    await supabase.from('checkins').delete()
      .eq('class_id', classId).eq('athlete_id', memberId)
      .gte('checked_in_at', dayStart.toISOString())

    const checkedAt = new Date(selectedDate); checkedAt.setHours(12, 0, 0, 0)
    await supabase.from('checkins').insert({
      class_id: classId,
      athlete_id: memberId,
      status: 'present',
      checked_in_at: checkedAt.toISOString(),
    })

    setActionLoading(p => ({ ...p, [key]: false }))
    fetchClassDetails(classId)
  }

  async function markAbsent(classId, memberId) {
    const key = `${classId}_${memberId}`
    setActionLoading(p => ({ ...p, [key]: true }))

    const dayStart = startOfDay(selectedDate)
    await supabase.from('checkins').delete()
      .eq('class_id', classId).eq('athlete_id', memberId)
      .gte('checked_in_at', dayStart.toISOString())

    const checkedAt = new Date(selectedDate); checkedAt.setHours(12, 0, 0, 0)
    await supabase.from('checkins').insert({
      class_id: classId,
      athlete_id: memberId,
      status: 'absent',
      checked_in_at: checkedAt.toISOString(),
    })

    setActionLoading(p => ({ ...p, [key]: false }))
    fetchClassDetails(classId)
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
    const { error } = await supabase.from('classes').insert({
      ...newClass,
      coach_id: trainerId,
      day_of_week: selectedDate.getDay(),
    })
    if (error) { console.error('addClass error:', error); return }
    setShowAdd(false)
    setNewClass({ name: '', start_time: '', duration_minutes: 60 })
    fetchDayClasses(selectedDate)
  }

  function handleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!classData[id]) fetchClassDetails(id)
  }

  if (loading) return <p className="text-center text-gray-400 py-10">טוען שיעורים...</p>

  // סליידר של כל התאריכים (30 אחורה, 60 קדימה)
  const sliderCells = []
  const today0 = startOfDay(new Date())
  for (let i = -30; i <= 60; i++) {
    const d = new Date(today0)
    d.setDate(today0.getDate() + i)
    sliderCells.push(d)
  }
  const isSelected = (d) => d.toDateString() === selectedDate.toDateString()
  const isToday = (d) => d.toDateString() === new Date().toDateString()

  return (
    <div className="space-y-4">
      {/* Header with date label + add button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-black text-gray-800 text-base leading-tight">{formatDateLabel(selectedDate)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSelectedDate(startOfDay(new Date()))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              isToday(selectedDate)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'text-blue-600 border-blue-300 hover:bg-blue-50'
            }`}>
            היום
          </button>
          <button onClick={() => setShowAdd(!showAdd)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
            + הוסף שיעור
          </button>
        </div>
      </div>

      {/* Horizontal date slider */}
      <div className="bg-white rounded-2xl border shadow-sm p-3 overflow-x-auto" dir="ltr">
        <div className="flex gap-1.5 min-w-max" dir="rtl">
          {sliderCells.map((d, i) => {
            const today = isToday(d)
            const selected = isSelected(d)
            return (
              <button key={i} onClick={() => setSelectedDate(startOfDay(d))}
                ref={el => { if (el && today && !selected) el.scrollIntoView?.({ inline: 'center', block: 'nearest' }) }}
                className={`flex-shrink-0 rounded-xl py-2 px-3 transition text-center min-w-[56px] ${
                  today
                    ? selected
                      ? 'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg ring-2 ring-red-400 scale-110'
                      : 'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md scale-105'
                    : selected
                      ? 'bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md ring-2 ring-blue-400'
                      : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50'
                }`}>
                <p className={`text-[10px] font-semibold ${today || selected ? 'opacity-90' : 'text-gray-400'}`}>
                  {DAYS_HE[d.getDay()].slice(0,2)}
                </p>
                <p className={`text-lg font-black leading-none mt-0.5`}>
                  {d.getDate()}
                </p>
                <p className={`text-[9px] mt-0.5 ${today || selected ? 'opacity-80' : 'text-gray-400'}`}>
                  {d.toLocaleDateString('he-IL', { month: 'short' })}
                </p>
                {today && <p className="text-[8px] font-bold mt-0.5">היום</p>}
              </button>
            )
          })}
        </div>
      </div>

      {showAdd && (
        <form onSubmit={addClass} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="שם השיעור"
            value={newClass.name}
            onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            type="time"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={newClass.start_time}
            onChange={e => setNewClass(p => ({ ...p, start_time: e.target.value }))}
            required
          />
          <input
            type="number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="משך (דקות)"
            value={newClass.duration_minutes}
            onChange={e => setNewClass(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm">שמור</button>
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border py-2 rounded-lg text-sm">ביטול</button>
          </div>
        </form>
      )}

      {!loading && classes.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p>אין שיעורים ביום {DAYS_HE[selectedDate.getDay()]}</p>
        </div>
      )}

      {classes.map(cls => {
        const data = classData[cls.id]
        const isOpen = expanded === cls.id
        const presentCount = data?.checkedIds?.size ?? 0
        const totalCount = data?.members?.length ?? 0

        return (
          <div key={cls.id} className="bg-white rounded-xl shadow-sm overflow-hidden border">
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
                <p className="text-sm text-gray-500">{formatTime(cls.start_time)} · {cls.duration_minutes} דקות</p>
              </div>
              <div className="flex items-center gap-2">
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
                    {/* Registered members list */}
                    {data.members.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">אין מתאמנים רשומים לשיעור זה</p>
                    ) : (
                      <ul className="divide-y">
                        {data.members.map(member => {
                          const membershipType = member.membership_type || member.subscription_type
                          const limit = WEEKLY_LIMITS[membershipType] ?? 2
                          const weekCount = data.weeklyCount[member.id] || 0
                          const isPresent = data.checkedIds.has(member.id)
                          const isAbsent = data.absentIds.has(member.id)
                          const isOverLimit = limit !== Infinity && weekCount >= limit && !isPresent
                          const key = `${cls.id}_${member.id}`
                          const busy = actionLoading[key]

                          return (
                            <li key={member.id} className="py-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-medium text-gray-800">{member.full_name}</p>
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
                    )}

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
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
