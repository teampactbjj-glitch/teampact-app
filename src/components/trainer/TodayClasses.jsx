import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const WEEKLY_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }

function formatTime(timeStr) {
  // timeStr can be "18:00:00" or "18:00"
  return timeStr ? timeStr.slice(0, 5) : ''
}

function getWeekRange() {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - day)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() }
}

export default function TodayClasses({ trainerId, isAdmin }) {
  const [classes, setClasses] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [classData, setClassData] = useState({}) // { classId: { registrations, checkedIds, errors } }
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newClass, setNewClass] = useState({ name: '', start_time: '', duration_minutes: 60 })
  const [checkinLoading, setCheckinLoading] = useState({}) // { athleteId: bool }

  useEffect(() => { fetchTodayClasses() }, [trainerId])

  async function fetchTodayClasses() {
    setLoading(true)
    const todayDow = new Date().getDay() // 0=ראשון, 4=חמישי

    if (isAdmin) {
      // Admin: all classes from all coaches/branches, ordered by branch then time
      const { data, error } = await supabase
        .from('classes')
        .select('*, branches(name)')
        .eq('day_of_week', todayDow)
        .order('branch_id')
        .order('start_time')

      console.log('fetchTodayClasses [admin]:', { todayDow, data, error })
      if (error) console.error('fetchTodayClasses error:', error)

      const classesWithBranch = (data || []).map(cls => ({
        ...cls,
        branchName: cls.branches?.name || cls.branch_id || '',
      }))
      setClasses(classesWithBranch)
      setLoading(false)
      return
    }

    // Regular trainer: find all coach records for this user (one per branch)
    const { data: coaches, error: coachErr } = await supabase
      .from('coaches')
      .select('id, branch_id, branches(name)')
      .eq('user_id', trainerId)

    console.log('coaches for trainer:', { coaches, coachErr })
    if (coachErr) console.error('fetchCoaches error:', coachErr)

    if (!coaches || coaches.length === 0) {
      setClasses([])
      setLoading(false)
      return
    }

    // Build lookup: coachId → branchName
    const coachBranchMap = {}
    coaches.forEach(c => {
      coachBranchMap[c.id] = c.branches?.name || c.branch_id
    })
    const coachIds = coaches.map(c => c.id)

    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .in('coach_id', coachIds)
      .eq('day_of_week', todayDow)
      .order('start_time')

    console.log('fetchTodayClasses [trainer]:', { todayDow, coachIds, data, error })
    if (error) console.error('fetchTodayClasses error:', error)

    const classesWithBranch = (data || []).map(cls => ({
      ...cls,
      branchName: coachBranchMap[cls.coach_id] || '',
    }))
    setClasses(classesWithBranch)
    setLoading(false)
  }

  async function fetchClassDetails(classId) {
    const [{ data: regs, error: regsErr }, { data: chks, error: chksErr }] = await Promise.all([
      supabase
        .from('registrations')
        .select('*, members(id, full_name, membership_type, subscription_type, group_name, group_id)')
        .eq('class_id', classId),
      supabase
        .from('checkins')
        .select('athlete_id')
        .eq('class_id', classId),
    ])
    if (regsErr) console.error('fetchClassDetails regs error:', regsErr)
    if (chksErr) console.error('fetchClassDetails chks error:', chksErr)

    const checkedIds = new Set((chks || []).map(c => c.athlete_id))
    setClassData(prev => ({
      ...prev,
      [classId]: { registrations: regs || [], checkedIds, athleteErrors: {} },
    }))
  }

  async function validateCheckin(classId, athleteId, memberData) {
    const membershipType = memberData?.membership_type || memberData?.subscription_type
    console.log('validateCheckin:', { classId, athleteId, membershipType })

    // unlimited — always OK
    if (membershipType === 'unlimited') return null

    // 1. Check member_classes registration
    const { data: memberClass, error: mcErr } = await supabase
      .from('member_classes')
      .select('id')
      .eq('member_id', athleteId)
      .eq('class_id', classId)
      .maybeSingle()

    if (mcErr) console.error('member_classes lookup error:', mcErr)

    if (!memberClass) {
      return `המתאמן אינו רשום לקבוצה זו`
    }

    // 2. Count weekly checkins
    const { weekStart, weekEnd } = getWeekRange()
    const { count, error: countErr } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('checked_in_at', weekStart)
      .lte('checked_in_at', weekEnd)

    if (countErr) console.error('weekly checkins count error:', countErr)

    const limit = WEEKLY_LIMITS[membershipType] ?? 2
    console.log(`weekly checkins: ${count}/${limit} (${membershipType})`)

    if (count >= limit) {
      return `חרג ממכסה שבועית — ${count}/${limit} אימונים`
    }

    return null // OK
  }

  async function toggleCheckin(classId, athleteId, isChecked, memberData) {
    setCheckinLoading(prev => ({ ...prev, [athleteId]: true }))

    if (!isChecked) {
      // Validate before checking in
      const error = await validateCheckin(classId, athleteId, memberData)
      if (error) {
        console.warn('checkin blocked:', error)
        setClassData(prev => ({
          ...prev,
          [classId]: {
            ...prev[classId],
            athleteErrors: { ...prev[classId]?.athleteErrors, [athleteId]: error },
          },
        }))
        setCheckinLoading(prev => ({ ...prev, [athleteId]: false }))
        return
      }
    }

    // Clear any previous error
    setClassData(prev => ({
      ...prev,
      [classId]: {
        ...prev[classId],
        athleteErrors: { ...prev[classId]?.athleteErrors, [athleteId]: null },
      },
    }))

    if (isChecked) {
      const { error } = await supabase
        .from('checkins')
        .delete()
        .eq('class_id', classId)
        .eq('athlete_id', athleteId)
      if (error) console.error('delete checkin error:', error)
    } else {
      const { error } = await supabase
        .from('checkins')
        .insert({ class_id: classId, athlete_id: athleteId })
      if (error) console.error('insert checkin error:', error)
    }

    setCheckinLoading(prev => ({ ...prev, [athleteId]: false }))
    fetchClassDetails(classId)
  }

  async function addClass(e) {
    e.preventDefault()
    const { error } = await supabase.from('classes').insert({
      ...newClass,
      coach_id: trainerId,
      day_of_week: new Date().getDay(),
    })
    if (error) { console.error('addClass error:', error); return }
    setShowAdd(false)
    setNewClass({ name: '', start_time: '', duration_minutes: 60 })
    fetchTodayClasses()
  }

  function handleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!classData[id]) fetchClassDetails(id)
  }

  if (loading) return <p className="text-center text-gray-400 py-10">טוען שיעורים...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          שיעורים היום — {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
        >
          + הוסף שיעור
        </button>
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

      {classes.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p>אין שיעורים מתוכננים להיום</p>
        </div>
      )}

      {classes.map(cls => {
        const data = classData[cls.id]
        const isOpen = expanded === cls.id

        return (
          <div key={cls.id} className="bg-white rounded-xl shadow-sm overflow-hidden border">
            <button
              onClick={() => handleExpand(cls.id)}
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition"
            >
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">{cls.name || cls.title}</p>
                  {cls.branchName && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                      {cls.branchName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{formatTime(cls.start_time)} · {cls.duration_minutes} דקות</p>
              </div>
              <div className="flex items-center gap-2">
                {data && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {data.checkedIds.size}/{data.registrations.length} צ'ק-אין
                  </span>
                )}
                <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-4 py-3">
                {!data ? (
                  <p className="text-sm text-gray-400 text-center py-2">טוען...</p>
                ) : data.registrations.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">אין מתאמנים רשומים</p>
                ) : (
                  <ul className="divide-y">
                    {data.registrations.map(reg => {
                      const member = reg.members
                      const athleteId = reg.athlete_id
                      const checked = data.checkedIds.has(athleteId)
                      const isLoading = checkinLoading[athleteId]
                      const errorMsg = data.athleteErrors?.[athleteId]
                      const membershipType = member?.membership_type || member?.subscription_type

                      return (
                        <li key={reg.id} className="py-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{member?.full_name}</p>
                              <p className="text-xs text-gray-400">
                                {member?.group_name || '—'} ·{' '}
                                {membershipType === '2x_week' ? '2× שבוע'
                                  : membershipType === '4x_week' ? '4× שבוע'
                                  : membershipType === 'unlimited' ? 'ללא הגבלה'
                                  : membershipType || '—'}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleCheckin(cls.id, athleteId, checked, member)}
                              disabled={isLoading}
                              className={`text-xs px-3 py-1 rounded-full font-medium transition disabled:opacity-40 ${
                                checked
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {isLoading ? '...' : checked ? "✓ נוכח" : "צ'ק-אין"}
                            </button>
                          </div>
                          {errorMsg && (
                            <p className="text-xs text-red-500 mt-1 bg-red-50 rounded px-2 py-1">
                              ⚠️ {errorMsg}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
