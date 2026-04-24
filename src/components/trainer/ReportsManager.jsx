import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ===== Helpers =====
const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

// זיהוי תחום לחימה לפי שם הקבוצה/שיעור (מילות מפתח)
function detectDiscipline(nameRaw = '') {
  const n = String(nameRaw).toLowerCase().trim()
  // ילדים (טף) — אך ורק קבוצת "לחימה משולבת 3-6" של סהר גפלא/איתי ליפשיץ
  // (שני/חמישי 17:05). קבוצות "א-ג" / "ד-ו" / "ילדים מתקדמים" נשארות בתחום המקורי.
  if (/\b3[- ]?6\b/.test(n)) return 'ילדים'
  // MMA — לחימה משולבת/מעורבת
  if (/\bmma\b|לחימה משולבת|לחימה מעורבת|קרב משולב|קרב מעורב|משולב|מעורב/.test(n)) return 'MMA'
  // Muay Thai — איגרוף תאילנדי / מואי טאי
  if (/muay|thai|תאילנדי|תאילנד|איגרוף|מואי[- ]?טאי|מואיטאי/.test(n)) return 'Muay Thai'
  // BJJ — ג'יו ג'יטסו, נוגי, גראפלינג, ברזיל, מזרון פתוח (Open Mat)
  if (/bjj|jiu|ג['׳]?יו|גיו|ג['׳]?יטסו|ג'יטסו|נו[- ]?גי|no[- ]?gi|ברזיל|גראפלינג|grappling|מזרון|open[- ]?mat|אופן[- ]?מאט/.test(n)) return 'BJJ'
  // "גי" כמילה עצמאית (למשל "אימון גי" או "גי שחור")
  if (/(^|[\s·\-·])גי([\s·\-·]|$)/.test(n)) return 'BJJ'
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

// כמות ימים מ"היום" (ללא שעה)
function daysAgoISO(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setTime(d.getTime() - days * DAY_MS)
  return d.toISOString()
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

function BarRow({ label, value, max, color = '#2563eb', suffix = '' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="mb-2">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-semibold text-gray-800 truncate" title={label}>{label}</span>
        <span className="text-sm font-bold text-gray-900 shrink-0 mr-2">{value}{suffix}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
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
  const [rangeDays, setRangeDays] = useState(30)  // תקופה לבחינת נרשמים חדשים
  const [churnDays, setChurnDays] = useState(30)  // תקופה לבחינת "נטישה" (ביטול מנוי)
  const [branchFilter, setBranchFilter] = useState('all')

  const [members, setMembers] = useState([])
  const [coaches, setCoaches] = useState([])
  const [classes, setClasses] = useState([]) // משמש גם כקבוצות (לפי המודל הקיים)
  const [branches, setBranches] = useState([])
  const [checkins, setCheckins] = useState([]) // נוכחויות — לצורך דוחות מבוססי נוכחות בפועל

  useEffect(() => { if (isAdmin) fetchAll() }, [isAdmin])

  async function fetchAll() {
    setLoading(true)
    setErr('')
    try {
      const [mRes, cRes, clsRes, bRes, chkRes] = await Promise.all([
        supabase
          .from('members')
          .select('id, full_name, status, active, subscription_type, coach_id, requested_coach_name, requested_coach_names, branch_id, branch_ids, group_id, group_ids, created_at, deleted_at'),
        supabase.from('coaches').select('id, name, branch_id'),
        supabase.from('classes').select('id, name, class_type, coach_id, branch_id, day_of_week, start_time'),
        supabase.from('branches').select('id, name'),
        supabase.from('checkins').select('class_id, athlete_id, status, checked_in_at').eq('status', 'present'),
      ])
      if (mRes.error)   throw mRes.error
      if (cRes.error)   throw cRes.error
      if (clsRes.error) throw clsRes.error
      if (bRes.error)   throw bRes.error
      if (chkRes.error) console.error('checkins fetch error:', chkRes.error)
      setMembers(mRes.data || [])
      setCoaches(cRes.data || [])
      setClasses(clsRes.data || [])
      setBranches(bRes.data || [])
      setCheckins(chkRes.data || [])
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

  // 1) כמות מתאמנים לפי מאמן
  const byCoach = useMemo(() => {
    const counts = new Map()
    // אתחול כל המאמנים כדי להראות גם מאמנים ללא מתאמנים
    coaches.forEach(c => counts.set(c.name || '—', 0))
    activeMembers.forEach(m => {
      let name = null
      if (m.coach_id && coachById.has(m.coach_id)) {
        name = coachById.get(m.coach_id).name
      } else if (m.requested_coach_name) {
        name = m.requested_coach_name
      } else if (m.requested_coach_names?.length) {
        name = m.requested_coach_names[0]
      }
      if (!name) name = 'ללא מאמן / unlimited'
      counts.set(name, (counts.get(name) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [activeMembers, coaches, coachById])

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

  // סט מתאמנים פעילים (לצורך סינון סניף של נוכחויות)
  const activeMemberIds = useMemo(() => new Set(activeMembers.map(m => m.id)), [activeMembers])

  // 2) כמות מתאמנים לפי תחום — מבוסס נוכחות בפועל (checkins עם status='present')
  // סופר מתאמן אחד לכל תחום שהגיע אליו לפחות פעם אחת.
  const byDiscipline = useMemo(() => {
    const counts = { BJJ: 0, 'Muay Thai': 0, MMA: 0, 'ילדים': 0, 'אחר': 0 }
    // מפה: מתאמן → סט תחומים אליהם הגיע
    const disciplinesPerMember = new Map()
    checkins.forEach(c => {
      if (!c.athlete_id || !c.class_id) return
      if (!activeMemberIds.has(c.athlete_id)) return // רק מתאמנים פעילים
      const disc = disciplineByClassId.get(c.class_id)
      if (!disc) return
      if (!disciplinesPerMember.has(c.athlete_id)) disciplinesPerMember.set(c.athlete_id, new Set())
      disciplinesPerMember.get(c.athlete_id).add(disc)
    })
    disciplinesPerMember.forEach(discSet => {
      discSet.forEach(d => { counts[d] = (counts[d] || 0) + 1 })
    })
    return DISCIPLINE_ORDER.map(d => ({ name: d, count: counts[d] || 0 }))
  }, [checkins, disciplineByClassId, activeMemberIds])

  // 3) נרשמים חדשים (לפי created_at בטווח הזמן שנבחר) — ללא soft-deleted
  const newMembers = useMemo(() => {
    const since = new Date(daysAgoISO(rangeDays)).getTime()
    return filteredMembers.filter(m => {
      if (m.deleted_at) return false
      if (!m.created_at) return false
      return new Date(m.created_at).getTime() >= since
    })
  }, [filteredMembers, rangeDays])

  // 4) נטישה (churn) — מתאמנים שבוטל להם המנוי (deleted_at בתוך חלון הזמן)
  // churn% = מבוטלים בתקופה / (פעילים + מבוטלים בתקופה)
  const { churnByCoach, churnByGroup, totalChurned, totalActiveBase } = useMemo(() => {
    const cutoff = Date.now() - churnDays * DAY_MS

    const coachNameOf = (m) => {
      if (m.coach_id && coachById.has(m.coach_id)) return coachById.get(m.coach_id).name
      if (m.requested_coach_name) return m.requested_coach_name
      if (m.requested_coach_names?.length) return m.requested_coach_names[0]
      return 'ללא מאמן / unlimited'
    }

    const groupNamesOf = (m) => {
      const gids = (m.group_ids && m.group_ids.length) ? m.group_ids : (m.group_id ? [m.group_id] : [])
      return gids.map(gid => classById.get(gid)?.name).filter(Boolean)
    }

    // מתאמנים שבוטלו בתקופה — deleted_at קיים ונמצא בתוך החלון
    const churned = filteredMembers.filter(m => {
      if (!m.deleted_at) return false
      return new Date(m.deleted_at).getTime() >= cutoff
    })

    // סיכום לפי מאמן
    const coachAgg = new Map()
    activeMembers.forEach(m => {
      const name = coachNameOf(m)
      if (!coachAgg.has(name)) coachAgg.set(name, { active: 0, churned: 0 })
      coachAgg.get(name).active++
    })
    churned.forEach(m => {
      const name = coachNameOf(m)
      if (!coachAgg.has(name)) coachAgg.set(name, { active: 0, churned: 0 })
      coachAgg.get(name).churned++
    })

    // סיכום לפי קבוצה
    const grpAgg = new Map()
    activeMembers.forEach(m => {
      groupNamesOf(m).forEach(gname => {
        if (!grpAgg.has(gname)) grpAgg.set(gname, { active: 0, churned: 0 })
        grpAgg.get(gname).active++
      })
    })
    churned.forEach(m => {
      const names = groupNamesOf(m)
      const finalNames = names.length ? names : ['ללא קבוצה']
      finalNames.forEach(gname => {
        if (!grpAgg.has(gname)) grpAgg.set(gname, { active: 0, churned: 0 })
        grpAgg.get(gname).churned++
      })
    })

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
  }, [activeMembers, filteredMembers, churnDays, coachById, classById])

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
  const maxCoach = byCoach.reduce((m, r) => Math.max(m, r.count), 0) || 1
  const maxDiscipline = byDiscipline.reduce((m, r) => Math.max(m, r.count), 0) || 1
  const churnPctTotal = totalActiveBase > 0 ? Math.round((totalChurned / totalActiveBase) * 100) : 0

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
        <StatCard label={`נרשמים חדשים (${rangeDays} ימים)`} value={newMembers.length} tone="green" />
        <StatCard label="ממתינים לאישור" value={totalPending} tone="orange" />
        <StatCard label={`% נטישה (${churnDays} ימים)`} value={`${churnPctTotal}%`} sub={`${totalChurned} ביטולים מתוך ${totalActiveBase}`} tone="red" />
      </div>

      {/* בורר טווח נרשמים חדשים */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600">טווח לנרשמים חדשים:</span>
        {[7, 30, 90, 180].map(d => (
          <button key={d}
            onClick={() => setRangeDays(d)}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold ${rangeDays === d ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >{d} ימים</button>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        <span className="text-xs text-gray-600">תקופת נטישה (ימים אחורה):</span>
        {[30, 60, 90, 180].map(d => (
          <button key={d}
            onClick={() => setChurnDays(d)}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold ${churnDays === d ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >{d}</button>
        ))}
      </div>

      {/* מתאמנים לפי מאמן */}
      <SectionCard title="מתאמנים לפי מאמן" icon="🥋" footer={`סה״כ ${totalActive} מתאמנים פעילים`}>
        {byCoach.length === 0 ? (
          <p className="text-sm text-gray-500">אין נתונים להצגה.</p>
        ) : (
          byCoach.map(row => (
            <BarRow key={row.name} label={row.name} value={row.count} max={maxCoach} color="#059669" />
          ))
        )}
      </SectionCard>

      {/* מתאמנים לפי תחום — מבוסס נוכחות בפועל */}
      <SectionCard title="מתאמנים לפי תחום לחימה" icon="🥊" footer="ספירה מבוססת על נוכחות בפועל (סימון ✓ נוכח באימון). התחום מזוהה אוטומטית לפי שם השיעור.">
        {byDiscipline.every(r => r.count === 0) ? (
          <p className="text-sm text-gray-500">אין נתונים להצגה.</p>
        ) : (
          byDiscipline.map(row => (
            <BarRow
              key={row.name}
              label={row.name}
              value={row.count}
              max={maxDiscipline}
              color={DISCIPLINE_COLORS[row.name]}
            />
          ))
        )}
        <p className="text-xs text-gray-500 mt-2">* מתאמן שהיה באימונים במספר תחומים נספר בכל אחד מהם.</p>
      </SectionCard>

      {/* נרשמים חדשים */}
      <SectionCard title={`נרשמים חדשים (${rangeDays} ימים אחרונים)`} icon="📝" footer={`סה״כ ${newMembers.length} רישומים בתקופה`}>
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
        title={`% נטישה לפי מאמן (ביטולי מנוי ב-${churnDays} ימים האחרונים)`}
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
        title={`% נטישה לפי קבוצה (ביטולי מנוי ב-${churnDays} ימים האחרונים)`}
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
