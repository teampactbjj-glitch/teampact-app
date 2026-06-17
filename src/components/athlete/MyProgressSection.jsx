import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllPaged } from '../../lib/fetchAllPaged'
import { getBeltMeta, getBeltLabel, formatYearsMonths, formatHebrewMonthYear } from '../../lib/belts'

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

// חישוב זמן בין שני תאריכים (YYYY-MM-DD) → "X שנים, Y חודשים"
function formatYearsMonths2Dates(fromStr, toStr) {
  if (!fromStr || !toStr) return null
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years--; months += 12 }
  if (years <= 0 && months <= 0) return null
  const parts = []
  if (years > 0) parts.push(years === 1 ? 'שנה' : `${years} שנים`)
  if (months > 0) parts.push(months === 1 ? 'חודש' : `${months} חודשים`)
  return parts.join(', ')
}

// === badges של יחידות אימון (כל הזמן) ===
// יחידת אימון = checkin אחד שהסתיים, בלי קשר לאורך השיעור.
// מבטל את אי-הצדק שהיה בספירת שעות (60 דק' מול 90 דק').
const HOUR_BADGES = [
  { hours: 25, label: '25 יחידות', emoji: '🌱' },
  { hours: 50, label: '50 יחידות', emoji: '🥉' },
  { hours: 100, label: '100 יחידות', emoji: '🥈' },
  { hours: 250, label: '250 יחידות', emoji: '🥇' },
  { hours: 500, label: '500 יחידות', emoji: '🏆' },
  { hours: 1000, label: '1000 יחידות', emoji: '👑' },
]

// === badges מיוחדים ===
// "Cross-trainer" — התאמן ב-2 תחומים שונים בחודש הנוכחי
// "חודש מושלם" — לפחות 3 אימונים בכל שבוע של החודש (4 שבועות מינימום)
// "רצף 8" — 8 שבועות רצופים פעילים
// "רצף 16" — 16 שבועות רצופים פעילים

// === גרף פעילות ===
function ActivityChart({ events, stats, isBestMonth, disciplinesThisMonth }) {
  const [view, setView] = useState('week')
  const [selectedBar, setSelectedBar] = useState(null)

  const TABS = [
    { id: 'week',  label: 'שבוע' },
    { id: 'month', label: 'חודש' },
    { id: '6m',   label: '6 חו׳' },
    { id: 'year',  label: 'שנה' },
  ]
  const MHS = ['ינו','פבר','מרץ','אפר','מאי','יוני','יולי','אוג','ספט','אוק','נוב','דצמ']
  const MHL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

  const chartData = useMemo(() => {
    const now = new Date()
    const DAY = 24 * 3600 * 1000
    const byDay = new Map()
    for (const e of events) byDay.set(e.dateKey, (byDay.get(e.dateKey) || 0) + 1)
    const dk = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    if (view === 'week') {
      // 7 ימים אחרונים — תווית = d/m
      const bars = Array.from({length:7}, (_,i) => {
        const d = new Date(now.getTime() - (6-i)*DAY); d.setHours(0,0,0,0)
        return {
          label: `${d.getDate()}/${d.getMonth()+1}`,
          value: byDay.get(dk(d)) || 0,
          isToday: i === 6,
          isFuture: false,
        }
      })
      // השוואה שבוע שעבר (אותם 7 ימים, -7)
      const prevTotal = Array.from({length:7}, (_,i) => {
        const d = new Date(now.getTime() - (13-i)*DAY); d.setHours(0,0,0,0)
        return byDay.get(dk(d)) || 0
      }).reduce((s,v)=>s+v,0)
      const thisTotal = bars.reduce((s,b)=>s+b.value,0)
      const diff = thisTotal - prevTotal
      return { bars, avg: thisTotal/7, thisTotal, prevTotal, diff,
               compareLabel: `שבוע שעבר: ${prevTotal}`, periodLabel: '7 ימים אחרונים' }
    }

    if (view === 'month') {
      // 4 שבועות — תווית = d/m של תחילת השבוע
      const bars = Array.from({length:4}, (_,w) => {
        const start = new Date(now.getTime() - (3-w)*7*DAY - 6*DAY); start.setHours(0,0,0,0)
        let count = 0
        for (let i=0;i<7;i++) { const d=new Date(start.getTime()+i*DAY); count+=byDay.get(dk(d))||0 }
        return { label: `${start.getDate()}/${start.getMonth()+1}`, value: count, isToday: w===3 }
      })
      // חודש שעבר (4 שבועות, -28)
      const prevTotal = Array.from({length:4}, (_,w) => {
        const start = new Date(now.getTime() - (3-w)*7*DAY - 6*DAY - 28*DAY); start.setHours(0,0,0,0)
        let count = 0
        for (let i=0;i<7;i++) { const d=new Date(start.getTime()+i*DAY); count+=byDay.get(dk(d))||0 }
        return count
      }).reduce((s,v)=>s+v,0)
      const thisTotal = bars.reduce((s,b)=>s+b.value,0)
      const diff = thisTotal - prevTotal
      return { bars, avg: thisTotal/4, thisTotal, prevTotal, diff,
               compareLabel: `4 שבועות קודמים: ${prevTotal}`, periodLabel: '28 יום אחרון' }
    }

    if (view === '6m') {
      const bars = Array.from({length:6}, (_,i) => {
        const d = new Date(now.getFullYear(), now.getMonth()-(5-i), 1)
        const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        let count = 0
        for (const [k,v] of byDay) if (k.startsWith(mk)) count+=v
        return { label: MHS[d.getMonth()], value: count, isToday: i===5 }
      })
      const thisTotal = bars.reduce((s,b)=>s+b.value,0)
      return { bars, avg: thisTotal/6, thisTotal, prevTotal: null, diff: null,
               compareLabel: null, periodLabel: '6 חודשים אחרונים' }
    }

    // year
    const bars = Array.from({length:12}, (_,i) => {
      const d = new Date(now.getFullYear(), now.getMonth()-(11-i), 1)
      const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      let count = 0
      for (const [k,v] of byDay) if (k.startsWith(mk)) count+=v
      return { label: MHS[d.getMonth()], value: count, isToday: i===11 }
    })
    const thisTotal = bars.reduce((s,b)=>s+b.value,0)
    return { bars, avg: thisTotal/12, thisTotal, prevTotal: null, diff: null,
             compareLabel: null, periodLabel: '12 חודשים אחרונים' }
  }, [events, view])

  const rawMax = Math.max(...chartData.bars.map(b=>b.value), 2)
  const yMax   = Math.ceil(rawMax / 2) * 2
  const yTicks = Array.from({length: yMax/2 + 1}, (_,i) => i*2)
  const sel    = selectedBar !== null ? chartData.bars[selectedBar] : null
  const tm     = stats?.thisMonth

  // SVG
  const VW=300, VH=130, YW=18, XH=16, PT=16, PR=2
  const CX=YW, CY=PT, CW=VW-YW-PR, CH=VH-XH-PT
  const n=chartData.bars.length, slot=CW/n
  const bw=Math.min(slot*0.52, 24)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', border:'1px solid #e5e7eb' }}>

      {/* ══ HEADER ══ */}
      <div style={{ background:'linear-gradient(135deg,#047857 0%,#059669 55%,#10b981 100%)' }} className="px-4 pt-4 pb-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.06em', opacity:0.7, textTransform:'uppercase' }}>ההתקדמות שלי</span>
          <span style={{ fontSize:11, opacity:0.6 }}>{MHL[new Date().getMonth()]} {new Date().getFullYear()}</span>
        </div>

        <div className="flex items-end gap-3">
          {/* מספר גדול */}
          <div style={{ lineHeight:1 }}>
            <div style={{ fontSize:50, fontWeight:900, lineHeight:1, letterSpacing:'-0.02em' }}>{tm?.sessions ?? 0}</div>
            <div style={{ fontSize:11, opacity:0.6, marginTop:4 }}>יחידות החודש</div>
          </div>

          {/* תחומים + שיא */}
          <div className="flex-1 flex flex-col gap-1 items-start pb-1">
            {disciplinesThisMonth?.slice(0,2).map(d => (
              <span key={d.name} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.18)', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {DISCIPLINE_ICONS[d.name]} {d.name} <span style={{ opacity:0.65 }}>· {d.sessions}</span>
              </span>
            ))}
            {isBestMonth && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'rgba(251,191,36,0.85)', color:'#78350f', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, marginTop:2 }}>
                🏆 שיא אישי
              </span>
            )}
          </div>
        </div>

        {/* השוואה */}
        {chartData.compareLabel && chartData.diff !== null && (
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, opacity:0.65 }}>{chartData.compareLabel}</span>
            <span style={{
              fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20,
              background: chartData.diff > 0 ? 'rgba(255,255,255,0.25)' : chartData.diff < 0 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
            }}>
              {chartData.diff > 0 ? `↑ +${chartData.diff}` : chartData.diff < 0 ? `↓ ${chartData.diff}` : '= זהה'}
            </span>
          </div>
        )}
      </div>

      {/* ══ TABS ══ */}
      <div style={{ padding:'10px 12px 6px', background:'#fafafa', borderBottom:'1px solid #f3f4f6' }}>
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:8, padding:2, gap:2 }}>
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => { setView(t.id); setSelectedBar(null) }}
              style={{
                flex:1, fontSize:11, fontWeight:600, padding:'5px 2px', border:'none', cursor:'pointer',
                borderRadius:6, transition:'all 0.15s',
                background: view===t.id ? '#fff' : 'transparent',
                color: view===t.id ? '#047857' : '#9ca3af',
                boxShadow: view===t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ INFO ROW ══ */}
      <div style={{ padding:'8px 16px 0', display:'flex', alignItems:'baseline', gap:6 }}>
        {sel ? (
          <>
            <span style={{ fontSize:18, fontWeight:800, color:'#111827' }}>{sel.value}</span>
            <span style={{ fontSize:11, color:'#9ca3af' }}>אימונים · {sel.label}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize:12, color:'#6b7280', fontWeight:500 }}>{chartData.periodLabel}</span>
            <span style={{ fontSize:11, color:'#9ca3af', marginRight:'auto' }}>
              ממוצע {Number.isInteger(chartData.avg) ? chartData.avg : chartData.avg.toFixed(1)}
            </span>
          </>
        )}
      </div>

      {/* ══ SVG CHART ══ */}
      <div style={{ padding:'4px 10px 12px 6px' }}>
        <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} style={{ display:'block', overflow:'visible' }}>

          {/* Y axis + grid */}
          {yTicks.map(v => {
            const y = CY + CH*(1-v/yMax)
            return (
              <g key={v}>
                <line x1={CX} y1={y} x2={VW-PR} y2={y}
                  stroke={v===0 ? '#e5e7eb' : '#f9fafb'} strokeWidth={v===0 ? 1 : 1} />
                <text x={CX-4} y={y+3.5} textAnchor="end" fontSize="9" fill="#d1d5db">
                  {v}
                </text>
              </g>
            )
          })}

          {/* avg line */}
          {chartData.avg > 0 && chartData.avg <= yMax && (
            <line
              x1={CX} x2={VW-PR}
              y1={CY+CH*(1-chartData.avg/yMax)} y2={CY+CH*(1-chartData.avg/yMax)}
              stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.55"
            />
          )}

          {/* bars */}
          {chartData.bars.map((bar, i) => {
            const bh  = yMax>0 ? Math.max((bar.value/yMax)*CH, bar.value>0 ? 3 : 0) : 0
            const bx  = CX + i*slot + (slot-bw)/2
            const by  = CY + CH - bh
            const isSel = selectedBar === i
            const fill = isSel       ? '#065f46'
                       : bar.isToday ? '#059669'
                       : bar.value>0  ? '#6ee7b7'
                       :                '#f3f4f6'
            return (
              <g key={i} onClick={()=>setSelectedBar(isSel?null:i)} style={{cursor:'pointer'}}>
                <rect x={CX+i*slot} y={CY} width={slot} height={CH+XH} fill="transparent"/>
                <rect x={bx} y={by} width={bw} height={bh} rx="4" fill={fill}/>
                {isSel && bar.value>0 && (
                  <text x={bx+bw/2} y={by-5} textAnchor="middle" fontSize="11" fill="#065f46" fontWeight="800">
                    {bar.value}
                  </text>
                )}
                <text x={bx+bw/2} y={VH-1} textAnchor="middle" fontSize="8.5"
                  fill={isSel||bar.isToday ? '#047857' : '#c4c4c4'}
                  fontWeight={isSel||bar.isToday ? '700' : '400'}>
                  {bar.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default function MyProgressSection({ profile, member }) {
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState([])
  const [classMap, setClassMap] = useState(new Map()) // class_id -> {name, class_type, duration_minutes, start_time, coach_id, coach_name}
  const [coachMap, setCoachMap] = useState(new Map()) // coach_id -> {name}
  const [promotionCandidate, setPromotionCandidate] = useState(null) // { event_name, event_date, status, target_belt, target_stripes, promoted_at }
  const [beltHistory, setBeltHistory] = useState([])                  // היסטוריית חגורות (שלב 3) — sorted ASC לפי received_at
  const [showHistory, setShowHistory] = useState(false)               // toggle: ההיסטוריה מוצגת רק לאחר לחיצה על כרטיס הפרופיל
  const [err, setErr] = useState(null)

  // ה-checkins נשמרים תחת members.id (לפי FK ב-DB).
  // נשתמש ב-member.id; אם חסר — fallback ל-profile.id (תאימות אחורה).
  const athleteId = member?.id || profile?.id

  // ── שליפת נתונים ─────────────────────────────────────────────
  useEffect(() => {
    if (!athleteId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        // 1) כל ה-checkins של המתאמן (נוכחות בלבד) — כל ההיסטוריה לצורך badges של שעות
        const { data: chk, error: chkErr } = await fetchAllPaged(() => supabase
          .from('checkins')
          .select('class_id, checked_in_at, checkin_date')
          .eq('athlete_id', athleteId)
          .eq('status', 'present')
          // מיון ייחודי לדפדוף יציב (אותו מתאמן → checkin_date+class_id ייחודי)
          .order('checkin_date', { ascending: true }).order('class_id', { ascending: true }))
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

        // 4) promotion candidate הכי רלוונטי: planned (עתידי) או promoted (אחרון)
        // מחפשים את ה-candidate של המתאמן הזה. אם יש כמה — נעדיף 'planned'; אחרת 'promoted'
        // האחרון (לפי promoted_at).
        let pcResult = null
        try {
          const { data: cands } = await supabase
            .from('promotion_candidates')
            .select('id, event_id, status, target_belt, target_stripes, promoted_at, current_belt')
            .eq('member_id', athleteId)
            .in('status', ['planned', 'promoted'])
          if (cands && cands.length > 0) {
            // נטען event_id-ים כדי לקבל name + event_date
            const eventIds = [...new Set(cands.map(c => c.event_id))]
            const { data: evs } = await supabase
              .from('promotion_events')
              .select('id, name, event_date, status')
              .in('id', eventIds)
              .is('deleted_at', null)
            const evMap = new Map((evs || []).map(e => [e.id, e]))

            // מועדף: planned (קרוב ביותר); אחרת — promoted (אחרון)
            const planned = cands.find(c => c.status === 'planned' && evMap.has(c.event_id))
            if (planned) {
              const ev = evMap.get(planned.event_id)
              pcResult = { ...planned, event_name: ev.name, event_date: ev.event_date }
            } else {
              const promotedList = cands.filter(c => c.status === 'promoted' && evMap.has(c.event_id))
              if (promotedList.length > 0) {
                promotedList.sort((a, b) => (b.promoted_at || '').localeCompare(a.promoted_at || ''))
                const p = promotedList[0]
                const ev = evMap.get(p.event_id)
                pcResult = { ...p, event_name: ev.name, event_date: ev.event_date }
              }
            }
          }
        } catch (e) {
          // אם הטבלה לא קיימת עדיין — מתעלמים בשקט
          console.warn('[MyProgress] promotion candidate load skipped:', e?.message || e)
        }

        // 5) belt_history — כל השורות של המתאמן הזה, מיון ASC לפי received_at
        let bhResult = []
        try {
          const { data: bhData } = await supabase
            .from('belt_history')
            .select('id, belt, belt_stripes, received_at, source, event_id, notes')
            .eq('member_id', athleteId)
            .order('received_at', { ascending: true })
          bhResult = bhData || []
        } catch (e) {
          // אם הטבלה לא קיימת עדיין — מתעלמים בשקט
          console.warn('[MyProgress] belt_history load skipped:', e?.message || e)
        }

        if (!cancelled) {
          setCheckins(checkinsData)
          setClassMap(cm)
          setCoachMap(coachMap2)
          setPromotionCandidate(pcResult)
          setBeltHistory(bhResult)
        }
      } catch (e) {
        console.warn('[MyProgress] load failed', e)
        if (!cancelled) setErr(e.message || 'שגיאה בטעינת נתוני התקדמות')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [athleteId])

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
      // משתמשים ב-checkin_date ישירות כדי להימנע מבעיות timezone בחישוב endTime.
      // fallback לחישוב מה-timestamp רק אם checkin_date חסר.
      const dateKey = c.checkin_date ||
        `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      list.push({
        timeMs,
        date,
        dateKey,
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

    // השוואה לתקופה מקבילה — ימים 1..dayOfMonth בחודש שעבר (הגין לתחילת חודש)
    const dayOfMonth = now.getDate()
    const lastMonthSamePeriod = events.filter(e => {
      if (e.monthKey !== lastMonthKey) return false
      const day = parseInt(e.dateKey.split('-')[2], 10)
      return day <= dayOfMonth
    }).length

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
      lastMonthSamePeriod,
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
    // יחידות אימון (כל הזמן)
    for (const b of HOUR_BADGES) {
      if (stats.allTimeSessions >= b.hours) {
        list.push({ ...b, kind: 'units', achieved: true })
      }
    }
    // ה-badge הבא של יחידות (תצוגה כ-progress)
    const nextUnitBadge = HOUR_BADGES.find(b => stats.allTimeSessions < b.hours)
    if (nextUnitBadge) {
      list.push({ ...nextUnitBadge, kind: 'hours-next', achieved: false, progress: stats.allTimeSessions, target: nextUnitBadge.hours })
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
    const lm = stats.lastMonthSamePeriod // תקופה מקבילה — הגון
    const lmFull = stats.lastMonth.sessions // כל החודש שעבר — לייחוס בלבד
    if (tm === 0 && lmFull === 0) return { text: 'בוא נתחיל. הצעד הראשון הוא פשוט להגיע לאימון הקרוב.', tone: 'neutral' }
    if (tm === 0 && lmFull > 0) return { text: `החודש שעבר התאמנת ${lmFull} פעמים. אל תשבור את הרצף — היכנס ללוז ותירשם.`, tone: 'warn' }
    if (stats.bestMonth.key && stats.bestMonth.sessions > 0 && tm >= stats.bestMonth.sessions && monthKey(new Date()) === stats.bestMonth.key) {
      return { text: '🏆 שיא אישי חדש החודש. לא היית מעולם כל כך עקבי.', tone: 'best' }
    }
    if (lm > 0 && tm > lm) {
      const pct = Math.round(((tm - lm) / lm) * 100)
      return { text: `עליה של ${pct}% לעומת תקופה זהה בחודש שעבר. כל הכבוד — תמשיך ככה.`, tone: 'up' }
    }
    if (lm > 0 && tm < lm * 0.5) {
      return { text: 'ירידה משמעותית לעומת תקופה זהה בחודש שעבר. בוא נחזור למסלול — הירשם לאימון הקרוב.', tone: 'warn' }
    }
    if (streaks.current >= 8) {
      return { text: `${streaks.current} שבועות רצוף — זה כבר הרגל. 🔥`, tone: 'best' }
    }
    if (tm > 0) return { text: `${tm} אימונים החודש. חזק. תמשיך.`, tone: 'up' }
    return { text: 'תמשיך להגיע. ההתקדמות מגיעה ממי שמתמיד.', tone: 'neutral' }
  }, [stats, streaks])

  // todayStr מחושב בכל רינדור ומשמש כ-dependency ל-calendarDays — כדי שה-memo
  // יתרענן כשהתאריך משתנה (חצות), גם אם events לא השתנה (אפליקציה פתוחה מאתמול).
  const todayStr = new Date().toDateString()

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

    // יום ראשון של החלון (לפני 27 ימים) — כדי ליישר לעמודת יום השבוע הנכונה
    const firstDay = new Date(todayMs - 27 * DAY)
    const firstDayOfWeek = firstDay.getDay() // 0=ראשון ... 6=שבת

    const cells = []

    // תאים ריקים לפני היום הראשון (יישור לעמודה הנכונה)
    for (let p = 0; p < firstDayOfWeek; p++) {
      cells.push({ kind: 'padding' })
    }

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
      const isFirstOfMonth = d.getDate() === 1
      cells.push({
        kind: 'day',
        day: d.getDate(),
        month: d.getMonth() + 1,
        primary,
        count: ag ? Object.values(ag).reduce((a,b)=>a+b,0) : 0,
        isToday,
        isFirstOfMonth,
        dateLabel: `${d.getDate()}/${d.getMonth()+1}`,
      })
    }

    // תאים ריקים בסוף להשלמת השורה האחרונה
    const remainder = cells.length % 7
    if (remainder !== 0) {
      for (let t = 0; t < 7 - remainder; t++) {
        cells.push({ kind: 'padding' })
      }
    }

    return cells
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, todayStr])

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
  // השוואה לתקופה המקבילה בחודש שעבר (ימים 1..היום) — הגון לתחילת חודש
  const samePeriodSessions = stats.lastMonthSamePeriod
  const diffPct = samePeriodSessions > 0 ? Math.round(((tm.sessions - samePeriodSessions) / samePeriodSessions) * 100) : null
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

  // ===== כרטיס חגורה — מציג אם המתאמן עושה Gi או NoGi (אותה דרגה) ויש חגורה =====
  const beltMeta = member?.belt ? getBeltMeta(member.belt) : null
  const trainsBjj = !!member?.trains_gi || !!member?.trains_nogi
  const showBeltCard = trainsBjj && !!beltMeta
  const trainingTypeLabel = (member?.trains_gi && member?.trains_nogi)
    ? 'גי + נו-גי'
    : member?.trains_nogi ? 'נו-גי בלבד' : (member?.trains_gi ? 'גי' : null)
  const beltReceivedMs = member?.belt_received_at ? new Date(member.belt_received_at).getTime() : null
  const bjjUnitsSinceBelt = (beltReceivedMs && events.length)
    ? events.filter(e => e.discipline === 'BJJ' && e.timeMs >= beltReceivedMs).length
    : 0

  // ===== באנרי קידום =====
  const promotionBanner = (() => {
    if (!promotionCandidate) return null
    const targetMeta = getBeltMeta(promotionCandidate.target_belt)
    if (!targetMeta) return null

    if (promotionCandidate.status === 'planned') {
      // מצב: סומנת לקידום
      const evDateMs = new Date(promotionCandidate.event_date + 'T12:00:00').getTime()
      const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() })()
      const daysUntil = Math.round((evDateMs - todayMs) / (1000 * 60 * 60 * 24))
      return (
        <div className="rounded-xl shadow-sm overflow-hidden border-2 border-amber-400"
             style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}>
          <div className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🎉</span>
              <div className="flex-1">
                <div className="text-[10px] text-amber-900 font-bold uppercase tracking-wider">סומנת לקידום!</div>
                <div className="text-base font-extrabold text-amber-900 leading-tight">
                  {promotionCandidate.event_name}
                </div>
              </div>
            </div>
            <div className="bg-white/70 rounded-lg p-3 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-[10px] text-amber-900 font-bold">היעד שלך</div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="inline-block w-3 h-3 rounded-sm border border-gray-400"
                        style={{ background: targetMeta.color }} />
                  <span className="text-sm font-extrabold" style={{ color: targetMeta.text === '#FFFFFF' ? targetMeta.color : '#1f2937' }}>
                    {targetMeta.label}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-amber-900 font-bold">
                  {daysUntil > 0 ? 'עוד' : daysUntil === 0 ? 'היום!' : 'עבר'}
                </div>
                {daysUntil > 0 && (
                  <>
                    <div className="text-2xl font-black text-amber-900 leading-none mt-1">{daysUntil}</div>
                    <div className="text-[10px] text-amber-800">ימים</div>
                  </>
                )}
                {daysUntil === 0 && (
                  <div className="text-xl font-black text-amber-900 mt-1">🔥</div>
                )}
              </div>
            </div>
            <div className="mt-2 text-center text-[11px] text-amber-900">
              💪 תחזק נוכחות. תופיע. תהיה שם.
            </div>
          </div>
        </div>
      )
    }

    if (promotionCandidate.status === 'promoted') {
      // מצב: ברכות, קודמת!
      const promotedDate = promotionCandidate.promoted_at
        ? new Date(promotionCandidate.promoted_at)
        : null
      const daysSince = promotedDate
        ? Math.round((Date.now() - promotedDate.getTime()) / (1000 * 60 * 60 * 24))
        : null
      // נציג את הבאנר רק אם הקידום קרה ב-30 הימים האחרונים
      if (daysSince != null && daysSince > 30) return null
      return (
        <div className="rounded-xl shadow-md overflow-hidden border-0 text-center text-white"
             style={{ background: 'linear-gradient(135deg,#581c87 0%,#7c3aed 50%,#a855f7 100%)' }}>
          <div className="p-5">
            <div className="text-5xl">🏆</div>
            <div className="text-[11px] opacity-90 mt-2 font-bold tracking-wider">מזל טוב! קיבלת חגורה</div>
            <div className="text-2xl font-black mt-1">{targetMeta.label}</div>
            <div className="text-[11px] opacity-85 mt-2">
              "{promotionCandidate.event_name}"
            </div>
          </div>
        </div>
      )
    }
    return null
  })()

  // ===== Unified Profile+Discipline Hero Card =====
  const heroCard = (() => {
    const athleteName = member?.full_name || profile?.full_name || ''
    const athleteEmail = profile?.email || ''
    const initials = athleteName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?'

    // תחום ראשי לפי היסטוריית checkins
    const primaryDiscipline = (() => {
      if (events.length === 0) return null
      const counts = {}
      for (const e of events) {
        if (e.discipline !== 'אחר') counts[e.discipline] = (counts[e.discipline] || 0) + 1
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      return sorted[0]?.[0] || null
    })()

    // ותק — מ-checkin הראשון
    const earliestDate = events.length > 0
      ? new Date(events[0].timeMs).toISOString().split('T')[0]
      : null

    const DISC_ICON = { 'BJJ': '🥋', 'Muay Thai': '🥊', 'MMA': '🤼', 'ילדים': '🧒', 'אחר': '💪' }
    const DISC_BG = {
      'Muay Thai': 'linear-gradient(135deg, #991b1b, #dc2626)',
      'MMA': 'linear-gradient(135deg, #4c1d95, #7c3aed)',
      'ילדים': 'linear-gradient(135deg, #b45309, #d97706)',
      'אחר': 'linear-gradient(135deg, #1f2937, #374151)',
    }

    if (showBeltCard) {
      // ─── BJJ: כרטיס עם צבע החגורה + פרטי הספורטאי ───
      return (
        <div className="rounded-xl shadow-sm overflow-hidden border-2"
             style={{ borderColor: beltMeta.color }}>
          {/* Header — צבע החגורה — לחיץ לפתיחת היסטוריה */}
          <button type="button" onClick={() => setShowHistory(v => !v)}
                  className="w-full text-right p-4 focus:outline-none active:opacity-80"
                  style={{ background: beltMeta.color, color: beltMeta.text }}>
            <div className="flex items-center gap-3">
              {/* אבטר */}
              <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-base font-extrabold"
                   style={{ background: beltMeta.text === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)',
                            color: beltMeta.text }}>
                {initials}
              </div>
              {/* שם + מייל + סוג אימון */}
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-base leading-tight truncate">{athleteName}</div>
                <div className="text-[11px] opacity-65 truncate mt-0.5">{athleteEmail}</div>
                {trainingTypeLabel && (
                  <div className="text-[10px] opacity-85 font-semibold mt-1">סוג אימון: {trainingTypeLabel}</div>
                )}
              </div>
              {/* אייקון + שם חגורה + פסים + חץ */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-2xl leading-none">🥋</span>
                <div className="text-right">
                  <div className="text-[9px] opacity-70 leading-tight">החגורה שלי</div>
                  <div className="font-extrabold text-sm leading-tight">{getBeltLabel(member.belt)}</div>
                </div>
                <span className="text-[11px] opacity-60 mt-1 leading-none">
                  {showHistory ? '▲' : '▼'}
                </span>
              </div>
            </div>
          </button>
          {/* Stats row */}
          <div className="bg-white p-3 grid gap-2 text-center"
               style={{ gridTemplateColumns: member.belt_received_at ? 'repeat(3, 1fr)' : '1fr' }}>
            {member.belt_received_at && (
              <div>
                <div className="text-[10px] text-gray-500 leading-tight">קבלתי</div>
                <div className="text-xs font-semibold text-gray-800 mt-0.5">
                  {formatHebrewMonthYear(member.belt_received_at)}
                </div>
              </div>
            )}
            {member.belt_received_at && (
              <div>
                <div className="text-[10px] text-gray-500 leading-tight">על החגורה</div>
                <div className="text-xs font-semibold text-gray-800 mt-0.5">
                  {formatYearsMonths(member.belt_received_at) || '—'}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] text-gray-500 leading-tight">יחידות BJJ מאז</div>
              <div className="text-base font-extrabold text-amber-700 mt-0.5 leading-none">
                {bjjUnitsSinceBelt}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // ─── לא-BJJ: כרטיס עם צבע התחום + ותק ───
    const disc = primaryDiscipline || 'אחר'
    const bgStyle = DISC_BG[disc] || DISC_BG['אחר']
    const icon = DISC_ICON[disc] || '💪'
    const seniorityStr = earliestDate ? formatYearsMonths(earliestDate) : null
    const totalSessions = events.filter(e => primaryDiscipline ? e.discipline === primaryDiscipline : true).length

    return (
      <div className="rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <button type="button" onClick={() => setShowHistory(v => !v)}
                className="w-full text-right focus:outline-none active:opacity-80">
        <div className="p-4 text-white" style={{ background: bgStyle }}>
          <div className="flex items-center gap-3">
            {/* אבטר */}
            <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-base font-extrabold bg-white/20">
              {initials}
            </div>
            {/* שם + מייל + ותק */}
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-base leading-tight truncate">{athleteName}</div>
              <div className="text-[11px] opacity-65 truncate mt-0.5">{athleteEmail}</div>
              {seniorityStr && (
                <div className="text-[10px] opacity-85 font-semibold mt-1">ותק: {seniorityStr}</div>
              )}
            </div>
            {/* אייקון + תחום + סשנים + חץ */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-2xl leading-none">{icon}</span>
              <div className="text-xs font-bold opacity-90 text-right">{disc}</div>
              {totalSessions > 0 && (
                <div className="text-[10px] opacity-75 text-right">{totalSessions} יחידות</div>
              )}
              <span className="text-[11px] opacity-60 mt-1 leading-none">
                {showHistory ? '▲' : '▼'}
              </span>
            </div>
          </div>
        </div>
        </button>
      </div>
    )
  })()

  return (
    <div className="space-y-4">
      {/* ===== כרטיס פרופיל מאוחד (פרטים + תחום/חגורה) ===== */}
      {heroCard}

      {/* ===== באנרי קידום ===== */}
      {promotionBanner}

      {/* ===== ההיסטוריה שלי — מוצגת רק כשה-toggle פתוח ===== */}
      {showHistory && (beltHistory.length > 0 || member?.bjj_start_date) && (() => {
        // בודק אם bjj_start_date כבר מכוסה ע"י שורה ב-belt_history (חגורה לבנה)
        const startDate = member?.bjj_start_date || null
        const firstHistoryBelt = beltHistory[0]?.belt || null
        // נציג "הצטרפות לBJJ" רק אם יש תאריך התחלה ואין חגורה לבנה כשורה ראשונה בהיסטוריה
        const showStartRow = startDate && firstHistoryBelt !== 'white'
        const totalBjjTime = startDate ? formatYearsMonths(startDate) : null

        return (
          <div className="rounded-xl shadow-sm bg-white border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-l from-amber-50 to-white border-b border-amber-100">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                  <span>📜</span>
                  <span>ההיסטוריה שלי</span>
                  {beltHistory.length > 0 && (
                    <span className="text-xs text-gray-500 font-normal">({beltHistory.length} {beltHistory.length === 1 ? 'חגורה' : 'חגורות'})</span>
                  )}
                </h3>
                {totalBjjTime && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                    {totalBjjTime} ב-BJJ
                  </span>
                )}
              </div>
            </div>
            <div className="p-4">
              <ol className="relative" style={{ borderInlineStart: '2px solid #e5e7eb' }}>

                {/* שורת "התחלת BJJ" — אם יש bjj_start_date ואין white belt בהיסטוריה */}
                {showStartRow && (
                  <li className="ms-4 pb-4 relative">
                    <span
                      className="absolute -start-[20px] top-1 flex items-center justify-center w-4 h-4 rounded-full ring-4 ring-white bg-gray-300"
                      aria-label="התחלת אימוני BJJ">
                      <span className="text-[9px] text-gray-600">🌱</span>
                    </span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-gray-500 text-sm">התחלת BJJ</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatHebrewMonthYear(startDate)}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">תאריך התחלה משוער</div>
                  </li>
                )}

                {beltHistory.map((h, idx) => {
                  const meta = getBeltMeta(h.belt)
                  const isCurrent = idx === beltHistory.length - 1 && h.belt === member.belt
                  // חישוב כמה זמן עברה בין שתי חגורות
                  const prevDate = idx === 0
                    ? (startDate || null)
                    : beltHistory[idx - 1]?.received_at || null
                  const timeAtPrev = (prevDate && h.received_at && h.belt !== 'white')
                    ? formatYearsMonths2Dates(prevDate, h.received_at)
                    : null

                  return (
                    <li key={h.id || idx} className="ms-4 pb-4 last:pb-0 relative">
                      {/* נקודה על הקו */}
                      <span
                        className={`absolute -start-[22px] top-1 flex items-center justify-center rounded-full ring-4 ring-white ${isCurrent ? 'w-5 h-5' : 'w-4 h-4'}`}
                        style={{ background: meta?.color || '#10b981' }}
                        aria-label={isCurrent ? 'החגורה הנוכחית' : 'הושלם'}>
                        <span className="text-[10px]" style={{ color: meta?.text || '#fff' }}>
                          {isCurrent ? '★' : '✓'}
                        </span>
                      </span>
                      <div className={`flex items-baseline justify-between gap-2 ${isCurrent ? 'font-bold' : ''}`}>
                        <span className={isCurrent ? 'text-gray-900' : 'text-gray-700'}>
                          {getBeltLabel(h.belt)}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatHebrewMonthYear(h.received_at)}
                        </span>
                      </div>
                      {timeAtPrev && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          לקח {timeAtPrev} מהחגורה הקודמת
                        </div>
                      )}
                      {isCurrent && (
                        <div className="mt-1 inline-block bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                          החגורה הנוכחית · {formatYearsMonths(h.received_at)} על החגורה
                        </div>
                      )}
                    </li>
                  )
                })}

                {/* אם אין היסטוריה אבל יש תאריך התחלה — הראה הודעה */}
                {beltHistory.length === 0 && showStartRow && (
                  <li className="ms-4 relative text-xs text-gray-400 italic">
                    עדיין אין חגורות מאושרות — שלח בקשה ממסך הפרופיל שלך.
                  </li>
                )}
              </ol>
            </div>
          </div>
        )
      })()}

      {/* ===== גרף פעילות עם טאבים (במקום ה-Hero card הירוק) ===== */}
      <ActivityChart events={events} stats={stats} isBestMonth={isBestMonth} sessionsToBest={sessionsToBest} disciplinesThisMonth={disciplinesThisMonth} />

      {/* ===== לוח 28 ימים אחרונים ===== */}
      <div className="bg-white rounded-xl border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-gray-800 text-sm">28 הימים האחרונים</h4>
          <div className="text-xs text-gray-500">{last28Days} ימים פעילים</div>
        </div>
        <div className="grid grid-cols-7 gap-1" dir="rtl">
          {/* כותרות ימי שבוע — ראשון (ימין) עד שבת (שמאל) */}
          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map(d => (
            <div key={d} className="text-center text-[9px] font-semibold text-gray-400 pb-0.5">{d}</div>
          ))}
          {calendarDays.map((c, i) => {
            if (c.kind === 'padding') {
              return <div key={`pad-${i}`} style={{ height: 28 }} />
            }
            const bg = c.primary ? DISCIPLINE_COLORS[c.primary] : '#f3f4f6'
            const fg = c.primary ? '#fff' : '#9ca3af'
            return (
              <div key={i}
                className="rounded flex flex-col items-center justify-center text-[10px] font-semibold relative"
                style={{
                  height: 28,
                  background: bg,
                  color: fg,
                  outline: c.isToday ? '2px solid #047857' : 'none',
                  outlineOffset: c.isToday ? '1px' : 0,
                  borderTop: c.isFirstOfMonth ? '2px solid #9ca3af' : 'none',
                }}
                title={c.primary ? `${c.dateLabel} — ${c.count} אימון${c.count>1?'ים':''}` : `${c.dateLabel} — לא התאמנת`}>
                <span>{c.day}</span>
                {c.isFirstOfMonth && (
                  <span style={{ fontSize: 7, lineHeight: 1, color: c.primary ? 'rgba(255,255,255,0.8)' : '#9ca3af' }}>
                    /{c.month}
                  </span>
                )}
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

      {/* ===== רצף שבועות + סה"כ יחידות (כל הזמן) ===== */}
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
          <div className="text-2xl mb-1">🥋</div>
          <div className="text-2xl font-extrabold text-emerald-700 leading-none">{stats.allTimeSessions}</div>
          <div className="text-[11px] text-gray-600 mt-1">יחידות אימון בסה"כ</div>
          <div className="text-[10px] text-gray-400 mt-1">מאז ההצטרפות</div>
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
