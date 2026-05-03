import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import BottomNav from '../BottomNav'
import InstallBanner from '../InstallBanner'
import EnablePushBanner from '../EnablePushBanner'
import { isStandalone } from '../../lib/platform'
import { notifyPush } from '../../lib/notifyPush'
import { allTrainerUserIds } from '../../lib/notifyTargets'
import ProductDetail from './ProductDetail'
import { useToast, useConfirm } from '../a11y'

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

// האם כעת מותר להירשם לשבוע הבא?
// מאז שהלוז פתוח לשבועיים קדימה — הרישום פתוח תמיד גם לשבוע הבא.
// (בעבר הוגבל ליום שישי 06:00 ואילך, הוסר לבקשת בעל המערכת.)
function isNextWeekRegistrationOpen(now = new Date()) {
  return true
}

function ScheduleTab({ member, limit, registrations, registrationsNext, onRegister, branchesMap }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBranch, setActiveBranch] = useState('all')
  // weekMode כעת נגזר מ-selectedDate (אין יותר טאב יד-ידני). אם אין תאריך נבחר — current.
  const nextWeekOpen = isNextWeekRegistrationOpen()
  // חישוב המונה האפקטיבי כאן — איפה ש-classes זמין בסקופ. (בהורה הוא לא היה זמין
  // כי הוא נטען בתוך הקומפוננט הזה.) המונה לא כולל מזרן פתוח/ספארינג שאינם נספרים במכסה.
  const computeCount = (regSet) => [...regSet].filter(id => {
    const cls = classes.find(c => c.id === id)
    return cls && !isOpenMatClass(cls)
  }).length
  const effectiveCount = computeCount(registrations)
  const effectiveCountNext = computeCount(registrationsNext)
  // selectedDate=null במצב התחלתי — מציגים רק "השיעורים שנרשמתי אליהם"
  // רק כשהמתאמן לוחץ על תאריך בסלייד — מוצג פירוט השיעורים של אותו יום
  const [selectedDate, setSelectedDate] = useState(null)
  const todayBtnRef = useRef(null)
  const selectedBtnRef = useRef(null)
  const sliderContainerRef = useRef(null)
  const didInitialScroll = useRef(false)

  // סליידר — לולאת ניסיונות שעומדת בעין מול re-renders (כמו בתצוגת המאמן)
  // מרכז את "היום" בהתחלה; מרכז את התאריך הנבחר כשהמשתמש לוחץ
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 20
    const tick = () => {
      if (cancelled) return
      attempts++
      const target = selectedDate ? selectedBtnRef.current : todayBtnRef.current
      const container = sliderContainerRef.current
      if (target && container) {
        try {
          target.scrollIntoView({
            block: 'nearest',
            inline: 'center',
            behavior: didInitialScroll.current && attempts > 1 ? 'smooth' : 'auto',
          })
          didInitialScroll.current = true
        } catch {
          const btnRect = target.getBoundingClientRect()
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

  const allMemberBranchIds = member?.branch_ids?.length
    ? member.branch_ids
    : member?.branch_id ? [member.branch_id] : []
  // סינון סניפים מוסתרים — מסתמך על branchesMap שכולל רק סניפים גלויים
  const branchIds = Object.keys(branchesMap || {}).length > 0
    ? allMemberBranchIds.filter(id => branchesMap[id])
    : allMemberBranchIds

  useEffect(() => {
    async function load() {
      try {
        if (branchIds.length === 0) { setClasses([]); return }
        const { data, error } = await supabase.from('classes')
          .select('*, branches!inner(name, hidden)')
          .in('branch_id', branchIds)
          .eq('branches.hidden', false)
          .or('status.eq.approved,status.is.null')
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
  }, [member?.id, member?.branch_ids?.join(','), member?.branch_id, Object.keys(branchesMap || {}).join(',')])

  const today = new Date(); today.setHours(0,0,0,0)
  // weekMode נגזר אוטומטית מהתאריך הנבחר. אין טאב ידני — המשתמש פשוט לוחץ על תאריך
  // בסטריפ הרציף (21 ימים), והמערכת זוכרת לאיזה שבוע השיעור משויך לצורך הרישום ומגבלת המנוי.
  const weekMode = (() => {
    if (!selectedDate) return 'current'
    const ws = new Date(today); ws.setDate(today.getDate() - today.getDay())
    const wsNext = new Date(ws); wsNext.setDate(ws.getDate() + 7)
    return selectedDate >= wsNext ? 'next' : 'current'
  })()
  // referenceDate משמש לחישוב הופעות שיעורים בשבוע הרלוונטי
  const referenceDate = (() => {
    if (weekMode !== 'next') return today
    const d = new Date(today)
    d.setDate(today.getDate() + (7 - today.getDay()))
    return d
  })()
  // האם הצגה זו היא של השבוע הבא (לא היום הנוכחי)
  const isNextWeekView = weekMode === 'next'
  // קבוצת הרישומים הרלוונטית לתצוגה הנוכחית
  const activeRegistrations = isNextWeekView ? registrationsNext : registrations
  // המונה האפקטיבי לתצוגה הנוכחית (לא כולל מזרן פתוח)
  const activeEffectiveCount = isNextWeekView ? effectiveCountNext : effectiveCount

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

  const selectedDow = selectedDate ? selectedDate.getDay() : null
  const dayClasses = selectedDate
    ? filteredClasses
        .filter(c => c.day_of_week === selectedDow)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    : []

  // בדיקה אם תאריך/שעת שיעור בעבר (חוסם הרשמה לעבר)
  const isPastDate = (d) => d < today
  const isPastClass = (cls, d) => {
    if (isPastDate(d)) return true
    if (d.toDateString() === today.toDateString()) {
      const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
      const classTime = new Date(d); classTime.setHours(h, m, 0, 0)
      return classTime <= new Date()
    }
    return false
  }

  // "השיעורים שלי" — השיעורים שהמתאמן נרשם אליהם בשבוע הנוכחי לתצוגה
  const myClasses = [...activeRegistrations]
    .map(cid => filteredClasses.find(c => c.id === cid))
    .filter(Boolean)
    .sort((a, b) => (a.day_of_week - b.day_of_week) || (a.start_time || '').localeCompare(b.start_time || ''))

  // חישוב תאריך ההופעה של שיעור בשבוע המוצג (ליום השבוע שלו)
  const nextOccurrenceThisWeek = (cls) => {
    const d = new Date(referenceDate)
    const dow = cls.day_of_week
    const refDow = referenceDate.getDay()
    const diff = dow - refDow
    d.setDate(referenceDate.getDate() + diff)
    return d
  }

  // סטריפ ימים רציף: 7 ימים אחורה + היום + 13 ימים קדימה = 21 ימים סה"כ.
  // עבר מוצג ב-opacity 0.5 (קריאה בלבד — אי אפשר להירשם לאחור).
  // עתיד מוצג רגיל. שבועות עתידיים מעבר לשבוע הבא — לא מוצגים (להגביל ל-2 שבועות).
  const sliderCells = []
  for (let i = -7; i <= 13; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i); sliderCells.push(d)
  }
  const isSelected = (d) => selectedDate && d.toDateString() === selectedDate.toDateString()
  const isTodayDate = (d) => d.toDateString() === today.toDateString()
  const isPastDateForSlider = (d) => d.getTime() < today.getTime()

  const dateLabel = selectedDate ? (() => {
    const diff = Math.round((selectedDate - today) / 86400000)
    const dayName = `יום ${DAYS_HE[selectedDow]}`
    const dateStr = selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
    if (diff === 0) return `היום · ${dayName} · ${dateStr}`
    if (diff === 1) return `מחר · ${dayName} · ${dateStr}`
    if (diff === -1) return `אתמול · ${dayName} · ${dateStr}`
    return `${dayName} · ${dateStr}`
  })() : null

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
        <div className="min-w-0">
          <p className="font-black text-gray-800 text-base leading-tight">
            {dateLabel || (isNextWeekView ? 'השיעורים שלי לשבוע הבא' : 'השיעורים שלי השבוע')}
          </p>
          {!selectedDate && <p className="text-xs text-gray-400 mt-0.5">לחץ על תאריך בסלייד כדי לראות את השיעורים של אותו יום</p>}
        </div>
        <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-bold whitespace-nowrap">
          {activeEffectiveCount}/{limit === Infinity ? '∞' : limit} {isNextWeekView ? 'בשבוע הבא' : 'השבוע'}
        </span>
      </div>

      {/* סטריפ ימים רציף — pill chips. אדום עמוק להיום, כחול עמוק לבחור, opacity 0.5 לעבר.
          7 ימים אחורה + 14 ימים קדימה. עיצוב בהיר (האתלט) — רקע לבן עם גבול אפור לכרטיסים רגילים. */}
      <div ref={sliderContainerRef} className="overflow-x-auto -mx-1 px-1" dir="ltr" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1.5" dir="rtl" style={{ minWidth: 'max-content' }}>
          {sliderCells.map((d, i) => {
            const todayFlag = isTodayDate(d)
            const selected = isSelected(d)
            const past = isPastDateForSlider(d)
            // עדיפות: היום (אדום מלא) → נבחר (כחול מלא) → רגיל (לבן עם גבול)
            const bgClass = todayFlag
              ? 'bg-red-700 text-white'
              : selected
                ? 'bg-blue-700 text-white'
                : 'bg-white border border-gray-200 text-gray-800'
            const dayColorClass = todayFlag
              ? 'text-red-100'
              : selected
                ? 'text-blue-100'
                : 'text-gray-500'
            const subtitle = todayFlag ? 'היום' : d.toLocaleDateString('he-IL', { month: 'short' })
            return (
              <button key={i} onClick={() => setSelectedDate(new Date(d))}
                ref={el => {
                  if (!el) return
                  if (selected) selectedBtnRef.current = el
                  if (todayFlag) todayBtnRef.current = el
                }}
                className={`flex-shrink-0 rounded-2xl transition py-2.5 px-3 min-w-[64px] text-center shadow-sm ${bgClass} ${past && !selected ? 'opacity-50' : ''}`}>
                <p className={`text-[10px] font-semibold ${dayColorClass}`}>
                  {DAYS_HE[d.getDay()]}
                </p>
                <p className="font-bold leading-none mt-1 text-lg">
                  {d.getDate()}
                </p>
                <p className={`text-[9px] mt-1 font-medium ${dayColorClass}`}>
                  {subtitle}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* פירוט שיעורים ליום הנבחר — מופיע רק אחרי לחיצה על תאריך */}
      {selectedDate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">שיעורים ביום הנבחר</h3>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              ✕ סגור
            </button>
          </div>
          {dayClasses.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border">
              <div className="text-3xl mb-2">📅</div>
              <p className="text-sm">אין שיעורים ביום {DAYS_HE[selectedDow]}</p>
            </div>
          ) : (
            dayClasses.map(cls => {
              const isReg = activeRegistrations.has(cls.id)
              const past = isPastClass(cls, selectedDate)
              const atRegLimit = !isReg && !isOpenMatClass(cls) && activeEffectiveCount >= limit && limit !== Infinity
              const disabled = past || (atRegLimit && !isReg)
              return (
                <button key={cls.id} onClick={() => !past && onRegister(cls, weekMode)} disabled={disabled}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition shadow-sm ${
                    past
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                      : isReg
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
                    <p className={`text-xs mt-1 ${isReg && !past ? 'text-red-100' : 'text-gray-500'}`}>
                      🕐 {cls.start_time?.slice(0,5)}
                      {cls.duration_minutes && ` · ${cls.duration_minutes} דק'`}
                      {cls.branches?.name && ` · 📍 ${cls.branches.name}`}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
                    past ? 'bg-gray-200 text-gray-500'
                    : isReg ? 'bg-white text-red-700'
                    : atRegLimit ? 'bg-gray-200'
                    : 'bg-red-600 text-white'
                  }`}>
                    {past ? 'הסתיים' : isReg ? '✓ רשום' : atRegLimit ? 'מלא' : '+ הירשם'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* השיעורים שלי השבוע — מופיע תמיד */}
      <div className="space-y-2 pt-5 mt-5 border-t-2 border-gray-200">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <span className="text-xl">📌</span>
          השיעורים שנרשמתי אליהם
        </h3>
        {myClasses.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">עדיין לא נרשמת לשיעורים השבוע</p>
            <p className="text-xs mt-1">לחץ על תאריך בסלייד כדי להירשם</p>
          </div>
        ) : (
          myClasses.map(cls => {
            const occurrence = nextOccurrenceThisWeek(cls)
            const past = isPastClass(cls, occurrence)
            const dateStr = occurrence.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
            return (
              <button key={cls.id}
                onClick={() => !past && onRegister(cls, weekMode)}
                disabled={past}
                className={`w-full flex items-center justify-between p-4 rounded-2xl shadow-sm transition ${
                  past
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-br from-red-600 to-red-800 text-white hover:from-red-700 hover:to-red-900'
                }`}>
                <div className="text-right flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🥋</span>
                    <p className="font-black text-base">{cls.name}</p>
                  </div>
                  <p className={`text-xs mt-1 ${past ? 'text-gray-500' : 'text-red-100'}`}>
                    📅 יום {DAYS_HE[cls.day_of_week]} · {dateStr} · 🕐 {cls.start_time?.slice(0,5)}
                    {cls.branches?.name && ` · 📍 ${cls.branches.name}`}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
                  past ? 'bg-gray-200 text-gray-500' : 'bg-white text-red-700'
                }`}>
                  {past ? 'הסתיים' : '✕ ביטול'}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function AnnouncementsTab({ announcements, profile, member }) {
  const toast = useToast()
  const confirm = useConfirm()
  const athleteName = member?.full_name || profile?.full_name || profile?.email || 'לא ידוע'
  const general = announcements.filter(a => a.type === 'general' || a.type === 'announcement')
  const seminars = announcements.filter(a => a.type === 'seminar')
  const storageKey = profile?.id ? `seminars_ordered_${profile.id}` : null
  const [ordered, setOrdered] = useState(() => {
    if (!storageKey) return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const [orderingId, setOrderingId] = useState(null)

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify([...ordered])) } catch {}
  }, [ordered, storageKey])

  useEffect(() => {
    if (!profile?.id || seminars.length === 0) return
    supabase.from('product_requests')
      .select('product_name, status')
      .eq('athlete_id', profile.id)
      .then(({ data }) => {
        const pendingNames = new Set((data || []).filter(r => r.status !== 'done').map(r => r.product_name))
        const ids = seminars.filter(p => pendingNames.has(p.title)).map(p => p.id)
        setOrdered(new Set(ids))
      })
  }, [profile?.id, seminars.length])

  async function handleOrder(item) {
    if (ordered.has(item.id)) {
      const ok = await confirm({ title: 'ביטול הזמנה', message: `לבטל את ההזמנה של "${item.title}"?`, confirmText: 'בטל הזמנה', danger: true })
      if (!ok) return
      setOrderingId(item.id)
      await supabase.from('product_requests')
        .delete()
        .eq('athlete_id', profile?.id)
        .eq('product_name', item.title)
        .eq('status', 'pending')
      setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
      setOrderingId(null)
      return
    }
    setOrderingId(item.id)
    const { error } = await supabase.from('product_requests').insert({
      product_name: item.title,
      athlete_id: profile?.id || null,
      athlete_name: athleteName,
      status: 'pending',
    })
    if (error) { console.error('order error:', error); toast.error('שגיאה: ' + (error.message || error.code || 'לא ידוע')) }
    else {
      setOrdered(prev => new Set([...prev, item.id]))
      // בניית גוף התראה - גם לסמינרים נוסיף מחיר/תיאור אם קיימים
      const bodyParts = [`${athleteName} הזמין: ${item.title}`]
      if (item.price != null) bodyParts.push(`מחיר: ₪${item.price}`)
      if (item.event_date) bodyParts.push(`תאריך: ${new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`)
      allTrainerUserIds()
        .then(ids => notifyPush({
          userIds: ids,
          title: '🎓 הזמנה חדשה לסמינר',
          body: bodyParts.join(' · '),
          url: '/#shop',
          tag: `order:${Date.now()}`,
        }))
        .catch(() => {})
    }
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
                  <button onClick={() => handleOrder(item)} disabled={orderingId === item.id}
                    className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${ordered.has(item.id) ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {orderingId === item.id ? '...' : ordered.has(item.id) ? '✓ הוזמן — יתקבל באימון (לחץ לביטול)' : 'לפרטים ורכישה'}
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

function ShopTab({ profile, member, allAnnouncements }) {
  const toast = useToast()
  const confirm = useConfirm()
  const products = allAnnouncements.filter(a => a.type === 'product')
  const athleteName = member?.full_name || profile?.full_name || profile?.email || 'לא ידוע'
  const storageKey = profile?.id ? `shop_ordered_${profile.id}` : null
  const [ordered, setOrdered] = useState(() => {
    if (!storageKey) return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const [orderingId, setOrderingId] = useState(null)
  const [selectedProductId, setSelectedProductId] = useState(null)  // איזה מוצר פתוח בדף פירוט

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify([...ordered])) } catch {}
  }, [ordered, storageKey])

  useEffect(() => {
    if (!profile?.id || products.length === 0) return
    supabase.from('product_requests')
      .select('product_name, status')
      .eq('athlete_id', profile.id)
      .then(({ data }) => {
        const pendingNames = new Set((data || []).filter(r => r.status !== 'done').map(r => r.product_name))
        const ids = products.filter(p => pendingNames.has(p.title)).map(p => p.id)
        setOrdered(new Set(ids))
      })
  }, [profile?.id, products.length])

  // handleOrder מטפל גם בהזמנה ישירה (מהרשימה) וגם בהזמנה מדף פירוט (עם אפשרות/מידה/צבע/רכיבים)
  async function handleOrder(item, selectedOption = null, selectedSize = null, selectedColor = null, componentSelections = null) {
    if (ordered.has(item.id)) {
      const ok = await confirm({ title: 'ביטול הזמנה', message: `לבטל את ההזמנה של "${item.title}"?`, confirmText: 'בטל הזמנה', danger: true })
      if (!ok) return
      setOrderingId(item.id)
      await supabase.from('product_requests')
        .delete()
        .eq('athlete_id', profile?.id)
        .eq('product_name', item.title)
        .eq('status', 'pending')
      setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
      setOrderingId(null)
      return
    }
    setOrderingId(item.id)
    // בונים את payload - שומרים את האפשרות, המידה והצבע
    const payload = {
      product_name: item.title,
      athlete_id: profile?.id || null,
      athlete_name: athleteName,
      status: 'pending',
    }
    // מידה וצבע כעמודות נפרדות (יש columns ב-DB)
    if (selectedSize) payload.selected_size = selectedSize
    if (selectedColor) payload.selected_color = selectedColor
    // אם יש בחירות פר-רכיב - שומרים מידה/צבע של הרכיב הראשון כ-selected_size/selected_color (תאימות לאחור)
    if (Array.isArray(componentSelections) && componentSelections.length) {
      const first = componentSelections[0] || {}
      if (first.size) payload.selected_size = first.size
      if (first.color) payload.selected_color = first.color
    }
    // מרכיבים notes מפורט - כולל אפשרות, מידה, צבע, רכיבים
    const noteParts = []
    if (selectedOption?.name) noteParts.push(`אפשרות: ${selectedOption.name}`)
    // בחירות פר-רכיב (למשל: מכנס מידה M צבע שחור | רשגארד מידה L צבע לבן)
    if (Array.isArray(componentSelections) && componentSelections.length && Array.isArray(selectedOption?.components)) {
      componentSelections.forEach((sel, i) => {
        const comp = selectedOption.components[i]
        if (!comp) return
        const pieces = [comp.name]
        if (sel?.size) pieces.push(`מידה ${sel.size}`)
        if (sel?.color) pieces.push(`צבע ${sel.color}`)
        if (pieces.length > 1) noteParts.push(pieces.join(' '))
      })
    } else {
      if (selectedSize) noteParts.push(`מידה: ${selectedSize}`)
      if (selectedColor) noteParts.push(`צבע: ${selectedColor}`)
    }
    if (selectedOption?.note) noteParts.push(selectedOption.note)
    if (noteParts.length) payload.notes = noteParts.join(' · ')
    // מחיר
    if (selectedOption?.price != null) {
      payload.unit_price = selectedOption.price
      payload.total_price = selectedOption.price
    } else if (item.price != null) {
      payload.unit_price = item.price
      payload.total_price = item.price
    }
    const { error } = await supabase.from('product_requests').insert(payload)
    if (error) { console.error('order error:', error); toast.error('שגיאה: ' + (error.message || error.code || 'לא ידוע')) }
    else {
      setOrdered(prev => new Set([...prev, item.id]))
      // בניית גוף התראה מפורט - כולל מידה, צבע, אפשרות, רכיבים ומחיר
      const bodyParts = [`${athleteName} הזמין: ${item.title}`]
      if (selectedOption?.name) bodyParts.push(`אפשרות: ${selectedOption.name}`)
      // אם יש רכיבים - מוסיפים אותם עם המידה/צבע לכל אחד
      if (Array.isArray(componentSelections) && componentSelections.length && Array.isArray(selectedOption?.components)) {
        componentSelections.forEach((sel, i) => {
          const comp = selectedOption.components[i]
          if (!comp) return
          const pieces = [comp.name]
          if (sel?.size) pieces.push(sel.size)
          if (sel?.color) pieces.push(sel.color)
          if (pieces.length > 1) bodyParts.push(pieces.join(' '))
        })
      } else {
        if (selectedSize) bodyParts.push(`מידה: ${selectedSize}`)
        if (selectedColor) bodyParts.push(`צבע: ${selectedColor}`)
      }
      // מחיר - מעדיפים את מחיר האפשרות, אחרת מחיר המוצר
      const priceToShow = selectedOption?.price != null ? selectedOption.price : item.price
      if (priceToShow != null) bodyParts.push(`מחיר: ₪${priceToShow}`)
      const finalBody = bodyParts.join(' · ')
      // DEBUG: לוג לקונסול של המתאמן כדי לוודא שהמידה/צבע נשלחים
      console.log('[order] notification payload:', {
        title: '🛒 הזמנה חדשה מהחנות',
        body: finalBody,
        selectedOption,
        selectedSize,
        selectedColor,
        priceToShow,
      })
      allTrainerUserIds()
        .then(ids => notifyPush({
          userIds: ids,
          title: '🛒 הזמנה חדשה מהחנות',
          body: finalBody,
          url: '/#shop',
          tag: `order:${Date.now()}`,
        }))
        .catch(() => {})
    }
    setOrderingId(null)
  }

  if (products.length === 0) {
    return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🛍️</div><p>אין מוצרים בחנות כרגע</p></div>
  }

  // אם יש מוצר נבחר - מציגים את דף הפירוט במקום רשימת המוצרים
  const selectedProduct = selectedProductId ? products.find(p => p.id === selectedProductId) : null
  if (selectedProduct) {
    return (
      <ProductDetail
        product={selectedProduct}
        onBack={() => setSelectedProductId(null)}
        onOrder={async (product, option, size, color, componentSelections) => {
          await handleOrder(product, option, size, color, componentSelections)
          // לאחר הזמנה/ביטול מוצלחים - נשארים בדף הפירוט (כדי שהמתאמן יראה את הסטטוס המתעדכן)
        }}
        alreadyOrdered={ordered.has(selectedProduct.id)}
        ordering={orderingId === selectedProduct.id}
      />
    )
  }

  return (
    <div className="space-y-6">
      {products.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 text-sm mb-3">🛒 מוצרים</h3>
          <div className="space-y-3">
            {products.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedProductId(item.id)}
                className="w-full text-right bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition"
              >
                {item.image_url && (
                  <div className="aspect-[3/4] w-full overflow-hidden rounded-xl">
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{item.title}</p>
                      {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                    </div>
                    {item.price != null && <span className="text-lg font-bold text-emerald-600 flex-shrink-0">₪{item.price}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {ordered.has(item.id) ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">✓ הוזמן</span>
                    ) : (
                      <span className="text-xs text-emerald-600">לחץ לפרטים ורכישה ←</span>
                    )}
                    <span className="text-xs text-gray-400">→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileTab({ profile, member }) {
  const toast = useToast()
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const [requestedSub, setRequestedSub] = useState(member?.subscription_type || '2x_week')
  const [subNote, setSubNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [allBranches, setAllBranches] = useState([])
  const [requestedBranchIds, setRequestedBranchIds] = useState(
    Array.isArray(member?.branch_ids) ? member.branch_ids : (member?.branch_id ? [member.branch_id] : [])
  )
  const [branchSessions, setBranchSessions] = useState({}) // {branchId: count}
  // המאמנים של המתאמן הזה — נגזר מ-class_registrations + checkins ב-60 ימים אחרונים.
  // [{ id, name, phone }] — רק מאמנים שיש להם טלפון מוגדר.
  const [myCoaches, setMyCoaches] = useState([])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      try {
        // 1) class_ids שאליהם המתאמן רשום (כל history) או נכח ב-60 ימים אחרונים
        const sixtyDaysAgoISO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const [regsRes, checksRes] = await Promise.all([
          supabase.from('class_registrations').select('class_id').eq('athlete_id', profile.id),
          supabase.from('checkins').select('class_id')
            .eq('athlete_id', profile.id).eq('status', 'present')
            .gte('checked_in_at', sixtyDaysAgoISO),
        ])
        const classIds = new Set([
          ...(regsRes.data || []).map(r => r.class_id).filter(Boolean),
          ...(checksRes.data || []).map(c => c.class_id).filter(Boolean),
        ])
        if (classIds.size === 0) { if (!cancelled) setMyCoaches([]); return }

        // 2) coach_id לכל class
        const { data: classesData } = await supabase
          .from('classes')
          .select('id, coach_id')
          .in('id', Array.from(classIds))
        const coachIds = new Set((classesData || []).map(c => c.coach_id).filter(Boolean))
        if (coachIds.size === 0) { if (!cancelled) setMyCoaches([]); return }

        // 3) coaches עצמם (name + user_id לחיבור ל-profiles)
        const { data: coachesData } = await supabase
          .from('coaches')
          .select('id, name, user_id')
          .in('id', Array.from(coachIds))
        const userIds = (coachesData || []).map(c => c.user_id).filter(Boolean)

        // 4) טלפונים מ-profiles (טלפון של המאמן נשמר על profile של המשתמש שלו)
        const phonesMap = {}
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, phone')
            .in('id', userIds)
          ;(profilesData || []).forEach(p => { if (p.phone) phonesMap[p.id] = p.phone })
        }

        // 5) רשימה סופית — רק מאמנים שיש להם טלפון, ממוינים לפי שם
        const list = (coachesData || [])
          .map(c => ({ id: c.id, name: c.name || '—', phone: phonesMap[c.user_id] || null }))
          .filter(c => c.phone)
          .sort((a, b) => a.name.localeCompare(b.name, 'he'))

        if (!cancelled) setMyCoaches(list)
      } catch (e) {
        console.warn('[ProfileTab] loadMyCoaches failed', e)
        if (!cancelled) setMyCoaches([])
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  useEffect(() => {
    supabase.from('branches').select('id, name').eq('hidden', false).order('name').then(({ data }) => {
      const list = data || []
      setAllBranches(list)
      // ניקוי IDs של סניפים מוסתרים/מחוקים שכבר אין בהם גישה ב-UI
      const visibleIds = new Set(list.map(b => b.id))
      setRequestedBranchIds(prev => prev.filter(id => visibleIds.has(id)))
      // ניקוי ערכי ספירה ישנים של סניפים שלא קיימים
      setBranchSessions(s => {
        const cleaned = {}
        for (const k of Object.keys(s)) if (visibleIds.has(k)) cleaned[k] = s[k]
        return cleaned
      })
    })
  }, [])

  function toggleRequestedBranch(id) {
    setRequestedBranchIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // אם מסירים סניף — נקה את הספירה שלו
      if (prev.includes(id)) {
        setBranchSessions(s => { const c = { ...s }; delete c[id]; return c })
      }
      return next
    })
  }

  function setBranchSessionCount(id, count) {
    const n = Math.max(0, parseInt(count) || 0)
    setBranchSessions(s => ({ ...s, [id]: n }))
  }

  const totalSessionsAllowed = requestedSub === '2x_week' ? 2 : requestedSub === '4x_week' ? 4 : null
  // סופרים רק את הסניפים שהמשתמש באמת בחר (מתעלמים מערכים תקועים)
  const totalSelectedSessions = requestedBranchIds.reduce((a, id) => a + (branchSessions[id] || 0), 0)

  const athleteName = member?.full_name || profile?.full_name || profile?.email || '—'

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
    if (!newEmail || newEmail === profile.email) { toast.error('הזן כתובת מייל חדשה'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: athleteName,
      change_type: 'email',
      current_value: profile.email,
      requested_value: newEmail,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת שינוי המייל נשלחה למנהל')
    setNewEmail('')
    loadPending()
  }

  async function submitSubChange() {
    const currentBranches = Array.isArray(member?.branch_ids) ? member.branch_ids : (member?.branch_id ? [member.branch_id] : [])
    // נשלח/נבדוק רק סניפים גלויים שהמשתמש יכול לבחור ב-UI
    const visibleIds = new Set((allBranches || []).map(b => b.id))
    const submitBranchIds = requestedBranchIds.filter(id => visibleIds.has(id))
    const branchesChanged =
      submitBranchIds.length !== currentBranches.length ||
      submitBranchIds.some(id => !currentBranches.includes(id))
    if (requestedSub === currentSub && !branchesChanged) { toast.error('בחר מנוי אחר או סניפים אחרים'); return }
    if (submitBranchIds.length === 0) { toast.error('יש לבחור לפחות סניף אחד'); return }
    // ולידציה — סכום האימונים חייב להתאים למנוי (רק ל-2x/4x)
    let submitBranchSessions = null
    if (totalSessionsAllowed !== null) {
      // נבדוק רק על הסניפים הגלויים שמופיעים ב-UI
      const sumVisible = submitBranchIds.reduce((a, id) => a + (branchSessions[id] || 0), 0)
      if (sumVisible !== totalSessionsAllowed) {
        toast.error(`סכום האימונים בסניפים חייב להיות בדיוק ${totalSessionsAllowed} (כרגע ${sumVisible})`)
        return
      }
      for (const id of submitBranchIds) {
        if (!branchSessions[id] || branchSessions[id] < 1) {
          toast.error('יש להזין מספר אימונים לכל סניף שנבחר')
          return
        }
      }
      submitBranchSessions = {}
      for (const id of submitBranchIds) submitBranchSessions[id] = branchSessions[id]
    }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: athleteName,
      change_type: 'subscription',
      current_value: currentSub,
      requested_value: requestedSub,
      requested_branch_ids: submitBranchIds,
      requested_branch_sessions: submitBranchSessions,
      note: subNote,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת שינוי המנוי נשלחה למנהל')
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

      {/* === דבר עם המאמן — דינמי לפי האימונים שהמתאמן רשום אליהם === */}
      {myCoaches.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">💬 המאמנים שלך</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {myCoaches.length === 1
                ? 'לחץ לפתיחת ווצאפ ישירות עם המאמן'
                : `${myCoaches.length} מאמנים — לחץ לפתיחת ווצאפ עם המאמן הרצוי`}
            </p>
          </div>
          <div className="space-y-2">
            {myCoaches.map(c => {
              const wa = athleteWaLink(c.phone, `שלום ${c.name}, מדבר ${athleteName} מ-Team Pact`)
              if (!wa) return null
              return (
                <a
                  key={c.id}
                  href={wa}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`שלח הודעת ווצאפ ל${c.name}`}
                  className="flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-xl px-4 py-3 transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-600"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0" aria-hidden="true">💬</div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="font-bold text-gray-900 text-sm truncate">{c.name}</div>
                    <div className="text-xs text-gray-500" dir="ltr">{c.phone}</div>
                  </div>
                  <span className="text-emerald-700 text-lg shrink-0" aria-hidden="true">›</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

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
            <div>
              <p className="text-xs text-gray-500 mb-1.5">סניפים (ניתן לבחור יותר מאחד)</p>
              <div className="flex gap-2 flex-wrap">
                {allBranches.map(b => (
                  <button key={b.id} type="button" onClick={() => toggleRequestedBranch(b.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      requestedBranchIds.includes(b.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}>
                    {requestedBranchIds.includes(b.id) ? '✓ ' : ''}📍 {b.name}
                  </button>
                ))}
              </div>
            </div>

            {totalSessionsAllowed !== null && requestedBranchIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-900">
                  כמה אימונים בשבוע בכל סניף? (סה"כ חייב להיות {totalSessionsAllowed})
                </p>
                {requestedBranchIds.map(id => {
                  const b = allBranches.find(x => x.id === id)
                  if (!b) return null
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 flex-1">📍 {b.name}</span>
                      <input type="number" min="0" max={totalSessionsAllowed}
                        value={branchSessions[id] ?? ''}
                        onChange={e => setBranchSessionCount(id, e.target.value)}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center" />
                      <span className="text-xs text-gray-500">אימונים</span>
                    </div>
                  )
                })}
                <p className={`text-xs font-semibold ${totalSelectedSessions === totalSessionsAllowed ? 'text-emerald-700' : 'text-red-600'}`}>
                  סה"כ: {totalSelectedSessions} / {totalSessionsAllowed}
                </p>
              </div>
            )}
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

      {/* קישור לאתר המועדון */}
      <div className="text-center pt-2">
        <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 hover:underline font-medium">
          <span aria-hidden="true">🌐</span> בקרו באתר המועדון — teampact.co.il
        </a>
      </div>

      {/* קישור לדף נגישות — חובה לפי תקנות הנגישות לשירות */}
      <div className="text-center pb-4">
        <a
          href="/accessibility"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 hover:underline font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 rounded"
        >
          <span aria-hidden="true">♿</span> הצהרת נגישות
        </a>
      </div>
    </div>
  )
}

function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0,0,0,0)
  return d.toISOString().split('T')[0]
}

// תחילת השבוע הבא — היום הראשון הבא (יום ראשון Sunday).
function getNextWeekStart() {
  const d = new Date()
  // קופצים קדימה לראשון הבא: 7 - dow (אם dow=0 קופצים שבוע שלם קדימה).
  const dow = d.getDay()
  d.setDate(d.getDate() + (7 - dow))
  d.setHours(0,0,0,0)
  return d.toISOString().split('T')[0]
}

function isOpenMatClass(cls) {
  if ((cls.class_type || '').toLowerCase() === 'open_mat') return true;
  const name = String(cls.name || cls.title || '').toLowerCase();
  if (/מזרו?ן\s*פתוח/.test(name)) return true;
  if (/ספר?י?נג|sparring/i.test(name)) return true;
  return false;
}

// === ווצאפ — נרמול טלפון ישראלי לפורמט בינלאומי + יצירת קישור wa.me ===
// משוכפל מ-ReportsManager.jsx (לא רוצים import בין trainer ל-athlete).
function athleteToIntlPhone(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  if (digits.length >= 9 && digits.length <= 10) return '972' + digits
  return digits
}
function athleteWaLink(phone, message = '') {
  const intl = athleteToIntlPhone(phone)
  if (!intl) return null
  const t = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${intl}${t}`
}

// === Welcome-back overlay ===
// מסך מודאל אדום-לבן שקופץ כשמתאמן לוחץ על התראת Push של "מתגעגעים אליך".
// נפתח ע"י #welcome-back?days=N ב-URL (נקבע ב-ReportsManager בשליחת ה-Push).
// CTA יחיד מכוון: "הירשם לאימון הקרוב" → מעביר ללוח השיעורים.
function WelcomeBackOverlay({ memberName, days, onClose }) {
  const firstName = String(memberName || '').trim().split(/\s+/)[0] || 'חבר'
  const headline = days === null
    ? `${firstName}, מתגעגעים אליך 💙`
    : days <= 14
      ? `${firstName}, מתגעגעים אליך 💙`
      : `${firstName}, איפה היית? 💙`
  const message = days === null
    ? 'שמתי לב שעדיין לא נרשמת לאימונים באפליקציה.\nלפני כל אימון פשוט נכנסים, בוחרים את האימון ומסמנים "נרשמתי" ✅\nככה אעקוב אחר ההתקדמות שלך נכון.'
    : days <= 14
      ? `שמתי לב שלא הגעת להתאמן כבר ${days} ימים.\nנשמח לראות אותך שוב על המזרן באימון הקרוב 💪`
      : `שמתי לב שלא הגעת להתאמן כבר ${days} ימים.\nאם צריך הפסקה או התאמה במנוי, בוא נדבר.\nנשמח לראות אותך שוב על המזרן 💪`

  function handleSchedule() {
    // משנה גם hash וגם state של AthleteDashboard דרך hashchange event
    window.location.hash = '#schedule'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-back-title"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
        {/* כותרת — גרדיאנט אדום של Team Pact */}
        <div className="bg-gradient-to-br from-red-600 via-red-700 to-red-900 text-white p-6 text-center relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl font-bold focus:outline focus:outline-2 focus:outline-white"
          >
            ✕
          </button>
          <div className="text-6xl mb-2" aria-hidden="true">🥋</div>
          <h2 id="welcome-back-title" className="text-2xl font-black mb-1 leading-tight">
            {headline}
          </h2>
          <p className="text-red-100 text-sm font-semibold tracking-wide">Team Pact</p>
        </div>

        {/* גוף ההודעה */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 text-base leading-relaxed whitespace-pre-line text-center">
            {message}
          </p>

          {/* CTA יחיד */}
          <button
            type="button"
            onClick={handleSchedule}
            className="w-full bg-gradient-to-br from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 active:from-red-800 active:to-red-950 text-white font-black text-base py-4 rounded-2xl shadow-lg transition-all focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-700"
          >
            📅 הירשם לאימון הקרוב
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium py-2 transition"
          >
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AthleteDashboard({ profile }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [activeTab, setActiveTab]           = useState('schedule')
  const [announcements, setAnnouncements]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [member, setMember]                 = useState(null)
  const [branchesMap, setBranchesMap]       = useState({})
  const [registrations, setRegistrations]   = useState(new Set())
  const [registrationsNext, setRegistrationsNext] = useState(new Set())
  // welcome-back overlay — קופץ כשמגיעים מ-Push של "מתגעגעים אליך"
  const [welcomeBack, setWelcomeBack] = useState({ open: false, days: null })

  // hash → tab/overlay (ניווט מהתראת push)
  useEffect(() => {
    const TAB_HASHES = ['schedule', 'shop', 'announcements', 'profile']
    function syncFromHash() {
      const raw = window.location.hash || ''
      // welcome-back?days=N — overlay ייעודי, לא tab
      if (raw.startsWith('#welcome-back')) {
        const qIdx = raw.indexOf('?')
        const daysStr = qIdx > -1 ? new URLSearchParams(raw.slice(qIdx + 1)).get('days') : null
        const daysNum = daysStr !== null && daysStr !== '' && !Number.isNaN(parseInt(daysStr, 10))
          ? parseInt(daysStr, 10)
          : null
        setWelcomeBack({ open: true, days: daysNum })
        return
      }
      setWelcomeBack({ open: false, days: null })
      const h = raw.replace('#', '')
      if (TAB_HASHES.includes(h)) setActiveTab(h)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  // מקור אמת יחיד: members.subscription_type. אסור לעשות fallback ל-profiles.subscription_type
  // כי זה שדה לגאסי שנשמר רק ברישום ולא מתעדכן כשהמנהל משנה מנוי — מה שיצר באג שמנהל
  // ראה 2× ומתאמן ראה 4× לאותו אדם.
  const subscriptionType = member?.subscription_type
  const limit = SUBSCRIPTION_LIMITS[subscriptionType] ?? 2
  // הערה: ה-effectiveCount/effectiveCountNext (ספירת רישומים לא כולל מזרן פתוח)
  // מחושבים בתוך ScheduleTab כי שם זמין המשתנה 'classes' לסינון מדויק. אין מקבילה כאן.
  const displayName = member?.full_name || profile?.full_name || profile?.email || 'מתאמן'
  const displaySub = SUBSCRIPTION_LABELS[subscriptionType] || (subscriptionType ? subscriptionType : null)
  // הודעה מיועדת למתאמן אם: אין בה branch_ids (כלומר "לכל הסניפים"), או שאחד הסניפים שלה הוא סניף של המתאמן.
  const memberBranches = (member?.branch_ids?.length ? member.branch_ids : (member?.branch_id ? [member.branch_id] : []))
  const announcementsForTab = announcements
    .filter(a => a.type === 'general' || a.type === 'announcement' || a.type === 'seminar')
    .filter(a => {
      if (!Array.isArray(a.branch_ids) || a.branch_ids.length === 0) return true
      return a.branch_ids.some(bid => memberBranches.includes(bid))
    })

  const lastSeenKey = profile?.id ? `announcements_last_seen_${profile.id}` : null
  const [lastSeen, setLastSeen] = useState(() => (lastSeenKey && typeof window !== 'undefined' ? window.localStorage.getItem(lastSeenKey) : null) || '')
  const announcementsCount = announcementsForTab.filter(a => a.created_at && a.created_at > lastSeen).length

  useEffect(() => {
    if (activeTab === 'announcements' && announcementsForTab.length && lastSeenKey) {
      const max = announcementsForTab.reduce((m, a) => (a.created_at && a.created_at > m ? a.created_at : m), '')
      if (max && max !== lastSeen) {
        window.localStorage.setItem(lastSeenKey, max)
        setLastSeen(max)
      }
    }
  }, [activeTab, announcements, lastSeenKey])

  useEffect(() => {
    if (profile?.id) { fetchMyClasses(); fetchAnnouncements(); fetchRegistrations(); fetchBranches() }
  }, [profile])

  useEffect(() => {
    if (!profile?.id) return
    const ch = supabase.channel('announcements-athlete')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchAnnouncements())
      .subscribe()
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetchAnnouncements()
        // ריענון רישומים בכל פעם שהטאב חוזר לפוקוס —
        // מבטיח שאם בקשת רישום נכשלה ברקע / בעוד הטאב היה מוקפא,
        // ה-UI יוצג בהתאם למצב האמיתי בשרת.
        fetchRegistrations()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [profile?.id])

  async function fetchBranches() {
    // טוען רק סניפים גלויים (hidden=false). סניפים מוסתרים לא יופיעו בתצוגה למתאמן
    // גם אם המתאמן משויך אליהם.
    const { data } = await supabase.from('branches').select('id, name').eq('hidden', false)
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
        if (linkErr) {
          // קישור נכשל — הנתונים האלה לא בטוחים לשימוש כי שאילתות עתידיות לפי profile.id לא ימצאו אותם.
          // עדיף לא להציג מתאמן שגוי מאשר להציג רשומה עם ID לא תואם.
          console.error('[athlete] link error — refusing to use mismatched member data:', linkErr)
          toast.error('שגיאה בקישור החשבון — פנה למאמן')
          memberData = null
        } else {
          memberData = { ...memberData, id: profile.id }
        }
      }
      setMember(memberData || null)
    } catch (e) {
      console.error('fetchMyClasses threw:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAnnouncements() {
    const statusFilter = 'status.eq.approved,status.is.null'
    const [itemsRes, generalRes] = await Promise.all([
      supabase.from('announcements').select('*').in('type', ['product', 'seminar']).or(statusFilter).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').in('type', ['general', 'announcement']).or(statusFilter).order('created_at', { ascending: false }).limit(50),
    ])
    setAnnouncements([...(itemsRes.data || []), ...(generalRes.data || [])])
  }

  async function fetchRegistrations() {
    // מביאים את שני השבועות (נוכחי + הבא) בשאילתה אחת ומפצלים לפי week_start.
    // ככה לא מבצעים שתי קריאות נפרדות, וקטגוריית הספירה תמיד מסונכרנת.
    const wsCurrent = getWeekStart()
    const wsNext = getNextWeekStart()
    const { data } = await supabase.from('class_registrations')
      .select('class_id, week_start')
      .eq('athlete_id', profile.id)
      .in('week_start', [wsCurrent, wsNext])
    const cur = new Set()
    const nxt = new Set()
    ;(data || []).forEach(r => {
      if (r.week_start === wsCurrent) cur.add(r.class_id)
      else if (r.week_start === wsNext) nxt.add(r.class_id)
    })
    setRegistrations(cur)
    setRegistrationsNext(nxt)
  }

  async function handleRegister(cls, weekMode = 'current') {
    // איזה שבוע אנחנו רושמים/מבטלים — לפי הטאב הפעיל ב-ScheduleTab.
    const isNext = weekMode === 'next'
    // רישום לשבוע הבא פתוח תמיד (הלוז מציג שבועיים קדימה).
    const targetSet = isNext ? registrationsNext : registrations
    const setTargetSet = isNext ? setRegistrationsNext : setRegistrations
    const isRegistered = targetSet.has(cls.id)

    // נעילה רק על השבוע הנוכחי. עבור שבוע הבא — אין נעילה כי השיעור עוד לא התחיל.
    if (!isNext) {
      const isLockedNow = (() => {
        const now = new Date()
        if (now.getDay() !== cls.day_of_week) return false
        const [hh = 0, mm = 0, ss = 0] = (cls.start_time || '00:00:00').split(':').map(Number)
        const todayStart = new Date(now); todayStart.setHours(hh, mm, ss || 0, 0)
        return now >= todayStart
      })()
      if (isLockedNow) {
        toast.error(isRegistered
          ? 'השיעור כבר התחיל — לא ניתן לבטל את הרישום.'
          : 'השיעור כבר התחיל — לא ניתן להירשם.')
        return
      }
    }

    // הערה: גריידוט מגבלת המנוי מבוצע ב-UI (atRegLimit ב-ScheduleTab) איפה
    // שיש גישה לרשימת השיעורים המלאה לחישוב מדויק (לא כולל מזרן פתוח).
    // כאן רק לוגיקה של יצירה/מחיקה.
    // לכידת week_start פעם אחת — מונע race condition בגבול שבוע (חצות שבת/ראשון).
    // תלוי במצב הטאב: שבוע נוכחי או הבא.
    const weekStart = isNext ? getNextWeekStart() : getWeekStart()

    // חישוב תאריך/שעת ההופעה של השיעור — לצרכי checkin.
    // לשבוע הנוכחי: היום אם עוד לא התחיל, אחרת השבוע הבא.
    // לשבוע הבא: ההופעה ב-week_start + day_of_week של השיעור.
    const computeOccurrenceStart = () => {
      const [hh = 0, mm = 0, ss = 0] = (cls.start_time || '00:00:00').split(':').map(Number)
      if (isNext) {
        const base = new Date(weekStart) // יום ראשון של השבוע הבא ב-UTC midnight
        const occ = new Date(base)
        occ.setDate(base.getDate() + cls.day_of_week)
        occ.setHours(hh, mm, ss || 0, 0)
        return occ
      }
      const now = new Date()
      const todayDow = now.getDay()
      if (todayDow === cls.day_of_week) {
        const todayStart = new Date(now)
        todayStart.setHours(hh, mm, ss || 0, 0)
        if (now < todayStart) return todayStart
      }
      let daysAhead = (cls.day_of_week - todayDow + 7) % 7
      if (daysAhead === 0) daysAhead = 7
      const nextStart = new Date(now)
      nextStart.setDate(now.getDate() + daysAhead)
      nextStart.setHours(hh, mm, ss || 0, 0)
      return nextStart
    }

    // Optimistic update: מעדכן UI מיד, לפני קריאה לשרת.
    // כך אם המשתמש מחליף טאב/יוצא מיד אחרי לחיצה — ה-UI כבר נכון,
    // וגם אם הבקשה נכשלת ברקע, ה-visibilitychange listener יסנכרן עם השרת.
    if (isRegistered) {
      setTargetSet(p => { const n = new Set(p); n.delete(cls.id); return n })
      try {
        const { error } = await supabase.from('class_registrations').delete()
          .eq('class_id', cls.id).eq('athlete_id', profile.id).eq('week_start', weekStart)
        if (error) throw error
        // ביטול רישום → מוחק את ה-checkin המוטמע 'present' של ההופעה הקרובה.
        // אם המאמן כבר סימן 'absent' לא דורסים — ה-status filter מוודא זאת.
        const occStart = computeOccurrenceStart()
        const dayStart = new Date(occStart); dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999)
        await supabase.from('checkins').delete()
          .eq('class_id', cls.id)
          .eq('athlete_id', profile.id)
          .eq('status', 'present')
          .gte('checked_in_at', dayStart.toISOString())
          .lte('checked_in_at', dayEnd.toISOString())
      } catch (e) {
        console.error('unregister error:', e)
        // rollback — מחזיר את הרישום אם הביטול נכשל
        setTargetSet(p => new Set([...p, cls.id]))
        toast.error('ביטול הרישום נכשל. נסה שוב.')
      }
    } else {
      setTargetSet(p => new Set([...p, cls.id]))
      try {
        // ה-UNIQUE constraint העדכני הוא (athlete_id, class_id, week_start) —
        // לכן יכולה להיות שורה לכל שבוע נפרדת, ויכול להיות רישום בו זמנית
        // לשבוע הנוכחי וגם לשבוע הבא לאותו שיעור.
        const { error } = await supabase.from('class_registrations').upsert(
          { class_id: cls.id, athlete_id: profile.id, week_start: weekStart },
          { onConflict: 'athlete_id,class_id,week_start' }
        )
        if (error) throw error
        // רישום → checkin אוטומטי 'present' עם תאריך/שעת השיעור הקרוב.
        // ככה המאמן רואה את כולם נוכחים כברירת מחדל, ומסמן ✕ נעדר רק לחריגים.
        // ignoreDuplicates=true: אם כבר קיים checkin (כולל absent) לא דורסים אותו.
        // המודל החדש: unique(class_id, athlete_id, checkin_date) — שורה לכל יום.
        // לכן גם רישום לשבוע הבא יוצר checkin משלו (לא דורס את השבוע הנוכחי).
        // הדוחות מסננים `t <= now` ולכן צ'ק-אין עתידי לא נספר עד שהיום עובר.
        {
          const occStart = computeOccurrenceStart()
          const checkedAt = new Date(occStart); checkedAt.setHours(12, 0, 0, 0)
          const checkinDate = `${checkedAt.getFullYear()}-${String(checkedAt.getMonth() + 1).padStart(2, '0')}-${String(checkedAt.getDate()).padStart(2, '0')}`
          await supabase.from('checkins').upsert(
            {
              class_id: cls.id,
              athlete_id: profile.id,
              status: 'present',
              checked_in_at: checkedAt.toISOString(),
              checkin_date: checkinDate,
            },
            { onConflict: 'class_id,athlete_id,checkin_date', ignoreDuplicates: true }
          )
        }
      } catch (e) {
        console.error('register error:', e)
        // rollback רק כשנכשל ממש
        setTargetSet(p => { const n = new Set(p); n.delete(cls.id); return n })
        toast.error('הרישום נכשל. נסה שוב.')
      }
    }
  }

  const memberBranchIds = member?.branch_ids?.length
    ? member.branch_ids
    : member?.branch_id ? [member.branch_id] : []
  const memberBranchNames = memberBranchIds.map(id => branchesMap[id]).filter(Boolean)

  return (
    <div
      className="bg-gray-50 flex flex-col"
      dir="rtl"
      style={{ height: '100dvh', minHeight: '100vh' }}
    >
      <header className="shrink-0 bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 text-white px-5 shadow-lg safe-area-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-md">
              <span className="text-xl">🥋</span>
            </div>
            <div>
              <h1 className="font-black text-lg leading-none tracking-wide">TeamPact</h1>
              <p className="text-gray-300 text-xs mt-0.5">שלום, <span className="font-bold text-white">{displayName}</span></p>
            </div>
          </div>
          {displaySub && (
            <span className="text-[10px] bg-red-600 text-white px-2 py-1 rounded-full font-bold shadow">
              {displaySub}
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
      {/* main ברוחב מלא — scrollbar מופיע בקצה המסך, לא באמצע (כפי שהיה ב-desktop רחב).
          התוכן עצמו עדיין מרוכז ב-max-w-lg כדי לשמור על UX מובייל-first. */}
      <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="p-4 max-w-lg w-full mx-auto">
          <div className="mb-3 space-y-2">
            {!isStandalone() && <InstallBanner variant="slim" />}
            <EnablePushBanner profile={profile} />
          </div>
          {activeTab === 'schedule' && <ScheduleTab member={member} limit={limit} registrations={registrations} registrationsNext={registrationsNext} onRegister={handleRegister} branchesMap={branchesMap} />}
          {activeTab === 'shop' && <ShopTab profile={profile} member={member} allAnnouncements={announcements} />}
          {activeTab === 'announcements' && <AnnouncementsTab announcements={announcementsForTab} profile={profile} member={member} />}
          {activeTab === 'profile' && <ProfileTab profile={profile} member={member} />}
        </div>
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isTrainer={false} announcementsCount={announcementsCount} />
      {welcomeBack.open && (
        <WelcomeBackOverlay
          memberName={member?.full_name || profile?.full_name || profile?.email}
          days={welcomeBack.days}
          onClose={() => { window.location.hash = '#schedule' }}
        />
      )}
    </div>
  )
}
