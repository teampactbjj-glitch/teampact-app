import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import BottomNav from '../BottomNav'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function resolveNextOccurrence(cls) {
  const now = new Date()
  const todayDow = now.getDay()
  const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
  const classDow = typeof cls.day_of_week === 'number' ? cls.day_of_week : 0
  let daysUntil = (classDow - todayDow + 7) % 7
  if (daysUntil === 0) {
    const nowMins = now.getHours() * 60 + now.getMinutes()
    if ((h * 60 + m) <= nowMins) daysUntil = 7
  }
  const nextDate = new Date(now)
  nextDate.setDate(now.getDate() + daysUntil)
  nextDate.setHours(h, m, 0, 0)
  const displayDay = daysUntil === 0 ? 'היום' : daysUntil === 1 ? 'מחר' : `יום ${DAYS_HE[classDow]}`
  const displayTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  return { daysUntil, displayDay, displayTime, nextDate }
}

function HomeTab({ profile, nextClass, isCheckedIn, weeklyCheckins, limit, checkinLoading, onCheckin, generalAnnouncements }) {
  const usagePercent = limit === Infinity ? 0 : Math.min((weeklyCheckins / limit) * 100, 100)
  return (
    <div className="space-y-4">
      {generalAnnouncements.length > 0 && (
        <div className="space-y-2">
          {generalAnnouncements.map(item => (
            <div key={item.id} className="bg-yellow-50 border-r-4 border-yellow-400 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-xl mt-0.5">📢</span>
              <div>
                <p className="font-semibold text-yellow-900 text-sm">{item.title}</p>
                {item.content && <p className="text-xs text-yellow-700 mt-0.5">{item.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">מנוי: {SUBSCRIPTION_LABELS[profile?.subscription_type] || '—'}</span>
          <span className="text-sm text-gray-500">{limit === Infinity ? 'ללא הגבלה' : `${weeklyCheckins}/${limit} השבוע`}</span>
        </div>
        {limit !== Infinity && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${usagePercent}%` }} />
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">האימון הבא שלך</h2>
        {!nextClass ? (
          <div className="text-center py-6 text-gray-400"><div className="text-3xl mb-2">📅</div><p className="text-sm">אין אימונים קרובים</p></div>
        ) : (
          <div>
            <p className="text-lg font-semibold text-gray-800">{nextClass.name || nextClass.title}</p>
            <p className="text-sm text-gray-500 mt-1">{nextClass.displayDay} · {nextClass.displayTime}</p>
            {nextClass.duration_minutes && <p className="text-xs text-gray-400">{nextClass.duration_minutes} דקות</p>}
            <button onClick={onCheckin} disabled={checkinLoading || (weeklyCheckins >= limit && !isCheckedIn && limit !== Infinity)}
              className={`mt-4 w-full py-3 rounded-xl font-semibold text-white transition disabled:opacity-50 ${isCheckedIn ? 'bg-green-500 hover:bg-green-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {checkinLoading ? '...' : isCheckedIn ? "✓ בוצע צ'ק-אין — ביטול?" : "צ'ק-אין לאימון"}
            </button>
            {weeklyCheckins >= limit && !isCheckedIn && limit !== Infinity && (
              <p className="text-xs text-red-500 text-center mt-2">הגעת למגבלת האימונים השבועית</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ScheduleTab({ generalAnnouncements }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('classes').select('*').order('day_of_week').order('start_time')
      .then(({ data }) => { setClasses(data || []); setLoading(false) })
  }, [])
  const byDay = DAYS_HE.reduce((acc, _, idx) => { acc[idx] = classes.filter(c => c.day_of_week === idx); return acc }, {})
  return (
    <div className="space-y-4">
      {generalAnnouncements.length > 0 && (
        <div className="space-y-2">
          {generalAnnouncements.map(item => (
            <div key={item.id} className="bg-yellow-50 border-r-4 border-yellow-400 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-xl mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold text-yellow-900 text-sm">{item.title}</p>
                {item.content && <p className="text-xs text-yellow-700 mt-0.5">{item.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {loading ? <p className="text-center text-gray-400 py-8">טוען...</p> : (
        <div className="space-y-4">
          {DAYS_HE.map((dayName, idx) => {
            const dayCls = byDay[idx]
            if (!dayCls || dayCls.length === 0) return null
            return (
              <div key={idx} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b px-4 py-2"><h3 className="font-bold text-gray-700 text-sm">יום {dayName}</h3></div>
                <ul className="divide-y">
                  {dayCls.map(cls => {
                    const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
                    const endMins = h * 60 + m + (cls.duration_minutes || 60)
                    return (
                      <li key={cls.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{cls.name || cls.title}</p>
                          {cls.coach && <p className="text-xs text-gray-400">{cls.coach}</p>}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-emerald-700">{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}</p>
                          <p className="text-xs text-gray-400">עד {String(Math.floor(endMins/60)).padStart(2,'0')}:{String(endMins%60).padStart(2,'0')}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ShopTab({ announcements }) {
  const products = announcements.filter(a => a.type === 'product')
  const seminars = announcements.filter(a => a.type === 'seminar')
  return (
    <div className="space-y-6">
      {seminars.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🎓 סמינרים ואירועים</h3>
          <div className="space-y-3">
            {seminars.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">🎓 סמינר</span>
                  {item.event_date && <span className="text-xs text-blue-600 font-medium">{new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <p className="font-semibold text-gray-800">{item.title}</p>
                {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                {item.price != null && <p className="text-sm font-bold text-emerald-600 mt-2">₪{item.price}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🛒 ציוד ומוצרים</h3>
          <div className="space-y-3">
            {products.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{item.title}</p>
                    {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                  </div>
                  {item.price != null && <span className="text-lg font-bold text-emerald-600 mr-3">₪{item.price}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {products.length === 0 && seminars.length === 0 && (
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🛍️</div><p>אין פריטים בחנות כרגע</p></div>
      )}
    </div>
  )
}

function ProfileTab({ profile }) {
  const [memberInfo, setMemberInfo] = useState(null)
  useEffect(() => {
    if (profile?.id) {
      supabase.from('members').select('belt, grade, subscription_type').eq('id', profile.id).maybeSingle()
        .then(({ data }) => setMemberInfo(data))
    }
  }, [profile])
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mx-auto mb-3">💪</div>
        <h2 className="text-lg font-bold text-gray-800">{profile?.full_name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{profile?.email}</p>
      </div>
      {memberInfo && (
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
          {memberInfo.belt && <div className="flex justify-between items-center"><span className="text-sm text-gray-500">חגורה</span><span className="text-sm font-semibold text-gray-800">{memberInfo.belt}</span></div>}
          {memberInfo.subscription_type && <div className="flex justify-between items-center"><span className="text-sm text-gray-500">מנוי</span><span className="text-sm font-semibold text-gray-800">{SUBSCRIPTION_LABELS[memberInfo.subscription_type] || memberInfo.subscription_type}</span></div>}
        </div>
      )}
      <button onClick={() => supabase.auth.signOut()} className="w-full bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-medium text-sm hover:bg-red-100 transition">
        יציאה מהמערכת
      </button>
    </div>
  )
}

export default function AthleteDashboard({ profile }) {
  const [activeTab, setActiveTab]           = useState('home')
  const [nextClass, setNextClass]           = useState(null)
  const [isCheckedIn, setIsCheckedIn]       = useState(false)
  const [weeklyCheckins, setWeeklyCheckins] = useState(0)
  const [announcements, setAnnouncements]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [checkinLoading, setCheckinLoading] = useState(false)

  const limit = SUBSCRIPTION_LIMITS[profile?.subscription_type] ?? 2
  const generalAnnouncements = announcements.filter(a => a.type === 'general' || a.type === 'announcement')

  useEffect(() => {
    if (profile?.id) { fetchNextClass(); fetchAnnouncements(); fetchWeeklyCheckins() }
  }, [profile])

  async function fetchNextClass() {
    setLoading(true)
    const { data: member } = await supabase.from('members').select('group_ids, group_id').eq('id', profile.id).maybeSingle()
    const groupIds = member?.group_ids || (member?.group_id ? [member.group_id] : [])
    if (groupIds.length === 0) { setNextClass(null); setLoading(false); return }
    const { data: classes } = await supabase.from('classes').select('*').in('id', groupIds)
    if (!classes || classes.length === 0) { setNextClass(null); setLoading(false); return }
    const withNext = classes.map(cls => ({ cls, ...resolveNextOccurrence(cls) }))
    withNext.sort((a, b) => a.daysUntil - b.daysUntil || a.nextDate - b.nextDate)
    const soonest = withNext[0]
    setNextClass({ ...soonest.cls, displayDay: soonest.displayDay, displayTime: soonest.displayTime })
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999)
    const { data: chk } = await supabase.from('checkins').select('id')
      .eq('class_id', soonest.cls.id).eq('athlete_id', profile.id)
      .gte('checked_in_at', todayStart.toISOString()).lte('checked_in_at', todayEnd.toISOString()).maybeSingle()
    setIsCheckedIn(!!chk)
    setLoading(false)
  }

  async function fetchWeeklyCheckins() {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0)
    const { count } = await supabase.from('checkins').select('id', { count: 'exact', head: true })
      .eq('athlete_id', profile.id).gte('checked_in_at', weekStart.toISOString())
    setWeeklyCheckins(count || 0)
  }

  async function fetchAnnouncements() {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    setAnnouncements(data || [])
  }

  async function handleCheckin() {
    if (!nextClass) return
    if (weeklyCheckins >= limit && !isCheckedIn) { alert(`הגעת למגבלת ${limit} אימונים השבוע`); return }
    setCheckinLoading(true)
    if (isCheckedIn) {
      await supabase.from('checkins').delete().eq('class_id', nextClass.id).eq('athlete_id', profile.id)
      setIsCheckedIn(false); setWeeklyCheckins(p => p - 1)
    } else {
      await supabase.from('checkins').insert({ class_id: nextClass.id, athlete_id: profile.id })
      setIsCheckedIn(true); setWeeklyCheckins(p => p + 1)
    }
    setCheckinLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🥋</span>
          <div>
            <h1 className="font-bold text-lg leading-none">TeamPact</h1>
            <p className="text-emerald-200 text-xs">שלום, {profile?.full_name}</p>
          </div>
        </div>
      </header>
      <main className="p-4 max-w-lg mx-auto pb-24">
        {loading && activeTab === 'home' ? (
          <p className="text-center text-gray-400 py-12">טוען...</p>
        ) : (
          <>
            {activeTab === 'home'     && <HomeTab profile={profile} nextClass={nextClass} isCheckedIn={isCheckedIn} weeklyCheckins={weeklyCheckins} limit={limit} checkinLoading={checkinLoading} onCheckin={handleCheckin} generalAnnouncements={generalAnnouncements} />}
            {activeTab === 'schedule' && <ScheduleTab generalAnnouncements={generalAnnouncements} />}
            {activeTab === 'shop'     && <ShopTab announcements={announcements} />}
            {activeTab === 'profile'  && <ProfileTab profile={profile} />}
          </>
        )}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isTrainer={false} />
    </div>
  )
}
