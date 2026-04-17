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

function ScheduleTab({ member, myClasses, checkinMap, weeklyCheckins, limit, loadingCheckin, onCheckin }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const branchIds = member?.branch_ids?.length
        ? member.branch_ids
        : member?.branch_id ? [member.branch_id] : []
      let q = supabase.from('classes').select('*, branches(name)').order('day_of_week').order('start_time')
      if (branchIds.length > 0) q = q.in('branch_id', branchIds)
      const { data } = await q
      setClasses(data || [])
      setLoading(false)
    }
    if (member !== null) load()
  }, [member])

  const todayDow = new Date().getDay()
  const myClassIds = new Set(myClasses.map(c => c.id))
  const byDay = DAYS_HE.reduce((acc, _, idx) => { acc[idx] = classes.filter(c => c.day_of_week === idx); return acc }, {})

  if (loading) return <p className="text-center text-gray-400 py-8">טוען...</p>
  if (classes.length === 0) return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📅</div><p>אין שיעורים בסניפים שלך</p></div>

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-800 text-lg">לוח שיעורים שבועי</h2>
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
                const isMine = myClassIds.has(cls.id)
                const isToday = idx === todayDow
                const isCheckedIn = !!checkinMap[cls.id]
                const atLimit = weeklyCheckins >= limit && !isCheckedIn && limit !== Infinity
                return (
                  <li key={cls.id} className={`px-4 py-3 flex items-center justify-between gap-2 ${isMine ? 'bg-emerald-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 text-sm">{cls.name || cls.title}</p>
                      <p className="text-xs text-gray-400">{cls.branches?.name || ''}{cls.hall ? ' · ' + cls.hall : ''}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-semibold text-emerald-700">{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}</p>
                      <p className="text-xs text-gray-400">עד {String(Math.floor(endMins/60)).padStart(2,'0')}:{String(endMins%60).padStart(2,'0')}</p>
                    </div>
                    {isMine && isToday && (
                      <button onClick={() => onCheckin(cls)} disabled={loadingCheckin === cls.id || atLimit}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40 ${isCheckedIn ? 'bg-green-500' : 'bg-emerald-600'}`}>
                        {loadingCheckin === cls.id ? '...' : isCheckedIn ? '✓' : "צ'ק-אין"}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function AnnouncementsTab({ announcements }) {
  if (announcements.length === 0) return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הודעות כרגע</p></div>
  return (
    <div className="space-y-3">
      <h2 className="font-bold text-gray-800 text-lg">הודעות</h2>
      {announcements.map(item => (
        <div key={item.id} className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start shadow-sm">
          <span className="text-2xl flex-shrink-0">📢</span>
          <div className="min-w-0">
            <p className="font-bold text-amber-900 text-sm leading-snug">{item.title}</p>
            {item.content && <p className="text-xs text-amber-800 mt-1 leading-relaxed">{item.content}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ShopTab({ profile, allAnnouncements }) {
  const [ordered, setOrdered] = useState(new Set())
  const [orderingId, setOrderingId] = useState(null)
  const seminars = allAnnouncements.filter(a => a.type === 'seminar')
  const products = allAnnouncements.filter(a => a.type === 'product')

  async function handleOrder(item) {
    if (ordered.has(item.id)) return
    setOrderingId(item.id)
    const { error } = await supabase.from('product_requests').insert({
      product_name: item.title,
      athlete_id: profile?.id || null,
      athlete_name: profile?.full_name || 'לא ידוע',
      status: 'pending',
    })
    if (error) { console.error('order error:', error); alert('שגיאה בשליחת הבקשה') }
    else { setOrdered(prev => new Set([...prev, item.id])) }
    setOrderingId(null)
  }

  if (seminars.length === 0 && products.length === 0) {
    return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🛍️</div><p>אין פריטים בחנות כרגע</p></div>
  }

  return (
    <div className="space-y-6">
      {seminars.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🎓 סמינרים ואירועים</h3>
          <div className="space-y-3">
            {seminars.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-44 object-cover" />}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">🎓 סמינר</span>
                    {item.event_date && <span className="text-xs text-blue-600 font-medium">{new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</span>}
                  </div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                  {item.price != null && <p className="text-sm font-bold text-emerald-600 mt-2">₪{item.price}</p>}
                  <button onClick={() => handleOrder(item)} disabled={orderingId === item.id || ordered.has(item.id)}
                    className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${ordered.has(item.id) ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {orderingId === item.id ? '...' : ordered.has(item.id) ? '✓ הבקשה נשלחה' : 'לפרטים ורכישה'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🛒 מוצרים</h3>
          <div className="space-y-3">
            {products.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-44 object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{item.title}</p>
                      {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                    </div>
                    {item.price != null && <span className="text-lg font-bold text-emerald-600 flex-shrink-0">₪{item.price}</span>}
                  </div>
                  <button onClick={() => handleOrder(item)} disabled={orderingId === item.id || ordered.has(item.id)}
                    className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${ordered.has(item.id) ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {orderingId === item.id ? '...' : ordered.has(item.id) ? '✓ הבקשה נשלחה' : 'לפרטים ורכישה'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
  const [activeTab, setActiveTab]           = useState('schedule')
  const [myClasses, setMyClasses]           = useState([])
  const [checkinMap, setCheckinMap]         = useState({})
  const [weeklyCheckins, setWeeklyCheckins] = useState(0)
  const [announcements, setAnnouncements]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [loadingCheckin, setLoadingCheckin] = useState(null)
  const [member, setMember]                 = useState(null)

  const limit = SUBSCRIPTION_LIMITS[profile?.subscription_type] ?? 2
  const generalAnnouncements = announcements.filter(a => a.type === 'general' || a.type === 'announcement')

  useEffect(() => {
    if (profile?.id) { fetchMyClasses(); fetchAnnouncements(); fetchWeeklyCheckins() }
  }, [profile])

  async function fetchMyClasses() {
    setLoading(true)
    const { data: memberData } = await supabase.from('members').select('*').eq('id', profile.id).maybeSingle()
    setMember(memberData)
    const groupIds = memberData?.group_ids || (memberData?.group_id ? [memberData.group_id] : [])
    if (groupIds.length === 0) { setMyClasses([]); setLoading(false); return }
    const { data: classes } = await supabase.from('classes').select('*').in('id', groupIds)
    if (!classes || classes.length === 0) { setMyClasses([]); setLoading(false); return }
    const sorted = classes.map(cls => ({ ...cls, ...resolveNextOccurrence(cls) }))
    sorted.sort((a, b) => a.daysUntil - b.daysUntil)
    setMyClasses(sorted)
    await fetchCheckins(classes.map(c => c.id))
    setLoading(false)
  }

  async function fetchCheckins(classIds) {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999)
    const { data } = await supabase.from('checkins').select('class_id')
      .eq('athlete_id', profile.id).in('class_id', classIds)
      .gte('checked_in_at', todayStart.toISOString()).lte('checked_in_at', todayEnd.toISOString())
    const map = {}
    ;(data || []).forEach(c => { map[c.class_id] = true })
    setCheckinMap(map)
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

  async function handleCheckin(cls) {
    if (weeklyCheckins >= limit && !checkinMap[cls.id] && limit !== Infinity) {
      alert(`הגעת למגבלת ${limit} אימונים השבוע`); return
    }
    setLoadingCheckin(cls.id)
    if (checkinMap[cls.id]) {
      await supabase.from('checkins').delete().eq('class_id', cls.id).eq('athlete_id', profile.id)
      setCheckinMap(p => { const n = { ...p }; delete n[cls.id]; return n })
      setWeeklyCheckins(p => p - 1)
    } else {
      await supabase.from('checkins').insert({ class_id: cls.id, athlete_id: profile.id })
      setCheckinMap(p => ({ ...p, [cls.id]: true }))
      setWeeklyCheckins(p => p + 1)
    }
    setLoadingCheckin(null)
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💪</span>
          <div>
            <h1 className="font-bold text-lg leading-none">TeamPact</h1>
            <p className="text-emerald-200 text-xs">שלום, {profile?.full_name}</p>
          </div>
        </div>
      </header>
      <main className="p-4 max-w-lg mx-auto pb-24">
        {loading && activeTab === 'schedule' ? (
          <p className="text-center text-gray-400 py-12">טוען...</p>
        ) : (
          <>
            {activeTab === 'schedule' && <ScheduleTab member={member} myClasses={myClasses} checkinMap={checkinMap} weeklyCheckins={weeklyCheckins} limit={limit} loadingCheckin={loadingCheckin} onCheckin={handleCheckin} />}
            {activeTab === 'shop' && <ShopTab profile={profile} allAnnouncements={announcements} />}
            {activeTab === 'announcements' && <AnnouncementsTab announcements={generalAnnouncements} />}
            {activeTab === 'profile' && <ProfileTab profile={profile} />}
          </>
        )}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isTrainer={false} />
    </div>
  )
}
