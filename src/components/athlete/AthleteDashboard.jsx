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

function ScheduleTab({ member, limit, registrations, onRegister, branchesMap }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBranch, setActiveBranch] = useState('all')

  const branchIds = member?.branch_ids?.length
    ? member.branch_ids
    : member?.branch_id ? [member.branch_id] : []

  useEffect(() => {
    async function load() {
      try {
        if (branchIds.length === 0) { setClasses([]); return }
        const { data, error } = await supabase.from('classes')
          .select('*, branches(name)').in('branch_id', branchIds)
          .order('day_of_week').order('start_time')
        if (error) console.error('ScheduleTab classes error:', error)
        setClasses(data || [])
      } catch (e) {
        console.error('ScheduleTab load threw:', e)
        setClasses([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [member?.id, member?.branch_ids?.join(','), member?.branch_id])

  const today = new Date()
  const todayDow = today.getDay()

  if (loading) return <p className="text-center text-gray-400 py-8">טוען...</p>

  if (branchIds.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-2">🥋</div>
        <p className="font-semibold text-gray-600">לא משויכת לסניף עדיין</p>
        <p className="text-xs mt-2">פנה למאמן לשיוך סניף</p>
      </div>
    )
  }

  // סינון לפי סניף פעיל
  const filteredClasses = activeBranch === 'all'
    ? classes
    : classes.filter(c => c.branch_id === activeBranch)

  const todayClasses = filteredClasses
    .filter(c => c.day_of_week === todayDow)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  const allHours = [...new Set(filteredClasses.map(c => c.start_time?.slice(0,5)))].filter(Boolean).sort()
  const daysOrder = [0, 1, 2, 3, 4, 5, 6]
  function getClassesAt(dow, time) {
    return filteredClasses.filter(c => c.day_of_week === dow && c.start_time?.slice(0,5) === time)
  }

  // תאריכים לשבוע הנוכחי (לתצוגת "לוח שנה")
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekDates = daysOrder.map(dow => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dow)
    return d
  })

  return (
    <div className="space-y-4">
      {/* Branch switcher */}
      {branchIds.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActiveBranch('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              activeBranch === 'all'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            כל הסניפים
          </button>
          {branchIds.map(bid => (
            <button key={bid} onClick={() => setActiveBranch(bid)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                activeBranch === bid
                  ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              📍 {branchesMap?.[bid] || 'סניף'}
            </button>
          ))}
        </div>
      )}

      {/* שיעורי היום למעלה */}
      {todayClasses.length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-red-950 text-white rounded-2xl p-4 shadow-lg border border-red-900/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🥋</span>
            <h3 className="font-black text-base tracking-wide">האימונים שלי היום</h3>
            <span className="mr-auto text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">
              {today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
            </span>
          </div>
          <div className="space-y-2">
            {todayClasses.map(cls => {
              const isReg = registrations.has(cls.id)
              const atRegLimit = !isReg && registrations.size >= limit && limit !== Infinity
              return (
                <button key={cls.id} onClick={() => onRegister(cls)} disabled={atRegLimit}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition ${
                    isReg
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                      : atRegLimit
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/20'
                  }`}>
                  <div className="text-right">
                    <p className="font-bold text-sm">{cls.name}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      🕐 {cls.start_time?.slice(0,5)}
                      {cls.branches?.name && ` · 📍 ${cls.branches.name}`}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${
                    isReg ? 'bg-white text-red-700' : atRegLimit ? 'bg-gray-600' : 'bg-red-600 text-white'
                  }`}>
                    {isReg ? '✓ רשום' : atRegLimit ? 'מלא' : 'הירשם'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {filteredClasses.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📅</div><p>אין שיעורים בסניף זה</p></div>
      ) : (
        <>
          {/* לוח שבועי מלא */}
          <div className="flex items-center justify-between">
            <h2 className="font-black text-gray-800 text-lg">לוח שיעורים שבועי</h2>
            <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-bold">
              {registrations.size}/{limit === Infinity ? '∞' : limit} השבוע
            </span>
          </div>

          {/* שורת תאריכי השבוע (כמו לוח שנה) */}
          <div className="grid grid-cols-7 gap-1">
            {daysOrder.map(dow => {
              const d = weekDates[dow]
              const isToday = dow === todayDow
              return (
                <div key={dow} className={`rounded-xl p-2 text-center ${
                  isToday
                    ? 'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg ring-2 ring-red-400'
                    : 'bg-white border border-gray-200 text-gray-500'
                }`}>
                  <p className={`text-[9px] font-semibold ${isToday ? 'text-red-100' : 'text-gray-400'}`}>
                    {DAYS_HE[dow].slice(0, 2)}
                  </p>
                  <p className={`text-lg font-black leading-none mt-0.5 ${isToday ? 'text-white' : 'text-gray-800'}`}>
                    {d.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs border-collapse" dir="rtl">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 px-2 font-semibold text-gray-600 border-b">שעה</th>
                  {daysOrder.map(dow => (
                    <th key={dow} className={`py-2 px-2 font-semibold border-b min-w-[110px] ${
                      dow === todayDow ? 'bg-red-50 text-red-800' : 'text-gray-600'
                    }`}>
                      {DAYS_HE[dow]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allHours.map(time => (
                  <tr key={time} className="border-b last:border-0">
                    <td className="py-2 px-2 font-bold text-gray-700 bg-gray-50 border-l whitespace-nowrap">{time}</td>
                    {daysOrder.map(dow => {
                      const dayClasses = getClassesAt(dow, time)
                      if (dayClasses.length === 0) return <td key={dow} className={`border-l ${dow === todayDow ? 'bg-red-50/20' : ''}`}></td>
                      return (
                        <td key={dow} className={`p-1 border-l align-top ${dow === todayDow ? 'bg-red-50/30' : ''}`}>
                          {dayClasses.map(cls => {
                            const isReg = registrations.has(cls.id)
                            const atRegLimit = !isReg && registrations.size >= limit && limit !== Infinity
                            return (
                              <button key={cls.id} onClick={() => onRegister(cls)} disabled={atRegLimit}
                                className={`w-full text-right p-2 rounded-lg mb-1 transition disabled:opacity-40 ${
                                  isReg ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm'
                                  : atRegLimit ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                }`}>
                                <div className="font-bold leading-tight text-[11px]">{cls.name}</div>
                                {cls.branches?.name && <div className={`text-[9px] mt-0.5 ${isReg ? 'text-red-100' : 'text-gray-400'}`}>{cls.branches.name}</div>}
                                <div className={`text-[9px] mt-1 font-bold ${isReg ? 'text-white' : atRegLimit ? 'text-gray-400' : 'text-red-600'}`}>
                                  {isReg ? '✓ רשום' : atRegLimit ? 'מלא' : '+ הירשם'}
                                </div>
                              </button>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function AnnouncementsTab({ announcements, profile }) {
  const [ordered, setOrdered] = useState(new Set())
  const [orderingId, setOrderingId] = useState(null)
  const general = announcements.filter(a => a.type === 'general' || a.type === 'announcement')
  const seminars = announcements.filter(a => a.type === 'seminar')

  async function handleOrder(item) {
    if (ordered.has(item.id)) return
    setOrderingId(item.id)
    const { error } = await supabase.from('product_requests').insert({
      product_name: item.title,
      athlete_id: profile?.id || null,
      athlete_name: profile?.full_name || 'לא ידוע',
      status: 'pending',
    })
    if (error) { console.error('order error:', error); alert('שגיאה: ' + (error.message || error.code || 'לא ידוע')) }
    else { setOrdered(prev => new Set([...prev, item.id])) }
    setOrderingId(null)
  }

  if (general.length === 0 && seminars.length === 0) {
    return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הודעות כרגע</p></div>
  }

  return (
    <div className="space-y-6">
      {general.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800 text-lg">הודעות</h2>
          {general.map(item => (
            <div key={item.id} className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start shadow-sm">
              <span className="text-2xl flex-shrink-0">📢</span>
              <div className="min-w-0">
                <p className="font-bold text-amber-900 text-sm leading-snug">{item.title}</p>
                {item.content && <p className="text-xs text-amber-800 mt-1 leading-relaxed">{item.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {seminars.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🎓 סמינרים ואירועים</h3>
          <div className="space-y-3">
            {seminars.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-gray-50" />}
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
    </div>
  )
}

function ShopTab({ profile, allAnnouncements }) {
  const [ordered, setOrdered] = useState(new Set())
  const [orderingId, setOrderingId] = useState(null)
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
    if (error) { console.error('order error:', error); alert('שגיאה: ' + (error.message || error.code || 'לא ידוע')) }
    else { setOrdered(prev => new Set([...prev, item.id])) }
    setOrderingId(null)
  }

  if (products.length === 0) {
    return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🛍️</div><p>אין מוצרים בחנות כרגע</p></div>
  }

  return (
    <div className="space-y-6">
      {products.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🛒 מוצרים</h3>
          <div className="space-y-3">
            {products.map(item => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-gray-50" />}
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

function ProfileTab({ profile, member }) {
  const [newEmail, setNewEmail] = useState('')
  const [requestedSub, setRequestedSub] = useState(member?.subscription_type || '2x_week')
  const [subNote, setSubNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])

  const currentSub = member?.subscription_type || profile?.subscription_type || '—'

  useEffect(() => {
    if (profile?.id) loadPending()
  }, [profile?.id])

  async function loadPending() {
    const { data } = await supabase.from('profile_change_requests').select('*')
      .eq('athlete_id', profile.id).eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingRequests(data || [])
  }

  async function submitEmailChange() {
    if (!newEmail || newEmail === profile.email) { alert('הזן כתובת מייל חדשה'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: profile.full_name,
      change_type: 'email',
      current_value: profile.email,
      requested_value: newEmail,
    })
    setSaving(false)
    if (error) { alert('שגיאה: ' + error.message); return }
    alert('בקשת שינוי המייל נשלחה למנהל')
    setNewEmail('')
    loadPending()
  }

  async function submitSubChange() {
    if (requestedSub === currentSub) { alert('בחר מנוי אחר'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: profile.full_name,
      change_type: 'subscription',
      current_value: currentSub,
      requested_value: requestedSub,
      note: subNote,
    })
    setSaving(false)
    if (error) { alert('שגיאה: ' + error.message); return }
    alert('בקשת שינוי המנוי נשלחה למנהל')
    setSubNote('')
    loadPending()
  }

  const hasPendingEmail = pendingRequests.some(r => r.change_type === 'email')
  const hasPendingSub = pendingRequests.some(r => r.change_type === 'subscription')

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mx-auto mb-3">💪</div>
        <h2 className="text-lg font-bold text-gray-800">{profile?.full_name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{profile?.email}</p>
      </div>

      {/* פרטים לקריאה בלבד */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">פרטים אישיים</h3>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">שם מלא</span>
          <span className="font-semibold text-gray-800">{member?.full_name || profile?.full_name || '—'}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">טלפון</span>
          <span className="font-semibold text-gray-800">{member?.phone || '—'}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">מנוי נוכחי</span>
          <span className="font-semibold text-emerald-700">{SUBSCRIPTION_LABELS[currentSub] || currentSub}</span>
        </div>
        {member?.belt && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">חגורה</span>
            <span className="font-semibold text-gray-800">{member.belt}</span>
          </div>
        )}
        <p className="text-xs text-gray-400 pt-2 border-t">לשינוי שם או טלפון — פנה למאמן</p>
      </div>

      {/* בקשות ממתינות */}
      {pendingRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <h3 className="font-bold text-amber-900 text-sm">⏳ בקשות ממתינות לאישור מנהל</h3>
          {pendingRequests.map(r => (
            <div key={r.id} className="text-xs text-amber-800">
              {r.change_type === 'email' ? '📧 שינוי מייל ל-' : '🎫 שינוי מנוי ל-'}
              <span className="font-semibold">
                {r.change_type === 'subscription' ? (SUBSCRIPTION_LABELS[r.requested_value] || r.requested_value) : r.requested_value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* שינוי מייל */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">שינוי כתובת מייל</h3>
        {hasPendingEmail ? (
          <p className="text-xs text-amber-700">יש בקשה ממתינה — לא ניתן לשלוח בקשה נוספת</p>
        ) : (
          <>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="הזן מייל חדש"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={submitEmailChange} disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
            </button>
          </>
        )}
      </div>

      {/* שינוי מנוי */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">שינוי מנוי / כמות אימונים</h3>
        {hasPendingSub ? (
          <p className="text-xs text-amber-700">יש בקשה ממתינה — לא ניתן לשלוח בקשה נוספת</p>
        ) : (
          <>
            <select value={requestedSub} onChange={e => setRequestedSub(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="2x_week">2× שבוע</option>
              <option value="4x_week">4× שבוע</option>
              <option value="unlimited">ללא הגבלה</option>
            </select>
            <textarea value={subNote} onChange={e => setSubNote(e.target.value)}
              placeholder="הערה (אופציונלי)" rows="2"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
            <button onClick={submitSubChange} disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
            </button>
          </>
        )}
      </div>

      <button onClick={() => supabase.auth.signOut()}
        className="w-full bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-medium text-sm hover:bg-red-100 transition">
        יציאה מהמערכת
      </button>
    </div>
  )
}

function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0,0,0,0)
  return d.toISOString().split('T')[0]
}

export default function AthleteDashboard({ profile }) {
  const [activeTab, setActiveTab]           = useState('schedule')
  const [announcements, setAnnouncements]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [member, setMember]                 = useState(null)
  const [branchesMap, setBranchesMap]       = useState({})
  const [registrations, setRegistrations]   = useState(new Set())

  const subscriptionType = member?.subscription_type || profile?.subscription_type
  const limit = SUBSCRIPTION_LIMITS[subscriptionType] ?? 2
  const announcementsForTab = announcements.filter(a => a.type === 'general' || a.type === 'announcement' || a.type === 'seminar')

  useEffect(() => {
    if (profile?.id) { fetchMyClasses(); fetchAnnouncements(); fetchRegistrations(); fetchBranches() }
  }, [profile])

  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('id, name')
    const map = {}
    ;(data || []).forEach(b => { map[b.id] = b.name })
    setBranchesMap(map)
  }

  async function fetchMyClasses() {
    setLoading(true)
    try {
      console.log('[athlete] profile:', { id: profile?.id, email: profile?.email, role: profile?.role })
      let memberData = null
      if (profile?.id) {
        const r = await supabase.from('members').select('*').eq('id', profile.id).maybeSingle()
        console.log('[athlete] member by id:', { found: !!r.data, error: r.error })
        memberData = r.data
      }
      if (!memberData && profile?.email) {
        const email = profile.email.toLowerCase()
        const r = await supabase.from('members').select('*').eq('email', email).maybeSingle()
        console.log('[athlete] member by email:', { email, found: !!r.data, error: r.error, data: r.data })
        if (r.error) console.error('member fetch by email error:', r.error)
        memberData = r.data
      }
      if (memberData && profile?.id && memberData.id !== profile.id) {
        console.log('[athlete] linking member.id to auth.uid', { memberId: memberData.id, authId: profile.id })
        const { error: linkErr } = await supabase.from('members')
          .update({ id: profile.id })
          .eq('id', memberData.id)
        if (linkErr) console.error('[athlete] link error:', linkErr)
        else memberData = { ...memberData, id: profile.id }
      }
      setMember(memberData || null)
    } catch (e) {
      console.error('fetchMyClasses threw:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAnnouncements() {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    setAnnouncements(data || [])
  }

  async function fetchRegistrations() {
    const { data } = await supabase.from('class_registrations')
      .select('class_id').eq('athlete_id', profile.id).eq('week_start', getWeekStart())
    setRegistrations(new Set((data || []).map(r => r.class_id)))
  }

  async function handleRegister(cls) {
    const isRegistered = registrations.has(cls.id)
    if (!isRegistered && registrations.size >= limit && limit !== Infinity) {
      alert('הגעת למגבלת ' + limit + ' שיעורים שבועיים לפי המנוי שלך'); return
    }
    if (isRegistered) {
      await supabase.from('class_registrations').delete()
        .eq('class_id', cls.id).eq('athlete_id', profile.id).eq('week_start', getWeekStart())
      setRegistrations(p => { const n = new Set(p); n.delete(cls.id); return n })
    } else {
      await supabase.from('class_registrations').insert({
        class_id: cls.id, athlete_id: profile.id, week_start: getWeekStart()
      })
      setRegistrations(p => new Set([...p, cls.id]))
    }
  }

  const memberBranchIds = member?.branch_ids?.length
    ? member.branch_ids
    : member?.branch_id ? [member.branch_id] : []
  const memberBranchNames = memberBranchIds.map(id => branchesMap[id]).filter(Boolean)

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 text-white px-5 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-md">
              <span className="text-xl">🥋</span>
            </div>
            <div>
              <h1 className="font-black text-lg leading-none tracking-wide">TeamPact</h1>
              <p className="text-gray-300 text-xs mt-0.5">שלום, <span className="font-bold text-white">{profile?.full_name}</span></p>
            </div>
          </div>
          {SUBSCRIPTION_LABELS[subscriptionType] && (
            <span className="text-[10px] bg-red-600 text-white px-2 py-1 rounded-full font-bold shadow">
              {SUBSCRIPTION_LABELS[subscriptionType]}
            </span>
          )}
        </div>
        {memberBranchNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {memberBranchNames.map((name, i) => (
              <span key={i} className="text-[10px] bg-white/10 backdrop-blur border border-white/20 text-white px-2.5 py-1 rounded-full font-semibold">
                📍 {name}
              </span>
            ))}
          </div>
        )}
      </header>
      <main className="p-4 max-w-lg mx-auto pb-24">
        {activeTab === 'schedule' && <ScheduleTab member={member} limit={limit} registrations={registrations} onRegister={handleRegister} branchesMap={branchesMap} />}
        {activeTab === 'shop' && <ShopTab profile={profile} allAnnouncements={announcements} />}
        {activeTab === 'announcements' && <AnnouncementsTab announcements={announcementsForTab} profile={profile} />}
        {activeTab === 'profile' && <ProfileTab profile={profile} member={member} />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isTrainer={false} />
    </div>
  )
}
