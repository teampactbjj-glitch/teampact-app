import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import { useToast, useConfirm } from '../a11y'

// ===== Helpers =====
const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

// נורמליזציה: lowercase + הסרת גרש/גרשיים/רווחים/מקפים — כדי שכל הצורות
// (ג׳יו ג׳יטסו / ג'יוג'יטסו / גיוגיטסו / ג'יו גיטסו) ימופו לאותה מחרוזת אחת.
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[׳״'’“”"`]/g, '') // ׳ ״ ' ' " " ` (כל סוגי הגרשים)
    .replace(/[\s\-_·.,]+/g, '')                              // רווחים ומפרידים
}

// זיהוי תחום לחימה לפי שם הקבוצה/שיעור.
// סדר הבדיקות חשוב: MMA קודם ל-Muay Thai קודם ל-BJJ — כדי ש"מתחילים מואי טאי"
// יזוהה כ-Muay Thai ולא ייפול ל-BJJ דרך "מתחילים".
function detectDiscipline(nameRaw = '') {
  const n = normalize(nameRaw)
  if (!n) return 'אחר'

  // ילדים — אך ורק קבוצת לחימה משולבת לגיל 3-6
  if (/3.?6/.test(n)) return 'ילדים'

  // MMA / לחימה משולבת — בכל צורה כתיב (עם/בלי רווחים)
  if (/(^|[^a-z])mma([^a-z]|$)|לחימהמשולבת|לחימהמעורבת|קרבמשולב|קרבמעורב|משולב|מעורב/.test(n)) return 'MMA'

  // Muay Thai / איגרוף תאילנדי — בכל צורה כתיב
  if (/muaythai|muay|מואיטאי|מואיתאי|מואי|איגרוףתאילנדי|איגרוףתאי|תאילנדי|תאילנד/.test(n)) return 'Muay Thai'

  // BJJ — כל הצורות: ג׳יו ג׳יטסו / ג'יו ג'יטסו / גיו גיטסו / ג'יוג'יטסו / גיוגיטסו /
  // BJJ / Jiu Jitsu / נוגי / נו גי / גראפלינג / גרפלינג / Grappling / ברזיל / Open Mat
  if (/bjj|jiujitsu|jiu|jitsu|גיוגיטסו|גיוגי|גיטסו|נוגי|nogi|גראפלינג|גרפלינג|grappling|ברזיל|brazil|openmat|אופנמט|אופןמט/.test(n)) return 'BJJ'

  // "גי" כמילה עצמאית (אימון גי / גי שחור) — בודק על המחרוזת המקורית כדי לא לבלבל
  // עם "גיא" / "גיל" וכד'.
  if (/(^|\s)גי(\s|$)/.test(String(nameRaw))) return 'BJJ'

  // ברירת מחדל ל-Team Pact (אקדמיית BJJ): שיעורים גנריים שלא נתפסו למעלה הם BJJ.
  // שיעורי MMA / Muay Thai עם תיוג ברור כבר נתפסו, אז כאן בטוח.
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

// יום אחורה במילישניות
const DAY_MS = 24 * 60 * 60 * 1000

// מחשב את שעת **סיום** השיעור בפועל בתאריך מסוים — לפי start_time + duration_minutes
// של הקלאס. זוהי הקריטריון להחלטה אם "האימון הסתיים" → רק אז ה-checkin נספר בדוחות.
//
// checkinDateStr: 'YYYY-MM-DD' (תאריך מקומי בישראל, מהעמודה checkin_date)
// startTime: 'HH:MM:SS' או 'HH:MM' (זמן מקומי, מ-classes.start_time)
// durationMin: מספר דקות, ברירת מחדל 60
//
// מחזיר: timestamp במילישניות של סיום השיעור בזמן מקומי.
// אם חסר start_time או checkin_date — מחזיר null וה-קוד שקורא יחליט מה לעשות.
function classEndMs(checkinDateStr, startTime, durationMin) {
  if (!checkinDateStr || !startTime) return null
  const parts = String(startTime).split(':').map(Number)
  const hh = parts[0]
  const mm = parts[1] || 0
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  const [y, mo, d] = String(checkinDateStr).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  // new Date(y, m-1, d, hh, mm) יוצר Date בזמן מקומי של הדפדפן.
  // אצל דודי/הצוות בישראל זה בדיוק מה שצריך.
  const start = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime()
  const dur = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60
  return start + dur * 60 * 1000
}

// כמות ימים מ"היום" (ללא שעה)
function daysAgoISO(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setTime(d.getTime() - days * DAY_MS)
  return d.toISOString()
}

// המרת מספר טלפון ישראלי לפורמט בינלאומי עבור wa.me
// 0545551234 → 972545551234 ; +972545551234 → 972545551234 ; 545551234 → 972545551234
function toIntlPhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  // 9-10 ספרות בלי קידומת — מניחים מספר ישראלי
  if (digits.length >= 9 && digits.length <= 10) return '972' + digits
  return digits
}

// קישור WhatsApp עם הודעה ממולאת מראש
function whatsappLink(phone, message) {
  const intl = toIntlPhone(phone)
  if (!intl) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
}

// שם המועדון — מופיע בהודעות התזכורת (חשוב במיוחד בווצאפ
// כשהמתאמן לא שמור באנשי הקשר ולא יודע מי שלח לו).
const CLUB_NAME = 'Team Pact'

// תבנית ההודעה לתזכורת מתאמן שלא הגיע — משמשת גם ווצאפ וגם Push.
// הקונטקסט: האפליקציה בהרצה. כל מי בטבלת members הוא מתאמן פעיל אצלנו —
// או שמגיע ולא נרשם, או שעדיין לא הבין שצריך להירשם באפליקציה.
//
// daysSince === null → מתאמן רשום שלא נרשם מעולם לאף אימון באפליקציה
//                       (כנראה לא הבין את התהליך החדש; תמריץ לרישום).
// daysSince עד 14    → גבולי (כמעט שבועיים) — נדיר כי הסף הוא 14.
// daysSince > 14     → מעל שבועיים בלי רישום, הטון מעט יותר מודאג.
function inactiveReminderMessage(name, daysSince) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'חבר'
  if (daysSince === null) {
    return `היי ${firstName}! 🥋\nכאן ${CLUB_NAME} — אנחנו עוברים לעבוד עם האפליקציה כדי לעקוב אחרי הנוכחות וההתקדמות 📱\nאני רואה שעדיין לא נרשמת לאימונים באפליקציה — לפני כל אימון פשוט נכנסים, בוחרים את האימון ומסמנים "נרשמתי" ✅\nככה אוכל לעקוב אחרי ההתקדמות שלך ולקדם אותך נכון 💪\nאם צריך עזרה עם האפליקציה — אני כאן 💬`
  }
  if (daysSince <= 14) {
    return `היי ${firstName}! 🥋\nכאן ${CLUB_NAME} — שמתי לב שלא הגעת להתאמן כבר כמעט שבועיים, מתגעגעים אליך 💙\nנשמח לראות אותך שוב על המזרן באימון הקרוב 💪`
  }
  return `היי ${firstName}! 🥋\nכאן ${CLUB_NAME} — שמתי לב שלא הגעת להתאמן כבר ${daysSince} ימים, מתגעגעים אליך 💙\nאם צריך הפסקה או התאמה במנוי, בוא נדבר 💬\nנשמח לראות אותך שוב על המזרן 💪`
}

// ===== UI Primitives =====
function StatCard({ label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'from-blue-600 to-blue-800 text-white',
    green: 'from-emerald-600 to-emerald-800 text-white',
    orange: 'from-orange-500 to-orange-700 text-white',
    red: 'from-rose-600 to-rose-800 text-white',
  }
  return (
    <div className={`bg-gradient-to-br ${tones[tone]} rounded-2xl p-4 shadow-md`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-3xl font-black leading-tight mt-1">{value}</div>
      {sub && <div className="text-xs opacity-80 mt-1">{sub}</div>}
    </div>
  )
}

function BarRow({ label, value, max, color = '#2563eb', suffix = '', sessions }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const ariaLabel = `${label}: ${value}${suffix}${typeof sessions === 'number' ? ` (${sessions} אימונים)` : ''}`
  return (
    <div
      className="mb-2"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max || 100}
    >
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-semibold text-gray-800 truncate" title={label}>{label}</span>
        <span className="text-sm font-bold text-gray-900 shrink-0 mr-2">
          {value}{suffix}
          {typeof sessions === 'number' && (
            <span className="text-xs font-normal text-gray-500 mr-1">· {sessions} אימונים</span>
          )}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden" aria-hidden="true">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

function SectionCard({ title, icon, children, footer }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <h3 className="font-black text-gray-900 flex items-center gap-2 mb-3 text-base">
        <span className="text-xl">{icon}</span>
        <span>{title}</span>
      </h3>
      {children}
      {footer && <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">{footer}</div>}
    </section>
  )
}

// ===== Main Component =====
export default function ReportsManager({ isAdmin }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // סלייד אחד מאוחד שמשפיע על כל הדוחות (נרשמים חדשים + נטישה + נוכחות)
  const [periodDays, setPeriodDays] = useState(30)
  const [branchFilter, setBranchFilter] = useState('all')

  const [members, setMembers] = useState([])
  const [coaches, setCoaches] = useState([])
  const [classes, setClasses] = useState([]) // משמש גם כקבוצות (לפי המודל הקיים)
  const [branches, setBranches] = useState([])
  const [checkins, setCheckins] = useState([]) // נוכחויות — לצורך דוחות מבוססי נוכחות בפועל
  const [trialVisits, setTrialVisits] = useState([]) // ביקורי ניסיון אנונימיים (טבלה נפרדת)
  const [registrations, setRegistrations] = useState([]) // class_registrations — מי רשום לאיזו קבוצה

  // ===== Push notification state (לסקציית "מתאמנים שלא הגיעו") =====
  // pushSending: Set של memberIds ששליחת ה-Push אליהם כרגע בתהליך
  // pushSent: Set של memberIds שכבר נשלח אליהם push בסשן הנוכחי (כדי למנוע ספאם)
  const [pushSending, setPushSending] = useState(() => new Set())
  const [pushSent, setPushSent] = useState(() => new Set())
  const [bulkSending, setBulkSending] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => { if (isAdmin) fetchAll() }, [isAdmin])

  async function fetchAll() {
    setLoading(true)
    setErr('')
    try {
      // Supabase מחזיר ברירת מחדל עד 1000 שורות בלבד. כדי שהדוחות לא ייחתכו —
      // נטענות עד 100,000 רשומות בכל קריאה, וגם מסננים מראש לפי טווח של 180 יום
      // (הטווח המקסימלי שניתן לבחור) כדי לחסוך תעבורה.
      const ROW_LIMIT = 100000
      const sinceMaxISO = new Date(Date.now() - 180 * DAY_MS).toISOString()

      const [mRes, cRes, clsRes, bRes, chkRes, tvRes, regRes] = await Promise.all([
        supabase
          .from('members')
          .select('id, full_name, phone, email, status, active, subscription_type, coach_id, requested_coach_name, requested_coach_names, branch_id, branch_ids, group_id, group_ids, created_at, deleted_at')
          .range(0, ROW_LIMIT - 1),
        supabase.from('coaches').select('id, name, branch_id').range(0, ROW_LIMIT - 1),
        supabase.from('classes').select('id, name, class_type, coach_id, coach_name, branch_id, day_of_week, start_time, duration_minutes').range(0, ROW_LIMIT - 1),
        supabase.from('branches').select('id, name').range(0, ROW_LIMIT - 1),
        // checkins: מסנן בצד השרת לפי טווח של 180 יום + מסיר את מגבלת 1000 השורות
        supabase
          .from('checkins')
          .select('class_id, athlete_id, status, checked_in_at, checkin_date')
          .eq('status', 'present')
          .gte('checked_in_at', sinceMaxISO)
          .range(0, ROW_LIMIT - 1),
        supabase
          .from('trial_visits')
          .select('id, class_id, visited_at, visitor_name')
          .gte('visited_at', sinceMaxISO)
          .range(0, ROW_LIMIT - 1),
        // class_registrations: רישום שבועי. unique על (athlete_id, class_id) —
        // לכן לכל זוג יש שורה אחת בלבד, עם week_start של הרישום האחרון.
        // מסננים בצד השרת לפי 180 יום (date column → string YYYY-MM-DD).
        supabase
          .from('class_registrations')
          .select('class_id, athlete_id, week_start')
          .gte('week_start', sinceMaxISO.slice(0, 10))
          .range(0, ROW_LIMIT - 1),
      ])
      if (mRes.error)   throw mRes.error
      if (cRes.error)   throw cRes.error
      if (clsRes.error) throw clsRes.error
      if (bRes.error)   throw bRes.error
      if (chkRes.error) console.error('checkins fetch error:', chkRes.error)
      // אם הטבלה trial_visits עדיין לא הוקמה במיגרציה — לא לשבור את הדוחות.
      if (tvRes.error && !/relation .*trial_visits/i.test(tvRes.error.message || '')) {
        console.error('trial_visits fetch error:', tvRes.error)
      }
      if (regRes.error) console.error('class_registrations fetch error:', regRes.error)
      setMembers(mRes.data || [])
      setCoaches(cRes.data || [])
      setClasses(clsRes.data || [])
      setBranches(bRes.data || [])
      setCheckins(chkRes.data || [])
      setTrialVisits(tvRes.data || [])
      setRegistrations(regRes.data || [])

      // לוג אבחון: מאפשר לוודא בקונסול של הדפדפן (Safari → Develop → Show Web Inspector)
      // שכל הצ'ק-אינים נטענו ולא נחתכו.
      // אם מספר ה-checkins מתקרב ל-100000 — צריך להגדיל את ROW_LIMIT או לעבור לדפדוף.
      console.info('[Reports] loaded:', {
        members: mRes.data?.length || 0,
        classes: clsRes.data?.length || 0,
        coaches: cRes.data?.length || 0,
        checkins_present_180d: chkRes.data?.length || 0,
        trial_visits_180d: tvRes.data?.length || 0,
        class_registrations_180d: regRes.data?.length || 0,
      })

      // פירוט סיווג שיעורים — עוזר לזהות שיעורים שמסווגים כ"אחר" בטעות
      // ושצריך להוסיף מילות מפתח עבורם.
      const cls = clsRes.data || []
      const classifiedAs = { BJJ: [], 'Muay Thai': [], MMA: [], 'ילדים': [], 'אחר': [] }
      cls.forEach(c => {
        const explicit = (c.class_type || '').toLowerCase()
        let disc = (explicit && explicit !== 'regular') ? detectDiscipline(explicit) : 'אחר'
        if (disc === 'אחר') disc = detectDiscipline(c.name || '')
        if (classifiedAs[disc]) classifiedAs[disc].push(c.name)
      })
      console.info('[Reports] class classification:',
        Object.fromEntries(Object.entries(classifiedAs).map(([k, v]) => [k, `${v.length} שיעורים`])))
      if (classifiedAs['אחר'].length > 0) {
        console.warn('[Reports] שיעורים שמסווגים כ"אחר" (לא נספרים תחת תחום ספציפי):',
          [...new Set(classifiedAs['אחר'])])
      }
    } catch (e) {
      console.error('fetchAll reports error:', e)
      setErr(e.message || 'שגיאה בטעינת הדוחות')
    } finally {
      setLoading(false)
    }
  }

  // מפת מאמן id→name
  const coachById = useMemo(() => {
    const m = new Map()
    coaches.forEach(c => m.set(c.id, c))
    return m
  }, [coaches])

  // מפת קבוצה/שיעור id → class
  const classById = useMemo(() => {
    const m = new Map()
    classes.forEach(c => m.set(c.id, c))
    return m
  }, [classes])

  // Filter: סינון לפי סניף
  const filteredMembers = useMemo(() => {
    if (branchFilter === 'all') return members
    return members.filter(m => {
      const bids = (m.branch_ids && m.branch_ids.length) ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
      return bids.includes(branchFilter)
    })
  }, [members, branchFilter])

  // מתאמנים פעילים (לא נמחקו, לא pending, לא pending_deletion)
  const activeMembers = useMemo(() => {
    return filteredMembers.filter(m =>
      !m.deleted_at &&
      m.status !== 'pending' &&
      m.status !== 'pending_deletion' &&
      m.active !== false
    )
  }, [filteredMembers])

  // Checkins מסוננים לפי טווח הזמן של דוחות הנוכחות.
  // ⚠️ הקריטריון לספירה: **השיעור הסתיים בפועל** (start_time + duration עבר לפני "עכשיו").
  // זה לא משנה מתי המאמן/מתאמן לחץ — אם אימון בעוד 3 ימים, הוא לא נספר עכשיו גם אם יש לו checkin.
  // ספירה רק אחרי שהשיעור באמת קרה ונגמר.
  // אם חסר start_time/checkin_date (נתונים ישנים) — fallback ל-checked_in_at.
  const filteredCheckins = useMemo(() => {
    const now = Date.now()
    const since = now - periodDays * DAY_MS
    return checkins.filter(c => {
      if (!c.checked_in_at) return false
      const cls = classById.get(c.class_id)
      // נסה לחשב את שעת סיום השיעור — אם אפשר, זה הקריטריון
      const endMs = cls ? classEndMs(c.checkin_date, cls.start_time, cls.duration_minutes) : null
      if (endMs !== null) {
        // יש לנו שעת סיום אמיתית של השיעור. רק אם הוא הסתיים.
        return endMs <= now && endMs >= since
      }
      // Fallback לנתונים ישנים בלי start_time או checkin_date:
      // לפחות נוודא ש-checked_in_at בעבר ובטווח. עדיף מאשר לפסול הכל.
      const t = new Date(c.checked_in_at).getTime()
      if (!Number.isFinite(t)) return false
      return t >= since && t <= now
    })
  }, [checkins, periodDays, classById])

  // סט מתאמנים פעילים (לצורך סינון נוכחויות)
  const activeMemberIds = useMemo(() => new Set(activeMembers.map(m => m.id)), [activeMembers])

  // מפת class_id → תחום (מבוסס class_type אם מפורש, אחרת שם השיעור)
  const disciplineByClassId = useMemo(() => {
    const m = new Map()
    classes.forEach(cls => {
      const explicit = (cls.class_type || '').toLowerCase()
      if (explicit && explicit !== 'regular') {
        const fromExplicit = detectDiscipline(explicit)
        if (fromExplicit !== 'אחר') { m.set(cls.id, fromExplicit); return }
      }
      m.set(cls.id, detectDiscipline(cls.name || ''))
    })
    return m
  }, [classes])

  // ============================================================
  // דוחות פעילות — מבוססים על נוכחות בפועל (checkins, status='present').
  // ⚠️ שונה מהמודל הישן שהסתמך על class_registrations:
  // רישום מראש לקבוצה אינו נספר כהגעה. נספרים רק אימונים שכבר התקיימו
  // (checked_in_at <= עכשיו) ושבהם המאמן סימן את המתאמן כנוכח.
  // הפילטר `filteredCheckins` כבר אוכף "אימון שהסתיים" + טווח periodDays.
  // ============================================================

  // 0b) מתאמנים פעילים לפי תחום + פילוח לפי מאמן בתוך התחום.
  // count = מתאמנים ייחודיים שנכחו בתחום, sessions = סך הצ'ק-אינים בתחום.
  const byAssignedDiscipline = useMemo(() => {
    const acc = {}
    DISCIPLINE_ORDER.forEach(d => {
      acc[d] = { members: new Set(), sessions: 0, byCoach: new Map() }
    })
    filteredCheckins.forEach(c => {
      if (!c.athlete_id || !c.class_id) return
      if (!activeMemberIds.has(c.athlete_id)) return
      const cls = classById.get(c.class_id)
      if (!cls) return
      const disc = disciplineByClassId.get(c.class_id) || 'אחר'
      if (!acc[disc]) return

      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'

      acc[disc].members.add(c.athlete_id)
      acc[disc].sessions += 1

      if (!acc[disc].byCoach.has(coachName)) {
        acc[disc].byCoach.set(coachName, { members: new Set(), sessions: 0 })
      }
      const coachAgg = acc[disc].byCoach.get(coachName)
      coachAgg.members.add(c.athlete_id)
      coachAgg.sessions += 1
    })
    return DISCIPLINE_ORDER.map(d => ({
      name: d,
      count: acc[d].members.size,
      sessions: acc[d].sessions,
      byCoach: Array.from(acc[d].byCoach.entries())
        .map(([name, agg]) => ({ name, count: agg.members.size, sessions: agg.sessions }))
        .sort((a, b) => b.count - a.count),
    }))
  }, [filteredCheckins, classById, coachById, disciplineByClassId, activeMemberIds])

  // 0c) מתאמנים שלא נכחו באימון ב-14 הימים האחרונים.
  // מבוסס על MAX של **שעת סיום השיעור** (לא checked_in_at) — כי רק שיעור שהסתיים
  // נחשב הגעה. אם מתאמן רשום לאימון שעוד לא קרה, זה לא נחשב.
  // הסף נקבע ל-14 יום כדי להימנע מ-false positives של חופש קצר/מילואים/מחלה.
  const INACTIVE_THRESHOLD_DAYS = 14
  const inactiveMembers = useMemo(() => {
    const now = Date.now()
    const lastByMember = new Map()
    // משתמשים ב-checkins המלאים (לא ה-filtered) — צריכים את כל ה-180 יום
    // כדי לדעת מתי באמת היה הצ'ק-אין האחרון, גם אם הוא ישן.
    // קריטריון: רק שיעורים שהסתיימו בפועל. fallback ל-checked_in_at אם חסר נתון.
    checkins.forEach(c => {
      if (!c.athlete_id) return
      const cls = classById.get(c.class_id)
      const endMs = cls ? classEndMs(c.checkin_date, cls.start_time, cls.duration_minutes) : null
      let t = null
      if (endMs !== null) {
        if (endMs > now) return // שיעור עתידי — לא נספר כהגעה
        t = endMs
      } else if (c.checked_in_at) {
        const ts = new Date(c.checked_in_at).getTime()
        if (!Number.isFinite(ts) || ts > now) return
        t = ts
      } else {
        return
      }
      const prev = lastByMember.get(c.athlete_id) || 0
      if (t > prev) lastByMember.set(c.athlete_id, t)
    })

    const cutoff = now - INACTIVE_THRESHOLD_DAYS * DAY_MS
    return activeMembers
      .map(m => {
        const last = lastByMember.get(m.id) || null
        return {
          id: m.id,
          name: m.full_name || '—',
          phone: m.phone || null,
          email: m.email || null,
          lastAttendance: last,
          daysSince: last ? Math.floor((now - last) / DAY_MS) : null,
        }
      })
      .filter(m => !m.lastAttendance || m.lastAttendance < cutoff)
      // לפי כמות הימים בלי הגעה, יורד (הכי מנותקים בראש)
      .sort((a, b) => {
        const aDays = a.daysSince ?? 999999
        const bDays = b.daysSince ?? 999999
        return bDays - aDays
      })
  }, [activeMembers, checkins, classById])

  // ===== שליחת Push למתאמן בודד =====
  // משתמש ב-Edge Function 'send-push' (תשתית קיימת ב-src/lib/notifyPush.js).
  // לחיצה על ההתראה במכשיר של המתאמן תפתח את לוח הזמנים של האפליקציה.
  async function sendPushToMember(member) {
    if (!member?.id) return
    if (pushSending.has(member.id)) return // הגנה מקליק כפול
    setPushSending(prev => new Set(prev).add(member.id))
    try {
      // אותו טקסט כמו ווצאפ — עקביות בין הערוצים, ושם המועדון מופיע בגוף ההודעה.
      // הכותרת קצרה כי מערכות הפעלה חותכות אותה במסך נעול.
      const title = `${CLUB_NAME} 🥋 מתגעגעים אליך`
      const body = inactiveReminderMessage(member.name, member.daysSince)
      await notifyPush({
        userIds: [member.id],
        title,
        body,
        url: '/',                // פותח את האפליקציה במסך הראשי (לוח השיעורים)
        tag: `inactive-${member.id}`, // מאחד התראות כפולות באותו מכשיר
        icon: '/icon-192.png',
      })
      setPushSent(prev => new Set(prev).add(member.id))
      toast.success(`התראה נשלחה ל${member.name}`)
    } catch (e) {
      console.warn('[ReportsManager] sendPushToMember failed', e)
      toast.error(`שגיאה בשליחה ל${member.name}`)
    } finally {
      setPushSending(prev => {
        const next = new Set(prev)
        next.delete(member.id)
        return next
      })
    }
  }

  // ===== שליחת Push לכל הלא-פעילים בבת אחת =====
  // דורש אישור של המשתמש (ConfirmDialog) כדי למנוע שליחה בטעות.
  async function sendPushToAllInactive() {
    if (bulkSending) return
    if (!inactiveMembers.length) return
    const ok = await confirm({
      title: `לשלוח התראה ל-${inactiveMembers.length} מתאמנים?`,
      message: 'כל המתאמנים שלא הגיעו ב-14 הימים האחרונים יקבלו התראת Push לאפליקציה. ניתן לשלוח שוב מחר אם תרצה.',
      confirmLabel: `שלח ל-${inactiveMembers.length}`,
      cancelLabel: 'ביטול',
    })
    if (!ok) return
    setBulkSending(true)
    let success = 0
    let failed = 0
    try {
      // שולחים בקריאה אחת ל-Edge Function (הפונקציה תומכת ב-array של user_ids)
      const ids = inactiveMembers.map(m => m.id).filter(Boolean)
      // אבל בגלל שטקסט ההודעה משתנה לפי daysSince של כל אחד, נשלח אחד-אחד.
      // עדיין מקבילי דרך Promise.all כדי שזה לא יחנוק את ה-UI.
      const results = await Promise.allSettled(
        inactiveMembers.map(m => {
          const body = inactiveReminderMessage(m.name, m.daysSince)
          return notifyPush({
            userIds: [m.id],
            title: `${CLUB_NAME} 🥋 מתגעגעים אליך`,
            body,
            url: '/',
            tag: `inactive-${m.id}`,
            icon: '/icon-192.png',
          })
        })
      )
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          success++
          setPushSent(prev => new Set(prev).add(inactiveMembers[i].id))
        } else {
          failed++
        }
      })
      if (failed === 0) {
        toast.success(`נשלחו ${success} התראות בהצלחה`)
      } else {
        toast.error(`נשלחו ${success} התראות, ${failed} נכשלו`)
      }
      // הערה: המכשיר של המתאמן יקבל את ההתראה רק אם הוא נתן הרשאת push
      // והתקין את האפליקציה כ-PWA. למי שלא — הכפתור הירוק של ווצאפ הוא ה-fallback.
      void ids // נשמר לעתיד, בעבור batch endpoint יחיד
    } catch (e) {
      console.warn('[ReportsManager] sendPushToAllInactive failed', e)
      toast.error('שגיאה בשליחת ההתראות')
    } finally {
      setBulkSending(false)
    }
  }

  // 1) כמות מתאמנים לפי מאמן — מבוסס נוכחות בפועל (checkins) בטווח הנבחר
  // מחזיר: שם, מתאמנים ייחודיים, וסה"כ אימונים (ספירת כל ה-checkins).
  const byCoach = useMemo(() => {
    const members = new Map()   // coachName → Set<athlete_id>
    const sessions = new Map()  // coachName → total checkins
    coaches.forEach(c => { members.set(c.name || '—', new Set()); sessions.set(c.name || '—', 0) })
    filteredCheckins.forEach(c => {
      if (!c.athlete_id || !c.class_id) return
      if (!activeMemberIds.has(c.athlete_id)) return
      const cls = classById.get(c.class_id)
      if (!cls) return
      let coachName = null
      // ניסיון 1: לפי coach_id מקושר לטבלת coaches
      if (cls.coach_id && coachById.has(cls.coach_id)) {
        coachName = coachById.get(cls.coach_id).name
      }
      // ניסיון 2: fallback ל-coach_name שנשמר ישירות על הקלאס (שיעורים ישנים ללא coach_id)
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'
      if (!members.has(coachName)) { members.set(coachName, new Set()); sessions.set(coachName, 0) }
      members.get(coachName).add(c.athlete_id)
      sessions.set(coachName, sessions.get(coachName) + 1)
    })
    return Array.from(members.entries())
      .map(([name, set]) => ({ name, count: set.size, sessions: sessions.get(name) || 0 }))
      .sort((a, b) => b.count - a.count)
  }, [filteredCheckins, coaches, coachById, classById, activeMemberIds])

  // 2) כמות מתאמנים לפי תחום + פילוח פנימי לפי מאמן.
  // לכל תחום: סה"כ מתאמנים ייחודיים + סה"כ אימונים, וגם מערך byCoach
  // עם אותם נתונים מצומצמים למאמן ספציפי.
  const byDiscipline = useMemo(() => {
    // מבנה עזר: discipline → { members: Set<athleteId>, sessions: number,
    //                          byCoach: Map<coachName, { members: Set, sessions: number }> }
    const acc = {}
    DISCIPLINE_ORDER.forEach(d => {
      acc[d] = { members: new Set(), sessions: 0, byCoach: new Map() }
    })

    filteredCheckins.forEach(c => {
      if (!c.athlete_id || !c.class_id) return
      if (!activeMemberIds.has(c.athlete_id)) return
      const cls = classById.get(c.class_id)
      if (!cls) return
      const disc = disciplineByClassId.get(c.class_id)
      if (!disc || !acc[disc]) return

      // שיוך מאמן לקלאס: לפי coach_id ואם אין fallback ל-coach_name
      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'

      acc[disc].members.add(c.athlete_id)
      acc[disc].sessions += 1

      if (!acc[disc].byCoach.has(coachName)) {
        acc[disc].byCoach.set(coachName, { members: new Set(), sessions: 0 })
      }
      const coachAgg = acc[disc].byCoach.get(coachName)
      coachAgg.members.add(c.athlete_id)
      coachAgg.sessions += 1
    })

    return DISCIPLINE_ORDER.map(d => ({
      name: d,
      count: acc[d].members.size,
      sessions: acc[d].sessions,
      byCoach: Array.from(acc[d].byCoach.entries())
        .map(([name, agg]) => ({ name, count: agg.members.size, sessions: agg.sessions }))
        .sort((a, b) => b.count - a.count),
    }))
  }, [filteredCheckins, disciplineByClassId, activeMemberIds, classById, coachById])

  // 2.5) שיעורי ניסיון לפי תחום לחימה + פילוח לפי מאמן.
  // עוזר להבין איזה מאמן מקדם המרת ניסיונות ובאיזה תחום.
  // בעתיד נחבר לעמודת תשלום כדי לדעת כמה ניסיונות נסגרו במנוי.
  const trialsByDiscipline = useMemo(() => {
    const since = Date.now() - periodDays * DAY_MS
    const acc = {}
    DISCIPLINE_ORDER.forEach(d => {
      acc[d] = { count: 0, byCoach: new Map() }
    })
    let total = 0
    trialVisits.forEach(tv => {
      if (!tv.visited_at) return
      if (new Date(tv.visited_at).getTime() < since) return
      const cls = classById.get(tv.class_id)
      const disc = disciplineByClassId.get(tv.class_id) || 'אחר'
      if (!acc[disc]) return

      let coachName = null
      if (cls) {
        if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
        if (!coachName && cls.coach_name) coachName = cls.coach_name
      }
      if (!coachName) coachName = 'ללא מאמן'

      acc[disc].count += 1
      acc[disc].byCoach.set(coachName, (acc[disc].byCoach.get(coachName) || 0) + 1)
      total++
    })
    return {
      rows: DISCIPLINE_ORDER.map(d => ({
        name: d,
        count: acc[d].count,
        byCoach: Array.from(acc[d].byCoach.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      })),
      total,
    }
  }, [trialVisits, periodDays, disciplineByClassId, classById, coachById])

  // 3) נרשמים חדשים (לפי created_at בטווח הזמן שנבחר) — ללא soft-deleted
  const newMembers = useMemo(() => {
    const since = new Date(daysAgoISO(periodDays)).getTime()
    return filteredMembers.filter(m => {
      if (m.deleted_at) return false
      if (!m.created_at) return false
      return new Date(m.created_at).getTime() >= since
    })
  }, [filteredMembers, periodDays])

  // 4) נטישה (churn) — מתאמנים שבוטל להם המנוי (deleted_at בתוך חלון הזמן)
  // מבוסס נוכחות בפועל (checkins): שיוך מאמן/קבוצה לפי היכן שהמתאמן התאמן בפועל,
  // לא לפי coach_id הפורמלי בפרופיל. עקבי לדוחות האחרים.
  const { churnByCoach, churnByGroup, totalChurned, totalActiveBase } = useMemo(() => {
    const cutoff = Date.now() - periodDays * DAY_MS

    // מבנים עזר: מתאמן → סט מאמנים וקבוצות שבהם התאמן בפועל (לפי כל היסטוריית ה-checkins)
    // רק שיעורים שהסתיימו בפועל נספרים — רישום לאימון עתידי לא יוצר שיוך.
    const nowMs = Date.now()
    const coachesByMember = new Map()
    const groupsByMember = new Map()
    checkins.forEach(c => {
      if (!c.athlete_id || !c.class_id) return
      const cls = classById.get(c.class_id)
      if (!cls) return
      const endMs = classEndMs(c.checkin_date, cls.start_time, cls.duration_minutes)
      if (endMs !== null) {
        if (endMs > nowMs) return // שיעור עתידי — לא יוצר שיוך
      } else if (c.checked_in_at) {
        const ts = new Date(c.checked_in_at).getTime()
        if (Number.isFinite(ts) && ts > nowMs) return
      }
      // מאמן לפי הקלאס — לפי coach_id, ואם אין fallback ל-coach_name
      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'
      if (!coachesByMember.has(c.athlete_id)) coachesByMember.set(c.athlete_id, new Set())
      coachesByMember.get(c.athlete_id).add(coachName)
      // קבוצה לפי שם הקלאס
      const gname = cls.name
      if (gname) {
        if (!groupsByMember.has(c.athlete_id)) groupsByMember.set(c.athlete_id, new Set())
        groupsByMember.get(c.athlete_id).add(gname)
      }
    })

    // מתאמנים שבוטלו בתקופה — deleted_at קיים ונמצא בתוך החלון
    const churned = filteredMembers.filter(m => {
      if (!m.deleted_at) return false
      return new Date(m.deleted_at).getTime() >= cutoff
    })

    // סיכום לפי מאמן (אילו מאמנים אצלם המתאמן אימן בפועל)
    const coachAgg = new Map()
    const addToCoachAgg = (memberId, key) => {
      const coachSet = coachesByMember.get(memberId)
      if (!coachSet || coachSet.size === 0) {
        const name = 'ללא מאמן'
        if (!coachAgg.has(name)) coachAgg.set(name, { active: 0, churned: 0 })
        coachAgg.get(name)[key]++
        return
      }
      coachSet.forEach(name => {
        if (!coachAgg.has(name)) coachAgg.set(name, { active: 0, churned: 0 })
        coachAgg.get(name)[key]++
      })
    }
    activeMembers.forEach(m => addToCoachAgg(m.id, 'active'))
    churned.forEach(m => addToCoachAgg(m.id, 'churned'))

    // סיכום לפי קבוצה (אילו קבוצות/שיעורים המתאמן אימן בהם בפועל)
    const grpAgg = new Map()
    const addToGrpAgg = (memberId, key) => {
      const grpSet = groupsByMember.get(memberId)
      if (!grpSet || grpSet.size === 0) {
        const name = 'ללא קבוצה'
        if (!grpAgg.has(name)) grpAgg.set(name, { active: 0, churned: 0 })
        grpAgg.get(name)[key]++
        return
      }
      grpSet.forEach(name => {
        if (!grpAgg.has(name)) grpAgg.set(name, { active: 0, churned: 0 })
        grpAgg.get(name)[key]++
      })
    }
    activeMembers.forEach(m => addToGrpAgg(m.id, 'active'))
    churned.forEach(m => addToGrpAgg(m.id, 'churned'))

    const toRow = ([name, { active, churned }]) => {
      const base = active + churned
      return { name, active, churned, pct: base > 0 ? Math.round((churned / base) * 100) : 0 }
    }

    const coachRows = Array.from(coachAgg.entries()).map(toRow)
      .filter(r => r.active + r.churned > 0).sort((a, b) => b.pct - a.pct)
    const groupRows = Array.from(grpAgg.entries()).map(toRow)
      .filter(r => r.active + r.churned > 0).sort((a, b) => b.pct - a.pct)

    return {
      churnByCoach: coachRows,
      churnByGroup: groupRows,
      totalChurned: churned.length,
      totalActiveBase: activeMembers.length + churned.length,
    }
  }, [activeMembers, filteredMembers, periodDays, coachById, classById, checkins])

  if (!isAdmin) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4 text-yellow-900">
        <div className="flex items-center gap-2 font-bold mb-1"><span>🔒</span> גישה מוגבלת</div>
        <p className="text-sm">הדוחות זמינים למנהל המערכת בלבד.</p>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-8">טוען דוחות…</div>
  }

  if (err) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-red-800">
        <div className="font-bold mb-1">שגיאה בטעינת הדוחות</div>
        <p className="text-sm">{err}</p>
      </div>
    )
  }

  const totalActive = activeMembers.length
  const totalPending = filteredMembers.filter(m => m.status === 'pending' && !m.deleted_at).length
  const churnPctTotal = totalActiveBase > 0 ? Math.round((totalChurned / totalActiveBase) * 100) : 0
  // משתנים אלה אינם בשימוש עוד (היו משמשים את דוחות "פעילות בפועל" שהוסרו),
  // אבל ה-aggregations byCoach/byDiscipline עדיין מחושבים כי משמשים את churn report.
  void byCoach; void byDiscipline

  return (
    <div className="space-y-4" dir="rtl">
      {/* כותרת + פילטרים */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <h2 className="font-black text-gray-900">דוחות מאמן</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">כל הסניפים</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button
            onClick={fetchAll}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-3 py-1.5 rounded-lg"
          >🔄 רענן</button>
        </div>
      </div>

      {/* סיכום מהיר */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="מתאמנים פעילים" value={totalActive} tone="blue" />
        <StatCard label={`נרשמים חדשים (${periodDays} ימים)`} value={newMembers.length} tone="green" />
        <StatCard label="ממתינים לאישור" value={totalPending} tone="orange" />
        <StatCard label={`% נטישה (${periodDays} ימים)`} value={`${churnPctTotal}%`} sub={`${totalChurned} ביטולים מתוך ${totalActiveBase}`} tone="red" />
      </div>

      {/* סלייד אחד מאוחד — משפיע על כל הדוחות (נוכחות + נרשמים חדשים + נטישה) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 font-semibold">טווח זמן לכל הדוחות:</span>
        {[7, 30, 60, 90, 180].map(d => (
          <button key={d}
            onClick={() => setPeriodDays(d)}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold ${periodDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >{d} ימים</button>
        ))}
      </div>

      {/* === פעילות מאמנים ותחומים (מודל "רישום=הגעה") === */}

      {/* מתאמנים פעילים לפי תחום + פילוח לפי מאמן */}
      <SectionCard
        title={`מתאמנים פעילים לפי תחום לחימה (${periodDays} ימים)`}
        icon="🥊"
        footer="מבוסס על נוכחות בפועל (צ'ק-אין באימון שהתקיים). המספר הראשון = מתאמנים ייחודיים שנכחו בתחום. השני = סה״כ אימונים בתחום. תחת כל תחום, פילוח לפי המאמן."
      >
        {byAssignedDiscipline.every(r => r.count === 0) ? (
          <p className="text-sm text-gray-500">אין נתונים להצגה.</p>
        ) : (
          byAssignedDiscipline.filter(r => r.count > 0 || r.name !== 'אחר').map(row => {
            const max = byAssignedDiscipline.reduce((m, r) => Math.max(m, r.count), 0) || 1
            // חפיפה = סכום פר-מאמן פחות הייחודיים. אם > 0 → יש מתאמנים אצל כמה מאמנים.
            const sumByCoach = row.byCoach.reduce((s, c) => s + c.count, 0)
            const overlap = sumByCoach - row.count
            return (
              <div key={`assigned-${row.name}`} className="mb-4 last:mb-0">
                <BarRow
                  label={row.name}
                  value={row.count}
                  max={max}
                  color={DISCIPLINE_COLORS[row.name]}
                  sessions={row.sessions}
                />
                {row.byCoach.length > 0 && row.count > 0 && (
                  <div className="mr-3 pl-2 border-r-2 border-gray-200 mt-1.5 space-y-1.5">
                    {overlap > 0 && (
                      <div className="text-[11px] text-gray-500 italic mb-1">
                        💡 סכום העמודות מתחת ({sumByCoach}) גדול מ-{row.count} כי {overlap} {overlap === 1 ? 'מתאמן רשום' : 'מתאמנים רשומים'} אצל יותר ממאמן אחד.
                      </div>
                    )}
                    {row.byCoach.map(coach => {
                      // המד של המאמן יחסי למאמן הבולט בתחום שלו
                      const maxInDisc = row.byCoach.reduce((m, c) => Math.max(m, c.count), 0) || 1
                      const pct = Math.round((coach.count / maxInDisc) * 100)
                      return (
                        <div key={`assigned-${row.name}-${coach.name}`} className="text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="truncate flex items-center gap-1.5">
                              <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: DISCIPLINE_COLORS[row.name] }} />
                              <span className="truncate text-gray-700" title={coach.name}>{coach.name}</span>
                            </span>
                            <span className="shrink-0 mr-2 font-semibold text-gray-900">
                              {coach.count}
                              <span className="text-gray-500 font-normal mr-1">· {coach.sessions} אימונים</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: DISCIPLINE_COLORS[row.name], opacity: 0.6 }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
        <p className="text-xs text-gray-500 mt-2">
          * מתאמן שמשויך לקבוצות בכמה תחומים נספר בכל תחום בנפרד.<br />
          * בתוך תחום, מתאמן שרשום אצל כמה מאמנים נספר אצל כל אחד מהם — לכן סכום המאמנים יכול להיות גדול מהמספר הכולל בתחום.
        </p>
      </SectionCard>

      {/* === התראת לא-פעילים — מבוסס על נוכחות בפועל בלבד === */}
      <SectionCard
        title={`מתאמנים שלא הגיעו מעל שבועיים ${inactiveMembers.length > 0 ? `(${inactiveMembers.length})` : ''}`}
        icon="⚠️"
        footer="מבוסס על נוכחות בפועל (צ'ק-אין באימון שהתקיים). הרשימה מציגה מתאמנים פעילים שלא נכחו בשום אימון ב-14 הימים האחרונים. רישום מראש לאימון עתידי לא נחשב הגעה. כפתור 📲 שולח התראת Push לאפליקציה (חינמי, מגיע גם אם המתאמן לא בקבוצה אצלך). כפתור 💬 פותח ווצאפ עם הודעה ממולאת מראש — fallback למתאמנים שלא הפעילו Push."
      >
        {inactiveMembers.length === 0 ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">✅ כל המתאמנים הפעילים נכחו באימון ב-14 הימים האחרונים.</p>
        ) : (
          <>
            {/* כפתור Bulk: שלח Push לכל הלא-פעילים בלחיצה אחת */}
            <div className="mb-3 flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs text-blue-900 flex-1 min-w-[160px]">
                💡 שליחת Push לכולם בלחיצה אחת (חינמי, פנימי באפליקציה).
              </div>
              <button
                type="button"
                onClick={sendPushToAllInactive}
                disabled={bulkSending}
                aria-label={`שלח התראת Push ל-${inactiveMembers.length} מתאמנים שלא הגיעו`}
                className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700 transition-colors"
              >
                <span aria-hidden="true">📲</span>
                <span>{bulkSending ? 'שולח…' : `שלח Push ל-${inactiveMembers.length}`}</span>
              </button>
            </div>
          <div className="max-h-96 overflow-y-auto -mx-4 px-4">
            <ul className="divide-y divide-gray-100">
              {inactiveMembers.map(m => {
                const days = m.daysSince
                const daysLabel = days === null ? 'לא נכח מעולם' : `${days} ימים`
                const toneClass = days === null ? 'bg-gray-100 text-gray-700' :
                  days >= 30 ? 'bg-red-100 text-red-800' :
                  days >= 14 ? 'bg-orange-100 text-orange-800' :
                  'bg-yellow-100 text-yellow-800'
                const waLink = whatsappLink(m.phone, inactiveReminderMessage(m.name, days))
                const isSending = pushSending.has(m.id)
                const wasSent = pushSent.has(m.id)
                return (
                  <li key={m.id} className="flex items-center gap-2 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate" title={m.name}>{m.name}</div>
                      {m.phone && <div className="text-xs text-gray-500 mt-0.5" dir="ltr">{m.phone}</div>}
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${toneClass}`}>
                      {daysLabel}
                    </span>
                    {/* כפתור Push — תמיד מוצג (גם בלי טלפון, כי Push לא דורש טלפון) */}
                    <button
                      type="button"
                      onClick={() => sendPushToMember(m)}
                      disabled={isSending || bulkSending}
                      aria-label={wasSent ? `התראה כבר נשלחה ל${m.name}` : `שלח התראת Push ל${m.name}`}
                      title={wasSent ? 'נשלח בסשן זה' : 'שלח התראת Push לאפליקציה'}
                      className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-2 rounded-lg focus:outline focus:outline-2 focus:outline-offset-2 transition-colors ${
                        wasSent
                          ? 'bg-blue-100 text-blue-700 cursor-default'
                          : isSending
                            ? 'bg-blue-300 text-white cursor-wait'
                            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white focus:outline-blue-700'
                      }`}
                    >
                      <span aria-hidden="true">{wasSent ? '✓' : '📲'}</span>
                      <span>{wasSent ? 'נשלח' : isSending ? '…' : 'Push'}</span>
                    </button>
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`שלח הודעת ווצאפ ל${m.name}`}
                        className="shrink-0 inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold px-2.5 py-2 rounded-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
                      >
                        <span aria-hidden="true">💬</span>
                        <span>ווצאפ</span>
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-400 italic px-2 py-2">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          </>
        )}
      </SectionCard>

      {/* שיעורי ניסיון לפי תחום לחימה + פילוח לפי מאמן — דוח שיווקי */}
      <SectionCard
        title={`שיעורי ניסיון לפי תחום ולפי מאמן (${periodDays} ימים)`}
        icon="🆕"
        footer={`סה״כ ${trialsByDiscipline.total} ביקורי ניסיון. תחת כל תחום, פילוח לפי המאמן שאצלו היה הניסיון — עוזר להבין איזה מאמן מקדם הצטרפות.`}
      >
        {trialsByDiscipline.total === 0 ? (
          <p className="text-sm text-gray-500">אין ביקורי ניסיון בתקופה זו.</p>
        ) : (
          trialsByDiscipline.rows.filter(r => r.count > 0 || r.name !== 'אחר').map(row => {
            const max = trialsByDiscipline.rows.reduce((m, r) => Math.max(m, r.count), 0) || 1
            return (
              <div key={`trial-${row.name}`} className="mb-4 last:mb-0">
                <BarRow
                  label={row.name}
                  value={row.count}
                  max={max}
                  color={DISCIPLINE_COLORS[row.name]}
                />
                {row.byCoach.length > 0 && row.count > 0 && (
                  <div className="mr-3 pl-2 border-r-2 border-gray-200 mt-1.5 space-y-1.5">
                    {row.byCoach.map(coach => {
                      const maxInDisc = row.byCoach.reduce((m, c) => Math.max(m, c.count), 0) || 1
                      const pct = Math.round((coach.count / maxInDisc) * 100)
                      return (
                        <div key={`trial-${row.name}-${coach.name}`} className="text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="truncate flex items-center gap-1.5">
                              <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: DISCIPLINE_COLORS[row.name] }} />
                              <span className="truncate text-gray-700" title={coach.name}>{coach.name}</span>
                            </span>
                            <span className="shrink-0 mr-2 font-semibold text-gray-900">{coach.count}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: DISCIPLINE_COLORS[row.name], opacity: 0.6 }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </SectionCard>

      {/* נרשמים חדשים */}
      <SectionCard title={`נרשמים חדשים (${periodDays} ימים אחרונים)`} icon="📝" footer={`סה״כ ${newMembers.length} רישומים בתקופה`}>
        {newMembers.length === 0 ? (
          <p className="text-sm text-gray-500">לא נרשמו מתאמנים חדשים בתקופה זו.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-right text-xs text-gray-500 border-b">
                  <th className="py-2 pr-1 font-semibold">שם</th>
                  <th className="py-2 font-semibold">מנוי</th>
                  <th className="py-2 font-semibold">סטטוס</th>
                  <th className="py-2 font-semibold">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {newMembers
                  .slice()
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map(m => (
                    <tr key={m.id} className="border-b last:border-0 text-gray-800">
                      <td className="py-1.5 pr-1 font-semibold truncate max-w-[130px]">{m.full_name}</td>
                      <td className="py-1.5 text-xs">{SUB_LABELS[m.subscription_type] || '—'}</td>
                      <td className="py-1.5 text-xs">
                        {m.status === 'pending'
                          ? <span className="text-orange-700 bg-orange-100 px-2 py-0.5 rounded">ממתין</span>
                          : <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">פעיל</span>}
                      </td>
                      <td className="py-1.5 text-xs text-gray-500">
                        {new Date(m.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* נטישה לפי מאמן */}
      <SectionCard
        title={`% נטישה לפי מאמן (ביטולי מנוי ב-${periodDays} ימים האחרונים)`}
        icon="📉"
        footer={totalChurned === 0 ? '✅ לא היו ביטולי מנוי בתקופה זו.' : undefined}
      >
        {churnByCoach.length === 0 ? (
          <p className="text-sm text-gray-500">אין נתונים להצגה.</p>
        ) : (
          churnByCoach.map(row => (
            <BarRow
              key={row.name}
              label={`${row.name} — ${row.churned}/${row.active}`}
              value={row.pct}
              max={100}
              color={row.pct >= 50 ? '#dc2626' : row.pct >= 25 ? '#ea580c' : '#059669'}
              suffix="%"
            />
          ))
        )}
      </SectionCard>

      {/* נטישה לפי קבוצה */}
      <SectionCard
        title={`% נטישה לפי קבוצה (ביטולי מנוי ב-${periodDays} ימים האחרונים)`}
        icon="👥"
      >
        {churnByGroup.length === 0 ? (
          <p className="text-sm text-gray-500">אין נתונים להצגה.</p>
        ) : (
          churnByGroup.map(row => (
            <BarRow
              key={row.name}
              label={`${row.name} — ${row.churned}/${row.active}`}
              value={row.pct}
              max={100}
              color={row.pct >= 50 ? '#dc2626' : row.pct >= 25 ? '#ea580c' : '#059669'}
              suffix="%"
            />
          ))
        )}
      </SectionCard>
    </div>
  )
}
