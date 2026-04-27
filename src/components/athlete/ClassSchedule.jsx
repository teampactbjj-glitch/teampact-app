import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatTime(t) {
  return t ? t.slice(0, 5) : ''
}

export default function ClassSchedule({ profile, member }) {
  const [classes, setClasses] = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({}) // { classId: bool }

  const subType = profile?.subscription_type || member?.subscription_type || member?.membership_type
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
        .eq('athlete_id', profile.id),
    ])

    console.log('classes result:', classData, classErr)
    console.log('registrations result:', regData, regErr)

    setClasses(classData || [])
    setRegisteredIds(new Set((regData || []).map(r => r.class_id)))
    setLoading(false)
  }

  async function toggleRegistration(classId) {
    const isRegistered = registeredIds.has(classId)

    // Prevent going over limit when registering
    if (!isRegistered && limit !== Infinity && registeredIds.size >= limit) {
      alert(`הגעת למגבלת ${limit} שיעורים שבועיים לפי המנוי שלך`)
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
      } catch (e) {
        console.error('unregister error:', e)
        // rollback
        setRegisteredIds(prev => new Set([...prev, classId]))
        alert('ביטול הרישום נכשל. נסה שוב.')
      }
    } else {
      // add optimistically
      setRegisteredIds(prev => new Set([...prev, classId]))
      try {
        const { error } = await supabase
          .from('class_registrations')
          .insert({ athlete_id: profile.id, class_id: classId })
        if (error) throw error
      } catch (e) {
        console.error('register error:', e)
        // rollback
        setRegisteredIds(prev => {
          const next = new Set(prev)
          next.delete(classId)
          return next
        })
        alert('הרישום נכשל. נסה שוב.')
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

                return (
                  <li
                    key={cls.id}
                    className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between gap-3 transition ${
                      isRegistered ? 'border-emerald-300 bg-emerald-50' : ''
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
                        isRegistered
                          ? 'bg-emerald-500 text-white hover:bg-red-100 hover:text-red-700'
                          : atLimit
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {busy
                        ? '...'
                        : isRegistered
                        ? '✓ רשום · בטל'
                        : atLimit
                        ? 'מגבלת מנוי'
                        : 'הירשם'}
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
