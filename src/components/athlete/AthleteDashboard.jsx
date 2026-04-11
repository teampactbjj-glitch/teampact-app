import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatTime(t) {
  return t ? t.slice(0, 5) : ''
}

function resolveNextOccurrence(cls) {
  const now = new Date()
  const todayDow = now.getDay()
  const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
  const classDow = typeof cls.day_of_week === 'number' ? cls.day_of_week : 0

  let daysUntil = (classDow - todayDow + 7) % 7
  if (daysUntil === 0) {
    const nowMins = now.getHours() * 60 + now.getMinutes()
    if (h * 60 + m <= nowMins) daysUntil = 7
  }

  const nextDate = new Date(now)
  nextDate.setDate(now.getDate() + daysUntil)
  nextDate.setHours(h, m, 0, 0)

  const displayDay = daysUntil === 0 ? 'היום' : daysUntil === 1 ? 'מחר' : `יום ${DAYS_HE[classDow]}`
  const displayTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { daysUntil, displayDay, displayTime, nextDate }
}

function computeNextClass(allClasses, regIds) {
  const registered = allClasses.filter(c => regIds.has(c.id))
  if (registered.length === 0) return null
  const withNext = registered.map(cls => ({ cls, ...resolveNextOccurrence(cls) }))
  withNext.sort((a, b) => a.daysUntil - b.daysUntil || a.nextDate - b.nextDate)
  const s = withNext[0]
  return { ...s.cls, displayDay: s.displayDay, displayTime: s.displayTime }
}

export default function AthleteDashboard({ profile }) {
  const [member, setMember] = useState(null)
  const [classes, setClasses] = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [nextClass, setNextClass] = useState(null)
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [weeklyCheckins, setWeeklyCheckins] = useState(0)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [regLoading, setRegLoading] = useState({}) // { classId: bool }

  useEffect(() => {
    if (profile?.id) fetchAll()
  }, [profile?.id])

  async function fetchAll() {
    setLoading(true)

    // 1. Member record
    const { data: memberData, error: memberErr } = await supabase
      .from('members')
      .select('branch_id, subscription_type, membership_type')
      .eq('email', profile.email)
      .maybeSingle()

    console.log('member:', memberData, 'error:', memberErr)
    setMember(memberData)

    const branchId = memberData?.branch_id
    console.log('branch_id:', branchId)

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    // 2. Parallel fetches
    const [classRes, regRes, annRes, chkRes] = await Promise.all([
      branchId
        ? supabase.from('classes').select('*').eq('branch_id', branchId).order('day_of_week').order('start_time')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('class_registrations').select('class_id').eq('athlete_id', profile.id),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('checkins').select('id', { count: 'exact', head: true })
        .eq('athlete_id', profile.id).gte('checked_in_at', weekStart.toISOString()),
    ])

    console.log('classes result:', classRes.data, 'error:', classRes.error)
    console.log('registrations result:', regRes.data, 'error:', regRes.error)

    const allClasses = classRes.data || []
    const regIds = new Set((regRes.data || []).map(r => r.class_id))

    setClasses(allClasses)
    setRegisteredIds(regIds)
    setAnnouncements(annRes.data || [])
    setWeeklyCheckins(chkRes.count || 0)

    // 3. Compute next class + today's check-in
    const next = computeNextClass(allClasses, regIds)
    setNextClass(next)
    if (next) await fetchCheckin(next.id)

    setLoading(false)
  }

  async function fetchCheckin(classId) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const { data: chk } = await supabase
      .from('checkins').select('id')
      .eq('class_id', classId).eq('athlete_id', profile.id)
      .gte('checked_in_at', todayStart.toISOString())
      .lte('checked_in_at', todayEnd.toISOString())
      .maybeSingle()
    setIsCheckedIn(!!chk)
  }

  async function toggleRegistration(classId) {
    const isReg = registeredIds.has(classId)

    if (!isReg && limit !== Infinity && registeredIds.size >= limit) {
      alert(`הגעת למגבלת ${limit} שיעורים שבועיים לפי המנוי שלך`)
      return
    }

    setRegLoading(p => ({ ...p, [classId]: true }))

    if (isReg) {
      const { error } = await supabase.from('class_registrations').delete()
        .eq('athlete_id', profile.id).eq('class_id', classId)
      if (error) { console.error('unregister error:', error); setRegLoading(p => ({ ...p, [classId]: false })); return }
    } else {
      const { error } = await supabase.from('class_registrations')
        .insert({ athlete_id: profile.id, class_id: classId })
      if (error) { console.error('register error:', error); setRegLoading(p => ({ ...p, [classId]: false })); return }
    }

    const newRegIds = new Set(registeredIds)
    if (isReg) newRegIds.delete(classId)
    else newRegIds.add(classId)
    setRegisteredIds(newRegIds)

    const next = computeNextClass(classes, newRegIds)
    setNextClass(next)
    if (next && next.id !== nextClass?.id) await fetchCheckin(next.id)

    setRegLoading(p => ({ ...p, [classId]: false }))
  }

  async function handleCheckin() {
    if (!nextClass) return
    if (weeklyCheckins >= limit && !isCheckedIn) {
      alert(`הגעת למגבלת ${limit} אימונים השבוע`)
      return
    }
    setCheckinLoading(true)
    if (isCheckedIn) {
      await supabase.from('checkins').delete().eq('class_id', nextClass.id).eq('athlete_id', profile.id)
      setIsCheckedIn(false)
      setWeeklyCheckins(p => p - 1)
    } else {
      await supabase.from('checkins').insert({ class_id: nextClass.id, athlete_id: profile.id })
      setIsCheckedIn(true)
      setWeeklyCheckins(p => p + 1)
    }
    setCheckinLoading(false)
  }

  const subType = profile?.subscription_type || member?.subscription_type || member?.membership_type
  const limit = SUBSCRIPTION_LIMITS[subType] ?? 2
  const usagePercent = limit === Infinity ? 0 : Math.min((weeklyCheckins / limit) * 100, 100)

  // Group all branch classes by day_of_week
  const grouped = DAYS_HE.map((dayName, dow) => ({
    dow,
    dayName,
    classes: classes.filter(c => c.day_of_week === dow),
  })).filter(g => g.classes.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💪</span>
          <div>
            <h1 className="font-bold text-lg leading-none">TeamPact</h1>
            <p className="text-emerald-200 text-xs">שלום, {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-emerald-200 hover:text-white text-sm">
          יציאה
        </button>
      </header>

      <main className="p-4 max-w-lg mx-auto space-y-5">
        {loading ? (
          <p className="text-center text-gray-400 py-16">טוען...</p>
        ) : (
          <>
            {/* 1. Subscription card */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  מנוי: {SUBSCRIPTION_LABELS[subType] || '—'}
                </span>
                <span className="text-sm text-gray-500">
                  {limit === Infinity ? 'ללא הגבלה' : `${weeklyCheckins}/${limit} אימונים השבוע`}
                </span>
              </div>
              {limit !== Infinity && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              )}
            </div>

            {/* 2. Weekly schedule */}
            <div>
              <h2 className="font-bold text-gray-800 mb-3">לוח שיעורים שבועי</h2>

              {!member?.branch_id ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-semibold text-orange-700">לא נמצא סניף משויך לחשבון שלך</p>
                  <p className="text-xs text-orange-500 mt-1">פנה למאמן לשיוך לסניף</p>
                </div>
              ) : grouped.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">אין שיעורים בסניף שלך</p>
              ) : (
                <div className="space-y-4">
                  {limit !== Infinity && (
                    <p className="text-xs text-gray-500 text-center">
                      {registeredIds.size}/{limit} שיעורים נבחרו לפי המנוי שלך
                    </p>
                  )}
                  {grouped.map(({ dow, dayName, classes: dayCls }) => (
                    <div key={dow}>
                      <p className="text-xs font-bold text-gray-400 tracking-wide mb-2 px-1">יום {dayName}</p>
                      <ul className="space-y-2">
                        {dayCls.map(cls => {
                          const isReg = registeredIds.has(cls.id)
                          const atLimit = !isReg && limit !== Infinity && registeredIds.size >= limit
                          const busy = regLoading[cls.id]
                          return (
                            <li
                              key={cls.id}
                              className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between gap-3 transition ${
                                isReg ? 'border-emerald-300 bg-emerald-50' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-sm">{cls.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatTime(cls.start_time)}
                                  {cls.duration_minutes && ` · ${cls.duration_minutes} דקות`}
                                  {cls.hall && ` · ${cls.hall}`}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleRegistration(cls.id)}
                                disabled={busy || atLimit}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
                                  isReg
                                    ? 'bg-emerald-500 text-white hover:bg-red-100 hover:text-red-700'
                                    : atLimit
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {busy ? '...' : isReg ? '✓ רשום · בטל' : atLimit ? 'מגבלת מנוי' : 'הירשם'}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Next class + check-in */}
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h2 className="font-bold text-gray-800 mb-3">האימון הבא שלך</h2>
              {!nextClass ? (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-3xl mb-2">📅</div>
                  <p className="text-sm">הירשם לשיעורים בלוח למעלה</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-semibold text-gray-800">{nextClass.name || nextClass.title}</p>
                  <p className="text-sm text-gray-500 mt-1">{nextClass.displayDay} · {nextClass.displayTime}</p>
                  {nextClass.duration_minutes && (
                    <p className="text-xs text-gray-400">{nextClass.duration_minutes} דקות</p>
                  )}
                  {weeklyCheckins >= limit && !isCheckedIn && limit !== Infinity ? (
                    <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-orange-700">הגעת למגבלת {limit} האימונים השבועיים</p>
                      <p className="text-xs text-orange-500 mt-1">פנה למאמן להוספת אימון חריג</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleCheckin}
                      disabled={checkinLoading}
                      className={`mt-4 w-full py-3 rounded-xl font-semibold text-white transition disabled:opacity-50 ${
                        isCheckedIn ? 'bg-green-500 hover:bg-green-600' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {checkinLoading ? '...' : isCheckedIn ? "✓ בוצע צ'ק-אין — ביטול?" : "צ'ק-אין לאימון"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 4. Announcements */}
            <div>
              <h2 className="font-bold text-gray-800 mb-3">הודעות וסמינרים</h2>
              {announcements.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">אין הודעות</p>
              ) : (
                <ul className="space-y-3">
                  {announcements.map(item => {
                    const isSeminar = item.type === 'seminar'
                    const isProduct = item.type === 'product'
                    return (
                      <li key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        {item.image_url && (
                          <img src={item.image_url} alt="" className="w-full h-44 object-cover" />
                        )}
                        <div className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isSeminar ? 'bg-purple-100 text-purple-700'
                              : isProduct ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                              {isSeminar ? '🎓 סמינר' : isProduct ? '🛒 מוצר' : '📢 הודעה'}
                            </span>
                            {item.price != null && (
                              <span className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                                ₪{item.price}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-gray-800">{item.title}</p>
                          {item.event_date && (
                            <div className="mt-2 flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                              <span className="text-lg">📅</span>
                              <div>
                                <p className="text-sm font-semibold text-purple-800">
                                  {new Date(item.event_date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-purple-600">
                                  {new Date(item.event_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )}
                          {item.content && (
                            <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{item.content}</p>
                          )}
                          {(isProduct || isSeminar) && (
                            <button className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition ${
                              isProduct ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}>
                              {isProduct ? '🛒 לפרטים ורכישה' : '📝 לפרטים והרשמה'}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
