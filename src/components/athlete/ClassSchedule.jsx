import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../a11y'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatTime(t) {
  return t ? t.slice(0, 5) : ''
}

// מחזיר את ה-week_start של השבוע הנוכחי (יום ראשון, פורמט YYYY-MM-DD).
// חייב להיות תואם ל-getWeekStart ב-AthleteDashboard.jsx.
function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

// מחזיר את ההופעה הקרובה ביותר *בעתיד* של השיעור השבועי.
// אם היום זה היום-בשבוע של השיעור והוא עדיין לא התחיל — ההופעה הבאה היא היום.
// אם היום והשיעור כבר התחיל (או הסתיים) — ההופעה הבאה היא השבוע הבא.
// כך תאריך ה-checkin שיוטמע ברישום תמיד יצביע על שיעור עתידי.
function computeNextOccurrence(cls, now = new Date()) {
  const [hh = 0, mm = 0, ss = 0] = (cls.start_time || '00:00:00').split(':').map(Number)
  const duration = Number(cls.duration_minutes) || 60
  const todayDow = now.getDay() // 0=Sunday..6=Saturday — תואם ל-day_of_week בסכמה
  if (todayDow === cls.day_of_week) {
    const todayStart = new Date(now)
    todayStart.setHours(hh, mm, ss || 0, 0)
    if (now < todayStart) {
      const todayEnd = new Date(todayStart.getTime() + duration * 60 * 1000)
      return { start: todayStart, end: todayEnd }
    }
  }
  let daysAhead = (cls.day_of_week - todayDow + 7) % 7
  if (daysAhead === 0) daysAhead = 7
  const nextStart = new Date(now)
  nextStart.setDate(now.getDate() + daysAhead)
  nextStart.setHours(hh, mm, ss || 0, 0)
  const nextEnd = new Date(nextStart.getTime() + duration * 60 * 1000)
  return { start: nextStart, end: nextEnd }
}

// השיעור של השבוע הזה נעול לרישום/ביטול אם היום הוא היום-בשבוע שלו
// והשעה כבר עברה. אחרי `start_time` של השיעור — אין יותר שינוי רישומים.
function isThisWeekLocked(cls, now = new Date()) {
  if (now.getDay() !== cls.day_of_week) return false
  const [hh = 0, mm = 0, ss = 0] = (cls.start_time || '00:00:00').split(':').map(Number)
  const todayStart = new Date(now)
  todayStart.setHours(hh, mm, ss || 0, 0)
  return now >= todayStart
}

export default function ClassSchedule({ profile, member }) {
  const toast = useToast()
  const [classes, setClasses] = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({}) // { classId: bool }
  // tick של "עכשיו" כל דקה — כדי שכפתורי הרישום/ביטול יחסמו אוטומטית
  // ברגע שעוברים את start_time (לביטול) או start_time+duration (לרישום),
  // בלי שהמתאמן צריך לרענן את המסך.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // מקור אמת יחיד: members. profiles.subscription_type הוא לגאסי (לא מתעדכן בשינוי מנוי).
  const subType = member?.subscription_type || member?.membership_type
  const limit = SUBSCRIPTION_LIMITS[subType] ?? 2

  useEffect(() => {
    console.log('ClassSchedule effect — member:', member, 'profile.id:', profile?.id)
    if (member?.branch_id) {
      fetchSchedule(member.branch_id)
    } else {
      // member arrived as null (still loading in parent) — keep waiting
      setLoading(true)
    }
  }, [member?.branch_id])

  // ריענון אוטומטי כשהטאב חוזר לפוקוס —
  // פותר את המקרה שמתאמן נרשם, יוצא מהאפליקציה / מחליף טאב,
  // ובינתיים יש פער בין ה-UI לבין מה שבאמת נשמר בשרת.
  // ריענון שקט (בלי loading state) — מסנכרן רק את ה-registrations,
  // את הלו"ז עצמו אין צורך לרענן בכל חזרה.
  useEffect(() => {
    if (!profile?.id) return
    const onVis = async () => {
      if (document.visibilityState !== 'visible') return
      const { data, error } = await supabase
        .from('class_registrations')
        .select('class_id')
        .eq('athlete_id', profile.id)
      if (error) {
        console.error('refresh registrations error:', error)
        return
      }
      setRegisteredIds(new Set((data || []).map(r => r.class_id)))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [profile?.id])

  async function fetchSchedule(branchId) {
    setLoading(true)
    console.log('fetchSchedule — branch_id:', branchId, 'athlete_id:', profile.id)

    const [{ data: classData, error: classErr }, { data: regData, error: regErr }] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, day_of_week, start_time, duration_minutes, hall, class_type')
        .eq('branch_id', branchId)
        .order('day_of_week')
        .order('start_time'),
      supabase
        .from('class_registrations')
        .select('class_id')
        .eq('athlete_id', profile.id)
        .eq('week_start', getWeekStart()),
    ])

    console.log('classes result:', classData, classErr)
    console.log('registrations result:', regData, regErr)

    setClasses(classData || [])
    setRegisteredIds(new Set((regData || []).map(r => r.class_id)))
    setLoading(false)
  }

  async function toggleRegistration(classId) {
    const isRegistered = registeredIds.has(classId)
    const cls = classes.find(c => c.id === classId)

    // אכיפת חלון זמן בצד הלקוח: שיעור של היום שכבר התחיל — נעול לחלוטין.
    // לא להירשם, לא לבטל. (השיעור של השבוע הבא כבר זמין כי computeNextOccurrence
    // מחזירה את ההופעה הבאה בעתיד.)
    if (cls && isThisWeekLocked(cls)) {
      toast.error(isRegistered
        ? 'השיעור כבר התחיל — לא ניתן לבטל את הרישום.'
        : 'השיעור כבר התחיל — לא ניתן להירשם.')
      return
    }

    // Prevent going over limit when registering
    if (!isRegistered && limit !== Infinity && registeredIds.size >= limit) {
      toast.error(`הגעת למגבלת ${limit} שיעורים שבועיים לפי המנוי שלך`)
      return
    }

    setActionLoading(p => ({ ...p, [classId]: true }))

    // Optimistic update: מעדכן UI לפני קריאה לשרת,
    // עם rollback אם הבקשה נכשלה. כך גם אם המשתמש מחליף טאב/יוצא מיד אחרי לחיצה,
    // ה-UI נשאר עקבי וה-visibilitychange מסנכרן עם השרת בחזרה.
    if (isRegistered) {
      // remove optimistically
      setRegisteredIds(prev => {
        const next = new Set(prev)
        next.delete(classId)
        return next
      })
      try {
        const { error } = await supabase
          .from('class_registrations')
          .delete()
          .eq('athlete_id', profile.id)
          .eq('class_id', classId)
        if (error) throw error
        // ביטול רישום → מוחק את ה-checkin המוטמע מסוג 'present' של אותה הופעה.
        // אנחנו לא מוחקים checkin עם status='absent' (אם המאמן כבר התערב וסימן נעדר).
        if (cls) {
          const { start } = computeNextOccurrence(cls, new Date())
          const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999)
          await supabase.from('checkins').delete()
            .eq('class_id', classId)
            .eq('athlete_id', profile.id)
            .eq('status', 'present')
            .gte('checked_in_at', dayStart.toISOString())
            .lte('checked_in_at', dayEnd.toISOString())
        }
      } catch (e) {
        console.error('unregister error:', e)
        // rollback
        setRegisteredIds(prev => new Set([...prev, classId]))
        toast.error('ביטול הרישום נכשל. נסה שוב.')
      }
    } else {
      // add optimistically
      setRegisteredIds(prev => new Set([...prev, classId]))
      try {
        const { error } = await supabase
          .from('class_registrations')
          .insert({ athlete_id: profile.id, class_id: classId })
        if (error) throw error
        // רישום → יוצר checkin אוטומטי 'present' עם תאריך השיעור הקרוב.
        // ככה המאמן/מנהל רואים את המתאמן כנוכח כברירת מחדל, וצריכים רק
        // לסמן ✕ נעדר לאלה שלא הגיעו (במקום לסמן ✓ נוכח לכולם בכל שיעור).
        // אם כבר קיים checkin (כולל absent) — לא נדרוס אותו (onConflict: do nothing).
        if (cls) {
          const { start } = computeNextOccurrence(cls, new Date())
          const checkedAt = new Date(start); checkedAt.setHours(12, 0, 0, 0)
          // המודל החדש: שורה לכל יום (class_id, athlete_id, checkin_date) — לכן רישום
          // בשבוע הבא לא דורס את הצ'ק-אין של השבוע הנוכחי. עמודת checkin_date
          // נמלאת גם ע"י טריגר ב-DB; שולחים גם מהלקוח כדי ש-onConflict יזהה מיד.
          const checkinDate = `${checkedAt.getFullYear()}-${String(checkedAt.getMonth() + 1).padStart(2, '0')}-${String(checkedAt.getDate()).padStart(2, '0')}`
          // upsert עם ignoreDuplicates=true: אם המאמן כבר סימן absent
          // אנחנו לא רוצים להחליף את זה ב-present אוטומטית.
          await supabase.from('checkins').upsert(
            {
              class_id: classId,
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
        // rollback
        setRegisteredIds(prev => {
          const next = new Set(prev)
          next.delete(classId)
          return next
        })
        toast.error('הרישום נכשל. נסה שוב.')
      }
    }

    setActionLoading(p => ({ ...p, [classId]: false }))
  }

  // Group classes by day_of_week
  const grouped = DAYS_HE.map((dayName, dow) => ({
    dow,
    dayName,
    classes: classes.filter(c => c.day_of_week === dow),
  })).filter(g => g.classes.length > 0)

  const limitLabel = limit === Infinity
    ? 'ללא הגבלה'
    : `${registeredIds.size}/${limit} שיעורים נבחרו`

  if (loading) {
    return <p className="text-center text-gray-400 py-10">טוען לוח שיעורים...</p>
  }

  if (!member?.branch_id) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-3xl mb-2">📅</div>
        <p className="text-sm">לא נמצא סניף משויך לחשבון שלך</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header / usage bar */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">השיעורים השבועיים שלי</span>
          <span className="text-sm text-gray-500">{limitLabel}</span>
        </div>
        {limit !== Infinity && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                registeredIds.size >= limit ? 'bg-emerald-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min((registeredIds.size / limit) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">אין שיעורים בסניף שלך</p>
        </div>
      ) : (
        grouped.map(({ dow, dayName, classes: dayCls }) => (
          <div key={dow}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">
              יום {dayName}
            </h3>
            <ul className="space-y-2">
              {dayCls.map(cls => {
                const isRegistered = registeredIds.has(cls.id)
                const atLimit = !isRegistered && limit !== Infinity && registeredIds.size >= limit
                const busy = actionLoading[cls.id]
                // השיעור של היום שכבר התחיל → נעול לרישום ולביטול גם יחד.
                const locked = isThisWeekLocked(cls, now)
                const disabled = busy || atLimit || locked

                let label
                if (busy) label = '...'
                else if (locked && isRegistered) label = '✓ רשום · השיעור התחיל'
                else if (locked) label = 'השיעור התחיל'
                else if (isRegistered) label = '✓ רשום · בטל'
                else if (atLimit) label = 'מגבלת מנוי'
                else label = 'הירשם'

                return (
                  <li
                    key={cls.id}
                    className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between gap-3 transition ${
                      isRegistered ? 'border-emerald-300 bg-emerald-50' : ''
                    } ${locked && !isRegistered ? 'opacity-60' : ''}`}
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
                      disabled={disabled}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
                        isRegistered
                          ? locked
                            ? 'bg-emerald-500 text-white cursor-not-allowed'
                            : 'bg-emerald-500 text-white hover:bg-red-100 hover:text-red-700'
                          : locked || atLimit
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
