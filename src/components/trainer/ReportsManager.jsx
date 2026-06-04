import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import { useToast, useConfirm } from '../a11y'
import PromotionEvents from './PromotionEvents'
import BeltHistoryEditor from './BeltHistoryEditor'
import { getBeltMeta, getBeltLabel, ADULT_BELTS, KIDS_BELTS,
  getBeltFamily, getBeltLevelPosition, getBeltFamilyLabel, getBeltFamilyColor,
  getSyllabusKeyForTarget, getLevelLabel,
  KIDS_BELT_MIN_AGE, KIDS_MIN_MONTHS_AT_BELT } from '../../lib/belts'

// ===== Helpers =====
const SUB_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

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

// מחזיר את תאריך ההופעה של רישום בפורמט 'YYYY-MM-DD' (זמן מקומי).
// week_start הוא התאריך של תחילת השבוע, day_of_week הוא 0..6.
// לדוגמה: week_start='2026-04-26' (יום ראשון) + day_of_week=2 (שלישי) → '2026-04-28'.
// משמש להזנה ל-classEndMs כמחליף של checkin_date שלא קיים ב-class_registrations.
function registrationOccurrenceDateStr(weekStart, dayOfWeek) {
  if (!weekStart) return null
  const [y, mo, d] = String(weekStart).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0)
  const dow = Number.isFinite(dayOfWeek) ? dayOfWeek : 0
  dt.setDate(dt.getDate() + dow)
  // YYYY-MM-DD בזמן מקומי (לא toISOString כי זה UTC ויכול להחליק יום אחורה)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
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
export default function ReportsManager({ isAdmin, profile }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // סלייד אחד מאוחד שמשפיע על כל הדוחות (נרשמים חדשים + נטישה + נוכחות)
  const [periodDays, setPeriodDays] = useState(30)
  const [branchFilter, setBranchFilter] = useState('all')

  // בורר חודש לייצוא Excel — נפרד מהסלייד הכללי
  // 'current' | 'last' | 'YYYY-MM'
  const [exportMonth, setExportMonth] = useState('current')

  const [members, setMembers] = useState([])
  const [coaches, setCoaches] = useState([])
  const [classes, setClasses] = useState([]) // משמש גם כקבוצות (לפי המודל הקיים)
  const [branches, setBranches] = useState([])
  const [checkins, setCheckins] = useState([]) // נוכחויות — לצורך דוחות מבוססי נוכחות בפועל
  const [trialVisits, setTrialVisits] = useState([]) // ביקורי ניסיון אנונימיים (טבלה נפרדת)
  const [registrations, setRegistrations] = useState([]) // class_registrations — מי רשום לאיזו קבוצה
  const [beltHistory, setBeltHistory] = useState([])     // belt_history — תאריכי קבלת חגורה היסטוריים (שלב 3)

  // ===== מבחן ילדים יוני =====
  const [kidsEvents, setKidsEvents]         = useState([])   // promotion_events של event_type='kids_annual_test' (planned)
  const [kidsCandidates, setKidsCandidates] = useState([])   // candidates של אירועים אלה
  const [syllabus, setSyllabus]             = useState([])   // belt_test_syllabus (4 שורות)
  const [kidsActionBusy, setKidsActionBusy] = useState(() => new Set()) // candidate_id-ים בעיבוד
  const [kidsRiskPushSent, setKidsRiskPushSent] = useState(() => new Set()) // member_id-ים שנשלח להם push
  const [kidsRiskPushBusy, setKidsRiskPushBusy] = useState(() => new Set())
  const [adultMarkBusy, setAdultMarkBusy]   = useState(() => new Set())

  // ===== Push notification state (לסקציית "מתאמנים שלא הגיעו") =====
  // pushSending: Set של memberIds ששליחת ה-Push אליהם כרגע בתהליך
  // pushSent: Set של memberIds שכבר נשלח אליהם push בסשן הנוכחי (כדי למנוע ספאם)
  const [pushSending, setPushSending] = useState(() => new Set())
  const [pushSent, setPushSent] = useState(() => new Set())
  const [bulkSending, setBulkSending] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  // ===== Promotion suggestions state =====
  // suggestionFilter: 'ready' | 'getting_close' | 'all'
  const [suggestionFilter, setSuggestionFilter] = useState('ready')
  // selectedCandidates: Set של member_id שסומנו ב-checkbox בדוח
  const [selectedCandidates, setSelectedCandidates] = useState(() => new Set())
  // initialEventCandidates: כשמשתמש לוחץ "צור אירוע עם מסומנים" → מועבר ל-PromotionEvents
  const [initialEventCandidates, setInitialEventCandidates] = useState(null)
  // editingHistoryMember: כשהמנהל/מאמן לוחץ ✏️ ליד שורה בדוח → modal של BeltHistoryEditor
  const [editingHistoryMember, setEditingHistoryMember] = useState(null)

  // טעינה: מנהל רואה הכל. מאמן רגיל גם — אבל הסינון לקואצ' שלו נעשה ב-useMemo (filteredMembers).
  useEffect(() => { if (isAdmin || profile?.id) fetchAll() }, [isAdmin, profile?.id])

  async function fetchAll() {
    setLoading(true)
    setErr('')
    try {
      // Supabase מחזיר ברירת מחדל עד 1000 שורות בלבד. כדי שהדוחות לא ייחתכו —
      // נטענות עד 100,000 רשומות בכל קריאה, וגם מסננים מראש לפי טווח של 180 יום
      // (הטווח המקסימלי שניתן לבחור) כדי לחסוך תעבורה.
      const ROW_LIMIT = 100000
      const sinceMaxISO = new Date(Date.now() - 180 * DAY_MS).toISOString()

      const [mRes, cRes, clsRes, bRes, chkRes, tvRes, regRes, bhRes, kidsEvRes, kidsCandRes, sylRes] = await Promise.all([
        supabase
          .from('members')
          .select('id, full_name, phone, email, status, active, subscription_type, coach_id, requested_coach_name, requested_coach_names, branch_id, branch_ids, group_id, group_ids, created_at, deleted_at, belt, belt_received_at, belt_stripes, belt_category, trains_gi, trains_nogi, bjj_start_date, birth_date')
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
        // belt_history: תאריכי קבלת חגורה היסטוריים. נטען לחישוב backfill מדויק.
        // אם הטבלה עוד לא הוקמה (Migration לא רץ) — נטפל בשגיאה בשקט.
        supabase
          .from('belt_history')
          .select('member_id, belt, belt_stripes, received_at, source, event_id')
          .range(0, ROW_LIMIT - 1),
        // promotion_events של מבחן ילדים יוני (planned + לא נמחקו)
        supabase
          .from('promotion_events')
          .select('id, name, event_date, event_type, class_id, attendance_threshold, branch_ids, status, deleted_at, notes')
          .eq('event_type', 'kids_annual_test')
          .is('deleted_at', null)
          .order('event_date', { ascending: true })
          .range(0, ROW_LIMIT - 1),
        // candidates של אירועי kids — נסנן בצד הקליינט לפי event_id
        supabase
          .from('promotion_candidates')
          .select('id, event_id, member_id, current_belt, current_stripes, target_belt, target_stripes, status, attendance_pct, attendance_recommendation, target_to_adult, expected_sessions, attended_sessions')
          .range(0, ROW_LIMIT - 1),
        // סילבוס מבחן חגורות
        supabase
          .from('belt_test_syllabus')
          .select('belt_family, age_range_label, content, level_notes, display_order')
          .order('display_order', { ascending: true }),
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
      // belt_history עלול להיכשל אם המיגרציה עוד לא רצה — לא חוסם
      if (bhRes.error && !/relation .*belt_history/i.test(bhRes.error.message || '')) {
        console.error('belt_history fetch error:', bhRes.error)
      }
      setMembers(mRes.data || [])
      setCoaches(cRes.data || [])
      setClasses(clsRes.data || [])
      setBranches(bRes.data || [])
      setCheckins(chkRes.data || [])
      setTrialVisits(tvRes.data || [])
      setRegistrations(regRes.data || [])
      setBeltHistory(bhRes.data || [])
      // אם הטבלאות עדיין לא הוקמו (Migration לא רץ) — לא לשבור את הדוחות.
      if (kidsEvRes.error && !/relation .*promotion_events/i.test(kidsEvRes.error.message || '')) {
        console.error('kids events fetch error:', kidsEvRes.error)
      }
      if (sylRes.error && !/relation .*belt_test_syllabus/i.test(sylRes.error.message || '')) {
        console.error('syllabus fetch error:', sylRes.error)
      }
      setKidsEvents((kidsEvRes.data || []).filter(e => e.event_type === 'kids_annual_test'))
      // candidates של אירועי kids בלבד (נסנן בקליינט לפי event_id-ים שב-kidsEvRes)
      const kidsEvIds = new Set((kidsEvRes.data || []).map(e => e.id))
      setKidsCandidates((kidsCandRes.data || []).filter(c => kidsEvIds.has(c.event_id)))
      setSyllabus(sylRes.data || [])

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

  // ============================================================
  // class_registrations מסוננים לפי טווח הזמן של הדוחות.
  // ⚠️ במודל של דודי: רישום = נוכחות, **בתנאי שהשיעור הסתיים** (start_time + duration < now).
  // אחרי תחילת השיעור המתאמן לא יכול לבטל (רק מאמן יכול להסיר), לכן ברגע שהשיעור הסתיים —
  // הרישום הוא הנוכחות הסופית. זה מחליף את הסתמכות הדוחות על checkins (שלא בשימוש פעיל).
  // ============================================================
  const filteredRegistrations = useMemo(() => {
    const now = Date.now()
    const since = now - periodDays * DAY_MS
    return registrations.filter(r => {
      if (!r.class_id || !r.athlete_id) return false
      const cls = classById.get(r.class_id)
      if (!cls) return false
      // חישוב תאריך ההופעה של השיעור: week_start + day_of_week.
      const occDateStr = registrationOccurrenceDateStr(r.week_start, cls.day_of_week)
      const endMs = classEndMs(occDateStr, cls.start_time, cls.duration_minutes)
      if (endMs === null) {
        // נתונים חסרים (start_time/duration_minutes/week_start) — לא ניתן לקבוע אם השיעור הסתיים.
        // לא סופרים — בטוח יותר מאשר לספור רישום עתידי בטעות.
        return false
      }
      // רק שיעור שהסתיים בפועל ובתוך טווח הזמן הנבחר.
      return endMs <= now && endMs >= since
    })
  }, [registrations, periodDays, classById])

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
  // דוחות פעילות — מבוססים על class_registrations (רישומים).
  // ⚠️ במודל של דודי: רישום = נוכחות (כי אחרי תחילת השיעור המתאמן לא יכול לבטל).
  // הפילטר filteredRegistrations כבר אוכף "השיעור הסתיים בפועל" + טווח periodDays —
  // לכן ספירה נכונה של הגעות מתבצעת רק על שיעורים שאכן התקיימו ונגמרו.
  // ============================================================

  // 0b) מתאמנים פעילים לפי תחום + פילוח לפי מאמן בתוך התחום.
  // count = מתאמנים ייחודיים שנרשמו לתחום (לשיעור שהסתיים),
  // sessions = סך הרישומים בתחום (כל "הגעה" נספרת).
  const byAssignedDiscipline = useMemo(() => {
    const acc = {}
    DISCIPLINE_ORDER.forEach(d => {
      acc[d] = { members: new Set(), sessions: 0, byCoach: new Map() }
    })
    filteredRegistrations.forEach(r => {
      if (!r.athlete_id || !r.class_id) return
      if (!activeMemberIds.has(r.athlete_id)) return
      const cls = classById.get(r.class_id)
      if (!cls) return
      const disc = disciplineByClassId.get(r.class_id) || 'אחר'
      if (!acc[disc]) return

      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'

      acc[disc].members.add(r.athlete_id)
      acc[disc].sessions += 1

      if (!acc[disc].byCoach.has(coachName)) {
        acc[disc].byCoach.set(coachName, { members: new Set(), sessions: 0 })
      }
      const coachAgg = acc[disc].byCoach.get(coachName)
      coachAgg.members.add(r.athlete_id)
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
  }, [filteredRegistrations, classById, coachById, disciplineByClassId, activeMemberIds])

  // 0c) מתאמנים שלא הגיעו לאימון ב-14 הימים האחרונים.
  // מבוסס על MAX של **שעת סיום השיעור** של רישום בפועל — כי רק שיעור שהסתיים
  // נחשב הגעה. אם מתאמן רשום לאימון שעוד לא קרה, זה לא נחשב.
  // הסף נקבע ל-14 יום כדי להימנע מ-false positives של חופש קצר/מילואים/מחלה.
  const INACTIVE_THRESHOLD_DAYS = 14
  const inactiveMembers = useMemo(() => {
    const now = Date.now()
    const lastByMember = new Map()
    // משתמשים ב-registrations המלא (לא ה-filtered) — צריכים את כל ה-180 יום
    // כדי לדעת מתי באמת הייתה ההגעה האחרונה, גם אם היא ישנה.
    // קריטריון: רק שיעורים שהסתיימו בפועל (start_time + duration < now).
    registrations.forEach(r => {
      if (!r.athlete_id) return
      const cls = classById.get(r.class_id)
      if (!cls) return
      const occDateStr = registrationOccurrenceDateStr(r.week_start, cls.day_of_week)
      const endMs = classEndMs(occDateStr, cls.start_time, cls.duration_minutes)
      if (endMs === null) return
      if (endMs > now) return // שיעור עתידי — לא נספר כהגעה
      const prev = lastByMember.get(r.athlete_id) || 0
      if (endMs > prev) lastByMember.set(r.athlete_id, endMs)
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
  }, [activeMembers, registrations, classById])

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
      // ה-URL מצביע ל-overlay "מתגעגעים אליך" (WelcomeBackOverlay) שיקפוץ
      // אוטומטית עם פתיחת האפליקציה. מעבירים days כפרמטר כדי שההודעה במסך
      // תהיה מותאמת (3 וריאציות: לא נכח מעולם / עד 14 / מעל 14).
      const wbDays = member.daysSince === null ? '' : `?days=${member.daysSince}`
      await notifyPush({
        userIds: [member.id],
        title,
        body,
        url: `/#welcome-back${wbDays}`,
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
          const wbDays = m.daysSince === null ? '' : `?days=${m.daysSince}`
          return notifyPush({
            userIds: [m.id],
            title: `${CLUB_NAME} 🥋 מתגעגעים אליך`,
            body,
            url: `/#welcome-back${wbDays}`,
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

  // 1) כמות מתאמנים לפי מאמן — מבוסס רישומים לשיעורים שהסתיימו בטווח הנבחר.
  // מחזיר: שם, מתאמנים ייחודיים, וסה"כ הגעות (= ספירת כל הרישומים לשיעורים שהסתיימו).
  const byCoach = useMemo(() => {
    const members = new Map()   // coachName → Set<athlete_id>
    const sessions = new Map()  // coachName → total registrations to ended classes
    coaches.forEach(c => { members.set(c.name || '—', new Set()); sessions.set(c.name || '—', 0) })
    filteredRegistrations.forEach(r => {
      if (!r.athlete_id || !r.class_id) return
      if (!activeMemberIds.has(r.athlete_id)) return
      const cls = classById.get(r.class_id)
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
      members.get(coachName).add(r.athlete_id)
      sessions.set(coachName, sessions.get(coachName) + 1)
    })
    return Array.from(members.entries())
      .map(([name, set]) => ({ name, count: set.size, sessions: sessions.get(name) || 0 }))
      .sort((a, b) => b.count - a.count)
  }, [filteredRegistrations, coaches, coachById, classById, activeMemberIds])

  // 2) כמות מתאמנים לפי תחום + פילוח פנימי לפי מאמן.
  // לכל תחום: סה"כ מתאמנים ייחודיים + סה"כ הגעות (רישומים לשיעורים שהסתיימו),
  // וגם מערך byCoach עם אותם נתונים מצומצמים למאמן ספציפי.
  const byDiscipline = useMemo(() => {
    // מבנה עזר: discipline → { members: Set<athleteId>, sessions: number,
    //                          byCoach: Map<coachName, { members: Set, sessions: number }> }
    const acc = {}
    DISCIPLINE_ORDER.forEach(d => {
      acc[d] = { members: new Set(), sessions: 0, byCoach: new Map() }
    })

    filteredRegistrations.forEach(r => {
      if (!r.athlete_id || !r.class_id) return
      if (!activeMemberIds.has(r.athlete_id)) return
      const cls = classById.get(r.class_id)
      if (!cls) return
      const disc = disciplineByClassId.get(r.class_id)
      if (!disc || !acc[disc]) return

      // שיוך מאמן לקלאס: לפי coach_id ואם אין fallback ל-coach_name
      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'

      acc[disc].members.add(r.athlete_id)
      acc[disc].sessions += 1

      if (!acc[disc].byCoach.has(coachName)) {
        acc[disc].byCoach.set(coachName, { members: new Set(), sessions: 0 })
      }
      const coachAgg = acc[disc].byCoach.get(coachName)
      coachAgg.members.add(r.athlete_id)
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
  }, [filteredRegistrations, disciplineByClassId, activeMemberIds, classById, coachById])

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
    // שיוך מאמן/קבוצה למתאמן מבוסס על רישומים לשיעורים שהסתיימו בפועל.
    registrations.forEach(r => {
      if (!r.athlete_id || !r.class_id) return
      const cls = classById.get(r.class_id)
      if (!cls) return
      const occDateStr = registrationOccurrenceDateStr(r.week_start, cls.day_of_week)
      const endMs = classEndMs(occDateStr, cls.start_time, cls.duration_minutes)
      if (endMs === null) return
      if (endMs > nowMs) return // שיעור עתידי — לא יוצר שיוך
      // מאמן לפי הקלאס — לפי coach_id, ואם אין fallback ל-coach_name
      let coachName = null
      if (cls.coach_id && coachById.has(cls.coach_id)) coachName = coachById.get(cls.coach_id).name
      if (!coachName && cls.coach_name) coachName = cls.coach_name
      if (!coachName) coachName = 'ללא מאמן'
      if (!coachesByMember.has(r.athlete_id)) coachesByMember.set(r.athlete_id, new Set())
      coachesByMember.get(r.athlete_id).add(coachName)
      // קבוצה לפי שם הקלאס
      const gname = cls.name
      if (gname) {
        if (!groupsByMember.has(r.athlete_id)) groupsByMember.set(r.athlete_id, new Set())
        groupsByMember.get(r.athlete_id).add(gname)
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
  }, [activeMembers, filteredMembers, periodDays, coachById, classById, registrations])

  // ============================================================
  // ===== Promotion Suggestions: ספי IBJJF + score =====
  // ============================================================
  //
  // == Backfill יחידות BJJ היסטוריות ==
  // בעיה: מתאמן שקיבל חגורה ב-2024-05 (לפני שהמערכת קיימת) — הסיסטם רואה 0 BJJ
  // checkins מאז, אבל בפועל הוא התאמן.
  //
  // לוגיקה:
  //   1. אם למתאמן **אין** ולו checkin אחד של BJJ במערכת → 0 משוער. אנחנו לא
  //      יודעים אם הוא בכלל מתאמן BJJ (גם אם יש לו subscription_type='4x_week' —
  //      יכול להיות שעושה 2 BJJ + 2 מואי תאי, ויכול להיות שעוד לא הגיע).
  //   2. אם יש לו לפחות checkin BJJ אחד:
  //      - מוצאים את ה-checkin הראשון שלו (`first_bjj_checkin_ms`).
  //      - אם עברו ≥ 90 ימים מאז + יש ≥ 5 checkins ב-3 חודשים אלה →
  //        ממוצע = checkins / (90/7) שבועות.
  //      - אחרת → 0 משוער (חוזרים אחרי 3 חודשים שיהיה דאטה אמין).
  //      - הקרנה אחורה רק על הפער: `first_bjj_checkin - belt_received_at`.
  //   3. תיקון × 0.86 על חגי ישראל ותקופות חירום (~6 שבועות בשנה אבודים).
  // ============================================================
  const HOLIDAY_FACTOR   = 0.86 // ~6 שבועות בשנה אבודים (חגים+חירום) → 86% מהשבועות פעילים
  const MIN_OBSERVATION_DAYS = 90       // מינימום תצפית כדי לחשב ממוצע
  const MIN_OBSERVED_UNITS   = 5        // מינימום checkins כדי שהממוצע יהיה אמין

  // ספים מינימליים לקידום (IBJJF guidelines + טיוב לפי ניסיון של דודי).
  // ניתן לכוונן בעתיד דרך טבלה במקום קוד.
  const PROMOTION_THRESHOLDS = {
    white:  { years: 1.5, units: 200, next: 'blue'   },
    blue:   { years: 2.0, units: 250, next: 'purple' },
    purple: { years: 1.5, units: 300, next: 'brown'  },
    brown:  { years: 1.0, units: 400, next: 'black'  },
    // שחורה (מבוגרים): קידום בין דאנים. IBJJF: 3 שנים בין דאן 1-3, 5 שנים 3-6, 7 שנים → קורל.
    black:    { years: 3.0, units: 300, next: 'black_1' },
    black_1:  { years: 3.0, units: 300, next: 'black_2' },
    black_2:  { years: 3.0, units: 300, next: 'black_3' },
    black_3:  { years: 5.0, units: 400, next: 'black_4' },
    black_4:  { years: 5.0, units: 400, next: 'black_5' },
    black_5:  { years: 5.0, units: 400, next: 'black_6' },
    black_6:  { years: 7.0, units: 400, next: 'coral_red_black' },
    coral_red_black: { years: 7.0, units: 300, next: 'coral_red_white' },
    coral_red_white: { years: 10.0, units: 300, next: 'red' },
    // ילדים: זמן יותר קצר בין דרגות
    kids_white:        { years: 0.7, units: 60,  next: 'kids_gray_white'   },
    kids_gray_white:   { years: 0.7, units: 60,  next: 'kids_gray'         },
    kids_gray:         { years: 0.7, units: 60,  next: 'kids_gray_black'   },
    kids_gray_black:   { years: 0.7, units: 60,  next: 'kids_yellow_white' },
    kids_yellow_white: { years: 0.7, units: 60,  next: 'kids_yellow'       },
    kids_yellow:       { years: 0.7, units: 60,  next: 'kids_yellow_black' },
    kids_yellow_black: { years: 0.7, units: 60,  next: 'kids_orange_white' },
    kids_orange_white: { years: 0.7, units: 60,  next: 'kids_orange'       },
    kids_orange:       { years: 0.7, units: 60,  next: 'kids_orange_black' },
    kids_orange_black: { years: 0.7, units: 60,  next: 'kids_green_white'  },
    kids_green_white:  { years: 0.7, units: 60,  next: 'kids_green'        },
    kids_green:        { years: 0.7, units: 60,  next: 'kids_green_black'  },
  }

  // בונים pivot: לכל מתאמן — כמה checkins מאז ה-belt_received_at שלו
  const promotionSuggestions = useMemo(() => {
    if (!members.length) return []
    // Map: `${member_id}::${belt}` → MIN(received_at) — תאריך הקבלה הראשון של החגורה הנוכחית.
    // משתמש בזה לדיוק backfill: אם בהיסטוריה יש "blue ינואר 2018" — זה התאריך לחישוב,
    // לא members.belt_received_at שיכול להיות "מאי 2024" (מתי קיבל פס נוסף).
    const earliestByMemberBelt = new Map()
    for (const h of beltHistory) {
      if (!h.member_id || !h.belt || !h.received_at) continue
      const key = `${h.member_id}::${h.belt}`
      const existing = earliestByMemberBelt.get(key)
      if (!existing || h.received_at < existing) {
        earliestByMemberBelt.set(key, h.received_at)
      }
    }
    // מספרת checkins לכל athlete_id, רק שיעורי BJJ שהסתיימו
    const bjjClassIds = new Set(
      classes.filter(c => {
        const explicit = (c.class_type || '').toLowerCase()
        const disc = explicit && explicit !== 'regular' ? detectDiscipline(explicit) : detectDiscipline(c.name || '')
        return disc === 'BJJ'
      }).map(c => c.id)
    )
    // אגירת checkins לפי athlete_id (רק BJJ + השיעור הסתיים בפועל)
    const nowMs = Date.now()
    const unitsByMember = new Map() // member_id → { totalUnits, unitsSinceBelt }
    for (const c of checkins) {
      if (!bjjClassIds.has(c.class_id)) continue
      const cls = classById.get(c.class_id)
      if (!cls) continue
      const endMs = classEndMs(c.checkin_date, cls.start_time, cls.duration_minutes)
      if (endMs == null || endMs > nowMs) continue
      const cur = unitsByMember.get(c.athlete_id) || { totalUnits: 0, unitsSinceBelt: 0, _endMs: [] }
      cur.totalUnits++
      cur._endMs.push(endMs)
      unitsByMember.set(c.athlete_id, cur)
    }

    // עבור כל מתאמן Gi עם חגורה — מחשבים years_on_belt + units_since_belt + score
    // **חשוב:** מציגים את כולם, גם בלי threshold (כמו אדומה/red) — recommendation='no_threshold'
    const rows = []
    for (const m of members) {
      // נכלל מתאמן Gi או NoGi (אותה הדרגה — Gi/NoGi משותפים).
      // אם שניהם false/null → לא מתאמן BJJ → לא נכלל בדוח.
      const trainsBjj = m.trains_gi !== false || m.trains_nogi === true
      if (!trainsBjj) continue
      if (!m.belt) continue
      if (m.deleted_at) continue
      if (m.status === 'pending' || m.status === 'pending_deletion') continue
      const thr = PROMOTION_THRESHOLDS[m.belt]
      // עדיפות: belt_history (תאריך הקבלה הראשון של החגורה הנוכחית) → fallback ל-members.belt_received_at
      const historyDate = earliestByMemberBelt.get(`${m.id}::${m.belt}`)
      const effectiveBeltReceivedAt = historyDate || m.belt_received_at
      const beltReceivedMs = effectiveBeltReceivedAt ? new Date(effectiveBeltReceivedAt).getTime() : null
      const yearsOnBelt = beltReceivedMs ? (nowMs - beltReceivedMs) / (365.25 * 24 * 3600 * 1000) : 0
      const stats = unitsByMember.get(m.id) || { totalUnits: 0, _endMs: [] }

      // ===== חישוב יחידות נצפות (observed) — מ-checkins של ה-DB =====
      const observedUnits = beltReceivedMs
        ? stats._endMs.filter(e => e >= beltReceivedMs).length
        : stats.totalUnits

      // ===== חישוב יחידות BJJ משוערות (estimated) למילוי הפער ההיסטורי =====
      // לוגיקה: ממוצע מחושב לפי **3 החודשים הראשונים מה-BJJ checkin הראשון** של
      // המתאמן במערכת (חלון יציב). מוקרן אחורה רק על הפער בין belt_received_at לבין
      // ה-checkin הראשון. אם אין BJJ checkin בכלל → 0 משוער.
      let estimatedUnits = 0
      let estimateBasis = null   // 'observed_first_3mo' | 'no_bjj_yet' | 'no_data' | null

      if (beltReceivedMs) {
        if (stats._endMs.length === 0) {
          // אין BJJ checkin אחד אפילו → לא יודעים שהוא בכלל מתאמן BJJ
          estimateBasis = 'no_bjj_yet'
        } else {
          const firstBjjCheckinMs = Math.min.apply(null, stats._endMs)
          // הקרנה אחורה רק עד first_bjj_checkin (לא לפני). אם החגורה ניתנה
          // אחרי ה-first_bjj_checkin → אין פער היסטורי
          if (firstBjjCheckinMs > beltReceivedMs) {
            const gapMs    = firstBjjCheckinMs - beltReceivedMs
            const gapWeeks = gapMs / (7 * 24 * 3600 * 1000)

            const calibWindowEndMs = firstBjjCheckinMs + (MIN_OBSERVATION_DAYS * 24 * 3600 * 1000)
            // נדרשים 3 חודשים מלאים: ה-window הסתיים לפני היום
            if (calibWindowEndMs <= nowMs) {
              const checkinsInWindow = stats._endMs.filter(e =>
                e >= firstBjjCheckinMs && e <= calibWindowEndMs
              ).length
              if (checkinsInWindow >= MIN_OBSERVED_UNITS) {
                const windowWeeks = MIN_OBSERVATION_DAYS / 7
                const frequencyPerWeek = checkinsInWindow / windowWeeks
                estimatedUnits = Math.round(gapWeeks * frequencyPerWeek * HOLIDAY_FACTOR)
                estimateBasis = 'observed_first_3mo'
              } else {
                estimateBasis = 'no_data'
              }
            } else {
              estimateBasis = 'no_data' // עוד אין 3 חודשי תצפית
            }
          }
        }
      }

      const unitsSinceBelt = observedUnits + estimatedUnits

      let recommendation, score, thresholdYears, thresholdUnits, nextBelt
      if (thr) {
        // החלש מבין השניים (כי אסור לקדם רק על בסיס זמן בלי אימונים)
        const yearsProgress = Math.min(yearsOnBelt / thr.years, 1.5)
        const unitsProgress = Math.min(unitsSinceBelt / thr.units, 1.5)
        score = Math.min(yearsProgress, unitsProgress)
        recommendation = score >= 1.0 ? 'ready'
                       : score >= 0.7 ? 'getting_close'
                       : 'not_yet'
        thresholdYears = thr.years
        thresholdUnits = thr.units
        nextBelt = thr.next
      } else {
        // חגורה ללא ספים (לא במעקב — למשל אדומה)
        score = 0
        recommendation = 'no_threshold'
      }

      rows.push({
        member: m,
        beltLabel: getBeltLabel(m.belt),
        yearsOnBelt,
        unitsSinceBelt,
        observedUnits,
        estimatedUnits,
        estimateBasis,
        thresholdYears,
        thresholdUnits,
        nextBelt,
        score,
        recommendation,
      })
    }
    // מיון: ready → getting_close → not_yet → no_threshold (לפי score, ואז no_threshold בסוף)
    rows.sort((a, b) => {
      if (a.recommendation === 'no_threshold' && b.recommendation !== 'no_threshold') return 1
      if (b.recommendation === 'no_threshold' && a.recommendation !== 'no_threshold') return -1
      return b.score - a.score
    })
    return rows
  }, [members, checkins, classes, classById, beltHistory])

  // ===== סינון לפי תפקיד =====
  // מנהל: רואה את כל המתאמנים בכל הסטטיסטיקות.
  // מאמן רגיל: רק את המתאמנים שמשויכים אליו (3 דרכים אפשריות):
  //   1. members.coach_id ∈ coaches שלו (coaches.user_id = profile.id)
  //   2. members.requested_coach_name = שם של אחד מה-coaches שלו
  //   3. members.requested_coach_names array מכיל שם של coach שלו
  //
  // (אותו pattern של AthleteManagement.jsx שורות 115-117.)
  const myAthleteIds = useMemo(() => {
    if (isAdmin || !profile?.id) return null // null = "אל תסנן"
    // coaches מ-fetchAll נטען עם id, name, branch_id, אבל בלי user_id.
    // לכן נשווה לפי name = profile.full_name.
    const myCoachNames = new Set()
    for (const c of coaches) {
      if (c.name && c.name === profile.full_name) myCoachNames.add(c.name)
    }
    // אם אין למאמן רישום ב-coaches עם השם שלו — fallback: נסה direct match על profile.id
    // (הוספה: גם אם לא נמצא, נחפש לפי full_name במידה והמתאמן כתב במפורש)
    const ids = new Set()
    for (const m of members) {
      if (m.requested_coach_name && profile.full_name && m.requested_coach_name === profile.full_name) {
        ids.add(m.id); continue
      }
      if (Array.isArray(m.requested_coach_names) && profile.full_name && m.requested_coach_names.includes(profile.full_name)) {
        ids.add(m.id); continue
      }
      // עבור coach_id — נצטרך לחפש את ה-coach המתאים. בינתיים נשתמש ב-name match.
      if (m.coach_id && myCoachNames.size > 0) {
        const coach = coaches.find(c => c.id === m.coach_id)
        if (coach && myCoachNames.has(coach.name)) {
          ids.add(m.id); continue
        }
      }
    }
    return ids
  }, [isAdmin, profile?.id, profile?.full_name, members, coaches])

  // מסננים את ה-suggestions למאמן רגיל
  const visibleSuggestions = useMemo(() => {
    if (!myAthleteIds) return promotionSuggestions
    return promotionSuggestions.filter(r => myAthleteIds.has(r.member.id))
  }, [promotionSuggestions, myAthleteIds])

  // ===== האם המאמן הנוכחי מלמד BJJ? =====
  // קידום זה רק עניין של BJJ. מאמן מואי תאי לא צריך לראות דוח קידום.
  // נחשב על בסיס classes שלו: אם לפחות שיעור אחד מסווג כ-BJJ (כולל NoGi/grappling) → מאמן BJJ.
  // detectDiscipline (כבר קיים בקובץ) מזהה: bjj, jiujitsu, nogi, grappling, גיוגיטסו, נוגי, ברזיל, openmat, וכו'
  const isBjjCoach = useMemo(() => {
    if (isAdmin) return true                    // מנהל = רואה הכל
    if (!profile?.full_name) return false
    // מצא את ה-coach.id-ים של המאמן הנוכחי בטבלת coaches (יכולים להיות כמה — סניף לסניף)
    const myCoachIds = new Set(
      coaches.filter(c => c.name === profile.full_name).map(c => c.id)
    )
    if (myCoachIds.size === 0) return false
    // בודק אם לפחות class אחד שלו הוא BJJ
    for (const cls of classes) {
      if (!myCoachIds.has(cls.coach_id)) continue
      const explicit = (cls.class_type || '').toLowerCase()
      const disc = explicit && explicit !== 'regular' ? detectDiscipline(explicit) : detectDiscipline(cls.name || '')
      if (disc === 'BJJ') return true
    }
    return false
  }, [isAdmin, profile?.full_name, coaches, classes])

  // ============================================================
  // ===== מבחן ילדים יוני — pivots =====
  // ============================================================
  const syllabusByFamily = useMemo(() => {
    const m = new Map()
    for (const s of syllabus) m.set(s.belt_family, s)
    return m
  }, [syllabus])

  const kidsCandsByEvent = useMemo(() => {
    const m = new Map()
    for (const c of kidsCandidates) {
      if (!m.has(c.event_id)) m.set(c.event_id, [])
      m.get(c.event_id).push(c)
    }
    return m
  }, [kidsCandidates])

  const memberByIdMap = useMemo(() => {
    const m = new Map()
    for (const x of members) m.set(x.id, x)
    return m
  }, [members])

  // אירועי kids גלויים: מנהל = הכל, מאמן = אירועים של class שיש לו לפחות אחד מ-myAthleteIds
  const visibleKidsEvents = useMemo(() => {
    if (isAdmin) return kidsEvents
    if (!myAthleteIds) return []
    // אירועים של מאמן: כאלה שלפחות אחד מהמועמדים שייך אליו
    return kidsEvents.filter(e => {
      const cands = kidsCandsByEvent.get(e.id) || []
      return cands.some(c => myAthleteIds.has(c.member_id))
    })
  }, [isAdmin, kidsEvents, kidsCandsByEvent, myAthleteIds])

  // ===== קבוצת ילדים בסיכון נשירה =====
  // kids שלא היה checkin שלהם 3+ שבועות. מקובצים לפי "כמה זמן עבר".
  const kidsAtRisk = useMemo(() => {
    const now = Date.now()
    const lastByMember = new Map()
    // משתמשים בכל ה-checkins (לא ב-filteredCheckins) כדי לקבל את המקסימום האמיתי
    for (const c of checkins) {
      if (!c.checked_in_at) continue
      const t = new Date(c.checked_in_at).getTime()
      if (!Number.isFinite(t) || t > now) continue
      const prev = lastByMember.get(c.athlete_id) || 0
      if (t > prev) lastByMember.set(c.athlete_id, t)
    }
    const cutoff21 = now - 21 * DAY_MS
    const list = []
    for (const m of activeMembers) {
      if (m.belt_category !== 'kids') continue
      if (!isAdmin && myAthleteIds && !myAthleteIds.has(m.id)) continue
      const last = lastByMember.get(m.id) || null
      if (last && last > cutoff21) continue
      const days = last ? Math.floor((now - last) / DAY_MS) : null
      list.push({
        id: m.id,
        name: m.full_name || '—',
        phone: m.phone || null,
        email: m.email || null,
        belt: m.belt,
        beltLabel: m.belt ? getBeltLabel(m.belt) : '—',
        lastAttendance: last,
        daysSince: days,
      })
    }
    list.sort((a, b) => (b.daysSince ?? 99999) - (a.daysSince ?? 99999))
    return list
  }, [checkins, activeMembers, isAdmin, myAthleteIds])

  // קיבוץ kids-at-risk לפי טווח שבועות
  const kidsAtRiskByBucket = useMemo(() => {
    const buckets = { '3-4w': [], '5-8w': [], '9-12w': [], '12w+': [] }
    for (const k of kidsAtRisk) {
      const d = k.daysSince ?? 99999
      if (d >= 84) buckets['12w+'].push(k)         // 12 שבועות+
      else if (d >= 63) buckets['9-12w'].push(k)   // 9-12 שבועות
      else if (d >= 35) buckets['5-8w'].push(k)    // 5-8 שבועות
      else buckets['3-4w'].push(k)                 // 3-4 שבועות
    }
    return buckets
  }, [kidsAtRisk])

  // ===== ילדים שיעברו לבוגרים השנה =====
  // מי שיגיע ל-16 בין הdate של אירוע kids הקרוב (או 1.6.YYYY) ל-12 חודש אחריו.
  const movingToAdult = useMemo(() => {
    // משתמשים בתאריך של אירוע kids הקרוב, או fallback ל-1.6 של השנה הנוכחית
    const today = new Date()
    const todayY = today.getFullYear()
    const sortedKidsEvents = [...visibleKidsEvents].sort((a, b) =>
      String(a.event_date).localeCompare(String(b.event_date))
    )
    const upcoming = sortedKidsEvents.find(e => e.event_date >= today.toISOString().slice(0, 10))
    const refDateStr = upcoming ? upcoming.event_date : `${todayY}-06-01`
    const ref = new Date(refDateStr)
    const yearLater = new Date(ref.getFullYear() + 1, ref.getMonth(), ref.getDate())

    const list = []
    for (const m of activeMembers) {
      if (m.belt_category !== 'kids') continue
      if (!m.birth_date) continue
      if (!isAdmin && myAthleteIds && !myAthleteIds.has(m.id)) continue
      const bd = new Date(m.birth_date)
      if (isNaN(bd.getTime())) continue
      const b16 = new Date(bd.getFullYear() + 16, bd.getMonth(), bd.getDate())
      if (b16 < ref || b16 >= yearLater) continue
      // האם כבר מסומן ב-candidate הקרוב?
      let alreadyMarked = false
      let upcomingCandId = null
      if (upcoming) {
        const cands = kidsCandsByEvent.get(upcoming.id) || []
        const cand = cands.find(c => c.member_id === m.id)
        if (cand) {
          alreadyMarked = !!cand.target_to_adult
          upcomingCandId = cand.id
        }
      }
      list.push({
        id: m.id,
        name: m.full_name || '—',
        belt: m.belt,
        beltLabel: m.belt ? getBeltLabel(m.belt) : '—',
        birth_date: m.birth_date,
        ageAt16: b16.toISOString().slice(0, 10),
        alreadyMarked,
        upcomingEventId: upcoming?.id || null,
        upcomingCandId,
      })
    }
    list.sort((a, b) => String(a.ageAt16).localeCompare(String(b.ageAt16)))
    return list
  }, [activeMembers, visibleKidsEvents, kidsCandsByEvent, isAdmin, myAthleteIds])

  // ===== ילדים מוכנים לקידום (לפי גיל + זמן בחגורה) =====
  const kidsReadyForPromotion = useMemo(() => {
    const today = new Date()
    const results = []
    for (const m of activeMembers) {
      if (m.belt_category !== 'kids') continue
      if (!isAdmin && myAthleteIds && !myAthleteIds.has(m.id)) continue
      const kidIdx = KIDS_BELTS.findIndex(b => b.value === m.belt)
      const nextBelt = kidIdx >= 0 ? KIDS_BELTS[kidIdx + 1] : null
      // לבן ילדים ללא birth_date — לא ניתן לחשב
      if (!nextBelt) continue
      // גיל
      let age = null
      if (m.birth_date) {
        const bd = new Date(m.birth_date)
        if (!isNaN(bd.getTime())) {
          age = today.getFullYear() - bd.getFullYear()
          const mo = today.getMonth() - bd.getMonth()
          if (mo < 0 || (mo === 0 && today.getDate() < bd.getDate())) age--
        }
      }
      const minAge = KIDS_BELT_MIN_AGE[nextBelt.value] ?? null
      const ageOk = age != null && minAge != null ? age >= minAge : null
      // זמן בחגורה — fallback ל-bjj_start_date אם belt_received_at חסר (לבנה חדשה)
      let monthsAtBelt = null
      let timeSource = null // 'belt' | 'bjj_start'
      const beltDateRef = m.belt_received_at || m.bjj_start_date || null
      if (beltDateRef) {
        const br = new Date(beltDateRef)
        if (!isNaN(br.getTime())) {
          monthsAtBelt = (today.getTime() - br.getTime()) / (1000 * 60 * 60 * 24 * 30.5)
          timeSource = m.belt_received_at ? 'belt' : 'bjj_start'
        }
      }
      const timeOk = monthsAtBelt != null ? monthsAtBelt >= KIDS_MIN_MONTHS_AT_BELT : null
      // ready: גיל OK + זמן OK; almostReady: גיל OK + זמן לא מספיק
      const ready = ageOk === true && timeOk === true
      const almostReady = ageOk === true && timeOk === false
      results.push({ m, age, nextBelt, minAge, ageOk, monthsAtBelt, timeOk, timeSource, ready, almostReady })
    }
    // מיון: מוכנים → כמעט מוכנים → שאר
    results.sort((a, b) => {
      const score = x => x.ready ? 0 : x.almostReady ? 1 : 2
      return score(a) - score(b) || (a.nextBelt?.order ?? 99) - (b.nextBelt?.order ?? 99) || (a.m.full_name || '').localeCompare(b.m.full_name || '', 'he')
    })
    return results
  }, [activeMembers, isAdmin, myAthleteIds])

  // קיבוץ לפי חגורת יעד (לסיכום הזמנת חגורות)
  const kidsReadyByTarget = useMemo(() => {
    const m = new Map()
    for (const r of kidsReadyForPromotion) {
      if (!r.ready) continue
      const key = r.nextBelt.value
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(r)
    }
    return m
  }, [kidsReadyForPromotion])

  // ===== handlers לפעולות בדוח מבחן יוני =====
  async function handleKidsCandidateAction(cand, action) {
    // action: 'promote' | 'extra_stripe' | 'not_promoted'
    if (kidsActionBusy.has(cand.id)) return
    setKidsActionBusy(prev => new Set(prev).add(cand.id))
    try {
      let payload
      if (action === 'promote') {
        payload = { status: 'promoted' }
      } else if (action === 'extra_stripe') {
        // נשאר באותה חגורה, מקבל פס נוסף
        payload = {
          status: 'promoted',
          target_belt: cand.current_belt,
          target_stripes: Math.min((cand.current_stripes ?? 0) + 1, 4),
        }
      } else {
        payload = { status: 'not_promoted' }
      }
      const { error } = await supabase.from('promotion_candidates').update(payload).eq('id', cand.id)
      if (error) throw error
      // רענון
      fetchAll()
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || String(e)))
    } finally {
      setKidsActionBusy(prev => { const n = new Set(prev); n.delete(cand.id); return n })
    }
  }

  async function handlePushKidsRiskParents(member) {
    if (!member?.id) return
    if (kidsRiskPushBusy.has(member.id)) return
    setKidsRiskPushBusy(prev => new Set(prev).add(member.id))
    try {
      const days = member.daysSince
      const daysTxt = days == null ? '' : ` (${days} ימים בלי אימון)`
      await notifyPush({
        userIds: [member.id],
        title: '🥋 מתגעגעים אליכם!',
        body: `${member.name}${daysTxt} — נשמח לראות אתכם בחזרה. המבחן השנתי קרוב!`,
        url: '/',
        tag: `kids-risk-${member.id}`,
        icon: '/icon-192.png',
      })
      setKidsRiskPushSent(prev => new Set(prev).add(member.id))
      toast.success(`Push נשלח ל-${member.name}`)
    } catch (e) {
      toast.error('שגיאה בשליחה: ' + (e?.message || String(e)))
    } finally {
      setKidsRiskPushBusy(prev => { const n = new Set(prev); n.delete(member.id); return n })
    }
  }

  async function handlePushAllKidsRiskParents() {
    if (kidsAtRisk.length === 0) return
    let sent = 0, failed = 0
    for (const k of kidsAtRisk) {
      if (kidsRiskPushSent.has(k.id)) continue
      try {
        const days = k.daysSince
        const daysTxt = days == null ? '' : ` (${days} ימים בלי אימון)`
        await notifyPush({
          userIds: [k.id],
          title: '🥋 מתגעגעים אליכם!',
          body: `${k.name}${daysTxt} — נשמח לראות אתכם בחזרה. המבחן השנתי קרוב!`,
          url: '/',
          tag: `kids-risk-${k.id}`,
          icon: '/icon-192.png',
        })
        setKidsRiskPushSent(prev => new Set(prev).add(k.id))
        sent++
      } catch {
        failed++
      }
    }
    if (sent > 0) toast.success(`נשלחו ${sent} התראות${failed ? ` (${failed} נכשלו)` : ''}`)
    else if (failed > 0) toast.error(`כל ${failed} ההתראות נכשלו`)
  }

  async function handleMarkAsAdultTransition(item) {
    // item: שורה מ-movingToAdult — אם יש upcomingCandId, עדכן candidate; אחרת ייצר חדש
    if (adultMarkBusy.has(item.id)) return
    setAdultMarkBusy(prev => new Set(prev).add(item.id))
    try {
      if (item.upcomingCandId) {
        const { error } = await supabase.from('promotion_candidates')
          .update({ target_to_adult: true, target_belt: 'white' })
          .eq('id', item.upcomingCandId)
        if (error) throw error
      } else if (item.upcomingEventId) {
        const member = memberByIdMap.get(item.id)
        const { error } = await supabase.from('promotion_candidates').insert({
          event_id: item.upcomingEventId,
          member_id: item.id,
          current_belt: member?.belt || null,
          current_stripes: member?.belt_stripes ?? 0,
          target_belt: 'white',
          target_stripes: 0,
          target_to_adult: true,
          status: 'planned',
        })
        if (error) throw error
      } else {
        toast.error('אין אירוע מבחן ילדים מתוכנן. צור קודם אירוע מבחן יוני.')
        return
      }
      toast.success(`${item.name} סומן כעובר לבוגרים`)
      fetchAll()
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || String(e)))
    } finally {
      setAdultMarkBusy(prev => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  // אפשרויות חודשים לבורר ייצוא — 12 חודשים אחורה (חייב להיות לפני early returns!)
  const monthOptions = useMemo(() => {
    const opts = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })
      opts.push({ key, label })
    }
    return opts
  }, [])

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

  // ===== יצוא Excel — דוח מתאמנים לפי סניף וחודש קלנדרי =====

  // מחזיר { startMs, endMs, label } לפי הבחירה
  function resolveExportRange(mode) {
    const now = new Date()
    if (mode === 'current') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      return { startMs: start.getTime(), endMs: now.getTime(), label: monthLabel }
    }
    if (mode === 'last') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
      const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      const monthLabel = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
      return { startMs: start.getTime(), endMs: end.getTime(), label: monthLabel }
    }
    // mode === 'YYYY-MM'
    const [y, m] = mode.split('-').map(Number)
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
    const end   = new Date(y, m, 0, 23, 59, 59, 999) // היום האחרון בחודש
    return { startMs: start.getTime(), endMs: end.getTime(), label: mode }
  }

  function exportMembersExcel() {
    const { startMs, endMs, label: monthLabel } = resolveExportRange(exportMonth)
    const daysInPeriod = (endMs - startMs) / (24 * 60 * 60 * 1000)
    const weeks = daysInPeriod / 7

    const branchName = branchFilter === 'all'
      ? 'כל-הסניפים'
      : (branches.find(b => b.id === branchFilter)?.name || branchFilter)

    // ספירת הגעות לכל מתאמן בחודש הנבחר — מסנן registrations לפי טווח הקלנדרי
    const attendanceByMember = new Map()
    registrations.forEach(r => {
      if (!r.athlete_id || !r.class_id) return
      const cls = classById.get(r.class_id)
      if (!cls) return
      const occDateStr = registrationOccurrenceDateStr(r.week_start, cls.day_of_week)
      const endClassMs = classEndMs(occDateStr, cls.start_time, cls.duration_minutes)
      if (endClassMs === null) return
      if (endClassMs < startMs || endClassMs > endMs) return // מחוץ לטווח החודש
      attendanceByMember.set(r.athlete_id, (attendanceByMember.get(r.athlete_id) || 0) + 1)
    })

    // כמות אימונים שבועית לפי סוג מנוי
    const SUB_WEEKLY = { '1x_week': 1, '2x_week': 2, '4x_week': 4, unlimited: null }

    const rows = activeMembers
      .map(m => {
        const actual = attendanceByMember.get(m.id) || 0
        const subType = m.subscription_type || ''
        const weekly = SUB_WEEKLY[subType]
        const expected = (weekly !== null && weekly !== undefined)
          ? Math.round(weekly * weeks)
          : null
        let status = ''
        if (expected !== null) {
          if (actual === 0) status = '❌ לא הגיע כלל'
          else if (actual < Math.round(expected * 0.5)) status = '⚠️ מנצל פחות מ-50% מהמנוי'
          else status = '✅ תקין'
        }

        return {
          'שם מלא': m.full_name || '—',
          'סוג מנוי': SUB_LABELS[subType] || subType || 'לא מוגדר',
          'הגעות בפועל': actual,
          'צפי לפי מנוי': expected !== null ? expected : 'ללא הגבלה',
          'סטטוס': status,
        }
      })
      .sort((a, b) => String(a['שם מלא']).localeCompare(String(b['שם מלא']), 'he'))

    const ws = XLSX.utils.json_to_sheet(rows)

    // רוחב עמודות אוטומטי
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'מתאמנים')

    XLSX.writeFile(wb, `teampact_${branchName}_${monthLabel}.xlsx`)
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
          {isAdmin && (
            <select
              value={exportMonth}
              onChange={e => setExportMonth(e.target.value)}
              className="text-xs border border-emerald-400 rounded-lg px-2 py-1.5 bg-white text-emerald-800 font-semibold"
              title="בחר חודש לדוח Excel"
            >
              <option value="current">חודש נוכחי</option>
              <option value="last">חודש שעבר</option>
              {monthOptions.slice(2).map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          )}
          {isAdmin && (
            <button
              onClick={exportMembersExcel}
              disabled={activeMembers.length === 0}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 rounded-lg"
            >
              📥 Excel
            </button>
          )}
        </div>
      </div>

      {/* באנר זיהוי תפקיד למאמן רגיל */}
      {!isAdmin && myAthleteIds && isBjjCoach && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900">
          <span className="font-bold">👤 תצוגת מאמן:</span> אתה רואה {myAthleteIds.size} מתאמנים שרשומים אצלך. סטטיסטיקות כלליות זמינות למנהל בלבד.
        </div>
      )}

      {/* באנר למאמן שלא-BJJ — אין מה להציג */}
      {!isAdmin && !isBjjCoach && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <div className="text-3xl mb-2">📊</div>
          <div className="font-bold text-gray-800">אין דוחות זמינים עבורך</div>
          <p className="text-sm text-gray-600 mt-2">
            דוחות הקידום מיועדים למאמני <b>גיו ג׳יטסו</b> (כולל NoGi). אם זו טעות — בדוק שהשם שלך בטבלת המאמנים תואם בדיוק לפרופיל שלך, ושיש לך לפחות שיעור BJJ אחד משויך.
          </p>
        </div>
      )}

      {/* סיכום מהיר — מנהל בלבד */}
      {isAdmin && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="מתאמנים פעילים" value={totalActive} tone="blue" />
        <StatCard label={`נרשמים חדשים (${periodDays} ימים)`} value={newMembers.length} tone="green" />
        <StatCard label="ממתינים לאישור" value={totalPending} tone="orange" />
        <StatCard label={`% נטישה (${periodDays} ימים)`} value={`${churnPctTotal}%`} sub={`${totalChurned} ביטולים מתוך ${totalActiveBase}`} tone="red" />
      </div>
      )}

      {/* ====== סטטיסטיקות כלליות — מנהל בלבד ====== */}
      {isAdmin && <>
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
        footer="מבוסס על רישומים לאימונים שהסתיימו בפועל (במודל הזה: רישום = הגעה, כי אחרי תחילת השיעור המתאמן לא יכול לבטל). המספר הראשון = מתאמנים ייחודיים שהגיעו לתחום. השני = סה״כ הגעות בתחום. תחת כל תחום, פילוח לפי המאמן."
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
      </>}
      {/* ====== סוף סטטיסטיקות מנהל ====== */}

      {/* ================================================================
          🎓 מועמדים לקידום (suggestion engine) — רק למנהל או מאמן BJJ
      ================================================================ */}
      {(isAdmin || isBjjCoach) && <>
      <SectionCard
        title={isAdmin ? 'מועמדים לקידום' : 'מועמדים לקידום (אצלי)'}
        icon="🎓"
        footer={`מבוסס על שנים מקבלת החגורה + יחידות BJJ שהתאמן מאז. ספים: לבן→כחול 1.5 שנים+200 יחידות, כחול→סגול 2/250, סגול→חום 1.5/300, חום→שחור 1/400, שחור↔דאנים 3-7 שנים+300-400 יחידות. הציון = החלש מבין שנים ויחידות. סימן ~ ביחידות = כולל הערכה היסטורית. הלוגיקה: לוקחים את הממוצע ב-3 החודשים הראשונים מה-BJJ checkin הראשון של המתאמן ומקרינים אחורה רק עד תאריך קבלת החגורה. אם אין BJJ checkin בכלל / אין 3 חודשי תצפית — אין הערכה (חוזרים מאוחר יותר). תיקון ×0.86 לחגי ישראל ותקופות חירום (~6 שבועות בשנה). סה"כ ${visibleSuggestions.length} מתאמני Gi עם חגורה${myAthleteIds ? ' (אצלך)' : ''}.`}
      >
        {/* פילטר תצוגה */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {[
            { v: 'ready',         label: '✅ בשלים',     count: visibleSuggestions.filter(r => r.recommendation === 'ready').length },
            { v: 'getting_close', label: '🟡 מתקרבים', count: visibleSuggestions.filter(r => r.recommendation === 'getting_close').length },
            { v: 'not_yet',       label: '⏳ עוד מוקדם', count: visibleSuggestions.filter(r => r.recommendation === 'not_yet').length },
            { v: 'all',           label: '👀 הכל',       count: visibleSuggestions.length },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setSuggestionFilter(opt.v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold ${
                suggestionFilter === opt.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {opt.label} ({opt.count})
            </button>
          ))}
        </div>

        {(() => {
          const visibleRows = visibleSuggestions.filter(r =>
            suggestionFilter === 'all' ? true : r.recommendation === suggestionFilter
          )
          if (visibleRows.length === 0) {
            return (
              <p className="text-sm text-gray-500 text-center py-4">
                אין מתאמנים בקטגוריה זו.
              </p>
            )
          }
          const selectedCount = Array.from(selectedCandidates).filter(id =>
            visibleRows.some(r => r.member.id === id)
          ).length

          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="p-2 text-right">✓</th>
                      <th className="p-2 text-right">שם</th>
                      <th className="p-2 text-right">חגורה</th>
                      <th className="p-2 text-right">שנים</th>
                      <th className="p-2 text-right">יחידות מאז</th>
                      <th className="p-2 text-right">ציון</th>
                      <th className="p-2 text-right">המלצה</th>
                      <th className="p-2 text-center">✏️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => {
                      const meta = getBeltMeta(r.member.belt)
                      const isSelected = selectedCandidates.has(r.member.id)
                      const recColor = r.recommendation === 'ready'
                        ? 'text-emerald-700 bg-emerald-50'
                        : r.recommendation === 'getting_close'
                          ? 'text-amber-700 bg-amber-50'
                          : r.recommendation === 'no_threshold'
                            ? 'text-purple-700 bg-purple-50'
                            : 'text-gray-500 bg-gray-50'
                      const recLabel = r.recommendation === 'ready'
                        ? '✓ בשל'
                        : r.recommendation === 'getting_close'
                          ? '◐ מתקרב'
                          : r.recommendation === 'no_threshold'
                            ? '— לא במעקב'
                            : '○ עוד מוקדם'
                      return (
                        <tr key={r.member.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedCandidates(prev => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(r.member.id)
                                  else next.delete(r.member.id)
                                  return next
                                })
                              }}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="p-2 font-bold text-gray-900">{r.member.full_name}</td>
                          <td className="p-2">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
                              style={{ background: meta?.color, color: meta?.text, borderColor: meta?.color }}
                            >
                              {r.beltLabel}
                            </span>
                          </td>
                          <td className="p-2">
                            {r.yearsOnBelt > 0 ? r.yearsOnBelt.toFixed(1) : '—'}
                            {r.thresholdYears != null && (
                              <span className="text-[10px] text-gray-400 mr-1">/ {r.thresholdYears}</span>
                            )}
                          </td>
                          <td className="p-2">
                            <span title={
                              r.estimatedUnits > 0
                                ? `${r.observedUnits} נצפו במערכת + ${r.estimatedUnits} משוערים (לפי ממוצע ב-3 חודשים הראשונים מה-BJJ checkin הראשון × 0.86 לחגים)`
                                : r.estimateBasis === 'no_bjj_yet'
                                  ? 'אין checkin של BJJ במערכת — אין הערכה אחורה'
                                  : r.estimateBasis === 'no_data'
                                    ? 'אין מספיק תצפית (פחות מ-3 חודשים או פחות מ-5 אימונים) — חוזרים אחרי תצפית מספיקה'
                                    : `${r.observedUnits} נצפו במערכת`
                            }>
                              {r.unitsSinceBelt}
                              {r.estimatedUnits > 0 && (
                                <span className="text-[10px] text-amber-600 mr-1">~</span>
                              )}
                            </span>
                            {r.thresholdUnits != null && (
                              <span className="text-[10px] text-gray-400 mr-1">/ {r.thresholdUnits}</span>
                            )}
                          </td>
                          <td className="p-2 font-bold">
                            {r.recommendation === 'no_threshold' ? '—' : `${(r.score * 100).toFixed(0)}%`}
                          </td>
                          <td className="p-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${recColor}`}>
                              {recLabel}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {(isAdmin || (myAthleteIds && myAthleteIds.has(r.member.id))) && (
                              <button type="button"
                                onClick={() => setEditingHistoryMember({
                                  id: r.member.id,
                                  name: r.member.full_name,
                                  category: r.member.belt_category || 'adult',
                                })}
                                title="ערוך היסטוריית חגורות"
                                className="text-amber-700 hover:text-amber-900 text-base">
                                ✏️
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* כפתור פעולה */}
              {selectedCount > 0 && (
                <div className="mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <span className="text-sm text-blue-900 font-bold">
                    סומנו {selectedCount} מועמדים
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedCandidates(new Set())}
                      className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold px-3 py-1.5 rounded-lg"
                    >
                      נקה
                    </button>
                    <button
                      onClick={() => {
                        setInitialEventCandidates(Array.from(selectedCandidates))
                        // גוללים למטה ל-PromotionEvents
                        setTimeout(() => {
                          document.getElementById('promotion-events-anchor')?.scrollIntoView({ behavior: 'smooth' })
                        }, 100)
                      }}
                      className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-1.5 rounded-lg"
                    >
                      🎓 צור אירוע קידום עם המסומנים
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </SectionCard>

      {/* ================================================================
          🧒 מוכנים לקידום — ילדים
      ================================================================ */}
      {kidsReadyForPromotion.length > 0 && (
        <SectionCard
          title={`🧒 מוכנים לקידום — ילדים (${kidsReadyForPromotion.filter(r => r.ready).length} מוכנים)`}
          icon="🧒"
          footer={
            kidsReadyByTarget.size > 0
              ? '🛒 סיכום להזמנת חגורות: ' + [...kidsReadyByTarget.entries()]
                  .map(([v, arr]) => `${getBeltLabel(v)} ×${arr.length}`)
                  .join(' · ')
              : 'לא נמצאו ילדים מוכנים לקידום כרגע'
          }
        >
          <div className="space-y-1">
            {kidsReadyForPromotion.map(({ m, age, nextBelt, minAge, ageOk, monthsAtBelt, timeOk, timeSource, ready, almostReady }) => {
              const nextMeta = getBeltMeta(nextBelt.value)
              const months = monthsAtBelt != null ? Math.floor(monthsAtBelt) : null
              const timeLabel = months != null
                ? `${months} חודשים${timeSource === 'bjj_start' ? ' (מתחילת אימונים)' : ''}`
                : 'אין תאריך'
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                    ready ? 'bg-emerald-50 border-emerald-200' :
                    almostReady ? 'bg-amber-50 border-amber-200' :
                    'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  {/* סטטוס */}
                  <span className="text-base shrink-0">
                    {ready ? '✅' : almostReady ? '⏳' : '❌'}
                  </span>
                  {/* שם */}
                  <span className="font-bold flex-1 truncate">{m.full_name}</span>
                  {/* גיל */}
                  <span className={`shrink-0 ${ageOk ? 'text-emerald-700' : ageOk === false ? 'text-red-500' : 'text-gray-400'}`}>
                    {age != null ? `גיל ${age}` : 'גיל ?'}
                    {minAge != null && ageOk === false && <span className="text-gray-400"> (צריך {minAge})</span>}
                  </span>
                  {/* זמן בחגורה / מתחילת אימונים */}
                  <span className={`shrink-0 ${timeOk ? 'text-emerald-700' : timeOk === false ? 'text-amber-600' : 'text-gray-400'}`}>
                    {timeLabel}
                  </span>
                  {/* חגורה נוכחית → יעד */}
                  <span className="shrink-0 flex items-center gap-1">
                    <span className="text-gray-500">{getBeltLabel(m.belt)}</span>
                    <span className="text-gray-400">→</span>
                    <span
                      className="font-bold px-2 py-0.5 rounded-full text-[10px]"
                      style={{ background: nextMeta?.color || '#ddd', color: nextMeta?.text || '#000' }}
                    >
                      {nextBelt.label}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ================================================================
          🥋 מבחן יוני — דוח candidates של אירועי kids_annual_test
      ================================================================ */}
      {visibleKidsEvents.length > 0 && (
        <SectionCard
          title={`🥋 מבחן יוני — מועמדים לקידום (${visibleKidsEvents.length} אירועים)`}
          icon="🥋"
          footer="לכל ילד מוצג % נוכחות מאז קבלת החגורה הנוכחית. 🟢 מומלץ לקידום (≥60%) · 🟡 לבדיקה (<60%) · ⚪ אין נתונים. בלחיצה על שם החגורה — סילבוס המבחן (לפי משפחה) + הערות לדרגה הספציפית."
        >
          <div className="space-y-4">
            {visibleKidsEvents.map(ev => {
              const evCands = (kidsCandsByEvent.get(ev.id) || [])
                .filter(c => isAdmin || !myAthleteIds || myAthleteIds.has(c.member_id))
              if (evCands.length === 0) return null
              // קבץ לפי target_belt (חגורת היעד)
              const byTarget = new Map()
              for (const c of evCands) {
                const k = c.target_belt || '—'
                if (!byTarget.has(k)) byTarget.set(k, [])
                byTarget.get(k).push(c)
              }
              const cls = classById.get(ev.class_id)
              return (
                <div key={ev.id} className="border border-amber-200 rounded-xl p-3 bg-amber-50/40">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{ev.name}</div>
                      <div className="text-[11px] text-gray-600">
                        {ev.event_date} {cls ? `· ${cls.name}` : ''}
                      </div>
                    </div>
                    <div className="text-[11px] bg-white border border-amber-300 text-amber-800 rounded-full px-2 py-0.5 font-bold">
                      {evCands.length} מועמדים
                    </div>
                  </div>
                  {Array.from(byTarget.entries()).map(([targetBelt, list]) => {
                    const targetMeta = getBeltMeta(targetBelt)
                    const isAdultTransition = list.some(c => c.target_to_adult)
                    const sylKey = getSyllabusKeyForTarget(targetBelt)
                    const sylRow = sylKey.family ? syllabusByFamily.get(sylKey.family) : null
                    const levelNotes = sylRow?.level_notes && sylKey.level
                      ? sylRow.level_notes[sylKey.level]
                      : null
                    return (
                      <details key={targetBelt} className="mb-2 border border-gray-200 rounded-lg bg-white">
                        <summary className="cursor-pointer p-2 flex items-center gap-2 text-sm">
                          <span
                            className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                            style={{ background: targetMeta?.color || '#fff' }}
                          />
                          <span className="font-bold flex-1">
                            {isAdultTransition ? '🎓 מעבר לבוגרים' : `יעד: ${getBeltLabel(targetBelt)}`}
                          </span>
                          <span className="text-[11px] bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                            {list.length}
                          </span>
                        </summary>
                        <div className="border-t border-gray-200 p-2 space-y-2">
                          {/* סילבוס לדרגה — רק אם יש */}
                          {sylRow && !isAdultTransition && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[11px]">
                              <div className="font-bold text-blue-900 mb-1">
                                📚 סילבוס {getBeltFamilyLabel(sylKey.family)} (גילאי {sylRow.age_range_label})
                                {sylKey.level && <span className="text-blue-700"> · {getLevelLabel(sylKey.level)}</span>}
                              </div>
                              {Array.isArray(sylRow.content?.sections) && (
                                <ul className="space-y-1">
                                  {sylRow.content.sections.map((sec, idx) => (
                                    <li key={idx}>
                                      <b>{sec.title}:</b>{' '}
                                      <span className="text-gray-700">
                                        {Array.isArray(sec.items) ? sec.items.join(', ') : ''}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {Array.isArray(levelNotes) && levelNotes.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-blue-200">
                                  <b>הערות לדרגה:</b>
                                  <ul className="list-disc mr-4">
                                    {levelNotes.map((n, i) => <li key={i}>{n}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          {/* candidates */}
                          <ul className="divide-y divide-gray-100">
                            {list.map(c => {
                              const mem = memberByIdMap.get(c.member_id)
                              const pct = c.attendance_pct == null ? null : Math.round(c.attendance_pct * 100)
                              const recIcon = c.attendance_recommendation === 'promote' ? '🟢'
                                            : c.attendance_recommendation === 'review'  ? '🟡'
                                            : '⚪'
                              const busy = kidsActionBusy.has(c.id)
                              const done = c.status && c.status !== 'planned'
                              return (
                                <li key={c.id} className="py-2 flex items-center gap-2 flex-wrap">
                                  <span className="text-base shrink-0">{recIcon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-gray-900 truncate">
                                      {mem?.full_name || '—'}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      נוכחות: {pct == null ? '—' : `${pct}%`}
                                      {c.expected_sessions != null && ` (${c.attended_sessions}/${c.expected_sessions})`}
                                      {' · '}
                                      נוכחית: {c.current_belt ? getBeltLabel(c.current_belt) : '—'}
                                    </div>
                                  </div>
                                  {done ? (
                                    <span className={`text-[11px] font-bold px-2 py-1 rounded ${
                                      c.status === 'promoted'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}>
                                      {c.status === 'promoted' ? '✓ קודם' : '✗ לא קודם'}
                                    </span>
                                  ) : (
                                    <div className="flex gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleKidsCandidateAction(c, 'promote')}
                                        disabled={busy}
                                        className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded disabled:opacity-50"
                                      >✓ קדם</button>
                                      <button
                                        type="button"
                                        onClick={() => handleKidsCandidateAction(c, 'extra_stripe')}
                                        disabled={busy}
                                        className="text-[11px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1 rounded disabled:opacity-50"
                                        title="ישאר בחגורה הנוכחית, יקבל פס נוסף"
                                      >+ פס</button>
                                      <button
                                        type="button"
                                        onClick={() => handleKidsCandidateAction(c, 'not_promoted')}
                                        disabled={busy}
                                        className="text-[11px] bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-2 py-1 rounded disabled:opacity-50"
                                      >✗ לא</button>
                                    </div>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      </details>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ================================================================
          ⚠️ סיכון נשירה לילדים
      ================================================================ */}
      {(isAdmin || isBjjCoach) && (
        <SectionCard
          title={`⚠️ סיכון נשירה — ילדים שלא הגיעו 3+ שבועות (${kidsAtRisk.length})`}
          icon="⚠️"
          footer="ילדים מקבוצת kids שלא היה להם checkin 21 ימים+. כפתור 📲 שולח push להורים. שימושי לפני המבחן השנתי כדי לדאוג שכל הילדים יחזרו לאימון בזמן."
        >
          {kidsAtRisk.length === 0 ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">✅ כל הילדים הפעילים הגיעו לאימון בשלושת השבועות האחרונים.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs text-blue-900 flex-1">
                  💡 שלח Push להורים של כל הילדים בסיכון (חינמי).
                </div>
                <button
                  type="button"
                  onClick={handlePushAllKidsRiskParents}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg"
                >
                  📲 שלח לכולם ({kidsAtRisk.length})
                </button>
              </div>
              {Object.entries({
                '3-4w':  '3-4 שבועות בלי אימון',
                '5-8w':  '5-8 שבועות בלי אימון',
                '9-12w': '9-12 שבועות בלי אימון',
                '12w+':  '⛔ מעל 3 חודשים בלי אימון',
              }).map(([key, label]) => {
                const list = kidsAtRiskByBucket[key] || []
                if (list.length === 0) return null
                return (
                  <div key={key} className="mb-3">
                    <h4 className="text-xs font-bold text-gray-700 mb-1">
                      {label} ({list.length})
                    </h4>
                    <ul className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg">
                      {list.map(k => {
                        const sending = kidsRiskPushBusy.has(k.id)
                        const sent = kidsRiskPushSent.has(k.id)
                        return (
                          <li key={k.id} className="flex items-center gap-2 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-gray-900 truncate">{k.name}</div>
                              <div className="text-[11px] text-gray-500">
                                {k.beltLabel}
                                {k.daysSince != null && ` · ${k.daysSince} ימים`}
                                {k.daysSince == null && ' · לא נכח מעולם'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePushKidsRiskParents(k)}
                              disabled={sending || sent}
                              className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded ${
                                sent
                                  ? 'bg-blue-100 text-blue-700'
                                  : sending
                                    ? 'bg-blue-300 text-white'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                            >
                              {sent ? '✓ נשלח' : sending ? '…' : '📲 Push'}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </>
          )}
        </SectionCard>
      )}

      {/* ================================================================
          🎓 מעבר לבוגרים השנה
      ================================================================ */}
      {(isAdmin || isBjjCoach) && (
        <SectionCard
          title={`🎓 מעבר לבוגרים השנה (${movingToAdult.length})`}
          icon="🎓"
          footer="ילדים שיגיעו לגיל 16 בין מבחן יוני הקרוב ליוני הבא — מועמדים לעבור לקטגוריית בוגרים (target_belt=לבנה). דרוש birth_date מלא ב-AthleteManagement."
        >
          {movingToAdult.length === 0 ? (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
              אין ילדים שיגיעו ל-16 השנה הקרובה (או שאין להם birth_date מלא).
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {movingToAdult.map(item => {
                const busy = adultMarkBusy.has(item.id)
                return (
                  <li key={item.id} className="flex items-center gap-2 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 truncate">{item.name}</div>
                      <div className="text-[11px] text-gray-500">
                        חגורה: {item.beltLabel} · יום הולדת 16: {item.ageAt16}
                      </div>
                    </div>
                    {item.alreadyMarked ? (
                      <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-800">
                        ✓ סומן
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMarkAsAdultTransition(item)}
                        disabled={busy || !item.upcomingEventId}
                        title={!item.upcomingEventId ? 'אין אירוע מבחן ילדים מתוכנן — צור קודם' : ''}
                        className="shrink-0 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 rounded"
                      >
                        {busy ? '…' : '🎓 סמן כעובר לבוגרים'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {/* ================================================================
          📅 אירועי קידום
      ================================================================ */}
      <div id="promotion-events-anchor" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <PromotionEvents
          profile={profile}
          isAdmin={isAdmin}
          initialCandidateMemberIds={initialEventCandidates}
        />
      </div>
      </>}
      {/* ====== סוף קטעי קידום ====== */}

      {/* ================================================================
          ✏️ Modal: עריכת היסטוריית חגורות מתוך דוח קידום
      ================================================================ */}
      {editingHistoryMember && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingHistoryMember(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="border-b p-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">📜 עריכת היסטוריה — {editingHistoryMember.name}</h3>
              <button onClick={() => setEditingHistoryMember(null)}
                className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              <BeltHistoryEditor
                memberId={editingHistoryMember.id}
                memberName={editingHistoryMember.name}
                memberCategory={editingHistoryMember.category}
              />
              <p className="text-[11px] text-gray-500 mt-3">
                ℹ️ שינויים נשמרים אוטומטית. סגור וחזור לדוח כדי לראות את הנתונים המעודכנים (יקרה fetch אוטומטי בסגירה).
              </p>
            </div>
            <div className="border-t p-3 flex justify-end bg-gray-50">
              <button onClick={() => { setEditingHistoryMember(null); fetchAll() }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                סגור ורענן דוח
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
