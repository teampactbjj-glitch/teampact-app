import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ============================================================
// MyProgressSection — דוח התקדמות אישי למתאמן
// ============================================================
// מציג למתאמן את התמונה החודשית שלו: כמה התאמן החודש, פילוח לפי תחום (BJJ / מואי תאי / וכו'),
// השוואה לחודש שעבר ולשיא האישי, לוח חודשי חזותי, רצף שבועות פעיל, ו-badges של אבני דרך.
// המטרה: מוטיבציה להתקדמות אישית, לא תחרות עם אחרים.
//
// מקור הנתונים: checkins (status='present') של המתאמן + classes לסיווג + duration.
// סינון: רק שיעורים שהסתיימו בפועל (start_time + duration_minutes עבר).
// ============================================================

// === נירמול ושיוך תחום (משוכפל מ-ReportsManager.jsx — לא רוצים import בין trainer ל-athlete) ===
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[׳״'’“”"`]/g, '')
    .replace(/[\s\-_·.,]+/g, '')
}

// סדר חשוב: MMA → Muay Thai → BJJ כדי ש"מתחילים מואי תאי" לא ייפול ל-BJJ דרך "מתחילים".
function detectDiscipline(nameRaw = '') {
  const n = normalize(nameRaw)
  if (!n) return 'אחר'
  if (/3.?6/.test(n)) return 'ילדים'
  if (/(^|[^a-z])mma([^a-z]|$)|לחימהמשולבת|לחימהמעורבת|קרבמשולב|קרבמעורב|משולב|מעורב/.test(n)) return 'MMA'
  if (/muaythai|muay|מואיטאי|מואיתאי|מואי|איגרוףתאילנדי|איגרוףתאי|תאילנדי|תאילנד/.test(n)) return 'Muay Thai'
  if (/bjj|jiujitsu|jiu|jitsu|גיוגיטסו|גיוגי|גיטסו|נוגי|nogi|גראפלינג|גרפלינג|grappling|ברזיל|brazil|openmat|אופנמט|אופןמט/.test(n)) return 'BJJ'
  if (/(^|\s)גי(\s|$)/.test(String(nameRaw))) return 'BJJ'
  if (/מתחילים|מתחיל|מתקדמים|מתקדם|בינוני|כחול|סגול|חום|שחור|חגורה|נשים|נשי|adult|adv|beg|kids|ילדים|נוער|טף/.test(n)) return 'BJJ'
  return 'אחר'
}

const DISCIPLINE_ORDER = ['BJJ', 'Muay Thai', 'MMA', 'ילדים', 'אחר']
const DISCIPLINE_COLORS = {
  'BJJ': '#2563eb',
  'Muay Thai': '#dc2626',
  'MMA': '#7c3aed',
  'ילדים': '#f59e0b',
  'אחר': '#6b7280',
}
const DISCIPLINE_BG = {
  'BJJ': '#dbeafe',
  'Muay Thai': '#fee2e2',
  'MMA': '#ede9fe',
  'ילדים': '#fef3c7',
  'אחר': '#f3f4f6',
}
const DISCIPLINE_ICONS = {
  'BJJ': '🥋',
  'Muay Thai': '🥊',
  'MMA': '🤼',
  'ילדים': '🧒',
  'אחר': '💪',
}

// === שעת סיום שיעור (משוכפל מ-ReportsManager) ===
function classEndMs(checkinDateStr, startTime, durationMin) {
  if (!checkinDateStr || !startTime) return null
  const parts = String(startTime).split(':').map(Number)
  const hh = parts[0]
  const mm = parts[1] || 0
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  const [y, mo, d] = String(checkinDateStr).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  const start = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime()
  const dur = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60
  return start + dur * 60 * 1000
}

// === מפתח חודש (YYYY-MM) מתאריך או ms ===
function monthKey(d) {
  const date = d instanceof Date ? d : new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// === שם חודש בעברית ===
const MONTH_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

// === badges של שעות מזרון (כל הזמן) ===
const HOUR_BADGES = [
  { hours: 25, label: '25 שעות', emoji: '🌱' },
  { hours: 50, label: '50 שעות', emoji: '🥉' },
  { hours: 100, label: '100 שעות', emoji: '🥈' },
  { hours: 250, label: '250 שעות', emoji: '🥇' },
  { hours: 500, label: '500 שעות', emoji: '🏆' },
  { hours: 1000, label: '1000 שעות', emoji: '👑' },
]

// === badges מיוחדים ===
// "Cross-trainer" — התאמן ב-2 תחומים שונים בחודש הנוכחי
// "חודש מושלם" — לפחות 3 אימונים בכל שבוע של החודש (4 שבועות מינימום)
// "רצף 8" — 8 שבועות רצופים פעילים
// "רצף 16" — 16 שבועות רצופים פעילים

export default function MyProgressSection({ profile }) {
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState([])
  const [classMap, setClassMap] = useState(new Map()) // class_id -> {name, class_type, duration_minutes, start_time, coach_id, coach_name}
  const [coachMap, setCoachMap] = useState(new Map()) // coach_id -> {name}
  const [err, setErr] = useState(null)

  // ── שליפת נתונים ─────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        // 1) כל ה-checkins של המתאמן (נוכחות בלבד) — כל ההיסטוריה לצורך badges של שעות
        const { data: chk, error: chkErr } = await supabase
          .from('checkins')
          .select('class_id, checked_in_at, checkin_date')
          .eq('athlete_id', profile.id)
          .eq('status', 'present')
          .order('checked_in_at', { ascending: true })
        if (chkErr) throw chkErr
        const checkinsData = chk || []

        // 2) classes של ה-class_ids הייחודיים
        const classIds = [...new Set(checkinsData.map(c => c.class_id).filter(Boolean))]
        let classes = []
        if (classIds.length > 0) {
          const { data: clsData } = await supabase
            .from('classes')
            .select('id, name, class_type, duration_minutes, start_time, coach_id, coach_name')
            .in('id', classIds)
          classes = clsData || []
        }
        const cm = new Map(classes.map(c => [c.id, c]))

        // 3) coaches לשמות (לחלק "המאמן הכי מתאמן איתו")
        const coachIds = [...new Set(classes.map(c => c.coach_id).filter(Boolean))]
        let coaches = []
        if (coachIds.length > 0) {
          const { data: coachData } = await supabase.from('coaches').select('id, name').in('id', coachIds)
          coaches = coachData || []
        }
        const coachMap2 = new Map(coaches.map(c => [c.id, c]))

        if (!cancelled) {
          setCheckins(checkinsData)
          setClassMap(cm)
          setCoachMap(coachMap2)
        }
      } catch (e) {
        console.warn('[MyProgress] load failed', e)
        if (!cancelled) setErr(e.message || 'שגיאה בטעינת נתוני התקדמות')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  // ── עיבוד נתונים: שיוך כל checkin לתחום + שעות + סינון "אימון שהסתיים" ─────
  const events = useMemo(() => {
    const now = Date.now()
    const list = []
    for (const c of checkins) {
      if (!c.class_id) continue
      const cls = classMap.get(c.class_id)
      if (!cls) continue
      // קריטריון: רק שיעורים שהסתיימו בפועל
      const endMs = classEndMs(c.checkin_date, cls.start_time, cls.duration_minutes)
      let timeMs
      if (endMs !== null) {
        if (endMs > now) continue // עתידי — לא נספר
        timeMs = endMs
      } else if (c.checked_in_at) {
        const t = new Date(c.checked_in_at).getTime()
        if (!Number.isFinite(t) || t > now) continue
        timeMs = t
      } else {
        continue
      }
      // סיווג: אם class_type מפורש ולא 'regular' — מנסה ממנו, אחרת מהשם
      const explicit = (cls.class_type || '').toLowerCase()
      let disc = (explicit && explicit !== 'regular') ? detectDiscipline(explicit) : 'אחר'
      if (disc === 'אחר') disc = detectDiscipline(cls.name || '')
      const dur = Number.isFinite(cls.duration_minutes) && cls.duration_minutes > 0 ? cls.duration_minutes : 60
      const date = new Date(timeMs)
      list.push({
        timeMs,
        date,
        dateKey: `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
        monthKey: monthKey(date),
        discipline: disc,
        durationMin: dur,
        classId: c.class_id,
        coachId: cls.coach_id || null,
        coachName: cls.coach_id && coachMap.get(cls.coach_id)?.name || cls.coach_name || null,
      })
    }
    return list
  }, [checkins, classMap, coachMap])

  // ── סטטיסטיקות חודשיות ─────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonthKey = monthKey(now)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthKey = monthKey(lastMonth)

    // אגרגציה לפי חודש: { sessions, minutes, byDiscipline:{...}, days:Set }
    const byMonth = new Map()
    for (const e of events) {
      let agg = byMonth.get(e.monthKey)
      if (!agg) {
        agg = { sessions: 0, minutes: 0, byDiscipline: {}, days: new Set() }
        byMonth.set(e.monthKey, agg)
      }
      agg.sessions += 1
      agg.minutes += e.durationMin
      agg.byDiscipline[e.discipline] = (agg.byDiscipline[e.discipline] || 0) + 1
      agg.days.add(e.dateKey)
    }

    const thisMonth = byMonth.get(thisMonthKey) || { sessions: 0, minutes: 0, byDiscipline: {}, days: new Set() }
    const lastMonthAgg = byMonth.get(lastMonthKey) || { sessions: 0, minutes: 0, byDiscipline: {}, days: new Set() }

    // שיא אישי — חודש עם הכי הרבה אימונים (לא כולל החודש הנוכחי אם הוא לא הכי גדול)
    let bestMonth = { key: null, sessions: 0, label: null }
    for (const [k, v] of byMonth.entries()) {
      if (v.sessions > bestMonth.sessions) {
        const [y, mo] = k.split('-').map(Number)
        bestMonth = { key: k, sessions: v.sessions, label: `${MONTH_HE[mo - 1]} ${y}` }
      }
    }

    // סה"כ שעות מזרון כל הזמן
    const allTimeMinutes = events.reduce((sum, e) => sum + e.durationMin, 0)
    const allTimeHours = allTimeMinutes / 60

    return {
      thisMonth,
      thisMonthHours: thisMonth.minutes / 60,
      lastMonth: lastMonthAgg,
      lastMonthHours: lastMonthAgg.minutes / 60,
      bestMonth,
      allTimeHours,
      allTimeSessions: events.length,
    }
  }, [events])

  // ── רצפים שבועיים ─────────────────────────────────────────────
  // שבוע = ראשון עד שבת (ישראל). שבוע "פעיל" = לפחות אימון אחד בו.
  // currentStreak = רצף השבועות הפעילים שמסתיימים בשבוע הנוכחי או הקודם (שלא יישבר אם יום ראשון)
  const streaks = useMemo(() => {
    if (events.length === 0) return { current: 0, longest: 0 }
    // ממיר תאריך לתחילת השבוע (ראשון 00:00 מקומי)
    const weekKey = (d) => {
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const dow = dd.getDay() // 0=Sunday
      dd.setDate(dd.getDate() - dow)
      return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
    }
    const activeWeeks = new Set(events.map(e => weekKey(e.date)))

    // רצף הכי ארוך אי פעם
    const sorted = [...activeWeeks].sort()
    let longest = 0
    let cur = 0
    let prevWeekStart = null
    for (const wk of sorted) {
      const [y, m, d] = wk.split('-').map(Number)
      const ws = new Date(y, m - 1, d).getTime()
      if (prevWeekStart === null || ws - prevWeekStart === 7 * 24 * 3600 * 1000) {
        cur += 1
      } else {
        cur = 1
      }
      if (cur > longest) longest = cur
      prevWeekStart = ws
    }

    // רצף נוכחי — מהשבוע של היום אחורה. אם השבוע הנוכחי לא פעיל אבל הקודם כן — מתחילים מהקודם.
    const today = new Date()
    let curWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    curWeekStart.setDate(curWeekStart.getDate() - curWeekStart.getDay())
    let current = 0
    let probe = curWeekStart.getTime()
    // אם השבוע הנוכחי לא פעיל — נסה להתחיל מהקודם (ככה לא נשבר ביום ראשון/שני בבוקר)
    const probeKey = (ms) => {
      const dd = new Date(ms)
      return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
    }
    if (!activeWeeks.has(probeKey(probe))) {
      probe -= 7 * 24 * 3600 * 1000
    }
    while (activeWeeks.has(probeKey(probe))) {
      current += 1
      probe -= 7 * 24 * 3600 * 1000
    }

    return { current, longest }
  }, [events])

  // ── badges שהושגו ─────────────────────────────────────────────
  const badges = useMemo(() => {
    const list = []
    // שעות מזרון
    for (const b of HOUR_BADGES) {
      if (stats.allTimeHours >= b.hours) {
        list.push({ ...b, kind: 'hours', achieved: true })
      }
    }
    // ה-badge הבא של שעות (תצוגה כ-progress)
    const nextHourBadge = HOUR_BADGES.find(b => stats.allTimeHours < b.hours)
    if (nextHourBadge) {
      list.push({ ...nextHourBadge, kind: 'hours-next', achieved: false, progress: stats.allTimeHours, target: nextHourBadge.hours })
    }
    // Cross-trainer (החודש)
    const discCountThisMonth = Object.keys(stats.thisMonth.byDiscipline).filter(d => stats.thisMonth.byDiscipline[d] > 0 && d !== 'אחר').length
    if (discCountThisMonth >= 2) {
      list.push({ kind: 'cross', label: 'Cross-trainer', emoji: '⚡', achieved: true, sub: 'מתאמן ב-2 תחומים החודש' })
    }
    // רצף שבועות פעיל
    if (streaks.current >= 8) {
      list.push({ kind: 'streak8', label: `רצף ${streaks.current} שבועות`, emoji: '🔥', achieved: true })
    }
    if (streaks.longest >= 16) {
      list.push({ kind: 'streak16', label: `שיא: ${streaks.longest} שבועות רצוף`, emoji: '⭐', achieved: true })
    }
    return list
  }, [stats, streaks])

  // ── מסר אישי דינמי ─────────────────────────────────────────────
  const personalMessage = useMemo(() => {
    const tm = stats.thisMonth.sessions
    const lm = stats.lastMonth.sessions
    if (tm === 0 && lm === 0) return { text: 'בוא נתחיל. הצעד הראשון הוא פשוט להגיע לאימון הקרוב.', tone: 'neutral' }
    if (tm === 0 && lm > 0) return { text: `החודש שעבר התאמנת ${lm} פעמים. אל תשבור את הרצף — היכנס ללוז ותירשם.`, tone: 'warn' }
    if (stats.bestMonth.key && stats.bestMonth.sessions > 0 && tm >= stats.bestMonth.sessions && monthKey(new Date()) === stats.bestMonth.key) {
      return { text: '🏆 שיא אישי חדש החודש. לא היית מעולם כל כך עקבי.', tone: 'best' }
    }
    if (lm > 0 && tm > lm) {
      const pct = Math.round(((tm - lm) / lm) * 100)
      return { text: `עליה של ${pct}% מהחודש שעבר. כל הכבוד — תמשיך ככה.`, tone: 'up' }
    }
    if (lm > 0 && tm < lm * 0.5) {
      return { text: 'ירידה משמעותית החודש. בוא נחזור למסלול — הירשם לאימון הקרוב.', tone: 'warn' }
    }
    if (streaks.current >= 8) {
      return { text: `${streaks.current} שבועות רצוף — זה כבר הרגל. 🔥`, tone: 'best' }
    }
    if (tm > 0) return { text: `${tm} אימונים החודש. חזק. תמשיך.`, tone: 'up' }
    return { text: 'תמשיך להגיע. ההתקדמות מגיעה ממי שמתמיד.', tone: 'neutral' }
  }, [stats, streaks])

  // ── סטריפ "28 ימים אחרונים" — קומפקטי, מודרני (כמו שעון כושר) ─────────────
  // 4 שורות × 7 ימים = 28 יום אחורה מהיום (כולל היום).
  // לכל יום: הצבע של התחום העיקרי (הכי הרבה אימונים באותו יום).
  // מקצועית יותר מלוח חודשי קלנדרי כי מראה תקופה קרובה ולא ריבועים ריקים בהתחלת חודש.
  const calendarDays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const DAY = 24 * 3600 * 1000

    // אגרגציה לפי dateKey (YYYY-MM-DD)
    const byDay = new Map()
    for (const e of events) {
      const key = e.dateKey
      if (!byDay.has(key)) byDay.set(key, {})
      const ag = byDay.get(key)
      ag[e.discipline] = (ag[e.discipline] || 0) + 1
    }

    const cells = []
    // 28 יום: מ-(היום - 27) עד היום
    for (let i = 27; i >= 0; i--) {
      const d = new Date(todayMs - i * DAY)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const ag = byDay.get(key)
      let primary = null
      if (ag) {
        let max = 0
        for (const [disc, count] of Object.entries(ag)) {
          if (count > max) { max = count; primary = disc }
        }
      }
      const isToday = i === 0
      cells.push({
        kind: 'day',
        day: d.getDate(),
        primary,
        count: ag ? Object.values(ag).reduce((a,b)=>a+b,0) : 0,
        isToday,
        dateLabel: `${d.getDate()}/${d.getMonth()+1}`,
      })
    }
    return cells
  }, [events])

  // סופר ימים שהתאמנתי ב-28 ימים אחרונים (לכותרת)
  const last28Days = useMemo(() => calendarDays.filter(c => c.kind === 'day' && c.primary).length, [calendarDays])

  // ── רינדור ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        <div className="animate-pulse text-gray-400">📊 טוען את ההתקדמות שלך...</div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4 text-sm text-red-700">
        שגיאה בטעינת ההתקדמות: {err}
      </div>
    )
  }

  // אם אין שום נתון — הצגה רכה במקום הסתרה (מעודד להתחיל)
  if (events.length === 0) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200 p-6 text-center">
        <div className="text-4xl mb-2">💪</div>
        <h3 className="font-bold text-emerald-900 text-lg mb-1">ההתקדמות שלי</h3>
        <p className="text-sm text-emerald-700">עוד לא רשום לך אימון. ברגע שתגיע לאימון הראשון — נתחיל לעקוב אחרי ההתקדמות שלך כאן.</p>
      </div>
    )
  }

  const tm = stats.thisMonth
  const tmHours = stats.thisMonthHours
  const lm = stats.lastMonth
  const lmSessions = lm.sessions
  const diffPct = lmSessions > 0 ? Math.round(((tm.sessions - lmSessions) / lmSessions) * 100) : null
  const isBestMonth = stats.bestMonth.key === monthKey(new Date()) && tm.sessions > 0
  const sessionsToBest = stats.bestMonth.sessions > tm.sessions ? stats.bestMonth.sessions - tm.sessions : 0

  // תחומים פעילים החודש (לא כולל "אחר" אם יש משהו אחר)
  const disciplinesThisMonth = DISCIPLINE_ORDER
    .filter(d => (tm.byDiscipline[d] || 0) > 0)
    .map(d => ({
      name: d,
      sessions: tm.byDiscipline[d],
      // הערכת שעות לפי 60 דקות לאימון בממוצע (לא מדויק לרזולוציית תחום בלי אגרגציה נוספת — אבל קרוב)
      hours: Math.round((tm.byDiscipline[d] * 60) / 60),
    }))

  // שעות לפי תחום החודש — מדויק:
  const hoursByDiscipline = {}
  for (const e of events) {
    if (e.monthKey !== monthKey(new Date())) continue
    hoursByDiscipline[e.discipline] = (hoursByDiscipline[e.discipline] || 0) + e.durationMin
  }

  return (
    <div className="space-y-4">
      {/* ===== Hero card — כותרת + מספרי החודש ===== */}
      <div className="rounded-xl shadow-sm overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)' }}>
        <div className="p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span>📊</span>
              <span>ההתקדמות שלי</span>
            </h3>
            <div className="text-xs opacity-90">{MONTH_HE[new Date().getMonth()]} {new Date().getFullYear()}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-lg p-3">
              <div className="text-3xl font-extrabold leading-none">{tm.sessions}</div>
              <div className="text-xs opacity-90 mt-1">אימונים החודש</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-lg p-3">
              <div className="text-3xl font-extrabold leading-none">{tmHours.toFixed(tmHours < 10 ? 1 : 0)}</div>
              <div className="text-xs opacity-90 mt-1">שעות מזרון</div>
            </div>
          </div>
          {/* השוואה */}
          {(diffPct !== null || isBestMonth) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {isBestMonth && (
                <span className="inline-flex items-center gap-1 bg-yellow-300 text-yellow-900 px-2 py-1 rounded-full font-bold">
                  🏆 שיא אישי
                </span>
              )}
              {diffPct !== null && diffPct !== 0 && (
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-semibold ${
                  diffPct > 0 ? 'bg-emerald-300 text-emerald-900' : 'bg-orange-200 text-orange-900'
                }`}>
                  {diffPct > 0 ? '↑' : '↓'} {Math.abs(diffPct)}% מהחודש שעבר
                </span>
              )}
              {!isBestMonth && stats.bestMonth.key && sessionsToBest > 0 && sessionsToBest <= 5 && (
                <span className="inline-flex items-center gap-1 bg-white/25 px-2 py-1 rounded-full">
                  עוד {sessionsToBest} לשיא האישי
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== פילוח לפי תחום (החודש) ===== */}
      {disciplinesThisMonth.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h4 className="font-bold text-gray-800 text-sm mb-3">פילוח לפי תחום</h4>
          <div className="grid grid-cols-2 gap-2">
            {disciplinesThisMonth.map(d => {
              const mins = hoursByDiscipline[d.name] || 0
              const hrs = mins / 60
              return (
                <div key={d.name} className="rounded-lg p-3 border" style={{ background: DISCIPLINE_BG[d.name], borderColor: DISCIPLINE_COLORS[d.name] + '33' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{DISCIPLINE_ICONS[d.name]}</span>
                    <span className="font-bold text-sm" style={{ color: DISCIPLINE_COLORS[d.name] }}>{d.name}</span>
                  </div>
                  <div className="text-2xl font-extrabold leading-none mt-2" style={{ color: DISCIPLINE_COLORS[d.name] }}>{d.sessions}</div>
                  <div className="text-[11px] text-gray-600 mt-1">{hrs.toFixed(hrs < 10 ? 1 : 0)} שעות · {d.sessions === 1 ? 'אימון' : 'אימונים'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== סטריפ 28 ימים אחרונים — קומפקטי ===== */}
      <div className="bg-white rounded-xl border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-gray-800 text-sm">28 הימים האחרונים</h4>
          <div className="text-xs text-gray-500">{last28Days} ימים פעילים</div>
        </div>
        <div className="grid grid-cols-7 gap-1" dir="rtl">
          {calendarDays.map((c, i) => {
            const bg = c.primary ? DISCIPLINE_COLORS[c.primary] : '#f3f4f6'
            const fg = c.primary ? '#fff' : '#9ca3af'
            return (
              <div key={i}
                className="rounded flex items-center justify-center text-[10px] font-semibold relative"
                style={{
                  height: 26,
                  background: bg,
                  color: fg,
                  outline: c.isToday ? '2px solid #047857' : 'none',
                  outlineOffset: c.isToday ? '1px' : 0,
                }}
                title={c.primary ? `${c.dateLabel} — ${c.count} אימון${c.count>1?'ים':''}` : `${c.dateLabel} — לא התאמנת`}>
                {c.day}
              </div>
            )
          })}
        </div>
        {/* מקרא תחומים */}
        {disciplinesThisMonth.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t text-[11px] text-gray-600">
            {disciplinesThisMonth.map(d => (
              <span key={d.name} className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ background: DISCIPLINE_COLORS[d.name] }}></span>
                <span>{d.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ===== רצף שבועות + סה"כ שעות (כל הזמן) ===== */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
          <div className="text-2xl mb-1">🔥</div>
          <div className="text-2xl font-extrabold text-orange-600 leading-none">{streaks.current}</div>
          <div className="text-[11px] text-gray-600 mt-1">שבועות רצוף</div>
          {streaks.longest > streaks.current && (
            <div className="text-[10px] text-gray-400 mt-1">שיא: {streaks.longest}</div>
          )}
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
          <div className="text-2xl mb-1">⏱️</div>
          <div className="text-2xl font-extrabold text-emerald-700 leading-none">{Math.round(stats.allTimeHours)}</div>
          <div className="text-[11px] text-gray-600 mt-1">שעות מזרון בסה"כ</div>
          <div className="text-[10px] text-gray-400 mt-1">{stats.allTimeSessions} אימונים</div>
        </div>
      </div>

      {/* ===== Badges ===== */}
      {badges.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h4 className="font-bold text-gray-800 text-sm mb-3">הישגים</h4>
          <div className="flex flex-wrap gap-2">
            {badges.map((b, i) => {
              if (b.kind === 'hours-next') {
                const pct = Math.min(100, Math.round((b.progress / b.target) * 100))
                return (
                  <div key={i} className="flex-1 min-w-[140px] bg-gray-50 rounded-lg p-3 border border-dashed border-gray-300">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-gray-600">{b.emoji} {b.label}</span>
                      <span className="text-gray-400">{Math.round(b.progress)}/{b.target}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                )
              }
              return (
                <div key={i} className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-900 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <span className="text-base leading-none">{b.emoji}</span>
                  <span>{b.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== מסר אישי דינמי ===== */}
      <div className={`rounded-xl p-4 text-sm font-semibold text-center ${
        personalMessage.tone === 'best' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
        personalMessage.tone === 'up' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
        personalMessage.tone === 'warn' ? 'bg-orange-50 text-orange-800 border border-orange-200' :
        'bg-gray-50 text-gray-700 border border-gray-200'
      }`}>
        {personalMessage.text}
      </div>
    </div>
  )
}
