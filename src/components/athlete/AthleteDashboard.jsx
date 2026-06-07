import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import BottomNav from '../BottomNav'
import InstallBanner from '../InstallBanner'
import EnablePushBanner from '../EnablePushBanner'
import { isStandalone } from '../../lib/platform'
import { notifyPush } from '../../lib/notifyPush'
import { allTrainerUserIds } from '../../lib/notifyTargets'
import ProductDetail from './ProductDetail'
import MyProgressSection from './MyProgressSection'
import { useToast, useConfirm } from '../a11y'
import logoUrl from '../../assets/logo.png'
import { ADULT_BELTS, KIDS_BELTS, getMaxStripes, getBeltLabel } from '../../lib/belts'

const SUBSCRIPTION_LIMITS = { '1x_week': 1, '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const DAYS_HE_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

// חלון חסד לרישום באיחור — מתאמן יכול להירשם עד 30 דקות אחרי תחילת השיעור.
// (חייב להיות זהה לערך ב-ClassSchedule.jsx.)
const LATE_REGISTER_GRACE_MIN = 30

// עזר בדיקה — עובד רק במצב פיתוח (npm run dev). בפרודקשן import.meta.env.DEV
// הוא false ו-getNow() מתנהג בדיוק כמו new Date(). מאפשר ?fakeNow=2026-05-03T18:10
function getNow() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const fake = new URLSearchParams(window.location.search).get('fakeNow')
    if (fake) {
      const d = new Date(fake)
      if (!isNaN(d.getTime())) return d
    }
  }
  return new Date()
}

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
  // selectedDate מאותחל להיום — כדי שהשיעורים של היום יוצגו מיד בטעינה.
  // כשהמתאמן לוחץ על תאריך אחר בסלייד — מוצג פירוט השיעורים של אותו יום.
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
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

  const today = getNow(); today.setHours(0,0,0,0)
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
  // ביטול רישום: נעול ברגע שהשיעור מתחיל (כמו לפני).
  const isPastForCancel = (cls, d) => {
    if (isPastDate(d)) return true
    if (d.toDateString() === today.toDateString()) {
      const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
      const classTime = new Date(d); classTime.setHours(h, m, 0, 0)
      return classTime <= getNow()
    }
    return false
  }
  // רישום: נשאר פתוח 30 דקות אחרי start_time (חלון חסד למאחרים).
  const isPastForRegister = (cls, d) => {
    if (isPastDate(d)) return true
    if (d.toDateString() === today.toDateString()) {
      const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
      const lateCutoff = new Date(d)
      lateCutoff.setHours(h, m, 0, 0)
      lateCutoff.setMinutes(lateCutoff.getMinutes() + LATE_REGISTER_GRACE_MIN)
      return lateCutoff <= getNow()
    }
    return false
  }
  // לתאימות עם הקריאות הקיימות שלא יודעות אם זה רישום או ביטול —
  // נשתמש בלוגיקת הרישום (הסלחנית יותר) כדי שלא נחסום בטעות מתאמן בחלון 30 הדקות.
  const isPastClass = isPastForRegister

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
              // שני סוגי "עבר": לרישום (כולל חלון 30 הדקות), ולביטול (חוסם בתחילת השיעור).
              const pastForRegister = isPastForRegister(cls, selectedDate)
              const pastForCancel = isPastForCancel(cls, selectedDate)
              // חלון 30 הדקות = השיעור התחיל אבל עוד אפשר להירשם באיחור
              const lateWindow = pastForCancel && !pastForRegister
              // הפעולה הספציפית של הכפתור (לפי סטטוס הרישום) חסומה?
              const actionBlocked = isReg ? pastForCancel : pastForRegister
              const atRegLimit = !isReg && !isOpenMatClass(cls) && activeEffectiveCount >= limit && limit !== Infinity
              const disabled = actionBlocked || (atRegLimit && !isReg)
              return (
                <button key={cls.id} onClick={() => !actionBlocked && onRegister(cls, weekMode)} disabled={disabled}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition shadow-sm ${
                    actionBlocked
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                      : isReg
                        ? 'bg-gradient-to-br from-red-600 to-red-800 text-white'
                        : lateWindow
                          ? 'bg-amber-500 text-white'
                          : atRegLimit
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white border border-gray-200 text-gray-800 hover:border-red-400'
                  }`}>
                  <div className="text-right flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🥋</span>
                      <p className="font-black text-base">{cls.name}</p>
                    </div>
                    <p className={`text-xs mt-1 ${(isReg || lateWindow) && !actionBlocked ? 'text-white/90' : 'text-gray-500'}`}>
                      🕐 {cls.start_time?.slice(0,5)}
                      {cls.duration_minutes && ` · ${cls.duration_minutes} דק'`}
                      {cls.branches?.name && ` · 📍 ${cls.branches.name}`}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
                    actionBlocked ? 'bg-gray-200 text-gray-500'
                    : isReg ? 'bg-white text-red-700'
                    : lateWindow ? 'bg-white text-amber-700'
                    : atRegLimit ? 'bg-gray-200'
                    : 'bg-red-600 text-white'
                  }`}>
                    {actionBlocked
                      ? (isReg ? '✓ רשום · הסתיים' : 'הסתיים')
                      : isReg ? '✓ רשום'
                      : lateWindow ? '+ הירשם (איחור)'
                      : atRegLimit ? 'מלא'
                      : '+ הירשם'}
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
  const general = announcements.filter(a => a.type === 'general' || a.type === 'announcement' || a.type === 'promotion')
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
                {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-gray-50" loading="lazy" />}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">🎓 סמינר</span>
                    {item.event_date && <span className="text-xs text-blue-600 font-medium">{new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</span>}
                  </div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                  {item.price != null && <p className="text-sm font-bold text-emerald-600 mt-2">₪{item.price}</p>}
                  <button onClick={() => handleOrder(item)} disabled={orderingId === item.id}
                    className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                      orderedDone.has(item.id) ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : ordered.has(item.id) ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {orderingId === item.id ? '...'
                      : orderedDone.has(item.id) ? '✅ ההזמנה הושלמה'
                      : ordered.has(item.id) ? '⏳ ממתין לאישור (לחץ לביטול)'
                      : 'לפרטים ורכישה'}
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

function ShopTab({ profile, member, allAnnouncements, onCartCountChange }) {
  const toast = useToast()
  const confirm = useConfirm()
  const products = allAnnouncements.filter(a => a.type === 'product' || a.type === 'bundle')
  const athleteName = member?.full_name || profile?.full_name || profile?.email || 'לא ידוע'
  const storageKey = profile?.id ? `shop_ordered_${profile.id}` : null
  const [ordered, setOrdered] = useState(() => {
    if (!storageKey) return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const [orderingId, setOrderingId] = useState(null)
  const [selectedProductId, setSelectedProductId] = useState(null)  // איזה מוצר פתוח בדף פירוט
  const [selectedProductVariants, setSelectedProductVariants] = useState([])
  const [compVariantsMap, setCompVariantsMap] = useState({})  // { compName: variants[] } לחבילות
  const productsRef = useRef([])  // ref כדי לקרוא products בתוך useEffect בלי לגרום לו להריץ מחדש
  const [orderedDone, setOrderedDone] = useState(new Set())  // הזמנות שהמנהל סיים
  const [orderedRequestsMap, setOrderedRequestsMap] = useState({})  // product_id → רשומת הזמנה מלאה
  const [editMode, setEditMode] = useState(false)  // האם פותחים ProductDetail לעריכה
  const [showCart, setShowCart] = useState(false)  // האם מציגים עגלת קניות

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify([...ordered])) } catch {}
  }, [ordered, storageKey])

  useEffect(() => {
    const pending = [...ordered].filter(id => !orderedDone.has(id)).length
    onCartCountChange?.(pending)
  }, [ordered, orderedDone])

  // שומר ref עדכני על products כדי לקרוא אותו מתוך effects בלי להוסיפו לdependency
  useEffect(() => { productsRef.current = products }, [products])

  // טעינת וריאנטים (מלאי) כשפותחים מוצר או חבילה
  useEffect(() => {
    if (!selectedProductId) { setSelectedProductVariants([]); setCompVariantsMap({}); return }
    const doLoad = async () => {
      const allProds = productsRef.current
      const prod = allProds.find(p => p.id === selectedProductId)
      const isBundle = prod?.type === 'bundle'
      const map = {}  // { product_id: variants[] }

      if (isBundle) {
        // חבילה: אין וריאנטים עצמיים — כולם נטענים לפי product_id של כל פריט
        setSelectedProductVariants([])
        for (const item of (prod.bundle_items || [])) {
          const { data } = await supabase.from('product_variants')
            .select('id, size, color, length, component_name, stock, active')
            .eq('product_id', item.product_id).eq('active', true)
          if (data?.length) map[item.product_id] = data
        }
      } else {
        // מוצר בודד: טוען וריאנטים עצמיים
        const { data: mainVars } = await supabase.from('product_variants')
          .select('id, size, color, length, component_name, stock, active')
          .eq('product_id', selectedProductId).eq('active', true)
        setSelectedProductVariants(mainVars || [])

        // מוצא חבילות שמכילות את המוצר הזה וטוען variants לכל הפריטים שלהן
        const relBundles = allProds.filter(p =>
          p.type === 'bundle' &&
          (p.bundle_items || []).some(i => i.product_id === selectedProductId)
        )
        for (const bundle of relBundles) {
          for (const item of (bundle.bundle_items || [])) {
            if (map[item.product_id]) continue
            const { data } = await supabase.from('product_variants')
              .select('id, size, color, length, component_name, stock, active')
              .eq('product_id', item.product_id).eq('active', true)
            if (data?.length) map[item.product_id] = data
          }
        }
      }

      setCompVariantsMap(map)
    }
    doLoad()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId])

  useEffect(() => {
    if (!profile?.id || products.length === 0) return
    supabase.from('product_requests')
      .select('*')
      .eq('athlete_id', profile.id)
      .then(({ data }) => {
        const rows = data || []
        // pending = כל מה שלא done/cancelled (כולל null מהזמנות ישנות)
        const pendingRows = rows.filter(r => !r.status || r.status === 'pending')
        const doneNames   = new Set(rows.filter(r => r.status === 'done').map(r => r.product_name))
        const pendingIds = products.filter(p => pendingRows.some(r => r.product_name === p.title)).map(p => p.id)
        const doneIds    = products.filter(p => doneNames.has(p.title)).map(p => p.id)
        // בנה map: product_id → רשומת הזמנה ממתינה
        const reqMap = {}
        for (const row of pendingRows) {
          const product = products.find(p => p.title === row.product_name)
          if (product) reqMap[product.id] = row
        }
        setOrdered(new Set(pendingIds))
        setOrderedDone(new Set(doneIds))
        setOrderedRequestsMap(reqMap)
      })
  }, [profile?.id, products.length])

  // handleOrder מטפל גם בהזמנה ישירה (מהרשימה) וגם בהזמנה מדף פירוט (עם אפשרות/מידה/צבע/אורך/רכיבים)
  // כשeditRequestId קיים — עדכון רשומה קיימת במקום יצירת חדשה
  async function handleOrder(item, selectedOption = null, selectedSize = null, selectedColor = null, selectedLength = null, componentSelections = null, quantity = 1, editRequestId = null) {
    // הזמנה שהמנהל כבר סיים — לא ניתן לביטול
    if (orderedDone.has(item.id)) {
      await confirm({ title: 'ההזמנה הושלמה', message: 'ההזמנה כבר טופלה על ידי המאמן ולא ניתנת לביטול.', confirmText: 'הבנתי', danger: false })
      return
    }
    // הזמנה ממתינה שנפתחה לצפייה (לא עריכה) — מאפשר ביטול
    if (ordered.has(item.id) && !editRequestId) {
      const ok = await confirm({ title: 'ביטול הזמנה', message: `לבטל את ההזמנה של "${item.title}"?`, confirmText: 'בטל הזמנה', danger: true })
      if (!ok) return
      setOrderingId(item.id)
      const reqId = orderedRequestsMap[item.id]?.id
      if (reqId) {
        await supabase.from('product_requests').update({ status: 'cancelled' }).eq('id', reqId)
      } else {
        // fallback: עדכן לפי שם (כולל הזמנות ישנות עם status=null)
        await supabase.from('product_requests')
          .update({ status: 'cancelled' })
          .eq('athlete_id', profile?.id)
          .eq('product_name', item.title)
          .or('status.eq.pending,status.is.null')
      }
      setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
      setOrderedRequestsMap(prev => { const n = {...prev}; delete n[item.id]; return n })
      setOrderingId(null)
      setSelectedProductId(null)
      allTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '❌ ביטול הזמנה', body: `${athleteName} ביטל הזמנה: ${item.title}`, url: '/#shop', tag: `order-cancel:${Date.now()}` })).catch(() => {})
      return
    }
    setOrderingId(item.id)
    // בונים את payload - שומרים את האפשרות, המידה והצבע
    const payload = {
      product_name: item.title,
      product_id: item.id || null,
      athlete_id: profile?.id || null,
      athlete_name: athleteName,
      status: 'pending',
    }
    // מידה, צבע ואורך כעמודות נפרדות (יש columns ב-DB)
    if (selectedSize) payload.selected_size = selectedSize
    if (selectedColor) payload.selected_color = selectedColor
    if (selectedLength) payload.selected_length = selectedLength
    // אם יש בחירות פר-רכיב - שומרים מידה/צבע/אורך של הרכיב הראשון כ-selected_size/selected_color/selected_length (תאימות לאחור)
    // ושומרים את כל הבחירות ב-component_selections לניכוי מלאי מדויק
    if (Array.isArray(componentSelections) && componentSelections.length) {
      const first = componentSelections[0] || {}
      if (first.size) payload.selected_size = first.size
      if (first.color) payload.selected_color = first.color
      if (first.length) payload.selected_length = first.length
      // שמירת כל בחירות הרכיבים עם שם הרכיב לניכוי מלאי ב-markDone
      if (Array.isArray(selectedOption?.components)) {
        payload.component_selections = componentSelections.map((sel, i) => ({
          component_name: selectedOption.components[i]?.name || null,
          product_id: selectedOption.components[i]?.product_id || null,
          size: sel?.size || null,
          color: sel?.color || null,
          length: sel?.length || null,
        }))
      }
    }
    // מרכיבים notes מפורט - כולל אפשרות, מידה, צבע, אורך, רכיבים
    const noteParts = []
    if (selectedOption?.name) noteParts.push(`אפשרות: ${selectedOption.name}`)
    // בחירות פר-רכיב (למשל: מכנס מידה M צבע שחור | ראשגארד מידה L צבע לבן ארוך)
    if (Array.isArray(componentSelections) && componentSelections.length && Array.isArray(selectedOption?.components)) {
      componentSelections.forEach((sel, i) => {
        const comp = selectedOption.components[i]
        if (!comp) return
        const pieces = [comp.name]
        if (sel?.size) pieces.push(`מידה ${sel.size}`)
        if (sel?.color) pieces.push(`צבע ${sel.color}`)
        if (sel?.length) pieces.push(sel.length)
        if (pieces.length > 1) noteParts.push(pieces.join(' '))
      })
    } else {
      if (selectedSize) noteParts.push(`מידה: ${selectedSize}`)
      if (selectedColor) noteParts.push(`צבע: ${selectedColor}`)
      if (selectedLength) noteParts.push(`אורך: ${selectedLength}`)
    }
    if (selectedOption?.note) noteParts.push(selectedOption.note)
    if (noteParts.length) payload.notes = noteParts.join(' · ')
    // כמות
    if (quantity && quantity > 1) payload.quantity = quantity
    // מחיר
    const unitPrice = selectedOption?.price != null ? selectedOption.price : (item.price ?? null)
    if (unitPrice != null) {
      payload.unit_price = unitPrice
      payload.total_price = unitPrice * (quantity || 1)
    }
    // עדכון או הוספה
    let error
    if (editRequestId) {
      // עדכון רשומה קיימת
      const { error: updErr } = await supabase.from('product_requests')
        .update(payload)
        .eq('id', editRequestId)
      error = updErr
      if (!error) {
        setOrderedRequestsMap(prev => ({ ...prev, [item.id]: { ...prev[item.id], ...payload, id: editRequestId } }))
        setEditMode(false)
        setSelectedProductId(null)
        toast.success('ההזמנה עודכנה!')
        setOrderingId(null)
        // התראה למנהל על עדכון הזמנה
        const editBodyParts = [`✏️ ${athleteName} עדכן הזמנה: ${item.title}`]
        if (selectedOption?.name) editBodyParts.push(`אפשרות: ${selectedOption.name}`)
        if (selectedSize) editBodyParts.push(`מידה: ${selectedSize}`)
        if (selectedColor) editBodyParts.push(`צבע: ${selectedColor}`)
        allTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '✏️ עדכון הזמנה', body: editBodyParts.join(' · '), url: '/#shop', tag: `order-edit:${Date.now()}` })).catch(() => {})
        return
      }
    } else {
      const { data: insData, error: insErr } = await supabase.from('product_requests').insert(payload).select('id').single()
      error = insErr
      if (!error && insData?.id) {
        payload._insertedId = insData.id
      }
    }
    if (error) { console.error('order error:', error); toast.error('שגיאה: ' + (error.message || error.code || 'לא ידוע')) }
    else {
      setOrdered(prev => new Set([...prev, item.id]))
      setOrderedRequestsMap(prev => ({ ...prev, [item.id]: { ...payload, id: payload._insertedId || prev[item.id]?.id } }))
      // בניית גוף התראה מפורט - כולל מידה, צבע, אפשרות, רכיבים ומחיר
      const bodyParts = [`${athleteName} הזמין: ${item.title}`]
      if (selectedOption?.name) bodyParts.push(`אפשרות: ${selectedOption.name}`)
      // אם יש רכיבים - מוסיפים אותם עם המידה/צבע/אורך לכל אחד
      if (Array.isArray(componentSelections) && componentSelections.length && Array.isArray(selectedOption?.components)) {
        componentSelections.forEach((sel, i) => {
          const comp = selectedOption.components[i]
          if (!comp) return
          const pieces = [comp.name]
          if (sel?.size) pieces.push(sel.size)
          if (sel?.color) pieces.push(sel.color)
          if (sel?.length) pieces.push(sel.length)
          if (pieces.length > 1) bodyParts.push(pieces.join(' '))
        })
      } else {
        if (selectedSize) bodyParts.push(`מידה: ${selectedSize}`)
        if (selectedColor) bodyParts.push(`צבע: ${selectedColor}`)
        if (selectedLength) bodyParts.push(`אורך: ${selectedLength}`)
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
    const editReqId = editMode ? orderedRequestsMap[selectedProduct.id]?.id : null
    const existingReq = orderedRequestsMap[selectedProduct.id]
    // חבילות רלוונטיות — חבילות שמכילות את המוצר הזה
    const relatedBundles = selectedProduct.type !== 'bundle'
      ? products.filter(p => p.type === 'bundle' && (p.bundle_items || []).some(i => i.product_id === selectedProduct.id))
      : []
    return (
      <ProductDetail
        product={selectedProduct}
        variants={selectedProductVariants}
        compVariantsMap={compVariantsMap}
        relatedBundles={relatedBundles}
        allProducts={products}
        onBack={() => { setSelectedProductId(null); setEditMode(false) }}
        onOrder={async (product, option, size, color, length, componentSelections, qty) => {
          await handleOrder(product, option, size, color, length, componentSelections, qty ?? 1, editReqId)
        }}
        onEdit={() => setEditMode(true)}
        alreadyOrdered={!editMode && ordered.has(selectedProduct.id)}
        ordering={orderingId === selectedProduct.id}
        editMode={editMode}
        initialSize={editMode ? existingReq?.selected_size : null}
        initialColor={editMode ? existingReq?.selected_color : null}
        initialLength={editMode ? existingReq?.selected_length : null}
        initialNotes={editMode ? existingReq?.notes : null}
        initialQuantity={editMode ? (existingReq?.quantity || 1) : 1}
      />
    )
  }

  // מסך עגלת קניות — כל ההזמנות הממתינות
  const pendingCartItems = products.filter(p => ordered.has(p.id) && !orderedDone.has(p.id))

  if (showCart) {
    return (
      <div className="space-y-4">
        {/* כותרת עגלה */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowCart(false)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            ← חזרה לחנות
          </button>
          <h3 className="font-bold text-gray-800 text-base">🛒 הזמנות שלי</h3>
        </div>

        {pendingCartItems.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <div className="text-5xl mb-3">🛒</div>
            <p className="text-sm">אין הזמנות פעילות</p>
            <button
              type="button"
              onClick={() => setShowCart(false)}
              className="mt-4 text-sm text-emerald-600 underline"
            >
              עבור לחנות לקנייה
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingCartItems.map(item => {
              const req = orderedRequestsMap[item.id]
              return (
                <div key={item.id} className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
                  <div className="flex gap-3 p-4">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                      {/* פרטי ההזמנה */}
                      {req?.notes && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{req.notes}</p>
                      )}
                      {req?.quantity > 1 && (
                        <p className="text-xs text-gray-500 mt-0.5">כמות: {req.quantity}</p>
                      )}
                      {req?.total_price != null ? (
                        <p className="text-sm font-bold text-emerald-600 mt-1">₪{req.total_price}</p>
                      ) : req?.unit_price != null ? (
                        <p className="text-sm font-bold text-emerald-600 mt-1">₪{req.unit_price}</p>
                      ) : item.price != null ? (
                        <p className="text-sm font-bold text-emerald-600 mt-1">₪{item.price}</p>
                      ) : null}
                      <span className="inline-block mt-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">⏳ ממתין לאישור</span>
                    </div>
                  </div>
                  {/* כפתורי פעולה */}
                  <div className="flex gap-2 px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => { setEditMode(true); setSelectedProductId(item.id); setShowCart(false) }}
                      className="flex-1 text-sm bg-blue-50 text-blue-600 border border-blue-200 py-2 rounded-xl font-medium hover:bg-blue-100 transition"
                    >
                      ✏️ ערוך הזמנה
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({ title: 'ביטול הזמנה', message: `לבטל את ההזמנה של "${item.title}"?`, confirmText: 'בטל הזמנה', danger: true })
                        if (!ok) return
                        setOrderingId(item.id)
                        const reqId = orderedRequestsMap[item.id]?.id
                        if (reqId) {
                          await supabase.from('product_requests').update({ status: 'cancelled' }).eq('id', reqId)
                        } else {
                          await supabase.from('product_requests')
                            .update({ status: 'cancelled' })
                            .eq('athlete_id', profile?.id)
                            .eq('product_name', item.title)
                            .or('status.eq.pending,status.is.null')
                        }
                        setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
                        setOrderedRequestsMap(prev => { const n = {...prev}; delete n[item.id]; return n })
                        setOrderingId(null)
                        allTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '❌ ביטול הזמנה', body: `${athleteName} ביטל הזמנה: ${item.title}`, url: '/#shop', tag: `order-cancel:${Date.now()}` })).catch(() => {})
                      }}
                      disabled={orderingId === item.id}
                      className="flex-1 text-sm bg-red-50 text-red-600 border border-red-200 py-2 rounded-xl font-medium hover:bg-red-100 transition disabled:opacity-50"
                    >
                      🗑 בטל הזמנה
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ═══ כותרת עם אייקון עגלה ═══ */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-700 text-sm">🛍️ מוצרים</h3>
        {pendingCartItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-1 text-gray-700 hover:text-gray-900 transition"
          >
            <span className="text-2xl">🛒</span>
            <span className="absolute -top-1 -left-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {pendingCartItems.length}
            </span>
          </button>
        )}
      </div>

      {/* ═══ רשימת מוצרים ═══ */}
      {products.length > 0 && (
        <div className="space-y-3">
          {products.map(item => {
            const isPending = ordered.has(item.id) && !orderedDone.has(item.id)
            const isDone    = orderedDone.has(item.id)
            return (
              <div key={item.id} className="w-full text-right bg-white rounded-xl border shadow-sm overflow-hidden">
                <div
                  role="button" tabIndex={0}
                  onClick={() => { if (!isPending && !isDone) { setSelectedProductId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }) } }}
                  onKeyDown={e => e.key === 'Enter' && !isPending && !isDone && (setSelectedProductId(item.id), window.scrollTo({ top: 0, behavior: 'smooth' }))}
                  className={!isPending && !isDone ? 'cursor-pointer hover:shadow-md transition' : ''}
                >
                  {item.image_url && (
                    <div className="aspect-[3/4] w-full overflow-hidden rounded-t-xl">
                      <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{item.title}</p>
                        {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                      </div>
                      {item.price != null && <span className="text-lg font-bold text-emerald-600 flex-shrink-0">₪{item.price}</span>}
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-1">
                  {isDone ? (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">✅ ההזמנה הושלמה</span>
                  ) : isPending ? (
                    <button type="button" onClick={() => setShowCart(true)}
                      className="text-xs text-amber-600 font-medium">⏳ הוזמן ←</button>
                  ) : (
                    <span className="text-xs text-gray-400">לחץ לפרטים ורכישה</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ProfileTab — התקדמות בלבד (קריאה) ──────────────────────────────────────
function ProfileTab({ profile, member }) {
  return (
    <div className="space-y-4">
      <MyProgressSection profile={profile} member={member} />
    </div>
  )
}

// ─── SettingsTab — הגדרות חשבון ─────────────────────────────────────────────
function SettingsTab({ profile, member }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  // פרטים אישיים
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  // אבטחה
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  // מנוי
  const [requestedSub, setRequestedSub] = useState(member?.subscription_type || '1x_week')
  const [subNote, setSubNote] = useState('')
  const [allBranches, setAllBranches] = useState([])
  const [requestedBranchIds, setRequestedBranchIds] = useState(
    Array.isArray(member?.branch_ids) ? member.branch_ids : (member?.branch_id ? [member.branch_id] : [])
  )
  const [branchSessions, setBranchSessions] = useState(member?.branch_sessions || {})
  // דרגה
  const [beltCategory, setBeltCategory] = useState(member?.belt_category || 'adult')
  const [beltVal, setBeltVal] = useState(member?.belt || '')
  const [beltStripes, setBeltStripes] = useState(member?.belt_stripes || 0)
  const [beltReceivedAt, setBeltReceivedAt] = useState(member?.belt_received_at || '')
  const [bjjStartDate, setBjjStartDate] = useState(member?.bjj_start_date || '')
  const [reqTrainsGi, setReqTrainsGi] = useState(member?.trains_gi ?? true)
  const [reqTrainsNogi, setReqTrainsNogi] = useState(member?.trains_nogi ?? false)
  const [birthDate, setBirthDate] = useState(member?.birth_date || '')
  const [priorAcademy, setPriorAcademy] = useState('')
  const [beltNote, setBeltNote] = useState('')
  // מאמנים + ניווט
  const [myCoaches, setMyCoaches] = useState([])
  const [settingsView, setSettingsView] = useState(null)
  // הקפאה/ביטול מנוי
  const [membershipAction, setMembershipAction] = useState(null) // 'freeze' | 'cancel' | null
  const [membershipNote, setMembershipNote] = useState('')

  const athleteName = member?.full_name || profile?.full_name || profile?.email || '—'
  const currentSub = member?.subscription_type || profile?.subscription_type || '—'

  // === חישוב גיל + קטגוריה לפי תאריך לידה ===
  const autoAge = (() => {
    if (!birthDate) return null
    const bd = new Date(birthDate)
    if (isNaN(bd.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - bd.getFullYear()
    const mo = today.getMonth() - bd.getMonth()
    if (mo < 0 || (mo === 0 && today.getDate() < bd.getDate())) age--
    return age
  })()
  const autoCategory = autoAge === null ? null : (autoAge >= 16 ? 'adult' : 'kids')

  useEffect(() => {
    if (!autoCategory) return
    if (autoCategory !== beltCategory) { setBeltCategory(autoCategory); setBeltVal(''); setBeltStripes(0) }
  }, [autoCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile?.id) loadPending()
  }, [profile?.id])

  async function loadPending() {
    const { data } = await supabase.from('profile_change_requests').select('*')
      .eq('athlete_id', profile.id).eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingRequests(data || [])
  }

  useEffect(() => {
    const athleteId = member?.id || profile?.id
    if (!athleteId) return
    let cancelled = false
    ;(async () => {
      try {
        const sixtyDaysAgoISO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const [regsRes, checksRes] = await Promise.all([
          supabase.from('class_registrations').select('class_id').eq('athlete_id', athleteId),
          supabase.from('checkins').select('class_id')
            .eq('athlete_id', athleteId).eq('status', 'present')
            .gte('checked_in_at', sixtyDaysAgoISO),
        ])
        const classIds = new Set([
          ...(regsRes.data || []).map(r => r.class_id).filter(Boolean),
          ...(checksRes.data || []).map(c => c.class_id).filter(Boolean),
        ])
        if (classIds.size === 0) { if (!cancelled) setMyCoaches([]); return }
        const { data: classesData } = await supabase.from('classes').select('id, coach_id').in('id', Array.from(classIds))
        const coachIds = new Set((classesData || []).map(c => c.coach_id).filter(Boolean))
        if (coachIds.size === 0) { if (!cancelled) setMyCoaches([]); return }
        const { data: coachesData } = await supabase.from('coaches').select('id, name, user_id').in('id', Array.from(coachIds))
        const userIds = (coachesData || []).map(c => c.user_id).filter(Boolean)
        const phonesMap = {}
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase.from('profiles').select('id, phone').in('id', userIds)
          ;(profilesData || []).forEach(p => { if (p.phone) phonesMap[p.id] = p.phone })
        }
        const seen = new Map()
        for (const c of (coachesData || [])) {
          const phone = phonesMap[c.user_id]
          if (!phone) continue
          const key = c.user_id || `${c.name}|${phone}`
          if (seen.has(key)) continue
          seen.set(key, { id: c.id, name: c.name || '—', phone })
        }
        if (!cancelled) setMyCoaches(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'he')))
      } catch (e) {
        console.warn('[SettingsTab] loadMyCoaches failed', e)
        if (!cancelled) setMyCoaches([])
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  useEffect(() => {
    supabase.from('branches').select('id, name').eq('hidden', false).order('name').then(({ data }) => {
      const list = data || []
      setAllBranches(list)
      const visibleIds = new Set(list.map(b => b.id))
      setRequestedBranchIds(prev => prev.filter(id => visibleIds.has(id)))
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
      if (prev.includes(id)) setBranchSessions(s => { const c = { ...s }; delete c[id]; return c })
      return next
    })
  }

  function setBranchSessionCount(id, count) {
    setBranchSessions(s => ({ ...s, [id]: Math.max(0, parseInt(count) || 0) }))
  }

  const totalSessionsAllowed = requestedSub === '1x_week' ? 1 : requestedSub === '2x_week' ? 2 : requestedSub === '4x_week' ? 4 : null
  const totalSelectedSessions = requestedBranchIds.reduce((a, id) => a + (branchSessions[id] || 0), 0)

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

  async function submitNameChange() {
    const trimmed = newName.trim()
    if (!trimmed) { toast.error('הזן שם חדש'); return }
    if (trimmed === athleteName) { toast.error('השם זהה לשם הנוכחי'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id, athlete_name: athleteName,
      change_type: 'name', current_value: athleteName, requested_value: trimmed,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת שינוי השם נשלחה למנהל')
    setNewName(''); loadPending()
  }

  async function submitEmailChange() {
    if (!newEmail || newEmail === profile.email) { toast.error('הזן כתובת מייל חדשה'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id, athlete_name: athleteName,
      change_type: 'email', current_value: profile.email, requested_value: newEmail,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת שינוי המייל נשלחה למנהל')
    setNewEmail(''); loadPending()
  }

  async function submitSubChange() {
    const currentBranches = Array.isArray(member?.branch_ids) ? member.branch_ids : (member?.branch_id ? [member.branch_id] : [])
    const visibleIds = new Set((allBranches || []).map(b => b.id))
    const submitBranchIds = requestedBranchIds.filter(id => visibleIds.has(id))
    const branchesChanged = submitBranchIds.length !== currentBranches.length || submitBranchIds.some(id => !currentBranches.includes(id))
    if (requestedSub === currentSub && !branchesChanged) { toast.error('בחר מנוי אחר או סניפים אחרים'); return }
    if (submitBranchIds.length === 0) { toast.error('יש לבחור לפחות סניף אחד'); return }
    let submitBranchSessions = null
    if (totalSessionsAllowed !== null) {
      const sumVisible = submitBranchIds.reduce((a, id) => a + (branchSessions[id] || 0), 0)
      if (sumVisible !== totalSessionsAllowed) { toast.error(`סכום האימונים בסניפים חייב להיות בדיוק ${totalSessionsAllowed} (כרגע ${sumVisible})`); return }
      for (const id of submitBranchIds) {
        if (!branchSessions[id] || branchSessions[id] < 1) { toast.error('יש להזין מספר אימונים לכל סניף שנבחר'); return }
      }
      submitBranchSessions = {}
      for (const id of submitBranchIds) submitBranchSessions[id] = branchSessions[id]
    }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id, athlete_name: athleteName,
      change_type: 'subscription', current_value: currentSub, requested_value: requestedSub,
      requested_branch_ids: submitBranchIds, requested_branch_sessions: submitBranchSessions, note: subNote,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת שינוי המנוי נשלחה למנהל')
    setSubNote(''); loadPending()
  }

  async function submitMembershipRequest() {
    if (!membershipAction) return
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: athleteName,
      change_type: membershipAction === 'freeze' ? 'membership_freeze' : 'membership_cancel',
      current_value: currentSub,
      requested_value: membershipAction,
      note: membershipNote || null,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success(membershipAction === 'freeze' ? 'בקשת ההקפאה נשלחה למנהל' : 'בקשת הביטול נשלחה למנהל')
    setMembershipNote('')
    setMembershipAction(null)
    loadPending()
  }

  async function submitBeltChange() {
    if (!beltVal) { toast.error('בחר חגורה'); return }
    if (!reqTrainsGi && !reqTrainsNogi) { toast.error('סמן לפחות סוג אימון אחד (Gi או NoGi)'); return }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id, athlete_name: athleteName,
      change_type: 'belt', current_value: member?.belt || '—', requested_value: beltVal,
      requested_belt: beltVal, requested_belt_stripes: Number(beltStripes) || 0,
      requested_belt_received_at: beltReceivedAt || null, requested_bjj_start_date: bjjStartDate || null,
      requested_trains_gi: !!reqTrainsGi, requested_trains_nogi: !!reqTrainsNogi,
      requested_birth_date: birthDate || null, prior_academy: priorAcademy || null, note: beltNote || null,
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    allTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: 'בקשת אישור דרגה חדשה',
      body: `${athleteName} מבקש דרגה: ${getBeltLabel(beltVal)}${beltStripes ? ` · ${beltStripes} פסים` : ''}`,
      url: '/#requests', tag: `belt-request:${profile.id}`,
    })).catch(() => {})
    toast.success('הבקשה נשלחה למנהל')
    setBeltNote(''); setPriorAcademy(''); loadPending()
  }

  const hasPendingName = pendingRequests.some(r => r.change_type === 'name')
  const hasPendingEmail = pendingRequests.some(r => r.change_type === 'email')
  const hasPendingSub = pendingRequests.some(r => r.change_type === 'subscription')
  const hasPendingBelt = pendingRequests.some(r => r.change_type === 'belt')
  const hasPendingMembership = pendingRequests.some(r => r.change_type === 'membership_freeze' || r.change_type === 'membership_cancel')

  return (
    <div className="space-y-4">
      {/* כותרת */}
      <div className="bg-white rounded-xl border shadow-sm p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-3">
          <span className="text-white text-xl font-medium">
            {(member?.full_name || profile?.full_name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('')}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{member?.full_name || profile?.full_name}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{profile?.email}</p>
      </div>

      <div className="space-y-3">
        {/* ── מסך ראשי ── */}
        {!settingsView && (
          <div className="space-y-3">
            <div className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
              <button onClick={() => setSettingsView('personal')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-gray-50 transition">
                <span className="text-xl w-8 text-center shrink-0">👤</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">פרטים אישיים</div>
                  <div className="text-xs text-gray-400 truncate">{member?.full_name || profile?.full_name}</div>
                </div>
                {hasPendingEmail && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 rotate-180"><path d="M9 18l6-6-6-6"/></svg>
              </button>

              <button onClick={() => setSettingsView('subscription')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-gray-50 transition">
                <span className="text-xl w-8 text-center shrink-0">🎫</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">מנוי</div>
                  <div className="text-xs text-gray-400">{SUBSCRIPTION_LABELS[currentSub] || currentSub}</div>
                </div>
                {hasPendingSub && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 rotate-180"><path d="M9 18l6-6-6-6"/></svg>
              </button>

              <button onClick={() => setSettingsView('belt')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-gray-50 transition">
                <span className="text-xl w-8 text-center shrink-0">🥋</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">עדכון דרגה</div>
                  <div className="text-xs text-gray-400">{member?.belt ? getBeltLabel(member.belt) : 'לא הוגדרה דרגה'}</div>
                </div>
                {hasPendingBelt && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 rotate-180"><path d="M9 18l6-6-6-6"/></svg>
              </button>

              <button onClick={() => setSettingsView('security')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-gray-50 transition">
                <span className="text-xl w-8 text-center shrink-0">🔒</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">אבטחה</div>
                  <div className="text-xs text-gray-400">סיסמה ויציאה</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 rotate-180"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>

            {myCoaches.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 px-1 mb-1.5">המאמנים שלך</p>
                <div className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
                  {myCoaches.map(c => {
                    const wa = athleteWaLink(c.phone, `שלום ${c.name}, מדבר ${athleteName} מ-Team Pact`)
                    if (!wa) return null
                    return (
                      <a key={c.id} href={wa} target="_blank" rel="noreferrer noopener"
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700 text-xs font-semibold">
                          {c.name.trim()[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{c.name}</div>
                          <div className="text-xs text-gray-400" dir="ltr">{c.phone}</div>
                        </div>
                        <span className="text-xs text-emerald-600 font-medium shrink-0">ווצאפ</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 pt-1 pb-2">
              <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
                className="text-sm text-emerald-700 hover:underline font-medium">teampact.co.il</a>
              <a href="/accessibility" className="text-xs text-gray-400 hover:underline">הצהרת נגישות</a>
            </div>
          </div>
        )}

        {/* ── פרטים אישיים ── */}
        {settingsView === 'personal' && (
          <div className="space-y-4">
            <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 text-sm text-emerald-600 font-medium -mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l6-6-6-6"/></svg>
              הגדרות
            </button>
            <div className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-gray-400">שם מלא</span>
                <span className="text-sm text-gray-800 font-medium">{member?.full_name || profile?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-gray-400">מייל</span>
                <span className="text-sm text-gray-800 font-medium">{profile?.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-gray-400">טלפון</span>
                <span className="text-sm text-gray-800 font-medium">{member?.phone || '—'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">שינוי שם מלא</p>
              {hasPendingName ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">יש בקשת שינוי שם ממתינה לאישור מנהל</p>
              ) : (
                <div className="space-y-2">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="הזן שם מלא חדש" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
                  <button onClick={submitNameChange} disabled={saving}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 px-1">לשינוי טלפון — פנה למאמן</p>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">שינוי כתובת מייל</p>
              {hasPendingEmail ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">יש בקשה ממתינה לאישור מנהל</p>
              ) : (
                <div className="space-y-2">
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="הזן מייל חדש" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
                  <button onClick={submitEmailChange} disabled={saving}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── מנוי ── */}
        {settingsView === 'subscription' && (
          <div className="space-y-4">
            <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 text-sm text-emerald-600 font-medium -mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l6-6-6-6"/></svg>
              הגדרות
            </button>
            <div>
              <p className="text-xs text-gray-400 px-1 mb-1.5">מנוי נוכחי</p>
              <div className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-gray-400">סוג</span>
                  <span className="text-sm font-medium text-emerald-700">{SUBSCRIPTION_LABELS[currentSub] || currentSub}</span>
                </div>
                {(Array.isArray(member?.branch_ids) ? member.branch_ids : (member?.branch_id ? [member.branch_id] : [])).length > 0 && (
                  <div className="flex justify-between items-start px-4 py-3 gap-4">
                    <span className="text-xs text-gray-400 shrink-0">סניפים</span>
                    <span className="text-sm text-gray-800 text-right">
                      {(Array.isArray(member?.branch_ids) ? member.branch_ids : [member.branch_id])
                        .map(id => allBranches.find(b => b.id === id)?.name || id).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* הקפאה / ביטול מנוי */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">הקפאה או ביטול מנוי</p>
              {hasPendingMembership ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  יש בקשה ממתינה לאישור מנהל
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMembershipAction(a => a === 'freeze' ? null : 'freeze')}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                        membershipAction === 'freeze'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                      }`}>
                      ❄️ הקפאת מנוי
                    </button>
                    <button
                      type="button"
                      onClick={() => setMembershipAction(a => a === 'cancel' ? null : 'cancel')}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                        membershipAction === 'cancel'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-red-400'
                      }`}>
                      🚫 ביטול מנוי
                    </button>
                  </div>
                  {membershipAction && (
                    <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      {membershipAction === 'freeze' ? (
                        <p className="text-xs text-blue-700 font-medium">הקפאת מנוי — תחול מיידית עם אישור המנהל.</p>
                      ) : (
                        <p className="text-xs text-red-700 font-medium">ביטול מנוי — ייכנס לתוקף בסוף החודש הנוכחי.</p>
                      )}
                      <textarea
                        value={membershipNote}
                        onChange={e => setMembershipNote(e.target.value)}
                        placeholder="סיבה (אופציונלי)"
                        rows="2"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none bg-white"
                      />
                      <button
                        onClick={submitMembershipRequest}
                        disabled={saving}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                        {saving ? 'שולח...' : 'שלח בקשה למנהל'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">בקשת שינוי מנוי</p>
              {hasPendingSub ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">יש בקשה ממתינה לאישור מנהל</p>
              ) : (
                <div className="space-y-3">
                  <select value={requestedSub} onChange={e => setRequestedSub(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                    <option value="1x_week">1× שבוע</option>
                    <option value="2x_week">2× שבוע</option>
                    <option value="4x_week">4× שבוע</option>
                    <option value="unlimited">ללא הגבלה</option>
                  </select>
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">סניפים</p>
                    <div className="flex gap-2 flex-wrap">
                      {allBranches.map(b => (
                        <button key={b.id} type="button" onClick={() => toggleRequestedBranch(b.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            requestedBranchIds.includes(b.id)
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}>
                          {requestedBranchIds.includes(b.id) ? '✓ ' : ''}{b.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {totalSessionsAllowed !== null && requestedBranchIds.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-700">כמה אימונים בשבוע בכל סניף? (סה"כ: {totalSessionsAllowed})</p>
                      {requestedBranchIds.map(id => {
                        const b = allBranches.find(x => x.id === id)
                        if (!b) return null
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <span className="text-sm text-gray-700 flex-1">{b.name}</span>
                            <input type="number" min="0" max={totalSessionsAllowed}
                              value={branchSessions[id] ?? ''}
                              onChange={e => setBranchSessionCount(id, e.target.value)}
                              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" />
                            <span className="text-xs text-gray-400">אימונים</span>
                          </div>
                        )
                      })}
                      <p className={`text-xs font-semibold ${totalSelectedSessions === totalSessionsAllowed ? 'text-emerald-700' : 'text-red-500'}`}>
                        סה"כ: {totalSelectedSessions} / {totalSessionsAllowed}
                      </p>
                    </div>
                  )}
                  <textarea value={subNote} onChange={e => setSubNote(e.target.value)}
                    placeholder="הערה (אופציונלי)" rows="2"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  <button onClick={submitSubChange} disabled={saving}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── עדכון דרגה ── */}
        {settingsView === 'belt' && (
          <div className="space-y-4">
            <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 text-sm text-emerald-600 font-medium -mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l6-6-6-6"/></svg>
              הגדרות
            </button>
            {member?.belt && (
              <div className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-gray-400">דרגה נוכחית</span>
                  <span className="text-sm font-medium text-gray-900">
                    {getBeltLabel(member.belt)}
                  </span>
                </div>
              </div>
            )}
            {hasPendingBelt ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">יש בקשת דרגה ממתינה — לא ניתן לשלוח בקשה נוספת</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 px-1">{member?.belt ? 'הדרגה לא מעודכנת? שלח בקשה לתיקון.' : 'הזן את הדרגה הנוכחית שלך לאישור המנהל.'}</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">תאריך לידה <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={birthDate || ''} onChange={e => setBirthDate(e.target.value)} />
                  {autoAge !== null && (
                    <p className={`text-xs mt-1.5 font-semibold px-2 py-1 rounded-lg inline-block ${autoCategory === 'kids' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                      {autoCategory === 'kids' ? `גיל ${autoAge} — קטגוריית ילדים` : `גיל ${autoAge} — קטגוריית בוגרים`}
                    </p>
                  )}
                </div>
                {autoCategory && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">חגורה נוכחית <span className="text-red-500">*</span></label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm bg-white" value={beltVal}
                      onChange={e => { const v = e.target.value; setBeltVal(v); setBeltStripes(s => Math.min(s || 0, getMaxStripes(v))) }}>
                      <option value="">— בחר חגורה —</option>
                      {(autoCategory === 'kids' ? KIDS_BELTS : ADULT_BELTS).map(b => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {beltVal && autoCategory === 'adult' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">מתי התחלת להתאמן BJJ? <span className="text-gray-400">(תאריך משוער)</span></label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={bjjStartDate || ''} onChange={e => setBjjStartDate(e.target.value)} />
                  </div>
                )}
                {beltVal && beltVal !== 'white' && beltVal !== 'kids_white' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">תאריך קבלת החגורה הנוכחית</label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={beltReceivedAt || ''} onChange={e => setBeltReceivedAt(e.target.value)} />
                  </div>
                )}
                {autoCategory && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">סוג אימון <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer bg-white border rounded-lg px-3 py-2">
                        <input type="checkbox" checked={!!reqTrainsGi} onChange={e => setReqTrainsGi(e.target.checked)} className="w-4 h-4 accent-amber-600" />גי
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer bg-white border rounded-lg px-3 py-2">
                        <input type="checkbox" checked={!!reqTrainsNogi} onChange={e => setReqTrainsNogi(e.target.checked)} className="w-4 h-4 accent-blue-600" />נו-גי
                      </label>
                    </div>
                  </div>
                )}
                <input type="text" value={priorAcademy} onChange={e => setPriorAcademy(e.target.value)}
                  placeholder="אקדמיה קודמת (אופציונלי)" className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                <textarea value={beltNote} onChange={e => setBeltNote(e.target.value)}
                  placeholder="הערה למנהל (אופציונלי)" rows="2"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none bg-white" />
                <button onClick={submitBeltChange} disabled={saving || !autoCategory}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── אבטחה ── */}
        {settingsView === 'security' && (
          <div className="space-y-4">
            <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 text-sm text-emerald-600 font-medium -mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l6-6-6-6"/></svg>
              הגדרות
            </button>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">שינוי סיסמה</p>
              <div className="space-y-2">
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="סיסמה חדשה (לפחות 6 תווים)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="אימות סיסמה"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
                {pwMsg && <p className={`text-xs ${pwMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg.text}</p>}
                <button onClick={updatePassword} disabled={pwSaving}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {pwSaving ? 'מעדכן...' : 'עדכן סיסמה'}
                </button>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut()}
              className="w-full border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 py-2.5 rounded-lg text-sm font-medium transition">
              יציאה מהמערכת
            </button>
          </div>
        )}
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
  const [cartCount, setCartCount]           = useState(0)
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
      // הערה: בעבר היה כאן קוד שמנסה לעדכן את member.id ב-DB להיות שווה ל-profile.id
      // כדי לאחד IDs. זה גרם לבאג חמור: ה-FK של checkins.athlete_id מצביע על members(id)
      // בלי ON UPDATE CASCADE — לכן שינוי ID שבר את הקישור לכל הצ'ק-אינים הקיימים.
      // התוצאה: מתאמן שראה 0/1 אימונים בלבד למרות שהיו לו עשרות.
      // הגישה הנכונה: לקבל ש-profile.id ו-member.id יכולים להיות שונים, ולהשתמש
      // ב-member.id (עם fallback ל-profile.id) בכל מקום שעובד עם checkins/class_registrations.
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
      supabase.from('announcements').select('id, type, title, content, description_long, features, image_url, color_images, status, created_at, price, branch_ids, purchase_options, available_sizes, available_colors, available_lengths, bundle_items').in('type', ['product', 'seminar', 'bundle']).or(statusFilter).order('created_at', { ascending: false }),
      supabase.from('announcements').select('id, type, title, content, image_url, status, created_at, price, branch_ids').in('type', ['general', 'announcement', 'promotion']).or(statusFilter).order('created_at', { ascending: false }).limit(50),
    ])
    setAnnouncements([...(itemsRes.data || []), ...(generalRes.data || [])])
  }

  async function fetchRegistrations() {
    // מביאים את שני השבועות (נוכחי + הבא) בשאילתה אחת ומפצלים לפי week_start.
    // ככה לא מבצעים שתי קריאות נפרדות, וקטגוריית הספירה תמיד מסונכרנת.
    const wsCurrent = getWeekStart()
    const wsNext = getNextWeekStart()
    // ה-registrations נשמרים תחת members.id — fallback ל-profile.id לתאימות.
    const athleteId = member?.id || profile.id
    const { data } = await supabase.from('class_registrations')
      .select('class_id, week_start')
      .eq('athlete_id', athleteId)
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
    //   ביטול — חסום ברגע שהשיעור מתחיל.
    //   רישום — חלון חסד של LATE_REGISTER_GRACE_MIN דקות אחרי תחילת השיעור (למאחרים).
    if (!isNext) {
      const now = getNow()
      const sameDay = now.getDay() === cls.day_of_week
      const [hh = 0, mm = 0, ss = 0] = (cls.start_time || '00:00:00').split(':').map(Number)

      const startedAlready = (() => {
        if (!sameDay) return false
        const todayStart = new Date(now); todayStart.setHours(hh, mm, ss || 0, 0)
        return now >= todayStart
      })()

      const lateWindowClosed = (() => {
        if (!sameDay) return false
        const lateCutoff = new Date(now); lateCutoff.setHours(hh, mm, ss || 0, 0)
        lateCutoff.setMinutes(lateCutoff.getMinutes() + LATE_REGISTER_GRACE_MIN)
        return now >= lateCutoff
      })()

      if (isRegistered && startedAlready) {
        toast.error('השיעור כבר התחיל — לא ניתן לבטל את הרישום.')
        return
      }
      if (!isRegistered && lateWindowClosed) {
        toast.error(`חלון הרישום נסגר (עד ${LATE_REGISTER_GRACE_MIN} דקות אחרי תחילת השיעור).`)
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
        // ⚠️ weekStart נוצר עם toISOString() שמחזיר UTC midnight — בישראל (UTC+2/3)
        // זה יום לפני היום המקומי. new Date(weekStart) ייתן שבת במקום ראשון.
        // לכן מחשבים את ראשון הבא ישירות מ-local time, ולא דרך weekStart.
        const now2 = new Date()
        const daysToNextSunday = 7 - now2.getDay() // 1–7 (לעולם לפחות 1 = שבוע הבא)
        const nextSunday = new Date(now2)
        nextSunday.setDate(now2.getDate() + daysToNextSunday)
        nextSunday.setHours(0, 0, 0, 0)
        const occ = new Date(nextSunday)
        occ.setDate(nextSunday.getDate() + cls.day_of_week)
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

    // ה-checkins/registrations נשמרים תחת members.id (לפי FK).
    // fallback ל-profile.id כדי לא לשבור רשומות ישנות.
    const athleteId = member?.id || profile.id

    // Optimistic update: מעדכן UI מיד, לפני קריאה לשרת.
    // כך אם המשתמש מחליף טאב/יוצא מיד אחרי לחיצה — ה-UI כבר נכון,
    // וגם אם הבקשה נכשלת ברקע, ה-visibilitychange listener יסנכרן עם השרת.
    if (isRegistered) {
      setTargetSet(p => { const n = new Set(p); n.delete(cls.id); return n })
      try {
        const { error } = await supabase.from('class_registrations').delete()
          .eq('class_id', cls.id).eq('athlete_id', athleteId).eq('week_start', weekStart)
        if (error) throw error
        // ביטול רישום → מוחק את ה-checkin המוטמע 'present' של ההופעה הקרובה.
        // אם המאמן כבר סימן 'absent' לא דורסים — ה-status filter מוודא זאת.
        const occStart = computeOccurrenceStart()
        const dayStart = new Date(occStart); dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999)
        await supabase.from('checkins').delete()
          .eq('class_id', cls.id)
          .eq('athlete_id', athleteId)
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
          { class_id: cls.id, athlete_id: athleteId, week_start: weekStart },
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
          const { error: chkErr } = await supabase.from('checkins').upsert(
            {
              class_id: cls.id,
              athlete_id: athleteId,
              status: 'present',
              checked_in_at: checkedAt.toISOString(),
              checkin_date: checkinDate,
            },
            { onConflict: 'class_id,athlete_id,checkin_date', ignoreDuplicates: true }
          )
          // אם ה-checkin נכשל (למשל RLS), לוג ברור.
          // ה-class_registration כבר נשמר — לא מתבטל. אבל ההתקדמות לא תתעדכן עד backfill.
          if (chkErr) {
            console.error('[register] auto-checkin failed (registration saved, but progress will not show this class):', chkErr)
          }
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
      <header className="shrink-0 bg-gradient-to-br from-black via-neutral-900 to-red-900 text-white px-5 py-2 shadow-lg safe-area-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="TeamPact"
              className="w-14 h-14 object-contain shrink-0"
              draggable="false"
            />
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
          {activeTab === 'shop' && <ShopTab profile={profile} member={member} allAnnouncements={announcements} onCartCountChange={setCartCount} />}
          {activeTab === 'announcements' && <AnnouncementsTab announcements={announcementsForTab} profile={profile} member={member} />}
          {activeTab === 'profile' && <ProfileTab profile={profile} member={member} />}
          {activeTab === 'settings' && <SettingsTab profile={profile} member={member} />}
        </div>
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isTrainer={false} announcementsCount={announcementsCount} cartCount={cartCount} />
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
