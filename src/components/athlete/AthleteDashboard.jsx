import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import BottomNav from '../BottomNav'
import InstallBanner from '../InstallBanner'
import EnablePushBanner from '../EnablePushBanner'
import BirthdayBanner from '../BirthdayBanner'
import { isStandalone } from '../../lib/platform'
import { notifyPush } from '../../lib/notifyPush'
import { nonSecretaryTrainerUserIds } from '../../lib/notifyTargets'
import ProductDetail from './ProductDetail'
import MyProgressSection from './MyProgressSection'
import { useToast, useConfirm } from '../a11y'
import logoUrl from '../../assets/logo.png'
import { ADULT_BELTS, KIDS_BELTS, getMaxStripes, getBeltLabel } from '../../lib/belts'
import { classDiscipline, DISCIPLINE_ORDER, DISCIPLINE_LABELS } from '../../lib/disciplines'

const SUBSCRIPTION_LIMITS = { '1x_week': 1, '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const FREEZE_REASON_LABELS = { military: 'מילואים', study: 'לימודים', medical: 'רפואי', injury: 'פציעה', other: 'אחר' }
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

// רשימת הנרשמים לשיעור — נשלפת דרך RPC מאובטח (get_class_registrants) כי
// ה-RLS של class_registrations מאפשר למתאמן לראות רק את הרישומים של עצמו.
// ה-RPC (SECURITY DEFINER) מאמת שהקורא הוא מתאמן פעיל בסניף של השיעור (או מאמן),
// ומחזיר שמות מלאים בלבד + דגל יומולדת 🎂 — בלי טלפון/אימייל/פרטים רגישים.
// העוגה מוצגת מהיומולדת ועד השיעור הראשון שהחוגג נרשם אליו אחריו, גג שבוע.
function ClassRegistrants({ classId, weekStart, classDate }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState(null)

  // החלפת שיעור/תאריך/שבוע — איפוס הרשימה כדי לא להציג נתונים של הקשר קודם
  useEffect(() => { setList(null); setOpen(false) }, [classId, weekStart, classDate])

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (list !== null) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_class_registrants', {
        p_class_id: classId,
        p_week_start: weekStart,
        p_class_date: classDate,
      })
      if (error) throw error
      setList(data || [])
    } catch (err) {
      console.error('get_class_registrants error:', err)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition"
      >
        <span>👥 מי נרשם לשיעור?</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mt-1">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-1">טוען...</p>
          ) : !list || list.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-1">עדיין אין נרשמים לשיעור הזה</p>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 font-bold mb-2">{list.length} נרשמו</p>
              <ul className="space-y-1.5">
                {list.map((r, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-center gap-1.5">
                    <span className="text-gray-300">•</span>
                    <span className="font-medium">{r.full_name}</span>
                    {r.is_birthday && <span title="יומולדת! 🎉">🎂</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ScheduleTab({ member, limit, registrations, registrationsNext, onRegister, branchesMap }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBranch, setActiveBranch] = useState('all')
  const [activeDiscipline, setActiveDiscipline] = useState('all') // סינון תחום לחימה
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
          .select('*, branches!inner(name, hidden), coaches(name)')
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

  // התחומים הקיימים בשיעורים של המתאמן (לפי הסדר הקבוע), להצגת כפתורי הסינון
  const availableDisciplines = DISCIPLINE_ORDER.filter(d => classes.some(c => classDiscipline(c) === d))
  // סינון משולב: סניף ואז תחום לחימה
  const byBranch = activeBranch === 'all'
    ? classes
    : classes.filter(c => c.branch_id === activeBranch)
  const filteredClasses = activeDiscipline === 'all'
    ? byBranch
    : byBranch.filter(c => classDiscipline(c) === activeDiscipline)

  const selectedDow = selectedDate ? selectedDate.getDay() : null
  const dayClasses = selectedDate
    ? filteredClasses
        .filter(c => c.day_of_week === selectedDow)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    : []

  // week_start של השבוע שאליו שייך התאריך הנבחר (יום ראשון, אותה קונבנציה
  // כמו getWeekStart — toISOString) + מחרוזת תאריך מקומית של היום הנבחר.
  // שניהם משמשים את רשימת הנרשמים (ClassRegistrants) — כך הרשימה נכונה
  // גם לימים בשבוע שעבר/הבא בסטריפ התאריכים.
  const selectedWeekStart = selectedDate ? (() => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
  })() : null
  const selectedDateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : null

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


      {/* Discipline switcher — סינון תחום לחימה (מופיע רק אם יש יותר מתחום אחד) */}
      {availableDisciplines.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActiveDiscipline('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              activeDiscipline === 'all'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            כל התחומים
          </button>
          {availableDisciplines.map(d => (
            <button key={d} onClick={() => setActiveDiscipline(d)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                activeDiscipline === d
                  ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              {DISCIPLINE_LABELS[d] || d}
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
                <div key={cls.id}>
                <button onClick={() => !actionBlocked && onRegister(cls, weekMode)} disabled={disabled}
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
                    {cls.coaches?.name && (
                      <p className={`text-xs mt-0.5 ${(isReg || lateWindow) && !actionBlocked ? 'text-white/90' : 'text-gray-500'}`}>
                        👤 {cls.coaches.name}
                      </p>
                    )}
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
                <ClassRegistrants
                  classId={cls.id}
                  weekStart={selectedWeekStart}
                  classDate={selectedDateStr}
                />
                </div>
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
                  {cls.coaches?.name && (
                    <p className={`text-xs mt-0.5 ${past ? 'text-gray-500' : 'text-red-100'}`}>
                      👤 {cls.coaches.name}
                    </p>
                  )}
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

// ממיר טקסט חופשי לרכיבי React כשכל URL (http/https/www) הופך לקישור לחיץ שנפתח בטאב חדש.
// בלי dangerouslySetInnerHTML — בטוח מ-XSS כי הטקסט נשאר טקסט והקישורים נבנים כ-<a> אמיתיים.
function linkifyText(text) {
  if (!text) return null
  const parts = String(text).split(/((?:https?:\/\/|www\.)[^\s]+)/g)
  return parts.map((part, i) => {
    if (/^(https?:\/\/|www\.)/.test(part)) {
      const href = part.startsWith('www.') ? `https://${part}` : part
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 underline break-all" onClick={e => e.stopPropagation()}>
          {part}
        </a>
      )
    }
    return part
  })
}

function AnnouncementsTab({ announcements, profile, member, lastSeen = '', focusId = null, onFocusConsumed }) {
  const toast = useToast()
  const confirm = useConfirm()
  // הדגשה זמנית של הודעה/סמינר שהגיעו אליהם מהתראת push
  const [highlightId, setHighlightId] = useState(null)

  useEffect(() => {
    if (!focusId || announcements.length === 0) return
    // ממתינים ל-render ואז גוללים להודעה ומדגישים אותה ל-3 שניות
    const t = setTimeout(() => {
      const el = document.getElementById(`announcement-${focusId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightId(focusId)
        setTimeout(() => setHighlightId(null), 3000)
      }
      onFocusConsumed?.()
    }, 300)
    return () => clearTimeout(t)
  }, [focusId, announcements.length])
  const athleteName = member?.full_name || profile?.full_name || profile?.email || 'לא ידוע'
  // ה-id של המתאמן הפעיל (ילד נבחר במתג ההורה) — הרשמות סמינר נשמרות תחתיו, לא תחת ההורה.
  const athleteId = member?.id || profile?.id || null
  const general = announcements.filter(a => a.type === 'general' || a.type === 'announcement' || a.type === 'promotion')
  const seminars = announcements.filter(a => a.type === 'seminar')
  const storageKey = athleteId ? `seminars_ordered_${athleteId}` : null
  const [ordered, setOrdered] = useState(() => {
    if (!storageKey) return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const [orderingId, setOrderingId] = useState(null)
  // הזמנות סמינר שהמנהל סימן כ"הושלמו" (status='done') — הכפתור הופך ל"✅ ההזמנה הושלמה".
  // בלי ה-state הזה הקומפוננטה קרסה ב-ReferenceError כי orderedDone היה מוגדר רק ב-ShopTab.
  const [orderedDone, setOrderedDone] = useState(new Set())
  // סינון תצוגה: הכל / אירועים / הודעות
  const [filter, setFilter] = useState('all')
  // צילום מצב "נקרא עד" ברגע הכניסה לטאב — כדי שנקודות ה"לא נקרא" יישארו יציבות בזמן הצפייה
  const [seenSnapshot] = useState(() => lastSeen || '')

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify([...ordered])) } catch {}
  }, [ordered, storageKey])

  useEffect(() => {
    if (!athleteId || seminars.length === 0) return
    supabase.from('product_requests')
      .select('product_name, announcement_id, status')
      .eq('athlete_id', athleteId)
      .then(({ data }) => {
        const rows = data || []
        // קישור הרשמה לסמינר לפי announcement_id (uuid); נפילה-לאחור לכותרת לרשומות ישנות בלי id.
        // כך שעריכת כותרת הסמינר לא מנתקת את "ממתין לאישור/לתשלום".
        const matches = (item, isDone) => rows.some(r =>
          (isDone ? r.status === 'done' : r.status !== 'done') &&
          (r.announcement_id ? r.announcement_id === item.id : r.product_name === item.title)
        )
        const ids     = seminars.filter(p => matches(p, false)).map(p => p.id)
        const doneIds = seminars.filter(p => matches(p, true)).map(p => p.id)
        setOrdered(new Set(ids))
        setOrderedDone(new Set(doneIds))
      })
  }, [athleteId, seminars.length])

  // מחיר אפקטיבי לסמינר: אם הוגדר מחיר מוקדם ותאריך תפוגה — עד התאריך (כולל) המחיר המוקדם,
  // אחריו המחיר הרגיל. אם אין מחיר מוקדם — המחיר הרגיל.
  function seminarPricing(item) {
    const early = item.early_price != null ? Number(item.early_price) : null
    const regular = item.price != null ? Number(item.price) : null
    const deadline = item.early_price_deadline ? new Date(item.early_price_deadline + 'T23:59:59') : null
    const earlyActive = early != null && deadline != null && new Date() <= deadline
    const current = earlyActive ? early : (regular != null ? regular : early)
    return { early, regular, deadline, earlyActive, current }
  }

  async function handleOrder(item) {
    // מתאמן ממתין/נמחק — חסום מהרשמה לסמינר. (ה-DB גם חוסם; כאן הודעה ברורה ורכה במקום שגיאה.)
    const blocked = !member || !!member.deleted_at || (member.status !== 'approved' && member.status !== 'active')
    if (blocked) {
      if (member?.deleted_at) toast.warning('החשבון שלך הוסר על ידי המועדון. לפרטים פנה למאמן.')
      else toast.info('ממתין לאישור מנהל לבדיקת המנוי. לאחר האישור תוכל להירשם לסמינרים.')
      return
    }
    if (orderedDone.has(item.id)) return // הזמנה שהושלמה — אין מה לבטל
    if (ordered.has(item.id)) {
      const ok = await confirm({ title: 'ביטול הזמנה', message: `לבטל את ההזמנה של "${item.title}"?`, confirmText: 'בטל הזמנה', danger: true })
      if (!ok) return
      setOrderingId(item.id)
      await supabase.from('product_requests')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('announcement_id', item.id)
        .eq('status', 'pending')
      setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
      setOrderingId(null)
      return
    }
    // דיאלוג אישור הרשמה — מציג תאריך + המחיר שנקבע לפי מועד ההרשמה. התשלום פיזי באקדמיה.
    const pr = seminarPricing(item)
    const confirmParts = []
    if (item.event_date) confirmParts.push(`תאריך: ${new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`)
    if (pr.current != null) confirmParts.push(`מחיר: ₪${pr.current}${pr.earlyActive ? ' (מחיר מוקדם)' : ''}`)
    confirmParts.push('התשלום יתבצע באקדמיה')
    const okReg = await confirm({
      title: `הרשמה ל"${item.title}"`,
      message: confirmParts.join(' · '),
      confirmText: 'אישור הרשמה',
    })
    if (!okReg) return
    setOrderingId(item.id)
    // הגנה מפני הרשמה כפולה לאותו סמינר: בדיקה טרייה מול ה-DB (תופסת גם הרשמה
    // ממכשיר/סשן אחר שעדיין לא שוקפה ב-state המקומי). השרת חוסם סופית עם אילוץ ייחודי
    // על (athlete_id, announcement_id). athlete_id = המתאמן הפעיל, כך שילד שני של אותו
    // הורה (member נפרד) עדיין יכול להירשם.
    const { data: existingReg } = await supabase.from('product_requests')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('announcement_id', item.id)
      .limit(1)
    if (existingReg && existingReg.length) {
      setOrdered(prev => new Set([...prev, item.id]))
      toast.info('כבר נרשמת לסמינר הזה')
      setOrderingId(null)
      return
    }
    const { error } = await supabase.from('product_requests').insert({
      product_name: item.title,
      announcement_id: item.id,
      athlete_id: athleteId,
      athlete_name: athleteName,
      status: 'pending',
      notes: `הרשמה לסמינר${pr.earlyActive ? ' · מחיר מוקדם' : ''}`,
      ...(pr.current != null ? { unit_price: pr.current, total_price: pr.current } : {}),
    })
    if (error) {
      // 23505 = הפרת אילוץ ייחודי → כבר קיימת הרשמה (מרוץ בין מכשירים). הודעה רכה במקום שגיאה.
      if (error.code === '23505') {
        setOrdered(prev => new Set([...prev, item.id]))
        toast.info('כבר נרשמת לסמינר הזה')
        setOrderingId(null)
        return
      }
      console.error('order error:', error); toast.error('שגיאה: ' + (error.message || error.code || 'לא ידוע'))
    }
    else {
      setOrdered(prev => new Set([...prev, item.id]))
      toast.success('נרשמת לסמינר! התשלום יתבצע באקדמיה')
      // בניית גוף התראה - כולל המחיר האפקטיבי לפי מועד ההרשמה
      const bodyParts = [`${athleteName} נרשם לסמינר: ${item.title}`]
      if (pr.current != null) bodyParts.push(`מחיר: ₪${pr.current}${pr.earlyActive ? ' (מוקדם)' : ''}`)
      if (item.event_date) bodyParts.push(`תאריך: ${new Date(item.event_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`)
      nonSecretaryTrainerUserIds()
        .then(ids => notifyPush({
          userIds: ids,
          title: '🎓 הרשמה חדשה לסמינר',
          body: bodyParts.join(' · '),
          url: '/#announcements',
          tag: `order:${Date.now()}`,
        }))
        .catch(() => {})
    }
    setOrderingId(null)
  }

  if (general.length === 0 && seminars.length === 0) {
    return <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין הודעות כרגע</p></div>
  }

  // הפרדה לשני אזורים: "אירועים קרובים" (סמינרים/תחרויות, לפי תאריך האירוע) ו"הודעות" (לפי תאריך פרסום).
  // שינוי תצוגה בלבד — לא נוגע בנתונים, בתמונות או בהרשמות.
  const now = new Date()
  // "לא נקרא" — פורסם אחרי הצילום של last_seen (אותו מקור אמת של הבאדג' על הטאב)
  const isUnread = item => !!(item.created_at && item.created_at > seenSnapshot)
  // אירוע נחשב "הסתיים" ברגע ששעת הסיום שלו עברה.
  // אם הוגדרה שעת סיום (event_end_time) — משתמשים בה; אחרת נופלים לסוף יום האירוע (חצות).
  // event_date נשמר עם T12:00:00, לכן מציבים עליו את שעת הסיום הנכונה לפני ההשוואה.
  const isEventPast = item => {
    if (!item.event_date) return false
    const end = new Date(item.event_date)
    const m = /^(\d{1,2}):(\d{2})/.exec(item.event_end_time || '')
    if (m) end.setHours(Number(m[1]), Number(m[2]), 0, 0)
    else end.setHours(23, 59, 59, 999)
    return now > end
  }
  // דירוג אירוע: [0]=עתידי (מהקרוב לרחוק), [1]=ללא תאריך (החדש שפורסם ראשון)
  const eventRank = item => {
    const d = item.event_date ? new Date(item.event_date) : null
    if (!d) return [1, -(new Date(item.created_at || 0).getTime())]
    return [0, d.getTime()]
  }
  const isPastEvent = isEventPast
  // אצל המתאמן — אירוע שהסתיים נעלם לגמרי (לא מוצג בכלל, גם לא מקופל).
  const events  = [...seminars].filter(e => !isPastEvent(e)).sort((a, b) => { const ra = eventRank(a), rb = eventRank(b); return ra[0] - rb[0] || ra[1] - rb[1] })
  const upcomingEvents = events
  const pastEvents = []
  const notices = [...general].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  // קיבוץ הודעות לפי זמן: היום / השבוע / מוקדם יותר
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6)
  const noticeGroupKey = item => {
    const d = item.created_at ? new Date(item.created_at) : null
    if (!d) return 'earlier'
    if (d >= todayStart) return 'today'
    if (d >= weekStart) return 'week'
    return 'earlier'
  }
  const relTime = item => {
    const d = item.created_at ? new Date(item.created_at) : null
    if (!d) return ''
    if (d >= todayStart) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  }
  const noticeGroups = [
    { key: 'today',   label: 'היום',       items: notices.filter(n => noticeGroupKey(n) === 'today') },
    { key: 'week',    label: 'השבוע',      items: notices.filter(n => noticeGroupKey(n) === 'week') },
    { key: 'earlier', label: 'מוקדם יותר', items: notices.filter(n => noticeGroupKey(n) === 'earlier') },
  ].filter(g => g.items.length > 0)

  // ---- הודעה: שורה רזה ושקטה (ביטול אימון / חג / לו"ז) ----
  const renderNotice = item => {
    const unread = isUnread(item)
    return (
      <div key={item.id} id={`announcement-${item.id}`}
        className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-500 ${
          highlightId === item.id ? 'border-blue-500 ring-2 ring-blue-300' : unread ? 'border-amber-200' : ''} ${unread ? '' : 'opacity-70'}`}>
        {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-gray-50" loading="lazy" />}
        <div className="p-4">
          <div className="flex items-start gap-2">
            {unread && <span aria-label="לא נקרא" className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-gray-800 ${unread ? 'font-semibold' : 'font-medium'}`}>{item.title}</p>
                {item.created_at && <span className="text-[11px] text-gray-400 shrink-0 mt-0.5">{relTime(item)}</span>}
              </div>
              {item.content && <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-line">{linkifyText(item.content)}</p>}
              {Array.isArray(item.links) && item.links.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {item.links.map((lnk, i) => (
                    <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold shadow-sm">
                      🔗 {lnk.label || lnk.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---- אירוע: כרטיס עשיר (סמינר/תחרות) עם תמונה, תאריך, מיקום, מחיר, הרשמה ----
  const renderEvent = item => {
    const pr = seminarPricing(item)
    const fmtD = d => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
    const unread = isUnread(item)
    const past = isEventPast(item)
    const earlyDaysLeft = pr.earlyActive && pr.deadline ? Math.ceil((pr.deadline - now) / 86400000) : null
    const showButton = item.allow_app_registration !== false && (!past || ordered.has(item.id) || orderedDone.has(item.id))
    return (
      <div key={item.id} id={`announcement-${item.id}`}
        className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-500 ${
          highlightId === item.id ? 'border-blue-500 ring-2 ring-blue-300' : ''} ${past ? 'opacity-60' : ''}`}>
        {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-gray-50" loading="lazy" />}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">🎓 סמינר</span>
              {past && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">הסתיים</span>}
            </div>
            {unread && !past && <span aria-label="לא נקרא" className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
          </div>
          <p className="font-semibold text-gray-800 text-base">{item.title}</p>
          <div className="mt-2 space-y-1">
            {item.event_date && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>📅</span><span>{new Date(item.event_date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
            )}
            {item.event_start_time && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>🕒</span><span>{item.event_start_time}{item.event_end_time ? `–${item.event_end_time}` : ''}</span>
              </div>
            )}
            {item.event_location && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(item.event_location)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                <span>📍</span><span>{item.event_location}</span>
              </a>
            )}
          </div>
          {item.content && <p className="text-xs text-gray-500 mt-2 whitespace-pre-line">{linkifyText(item.content)}</p>}
          {/* קישורי הרשמה חיצונית (אינטרקלאב/תחרות) — מוסתרים אחרי שהאירוע הסתיים כדי שלא ניתן יהיה להירשם לאירוע שעבר */}
          {!past && Array.isArray(item.links) && item.links.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {item.links.map((lnk, i) => (
                <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold">
                  🔗 {lnk.label || lnk.url}
                </a>
              ))}
            </div>
          )}
          {/* אירוע שהסתיים שההרשמה אליו הייתה דרך קישור חיצוני — חיווי "ההרשמה נסגרה" במקום הקישור */}
          {past && item.allow_app_registration === false && Array.isArray(item.links) && item.links.length > 0 && (
            <p className="mt-2 text-xs text-gray-400 font-medium">🔒 ההרשמה לאירוע נסגרה</p>
          )}
          {/* תמחור: אם יש מחיר מוקדם — מציגים את שני המחירים, הנוכחי מודגש והשני מחוק/אפור */}
          {pr.early != null && pr.deadline && pr.regular != null ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={pr.earlyActive ? 'font-bold text-emerald-600' : 'text-gray-400 line-through'}>
                עד {fmtD(pr.deadline)} — ₪{pr.early}
              </span>
              <span className={pr.earlyActive ? 'text-gray-500' : 'font-bold text-emerald-600'}>
                אחרי — ₪{pr.regular}
              </span>
              {pr.earlyActive && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">מחיר מוקדם בתוקף!</span>}
            </div>
          ) : pr.current != null && (
            <p className="text-sm font-bold text-emerald-600 mt-2">₪{pr.current}</p>
          )}
          {/* דדליין מחיר מוקדם מתקרב — תגית דחיפות */}
          {earlyDaysLeft != null && earlyDaysLeft >= 0 && earlyDaysLeft <= 7 && (
            <div className="mt-2">
              <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full">⏳ מחיר מוקדם — נותר {earlyDaysLeft === 0 ? 'פחות מיום' : `${earlyDaysLeft} ימים`}</span>
            </div>
          )}
          {/* כפתור הרשמה פנימי — מוצג רק אם המנהל לא כיבה "הרשמה דרך האפליקציה" */}
          {showButton && (
            <button onClick={() => handleOrder(item)} disabled={orderingId === item.id}
              className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                orderedDone.has(item.id) ? 'bg-emerald-100 text-emerald-700 cursor-default'
                : ordered.has(item.id) ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
              {orderingId === item.id ? '...'
                : orderedDone.has(item.id) ? '✅ נרשמת — התשלום אושר'
                : ordered.has(item.id) ? (pr.current > 0 ? '⏳ נרשמת — ממתין לתשלום (לחץ לביטול)' : '⏳ נרשמת — ממתין לאישור (לחץ לביטול)')
                : `להירשם לסמינר${pr.current != null ? ` · ₪${pr.current}` : ''}`}
            </button>
          )}
        </div>
      </div>
    )
  }

  const showEvents  = filter !== 'notices' && events.length > 0
  const showNotices = filter !== 'events' && noticeGroups.length > 0

  return (
    <div className="space-y-5">
      {/* סרגל סינון: הכל / אירועים / הודעות */}
      <div className="flex bg-gray-100 rounded-full p-1 text-sm">
        {[{ key: 'all', label: 'הכל' }, { key: 'events', label: 'אירועים' }, { key: 'notices', label: 'הודעות' }].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`flex-1 py-1.5 rounded-full font-medium transition ${
              filter === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {showEvents && (
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800 text-lg">📅 אירועים קרובים</h2>
          {upcomingEvents.length > 0
            ? upcomingEvents.map(renderEvent)
            : <p className="text-sm text-gray-400 py-2">אין אירועים קרובים</p>}
        </div>
      )}

      {showNotices && (
        <div className="space-y-4">
          <h2 className="font-bold text-gray-800 text-lg">📢 הודעות</h2>
          {noticeGroups.map(g => (
            <div key={g.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">{g.label}</span>
                <span className="flex-1 h-px bg-gray-200" />
              </div>
              {g.items.map(renderNotice)}
            </div>
          ))}
        </div>
      )}

      {!showEvents && !showNotices && (
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📭</div><p>אין מה להציג כאן</p></div>
      )}
    </div>
  )
}

function ShopTab({ profile, member, allAnnouncements, onCartCountChange }) {
  const toast = useToast()
  const confirm = useConfirm()
  const products = allAnnouncements.filter(a => a.type === 'product' || a.type === 'bundle')
  const athleteName = member?.full_name || profile?.full_name || profile?.email || 'לא ידוע'
  // ה-id של המתאמן הפעיל (ילד נבחר במתג ההורה) — הרשמות/הזמנות נשמרות תחתיו, לא תחת ההורה.
  const athleteId = member?.id || profile?.id || null
  const storageKey = athleteId ? `shop_ordered_${athleteId}` : null
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
    if (!athleteId || products.length === 0) return
    supabase.from('product_requests')
      .select('*')
      .eq('athlete_id', athleteId)
      .then(({ data }) => {
        const rows = data || []
        // pending = כל מה שלא done/cancelled (כולל null מהזמנות ישנות)
        const pendingRows = rows.filter(r => !r.status || r.status === 'pending')
        const doneNames   = new Set(rows.filter(r => r.status === 'done').map(r => r.product_name))
        const pendingTitles = new Set(pendingRows.map(r => r.product_name))
        const pendingIds = products.filter(p => pendingTitles.has(p.title)).map(p => p.id)
        // "done" מוצג רק אם אין כרגע הזמנה ממתינה לאותו מוצר — כך שהזמנה חדשה תמיד גוברת
        // ולא נחסמת ע"י הזמנה ישנה שהושלמה.
        const doneIds    = products.filter(p => doneNames.has(p.title) && !pendingTitles.has(p.title)).map(p => p.id)
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
  }, [athleteId, products.length])

  // handleOrder מטפל גם בהזמנה ישירה (מהרשימה) וגם בהזמנה מדף פירוט (עם אפשרות/מידה/צבע/אורך/רכיבים)
  // כשeditRequestId קיים — עדכון רשומה קיימת במקום יצירת חדשה
  async function handleOrder(item, selectedOption = null, selectedSize = null, selectedColor = null, selectedLength = null, componentSelections = null, quantity = 1, editRequestId = null) {
    // מתאמן ממתין/נמחק — חסום מהזמנה בחנות. (ה-DB גם חוסם; כאן הודעה ברורה ורכה במקום שגיאה.)
    const blocked = !member || !!member.deleted_at || (member.status !== 'approved' && member.status !== 'active')
    if (blocked) {
      if (member?.deleted_at) toast.warning('החשבון שלך הוסר על ידי המועדון. לפרטים פנה למאמן.')
      else toast.info('ממתין לאישור מנהל לבדיקת המנוי. לאחר האישור תוכל להזמין בחנות.')
      return
    }
    // הערה: הזמנה שהושלמה (done) כבר לא חוסמת — מותר לבצע רכישה חוזרת של אותו מוצר.
    // (כרטיס done נפתח ל-ProductDetail ויוצר הזמנה pending חדשה.)
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
          .eq('athlete_id', athleteId)
          .eq('product_name', item.title)
          .or('status.eq.pending,status.is.null')
      }
      setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
      setOrderedRequestsMap(prev => { const n = {...prev}; delete n[item.id]; return n })
      setOrderingId(null)
      setSelectedProductId(null)
      nonSecretaryTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '❌ ביטול הזמנה', body: `${athleteName} ביטל הזמנה: ${item.title}`, url: '/#shop', tag: `order-cancel:${Date.now()}` })).catch(() => {})
      return
    }
    setOrderingId(item.id)
    // בונים את payload - שומרים את האפשרות, המידה והצבע
    const payload = {
      product_name: item.title,
      product_id: item.id || null,
      announcement_id: item.id || null,
      athlete_id: athleteId,
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
        nonSecretaryTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '✏️ עדכון הזמנה', body: editBodyParts.join(' · '), url: '/#shop', tag: `order-edit:${Date.now()}` })).catch(() => {})
        return
      }
    } else {
      // הגנה מפני הזמנה כפולה בחנות: אם כבר קיימת הזמנה *ממתינה* לאותו מוצר (מרוץ/מכשיר אחר)
      // — לא יוצרים חדשה. בודקים רק status='pending', כך שרכישה חוזרת אחרי 'done' (שולם)
      // עדיין מותרת, והזמנות שבוטלו לא חוסמות.
      const { data: existingPending } = await supabase.from('product_requests')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('product_id', item.id)
        .eq('status', 'pending')
        .limit(1)
      if (existingPending && existingPending.length) {
        toast.info('כבר יש לך הזמנה ממתינה למוצר הזה')
        setOrdered(prev => new Set([...prev, item.id]))
        setOrderingId(null)
        setSelectedProductId(null)
        return
      }
      const { data: insData, error: insErr } = await supabase.from('product_requests').insert(payload).select('id').single()
      error = insErr
      if (!error && insData?.id) {
        payload._insertedId = insData.id
      }
    }
    if (error) {
      // 23505 = הפרת אילוץ ייחודי → כבר קיימת הזמנה ממתינה (מרוץ בין מכשירים). הודעה רכה.
      if (error.code === '23505') {
        toast.info('כבר יש לך הזמנה ממתינה למוצר הזה')
        setOrdered(prev => new Set([...prev, item.id]))
        setOrderingId(null)
        setSelectedProductId(null)
        return
      }
      console.error('order error:', error); toast.error('שגיאה: ' + (error.message || error.code || 'לא ידוע'))
    }
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
      nonSecretaryTrainerUserIds()
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
                            .eq('athlete_id', athleteId)
                            .eq('product_name', item.title)
                            .or('status.eq.pending,status.is.null')
                        }
                        setOrdered(prev => { const n = new Set(prev); n.delete(item.id); return n })
                        setOrderedRequestsMap(prev => { const n = {...prev}; delete n[item.id]; return n })
                        setOrderingId(null)
                        nonSecretaryTrainerUserIds().then(ids => notifyPush({ userIds: ids, title: '❌ ביטול הזמנה', body: `${athleteName} ביטל הזמנה: ${item.title}`, url: '/#shop', tag: `order-cancel:${Date.now()}` })).catch(() => {})
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
        {/* אייקון העגלה תמיד גלוי — גם כשאין הזמנות ממתינות. המספר הירוק מופיע רק כשיש. */}
        <button
          type="button"
          onClick={() => setShowCart(true)}
          aria-label="עגלת הקניות שלי"
          className="relative flex items-center gap-1 text-gray-700 hover:text-gray-900 transition"
        >
          <span className="text-2xl">🛒</span>
          {pendingCartItems.length > 0 && (
            <span className="absolute -top-1 -left-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {pendingCartItems.length}
            </span>
          )}
        </button>
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
                  onClick={() => { if (!isPending) { setSelectedProductId(item.id); setTimeout(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }), 10) } }}
                  onKeyDown={e => e.key === 'Enter' && !isPending && (setSelectedProductId(item.id), setTimeout(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }), 10))}
                  className={!isPending ? 'cursor-pointer hover:shadow-md transition' : ''}
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">✅ ההזמנה הושלמה</span>
                      <span className="text-xs text-blue-600 font-medium">לרכישה נוספת לחץ ←</span>
                    </div>
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
  // מתאמן ממתין/נמחק — חסום מכל בקשת שינוי/פעולה. מחזיר true אם חסום (ומציג הודעה רכה).
  function blockIfNotActive() {
    if (!member || member.deleted_at) { toast.warning('החשבון שלך הוסר על ידי המועדון. לפרטים פנה למאמן.'); return true }
    if (member.status !== 'approved' && member.status !== 'active') { toast.info('ממתין לאישור מנהל לבדיקת המנוי. לאחר האישור תוכל לבצע פעולות.'); return true }
    return false
  }
  const [saving, setSaving] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  // פרטים אישיים
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  // אבטחה
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
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
  const [freezeReqStart, setFreezeReqStart] = useState('')
  const [freezeReqReason, setFreezeReqReason] = useState('military')
  const [freezeMinDate, setFreezeMinDate] = useState('')

  // התאריך המוקדם ביותר שאפשר להקפיא ממנו: יום אחרי האימון האחרון שהמתאמן היה בו נוכח
  async function computeFreezeMinDate() {
    const aid = member?.id || profile?.id
    const today = new Date().toISOString().split('T')[0]
    let min = today
    if (aid) {
      const { data } = await supabase.from('checkins')
        .select('checkin_date').eq('athlete_id', aid).eq('status', 'present')
        .order('checkin_date', { ascending: false }).limit(1)
      if (data && data[0]?.checkin_date) {
        const next = new Date(data[0].checkin_date + 'T00:00:00')
        next.setDate(next.getDate() + 1)
        const nextStr = next.toISOString().split('T')[0]
        if (nextStr > min) min = nextStr
      }
    }
    setFreezeMinDate(min)
    setFreezeReqStart(min)
  }

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
    if (blockIfNotActive()) return
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
    nonSecretaryTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: 'בקשת שינוי שם',
      body: `${athleteName} מבקש/ת לשנות שם ל: ${trimmed}`,
      url: '/#requests', tag: `name-request:${profile.id}`,
    })).catch(() => {})
    setNewName(''); loadPending()
  }

  async function submitEmailChange() {
    if (blockIfNotActive()) return
    // שינוי מייל ישיר דרך Supabase Auth (כמו אצל הצוות) — נשלח קישור אימות לכתובת החדשה.
    const trimmed = (newEmail || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { toast.error('כתובת מייל לא תקינה'); return }
    if (trimmed === (profile.email || '').trim().toLowerCase()) { toast.error('המייל זהה לנוכחי'); return }
    // הגנה קריטית: רשומת המתאמן נשלפת לפי id, ובנפילה — לפי email (fetchMyClasses).
    // אם החשבון מקושר רק לפי email (member.id ≠ profile.id), שינוי המייל ינתק את הרשומה
    // וישבור את החשבון. במקרה כזה חוסמים שינוי עצמי ומפנים למנהל.
    if (member && member.id !== profile.id) {
      toast.error('לא ניתן לשנות מייל מהאפליקציה עבור החשבון הזה — פנה למנהל לעדכון.')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('נשלח קישור אימות למייל החדש — יש ללחוץ עליו כדי להשלים. עד אז התחבר עם המייל הקודם.')
    setNewEmail('')
  }

  async function submitSubChange() {
    if (blockIfNotActive()) return
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
    nonSecretaryTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: 'בקשת שינוי מנוי/סניף',
      body: `${athleteName}: ${currentSub} → ${requestedSub}`,
      url: '/#requests', tag: `sub-request:${profile.id}`,
    })).catch(() => {})
    setSubNote(''); loadPending()
  }

  async function submitMembershipRequest() {
    if (blockIfNotActive()) return
    if (!membershipAction) return
    if (membershipAction === 'freeze') {
      if (!freezeReqStart) { toast.error('בחר תאריך התחלת הקפאה'); return }
      if (freezeMinDate && freezeReqStart < freezeMinDate) {
        toast.error(`אי אפשר להקפיא בתאריך שבו היית באימון. הכי מוקדם: ${freezeMinDate.split('-').reverse().join('/')}`)
        return
      }
    }
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: athleteName,
      change_type: membershipAction === 'freeze' ? 'membership_freeze' : 'membership_cancel',
      current_value: currentSub,
      requested_value: membershipAction,
      note: membershipNote || null,
      ...(membershipAction === 'freeze' ? {
        requested_freeze_start: freezeReqStart,
        requested_freeze_reason: freezeReqReason,
        requested_freeze_open: true, // המתאמן מבקש תאריך התחלה; החזרה תיקבע ע"י המנהל
      } : {}),
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success(membershipAction === 'freeze' ? 'בקשת ההקפאה נשלחה למנהל' : 'בקשת הביטול נשלחה למנהל')
    nonSecretaryTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: membershipAction === 'freeze' ? '❄️ בקשת הקפאת מנוי' : 'בקשת ביטול מנוי',
      body: membershipAction === 'freeze'
        ? `${athleteName} מבקש/ת להקפיא מנוי מתאריך ${freezeReqStart}`
        : `${athleteName} מבקש/ת לבטל מנוי`,
      url: '/#requests', tag: `membership-request:${profile.id}`,
    })).catch(() => {})
    setMembershipNote('')
    setMembershipAction(null)
    loadPending()
  }

  async function submitUnfreezeRequest() {
    if (blockIfNotActive()) return
    setSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: athleteName,
      change_type: 'membership_unfreeze',
      current_value: 'frozen',
      requested_value: 'active',
    })
    setSaving(false)
    if (error) { toast.error('שגיאה: ' + error.message); return }
    toast.success('בקשת הפעלת המנוי נשלחה למנהל')
    nonSecretaryTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: 'בקשת הפעלת מנוי',
      body: `${athleteName} מבקש/ת להפעיל מחדש את המנוי (יציאה מהקפאה)`,
      url: '/#requests', tag: `unfreeze-request:${profile.id}`,
    })).catch(() => {})
    loadPending()
  }

  async function submitBeltChange() {
    if (blockIfNotActive()) return
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
    nonSecretaryTrainerUserIds().then(ids => notifyPush({
      userIds: ids,
      title: 'בקשת אישור דרגה חדשה',
      body: `${athleteName} מבקש דרגה: ${getBeltLabel(beltVal)}${beltStripes ? ` · ${beltStripes} פסים` : ''}`,
      url: '/#requests', tag: `belt-request:${profile.id}`,
    })).catch(() => {})
    toast.success('הבקשה נשלחה למנהל')
    setBeltNote(''); setPriorAcademy(''); loadPending()
  }

  const hasPendingName = pendingRequests.some(r => r.change_type === 'name')
  const hasPendingSub = pendingRequests.some(r => r.change_type === 'subscription')
  const hasPendingBelt = pendingRequests.some(r => r.change_type === 'belt')
  const hasPendingMembership = pendingRequests.some(r => r.change_type === 'membership_freeze' || r.change_type === 'membership_cancel')
  const isFrozen = member?.membership_status === 'frozen'
  const hasPendingUnfreeze = pendingRequests.some(r => r.change_type === 'membership_unfreeze')

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
                {hasPendingName && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
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
              <div className="space-y-2">
                <input type="email" dir="ltr" inputMode="email" autoComplete="email"
                  value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="email@example.com" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-left" />
                <button onClick={submitEmailChange} disabled={saving}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'שולח...' : 'עדכן מייל'}
                </button>
                <p className="text-[11px] text-gray-400 px-1">יישלח קישור אימות לכתובת החדשה. ההתחברות תתעדכן רק לאחר אישור הקישור.</p>
              </div>
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
              {isFrozen ? (
                <div className="space-y-3">
                  <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                    <p className="font-semibold text-blue-800">❄️ המנוי שלך מוקפא</p>
                    <p className="text-xs text-blue-700">
                      {member?.freeze_reason ? `סיבה: ${FREEZE_REASON_LABELS[member.freeze_reason] || member.freeze_reason}` : 'הקפאה פעילה'}
                      {member?.freeze_start_date && ` · מ-${member.freeze_start_date.split('-').reverse().join('/')}`}
                      {member?.freeze_end_date
                        ? ` · עד ${member.freeze_end_date.split('-').reverse().join('/')}`
                        : ' · ממתין לאישור חזרה'}
                    </p>
                    {member?.freeze_requires_medical && (
                      <p className="text-xs text-blue-700">🩺 החזרה מותנית באישור רפואי</p>
                    )}
                  </div>
                  {hasPendingUnfreeze ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      בקשת הפעלת המנוי נשלחה — ממתינה לאישור מנהל
                    </p>
                  ) : (
                    <button
                      onClick={submitUnfreezeRequest}
                      disabled={saving}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                      {saving ? 'שולח...' : '✅ בקשת הפעלת מנוי'}
                    </button>
                  )}
                </div>
              ) : hasPendingMembership ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  יש בקשה ממתינה לאישור מנהל
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setMembershipAction(a => a === 'freeze' ? null : 'freeze'); if (membershipAction !== 'freeze') computeFreezeMinDate() }}
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
                        <>
                          <p className="text-xs text-blue-700 font-medium">הקפאת מנוי — הבקשה תאושר ע"י המנהל.</p>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">תאריך התחלת הקפאה</label>
                            <input type="date" value={freezeReqStart} min={freezeMinDate}
                              onChange={e => setFreezeReqStart(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                            {freezeMinDate && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                לא ניתן להקפיא בתאריך שבו היית באימון. הכי מוקדם: {freezeMinDate.split('-').reverse().join('/')}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">סיבה</label>
                            <select value={freezeReqReason} onChange={e => setFreezeReqReason(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                              <option value="military">מילואים</option>
                              <option value="study">לימודים</option>
                              <option value="medical">רפואי</option>
                              <option value="injury">פציעה</option>
                              <option value="other">אחר</option>
                            </select>
                          </div>
                        </>
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
                <div className="relative">
                  <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="סיסמה חדשה (לפחות 6 תווים)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pl-10 text-sm" />
                  <button type="button" tabIndex={-1} onClick={() => setShowNewPw(s => !s)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">
                    {showNewPw
                      ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
                  </button>
                </div>
                <div className="relative">
                  <input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="אימות סיסמה"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pl-10 text-sm" />
                  <button type="button" tabIndex={-1} onClick={() => setShowConfirmPw(s => !s)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">
                    {showConfirmPw
                      ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
                  </button>
                </div>
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
  // כל המתאמנים שהחשבון מורשה להם: עצמו (id=auth.uid) + ילדיו (guardian_id=auth.uid).
  // אם יש יותר מאחד — מוצג מתג החלפה למעלה. מתאמן רגיל (רשומה אחת) — זהה להיום.
  const [myMembers, setMyMembers]           = useState([])
  const activeMemberKey = profile?.id ? `tp_active_member_${profile.id}` : null
  // טופס "➕ הוסף ילד" מתוך האפליקציה (הורה קיים מוסיף ילד נוסף)
  const [addChildOpen, setAddChildOpen]     = useState(false)
  const [addChildSaving, setAddChildSaving] = useState(false)
  const [childForm, setChildForm]           = useState({ full_name: '', birth_date: '', branch_ids: [], subscription_type: '2x_week' })
  const [branchesMap, setBranchesMap]       = useState({})
  // מתאמן שנמחק ע"י המועדון (soft-delete — deleted_at מסומן) — חסום לחלוטין מפעולות.
  const isRemoved = !!member?.deleted_at
  // מתאמן שטרם אושר (status לא approved/active) — רואה את האפליקציה אך לא יכול לבצע פעולות.
  // מסד הנתונים אוכף את שניהם (current_user_can_book + deleted_at); כאן זה לחוויית המשתמש.
  const isPending = !!member && !isRemoved && member.status !== 'approved' && member.status !== 'active'
  const [registrations, setRegistrations]   = useState(new Set())
  const [registrationsNext, setRegistrationsNext] = useState(new Set())
  // welcome-back overlay — קופץ כשמגיעים מ-Push של "מתגעגעים אליך"
  const [welcomeBack, setWelcomeBack] = useState({ open: false, days: null })
  // הודעה/סמינר שצריך לגלול אליהם בטאב ההודעות (מגיע מהתראת push: #announcements?focus=<id>)
  const [focusAnnouncementId, setFocusAnnouncementId] = useState(null)

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
      // announcements?focus=<id> — פתיחת טאב הודעות וגלילה להודעה/סמינר ספציפיים (מהתראת push)
      if (raw.startsWith('#announcements')) {
        const qIdx = raw.indexOf('?')
        const focus = qIdx > -1 ? new URLSearchParams(raw.slice(qIdx + 1)).get('focus') : null
        setFocusAnnouncementId(focus || null)
        setActiveTab('announcements')
        return
      }
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
    if (profile?.id) { fetchMyClasses(); fetchAnnouncements(); fetchBranches() }
  }, [profile])

  // רישומי השיעורים תלויים במתאמן הפעיל — מתרעננים בבחירה הראשונית ובכל החלפת ילד.
  useEffect(() => {
    if (member?.id) fetchRegistrations(member.id)
  }, [member?.id])

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
        // ריענון רשומת המתאמן (status) — כך שמתאמן "ממתין לאישור" שאושר בינתיים
        // ייפתח אוטומטית כשהוא חוזר למסך, בלי פולינג רציף.
        fetchMyClasses()
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
      // טוען את כל המתאמנים של החשבון: עצמו (id=auth.uid) + ילדיו (guardian_id=auth.uid).
      // (member.id ו-profile.id יכולים להיות שונים — לא מאחדים IDs, זה שובר FK של checkins.)
      let list = []
      if (profile?.id) {
        const r = await supabase.from('members').select('*')
          .or(`id.eq.${profile.id},guardian_id.eq.${profile.id}`)
          .is('deleted_at', null)
        if (r.error) console.error('members fetch (.or) error:', r.error)
        list = r.data || []
      }
      // נפילה לאחור: חשבונות ישנים שבהם member.id ≠ auth.uid — איתור לפי email.
      if (list.length === 0 && profile?.email) {
        const email = profile.email.toLowerCase()
        const r = await supabase.from('members').select('*').eq('email', email).maybeSingle()
        if (r.error) console.error('member fetch by email error:', r.error)
        if (r.data) list = [r.data]
      }
      // מיון יציב: ההורה-עצמו ראשון, אחר כך ילדים לפי שם.
      list.sort((a, b) => {
        const aSelf = a.id === profile?.id ? 0 : 1
        const bSelf = b.id === profile?.id ? 0 : 1
        if (aSelf !== bSelf) return aSelf - bSelf
        return (a.full_name || '').localeCompare(b.full_name || '', 'he')
      })
      setMyMembers(list)
      // בחירת המתאמן הפעיל: שמור ב-localStorage אם עדיין תקף, אחרת ההורה-עצמו, אחרת הראשון.
      const savedId = activeMemberKey ? window.localStorage.getItem(activeMemberKey) : null
      const pick = list.find(m => m.id === savedId)
        || list.find(m => m.id === profile?.id)
        || list[0]
        || null
      setMember(pick)
    } catch (e) {
      console.error('fetchMyClasses threw:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAnnouncements() {
    const statusFilter = 'status.eq.approved,status.is.null'
    const [itemsRes, generalRes] = await Promise.all([
      supabase.from('announcements').select('id, type, title, content, description_long, features, image_url, color_images, status, created_at, price, early_price, early_price_deadline, event_date, event_start_time, event_end_time, event_location, branch_ids, purchase_options, available_sizes, available_colors, available_lengths, bundle_items, links, allow_app_registration').in('type', ['product', 'seminar', 'bundle']).or(statusFilter).order('created_at', { ascending: false }),
      supabase.from('announcements').select('id, type, title, content, image_url, status, created_at, price, branch_ids, links').in('type', ['general', 'announcement', 'promotion']).or(statusFilter).order('created_at', { ascending: false }).limit(50),
    ])
    setAnnouncements([...(itemsRes.data || []), ...(generalRes.data || [])])
  }

  // החלפת המתאמן הפעיל (מתג ההורה) — מעדכן member, שומר ב-localStorage,
  // וה-useEffect על member?.id מרענן את הרישומים אוטומטית.
  function switchMember(id) {
    const m = myMembers.find(x => x.id === id)
    if (!m) return
    setMember(m)
    if (activeMemberKey) window.localStorage.setItem(activeMemberKey, id)
  }

  // הוספת ילד מתוך האפליקציה (הורה קיים) — INSERT עם guardian_id=auth.uid, status=pending.
  // הילד הקיים לא נגע; שאילתת הטעינה .or() תחזיר את שניהם.
  async function submitAddChild() {
    const name = (childForm.full_name || '').trim()
    if (name.split(/\s+/).filter(Boolean).length < 2) { toast.error('יש להזין שם מלא של הילד/ה (פרטי + משפחה)'); return }
    if (!childForm.birth_date) { toast.error('נא למלא תאריך לידה'); return }
    if (childForm.branch_ids.length === 0) { toast.error('נא לבחור סניף'); return }
    setAddChildSaving(true)
    // שם ההורה ושם הטלפון — מהרשומות הקיימות אם יש, אחרת מהפרופיל.
    const existingChild = myMembers.find(m => m.guardian_id === profile?.id)
    const parentName = existingChild?.parent_name || profile?.full_name || null
    const phone = existingChild?.phone || myMembers[0]?.phone || null
    const { error } = await supabase.from('members').insert({
      full_name: name,
      email: null,
      phone,
      branch_ids: childForm.branch_ids,
      branch_id: childForm.branch_ids[0],
      subscription_type: childForm.subscription_type,
      membership_type: childForm.subscription_type,
      status: 'pending',
      birth_date: childForm.birth_date || null,
      guardian_id: profile?.id,
      parent_name: parentName,
    })
    setAddChildSaving(false)
    if (error) { console.error('add child error:', error); toast.error('שגיאה בהוספת הילד — נסה שוב'); return }
    toast.success('הילד נוסף! ממתין לאישור המאמן')
    setAddChildOpen(false)
    setChildForm({ full_name: '', birth_date: '', branch_ids: [], subscription_type: '2x_week' })
    await fetchMyClasses()
  }

  async function fetchRegistrations(forMemberId) {
    // מביאים את שני השבועות (נוכחי + הבא) בשאילתה אחת ומפצלים לפי week_start.
    // ככה לא מבצעים שתי קריאות נפרדות, וקטגוריית הספירה תמיד מסונכרנת.
    const wsCurrent = getWeekStart()
    const wsNext = getNextWeekStart()
    // ה-registrations נשמרים תחת members.id — fallback ל-profile.id לתאימות.
    const athleteId = forMemberId || member?.id || profile.id
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
    // מתאמן שנמחק ע"י המועדון — חסום לחלוטין. (ה-DB גם חוסם כגיבוי.)
    if (isRemoved) {
      toast.warning('החשבון שלך הוסר על ידי המועדון. לפרטים פנה למאמן.')
      return
    }
    // מתאמן שטרם אושר — יכול לראות את הלו"ז אך לא להירשם. (ה-DB גם חוסם כגיבוי.)
    if (isPending) {
      toast.info('ממתין לאישור מנהל לבדיקת המנוי. לאחר האישור תוכל להירשם לאימונים.')
      return
    }
    // איזה שבוע אנחנו רושמים/מבטלים — לפי הטאב הפעיל ב-ScheduleTab.
    const isNext = weekMode === 'next'
    // רישום לשבוע הבא פתוח תמיד (הלוז מציג שבועיים קדימה).
    const targetSet = isNext ? registrationsNext : registrations
    const setTargetSet = isNext ? setRegistrationsNext : setRegistrations
    const isRegistered = targetSet.has(cls.id)

    // מתאמן מוקפא — חסום מרישום חדש (ביטול רישום קיים עדיין מותר)
    if (member?.membership_status === 'frozen' && !isRegistered) {
      toast.info('המנוי שלך מוקפא — לא ניתן להירשם לאימונים עד החזרה.')
      return
    }

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
        // היום הוא יום השיעור — מעגנים את ההופעה להיום, גם אם השיעור כבר התחיל/נגמר.
        // כך רישום באיחור (אפילו אחרי שהשיעור נגמר) נספר לאותו אימון ויורד ממכסת השבוע,
        // במקום להתגלגל לשבוע הבא וליצור checkin "רפאים" שחוסם מכסה (הבאג של גל/אביתר).
        const todayStart = new Date(now)
        todayStart.setHours(hh, mm, ss || 0, 0)
        return todayStart
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
      {/* באנר יום הולדת צף — מוצג רק לחוגג ביום ההולדת שלו, פעם ביום */}
      <BirthdayBanner
        name={member?.full_name || profile?.full_name}
        birthDate={member?.birth_date}
        userId={profile?.id}
      />
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
      {/* מתג החלפה בין הילדים (הורה רב-ילדים) — מוצג רק אם יש יותר ממתאמן אחד.
          מתאמן רגיל (רשומה אחת) לא רואה כלום — זהה להיום. */}
      {(myMembers.length > 1 || myMembers.some(m => m.guardian_id === profile?.id)) && (
        <div className="shrink-0 bg-white border-b border-gray-200 overflow-x-auto">
          <div className="flex items-center gap-2 max-w-lg mx-auto px-4 py-2">
            <span className="text-xs text-gray-500 shrink-0">מתאמן:</span>
            {myMembers.map(m => {
              const active = m.id === member?.id
              const pending = m.status !== 'approved' && m.status !== 'active'
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMember(m.id)}
                  aria-pressed={active}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-400 ${
                    active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {(m.full_name || 'מתאמן').split(' ')[0]}
                  {pending && (
                    <span className={`mr-1 text-[10px] ${active ? 'text-emerald-100' : 'text-amber-600'}`}>· ממתין</span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setAddChildOpen(true)}
              className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border border-dashed border-emerald-400 text-emerald-700 hover:bg-emerald-50 transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-400"
            >
              ➕ הוסף ילד
            </button>
          </div>
        </div>
      )}
      {/* main ברוחב מלא — scrollbar מופיע בקצה המסך, לא באמצע (כפי שהיה ב-desktop רחב).
          התוכן עצמו עדיין מרוכז ב-max-w-lg כדי לשמור על UX מובייל-first. */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="p-4 max-w-lg w-full mx-auto">
          <div className="mb-3 space-y-2">
            {isRemoved && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 text-center" role="alert">
                <p className="text-sm font-bold text-red-800">⛔ החשבון שלך הוסר על ידי המועדון</p>
                <p className="text-xs text-red-700 mt-1">לא ניתן להירשם לאימונים או לבצע פעולות. לפרטים פנה למאמן או למזכירות.</p>
              </div>
            )}
            {isPending && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 text-center" role="status">
                <p className="text-sm font-bold text-amber-900">⏳ הבקשה שלך ממתינה לאישור מנהל</p>
                <p className="text-xs text-amber-700 mt-1">המנהל בודק שהתשלום תואם את המנוי. לאחר האישור תוכל להירשם לאימונים — בינתיים אפשר לצפות ולהתרשם.</p>
              </div>
            )}
            {/* שלט התקנה: למתאמן ממתין — אדום בולט; למאושר — שורה דקה; לנמחק — לא מציגים. */}
            {!isStandalone() && !isRemoved && <InstallBanner variant={isPending ? 'hero' : 'slim'} />}
            <EnablePushBanner profile={profile} />
          </div>
          {activeTab === 'schedule' && <ScheduleTab member={member} limit={limit} registrations={registrations} registrationsNext={registrationsNext} onRegister={handleRegister} branchesMap={branchesMap} />}
          {activeTab === 'shop' && <ShopTab profile={profile} member={member} allAnnouncements={announcements} onCartCountChange={setCartCount} />}
          {activeTab === 'announcements' && <AnnouncementsTab announcements={announcementsForTab} profile={profile} member={member} lastSeen={lastSeen} focusId={focusAnnouncementId}
            onFocusConsumed={() => {
              setFocusAnnouncementId(null)
              // מנקה את ?focus מהכתובת — בלי זה כל פתיחה חוזרת של הטאב גוללת שוב את המסך.
              // replaceState לא מפעיל hashchange, אז אין לולאה.
              if (window.location.hash.includes('?focus=')) {
                history.replaceState(null, '', window.location.pathname + window.location.search + '#announcements')
              }
            }} />}
          {activeTab === 'profile' && <ProfileTab profile={profile} member={member} />}
          {activeTab === 'settings' && <SettingsTab profile={profile} member={member} />}
        </div>
      </main>
      {addChildOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" dir="rtl" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-800">➕ הוספת ילד</h2>
              <button type="button" onClick={() => setAddChildOpen(false)} aria-label="סגור" className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500">הילד יתווסף לחשבון שלך וימתין לאישור המאמן.</p>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">שם מלא של הילד/ה *</label>
              <input type="text" value={childForm.full_name}
                onChange={e => setChildForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="ישראל ישראלי"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">תאריך לידה *</label>
              <input type="date" max={new Date().toISOString().split('T')[0]} value={childForm.birth_date}
                onChange={e => setChildForm(p => ({ ...p, birth_date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">סניף *</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(branchesMap).map(([id, name]) => {
                  const sel = childForm.branch_ids.includes(id)
                  return (
                    <button key={id} type="button"
                      onClick={() => setChildForm(p => ({ ...p, branch_ids: sel ? p.branch_ids.filter(x => x !== id) : [...p.branch_ids, id] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${sel ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'}`}>
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">סוג מנוי</label>
              <select value={childForm.subscription_type}
                onChange={e => setChildForm(p => ({ ...p, subscription_type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="1x_week">1× שבוע</option>
                <option value="2x_week">2× שבוע</option>
                <option value="4x_week">4× שבוע</option>
                <option value="unlimited">ללא הגבלה</option>
              </select>
            </div>
            <button type="button" onClick={submitAddChild} disabled={addChildSaving}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50">
              {addChildSaving ? 'שומר...' : 'הוסף ילד'}
            </button>
          </div>
        </div>
      )}
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
