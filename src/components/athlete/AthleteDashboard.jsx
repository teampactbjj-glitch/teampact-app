import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import BottomNav from '../BottomNav'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const DAYS_HE_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

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
  const [selectedDate, setSelectedDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const selectedBtnRef = useRef(null)
  const didInitialScroll = useRef(false)

  // גלול תמיד אל התאריך הנבחר (כולל "היום")
  useEffect(() => {
    const t = setTimeout(() => {
      selectedBtnRef.current?.scrollIntoView?.({
        inline: 'center',
        block: 'nearest',
        behavior: didInitialScroll.current ? 'smooth' : 'auto',
      })
      didInitialScroll.current = true
    }, 30)
    return () => clearTimeout(t)
  }, [selectedDate])

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

  const today = new Date(); today.setHours(0,0,0,0)

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

  const filteredClasses = activeBranch === 'all'
    ? classes
    : classes.filter(c => c.branch_id === activeBranch)

  const selectedDow = selectedDate.getDay()
  const dayClasses = filteredClasses
    .filter(c => c.day_of_week === selectedDow)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  // סליידר של 90 תאריכים (30 אחורה, 60 קדימה)
  const sliderCells = []
  for (let i = -30; i <= 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i); sliderCells.push(d)
  }
  const isSelected = (d) => d.toDateString() === selectedDate.toDateString()
  const isTodayDate = (d) => d.toDateString() === today.toDateString()

  const dateLabel = (() => {
    const diff = Math.round((selectedDate - today) / 86400000)
    const dayName = `יום ${DAYS_HE[selectedDow]}`
    const dateStr = selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
    if (diff === 0) return `היום · ${dayName} · ${dateStr}`
    if (diff === 1) return `מחר · ${dayName} · ${dateStr}`
    if (diff === -1) return `אתמול · ${dayName} · ${dateStr}`
    return `${dayName} · ${dateStr}`
  })()

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

      {/* כותרת + מונה שבועי */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-black text-gray-800 text-base leading-tight">{dateLabel}</p>
        </div>
        <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-bold whitespace-nowrap">
          {registrations.size}/{limit === Infinity ? '∞' : limit} השבוע
        </span>
      </div>

      {/* סליידר תאריכים אופקי */}
      <div className="bg-white rounded-2xl border shadow-sm p-3 overflow-x-auto" dir="ltr">
        <div className="flex gap-1.5 min-w-max" dir="rtl">
          {sliderCells.map((d, i) => {
            const todayFlag = isTodayDate(d)
            const selected = isSelected(d)
            return (
              <button key={i} onClick={() => setSelectedDate(new Date(d))}
                ref={el => {
                  if (el && selected) selectedBtnRef.current = el
                }}
                className={`flex-shrink-0 rounded-xl transition text-center ${
                  todayFlag
                    ? 'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg ring-4 ring-red-300 scale-110 py-2.5 px-3.5 min-w-[68px]'
                    : selected
                      ? 'bg-gradient-to-br from-gray-800 to-gray-900 text-white shadow-md ring-2 ring-gray-400 py-2 px-3 min-w-[56px]'
                      : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 py-2 px-3 min-w-[56px]'
                }`}>
                <p className={`text-[10px] font-semibold ${todayFlag || selected ? 'opacity-95' : 'text-gray-400'}`}>
                  {DAYS_HE_SHORT[d.getDay()]}
                </p>
                <p className={`font-black leading-none mt-0.5 ${todayFlag ? 'text-2xl' : 'text-lg'}`}>
                  {d.getDate()}
                </p>
                <p className={`text-[9px] mt-0.5 ${todayFlag || selected ? 'opacity-80' : 'text-gray-400'}`}>
                  {d.toLocaleDateString('he-IL', { month: 'short' })}
                </p>
                {todayFlag && <p className="text-[9px] font-black mt-1 bg-white/30 rounded px-1">היום</p>}
              </button>
            )
          })}
        </div>
      </div>

      {/* רשימת שיעורים ליום הנבחר */}
      {dayClasses.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border">
          <div className="text-4xl mb-2">📅</div>
          <p>אין שיעורים ביום {DAYS_HE[selectedDow]}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayClasses.map(cls => {
            const isReg = registrations.has(cls.id)
            const atRegLimit = !isReg && registrations.size >= limit && limit !== Infinity
            return (
              <button key={cls.id} onClick={() => onRegister(cls)} disabled={atRegLimit}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition shadow-sm ${
                  isReg
                    ? 'bg-gradient-to-br from-red-600 to-red-800 text-white'
                    : atRegLimit
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white border border-gray-200 text-gray-800 hover:border-red-400'
                }`}>
                <div className="text-right flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🥋</span>
                    <p className="font-black text-base">{cls.name}</p>
                  </div>
                  <p className={`text-xs mt-1 ${isReg ? 'text-red-100' : 'text-gray-500'}`}>
                    🕐 {cls.start_time?.slice(0,5)}
                    {cls.duration_minutes && ` · ${cls.duration_minutes} דק'`}
                    {cls.branches?.name && ` · 📍 ${cls.branches.name}`}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
                  isReg ? 'bg-white text-red-700' : atRegLimit ? 'bg-gray-200' : 'bg-red-600 text-white'
                }`}>
                  {isReg ? '✓ רשום' : atRegLimit ? 'מלא' : '+ הירשם'}
                </span>
              </button>
            )
          })}
        </div>
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
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const [requestedSub, setRequestedSub] = useState(member?.subscription_type || '2x_week')
  const [subNote, setSubNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])

  async function updatePassword() {
    setPwMsg(null)
    if (!newPassword || newPassword.length < 6) { setPwMsg({ type: 'err', text: 'סיסמה חייבת להכיל לפחות 6 תווים' }); return }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: 'הסיסמאות לא תואמות' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwMsg({ type: 'err', text: error.message }); return }
    setPwMsg({ type: 'ok', text: 'הסיסמה עודכנה בהצלחה' })
    setNewPassword(''); setConfirmPassword('')
  }

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

      {/* שינוי סיסמה */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">שינוי סיסמה</h3>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
          placeholder="סיסמה חדשה (לפחות 6 תווים)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          placeholder="אימות סיסמה"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        {pwMsg && <p className={`text-xs ${pwMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg.text}</p>}
        <button onClick={updatePassword} disabled={pwSaving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {pwSaving ? 'מעדכן...' : 'עדכן סיסמה'}
        </button>
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
