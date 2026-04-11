import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ClassSchedule from './ClassSchedule'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const TABS = [
  { id: 'home', label: '🏠 דף הבית' },
  { id: 'schedule', label: '📅 לוח שיעורים' },
]

// Find the next occurrence of a recurring class (day_of_week + start_time)
// Returns { daysUntil, displayDay, displayTime }
function resolveNextOccurrence(cls) {
  const now = new Date()
  const todayDow = now.getDay()
  const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
  const classDow = typeof cls.day_of_week === 'number' ? cls.day_of_week : 0

  let daysUntil = (classDow - todayDow + 7) % 7
  // If it's today but the class already passed, push to next week
  if (daysUntil === 0) {
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const classMins = h * 60 + m
    if (classMins <= nowMins) daysUntil = 7
  }

  const nextDate = new Date(now)
  nextDate.setDate(now.getDate() + daysUntil)
  nextDate.setHours(h, m, 0, 0)

  const displayDay = daysUntil === 0 ? 'היום' : daysUntil === 1 ? 'מחר' : `יום ${DAYS_HE[classDow]}`
  const displayTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  return { daysUntil, displayDay, displayTime, nextDate }
}

export default function AthleteDashboard({ profile }) {
  const [tab, setTab] = useState('home')
  const [member, setMember] = useState(null)
  const [nextClass, setNextClass] = useState(null)
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [weeklyCheckins, setWeeklyCheckins] = useState(0)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkinLoading, setCheckinLoading] = useState(false)

  const limit = SUBSCRIPTION_LIMITS[profile?.subscription_type] ?? 2

  useEffect(() => {
    if (profile?.id) {
      fetchMemberAndNextClass()
      fetchAnnouncements()
      fetchWeeklyCheckins()
    }
  }, [profile])

  async function fetchMemberAndNextClass() {
    setLoading(true)

    // 1. Get athlete's member record to read group_ids + branch_id
    const { data: memberData, error: memberErr } = await supabase
      .from('members')
      .select('group_ids, group_id, branch_id, subscription_type, membership_type')
      .eq('email', profile.email)
      .maybeSingle()

    if (memberErr) console.error('fetchMember error:', memberErr)
    setMember(memberData || null)

    const groupIds = memberData?.group_ids || (memberData?.group_id ? [memberData.group_id] : [])
    const branchId = memberData?.branch_id

    if (groupIds.length === 0) {
      setNextClass(null)
      setLoading(false)
      return
    }

    // 2. Fetch classes filtered by group_ids AND branch_id
    let query = supabase.from('classes').select('*').in('id', groupIds)
    if (branchId) query = query.eq('branch_id', branchId)
    const { data: classes, error: classErr } = await query

    if (classErr) console.error('fetchClasses error:', classErr)

    if (!classes || classes.length === 0) {
      setNextClass(null)
      setLoading(false)
      return
    }

    // 3. Find the soonest next occurrence across all classes
    const withNext = classes.map(cls => ({ cls, ...resolveNextOccurrence(cls) }))
    withNext.sort((a, b) => a.daysUntil - b.daysUntil || a.nextDate - b.nextDate)
    const soonest = withNext[0]

    setNextClass({ ...soonest.cls, displayDay: soonest.displayDay, displayTime: soonest.displayTime })

    // 4. Check if already checked in today for this class
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999)
    const { data: chk } = await supabase
      .from('checkins')
      .select('id')
      .eq('class_id', soonest.cls.id)
      .eq('athlete_id', profile.id)
      .gte('checked_in_at', todayStart.toISOString())
      .lte('checked_in_at', todayEnd.toISOString())
      .maybeSingle()

    setIsCheckedIn(!!chk)
    setLoading(false)
  }

  async function fetchWeeklyCheckins() {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', profile.id)
      .gte('checked_in_at', weekStart.toISOString())

    setWeeklyCheckins(count || 0)
  }

  async function fetchAnnouncements() {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    setAnnouncements(data || [])
  }

  async function handleCheckin() {
    if (!nextClass) return
    if (weeklyCheckins >= limit && !isCheckedIn) {
      alert(`הגעת למגבלת ${limit} אימונים השבוע`)
      return
    }
    setCheckinLoading(true)
    if (isCheckedIn) {
      await supabase.from('checkins').delete()
        .eq('class_id', nextClass.id).eq('athlete_id', profile.id)
      setIsCheckedIn(false)
      setWeeklyCheckins(p => p - 1)
    } else {
      await supabase.from('checkins').insert({ class_id: nextClass.id, athlete_id: profile.id })
      setIsCheckedIn(true)
      setWeeklyCheckins(p => p + 1)
    }
    setCheckinLoading(false)
  }

  const usagePercent = limit === Infinity ? 0 : Math.min((weeklyCheckins / limit) * 100, 100)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      {/* Tab navigation */}
      <nav className="bg-white border-b flex">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'text-emerald-700 border-b-2 border-emerald-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-4 max-w-lg mx-auto">
        {/* Home tab */}
        <div className={tab === 'home' ? 'space-y-4' : 'hidden'}>
          {/* Subscription card */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                מנוי: {SUBSCRIPTION_LABELS[profile?.subscription_type] || '—'}
              </span>
              <span className="text-sm text-gray-500">
                {limit === Infinity ? 'ללא הגבלה' : `${weeklyCheckins}/${limit} השבוע`}
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

          {/* Next class card */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">האימון הבא שלך</h2>
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-4">טוען...</p>
            ) : !nextClass ? (
              <div className="text-center py-6 text-gray-400">
                <div className="text-3xl mb-2">📅</div>
                <p className="text-sm">אין אימונים קרובים</p>
                <button
                  onClick={() => setTab('schedule')}
                  className="mt-3 text-sm text-emerald-600 hover:underline"
                >
                  הירשם לשיעורים בלוח השיעורים
                </button>
              </div>
            ) : (
              <div>
                <p className="text-lg font-semibold text-gray-800">{nextClass.name || nextClass.title}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {nextClass.displayDay} · {nextClass.displayTime}
                </p>
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
                      isCheckedIn
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {checkinLoading ? '...' : isCheckedIn ? "✓ בוצע צ'ק-אין — ביטול?" : "צ'ק-אין לאימון"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Announcements */}
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
                        {/* Badge row */}
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

                        {/* Seminar date — prominent */}
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

                        {/* CTA for product / seminar */}
                        {(isProduct || isSeminar) && (
                          <button className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition ${
                            isProduct
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
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
        </div>

        {/* Schedule tab */}
        <div className={tab === 'schedule' ? '' : 'hidden'}>
          <ClassSchedule profile={profile} member={member} />
        </div>
      </main>
    </div>
  )
}
