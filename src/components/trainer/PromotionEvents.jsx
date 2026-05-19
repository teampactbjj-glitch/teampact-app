import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import {
  ADULT_BELTS, KIDS_BELTS, getBeltMeta, getBeltLabel, getMaxStripes,
} from '../../lib/belts'

// ===== עזרי תאריך לחישוב נוכחות =====
const DAY_MS = 24 * 60 * 60 * 1000

// תאריך שיעור בפועל לפי registration.week_start + class.day_of_week (YYYY-MM-DD).
function regOccurrenceDateStr(weekStart, dayOfWeek) {
  if (!weekStart || dayOfWeek == null) return null
  const ws = new Date(weekStart + 'T00:00:00')
  if (isNaN(ws.getTime())) return null
  const offset = ((dayOfWeek - ws.getDay()) + 7) % 7
  const d = new Date(ws.getTime() + offset * DAY_MS)
  return d.toISOString().slice(0, 10)
}

// משך שיעור עד סיום (ms epoch). null אם חסר.
function classEndMs(dateStr, startTime, durationMin) {
  if (!dateStr || !startTime) return null
  const [h, mi] = String(startTime).split(':').map(n => parseInt(n, 10))
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  const start = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:00`)
  if (isNaN(start.getTime())) return null
  const dur = Number.isFinite(+durationMin) ? +durationMin : 60
  return start.getTime() + dur * 60 * 1000
}

// ============================================================
// PromotionEvents — ניהול אירועי קידום (מאמן/מנהל)
// ============================================================
// תפקידים:
//   1. רשימת אירועים עתידיים + עברו
//   2. יצירת אירוע חדש (תאריך, שם, סניפים, מועמדים)
//   3. עריכה של אירוע planned (כל עוד event_date >= today)
//   4. הוספת/הסרת מועמדים לאירוע
//
// lazy execution + push notifications מטופל ב-TrainerDashboard.jsx
// ============================================================

const STATUS_LABEL = {
  planned: 'מתוכנן',
  completed: 'בוצע',
  cancelled: 'בוטל',
}

const STATUS_COLOR = {
  planned: 'bg-amber-50 text-amber-800 border-amber-300',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-300',
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatHebrewDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const day = d.getDate()
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
  return `${day} ב${months[d.getMonth()]} ${d.getFullYear()}`
}

// ===== מפיק את החגורה הבאה הבולטת ביותר לפי החגורה הנוכחית =====
// משמש רק לברירת מחדל ב-target_belt; המאמן יכול לשנות.
function nextBeltDefault(currentBelt) {
  if (!currentBelt) return null
  const adult = ADULT_BELTS.find(b => b.value === currentBelt)
  if (adult) {
    // לוגיקה לחגורות דאן (שחורה+דאן) — לקדם לדאן הבא
    if (adult.dan && adult.dan < 6) return `black_${adult.dan + 1}`
    if (adult.value === 'black')   return 'black_1'        // שחורה בלי דאן → דאן 1
    if (adult.value === 'black_6') return 'coral_red_black' // דאן 6 → קורל אדום-שחור
    // עבור white/blue/purple/brown — לקפוץ לצבע הבא (לא לדאן)
    const idx = ADULT_BELTS.findIndex(b => b.value === currentBelt)
    for (let i = idx + 1; i < ADULT_BELTS.length; i++) {
      if (!ADULT_BELTS[i].dan && ADULT_BELTS[i].order > adult.order) return ADULT_BELTS[i].value
    }
    return null
  }
  const kid = KIDS_BELTS.find(b => b.value === currentBelt)
  if (kid) {
    const idx = KIDS_BELTS.findIndex(b => b.value === currentBelt)
    return KIDS_BELTS[idx + 1]?.value || null
  }
  return null
}

// ============================================================
export default function PromotionEvents({ profile, isAdmin, onClose, initialCandidateMemberIds }) {
  const [loading, setLoading]   = useState(true)
  const [events, setEvents]     = useState([])
  const [candidates, setCandidates] = useState([]) // כל ה-candidates של כל האירועים שנטענו
  const [members, setMembers]   = useState([])     // כל המתאמנים הפעילים (לבחירה)
  const [branches, setBranches] = useState([])
  const [err, setErr]           = useState('')
  const [editingEvent, setEditingEvent] = useState(null) // null | { id?, name, event_date, branch_ids, notes }
  const [pendingNewEvent, setPendingNewEvent] = useState(null) // אם נכנסנו עם initialCandidateMemberIds
  const [showKidsCreator, setShowKidsCreator] = useState(false) // מודאל יצירת מבחן ילדים יוני

  // ── טעינת נתונים ───────────────────────────────────────────
  useEffect(() => { load() }, [])

  // אם נכנסנו עם רשימת מועמדים מהדוח — נפתח dialog יצירת אירוע
  useEffect(() => {
    if (initialCandidateMemberIds?.length && !editingEvent && !pendingNewEvent) {
      setPendingNewEvent(initialCandidateMemberIds)
      setEditingEvent({
        id: null,
        name: 'מבחן חגורות',
        event_date: '',
        branch_ids: [],
        notes: '',
      })
    }
  }, [initialCandidateMemberIds])

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const [eventsRes, candsRes, memsRes, branchesRes] = await Promise.all([
        supabase.from('promotion_events')
          .select('*').is('deleted_at', null)
          .order('event_date', { ascending: false }),
        supabase.from('promotion_candidates').select('*'),
        supabase.from('members')
          .select('id, full_name, belt, belt_stripes, belt_category, belt_received_at, branch_id, branch_ids, trains_gi, trains_nogi, status, deleted_at')
          .neq('status', 'pending').neq('status', 'pending_deletion').is('deleted_at', null)
          .order('full_name'),
        supabase.from('branches').select('id, name').eq('hidden', false).order('name'),
      ])
      if (eventsRes.error) throw eventsRes.error
      if (candsRes.error) throw candsRes.error
      if (memsRes.error) throw memsRes.error
      setEvents(eventsRes.data || [])
      setCandidates(candsRes.data || [])
      setMembers(memsRes.data || [])
      setBranches(branchesRes.data || [])
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── pivots ──────────────────────────────────────────────────
  const candByEvent = useMemo(() => {
    const m = new Map()
    for (const c of candidates) {
      if (!m.has(c.event_id)) m.set(c.event_id, [])
      m.get(c.event_id).push(c)
    }
    return m
  }, [candidates])

  const memberById = useMemo(() => {
    const m = new Map()
    for (const x of members) m.set(x.id, x)
    return m
  }, [members])

  const branchById = useMemo(() => {
    const m = new Map()
    for (const b of branches) m.set(b.id, b)
    return m
  }, [branches])

  const today = todayISO()
  const upcoming = events.filter(e => e.status === 'planned' && e.event_date >= today)
  const todayEvents = events.filter(e => e.status === 'planned' && e.event_date === today)
  const past = events.filter(e => e.status !== 'planned' || e.event_date < today)

  // ── רינדור ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500" dir="rtl">טוען אירועי קידום…</div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          שגיאה: {err}
        </div>
      )}

      {/* כפתור חזרה (אם פתוח כתת-מסך) */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-blue-700 hover:text-blue-900 text-sm font-bold"
        >
          ← חזרה למתאמנים
        </button>
      )}

      <header className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black text-gray-900">🎓 אירועי קידום</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowKidsCreator(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1"
            title="יצירת אירועי מבחן לכל קבוצות הילדים בו-זמנית"
          >
            🧒 צור מבחן ילדים יוני
          </button>
          <button
            type="button"
            onClick={() => setEditingEvent({ id: null, name: '', event_date: '', branch_ids: [], notes: '' })}
            className="bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> אירוע חדש
          </button>
        </div>
      </header>

      {/* אירועים היום — באנר בולט */}
      {todayEvents.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🔥</span>
            <h3 className="font-black text-amber-900">היום יש אירוע קידום!</h3>
          </div>
          <p className="text-xs text-amber-800 mb-3">
            יש זמן עד מחר לערוך מועמדים (להוסיף/להסיר/לבטל). מחר בבוקר המערכת תעדכן אוטומטית את החגורות
            ותשלח push notifications לכל מי שנשאר ברשימה.
          </p>
          {todayEvents.map(ev => (
            <EventRow
              key={ev.id}
              ev={ev}
              candidates={candByEvent.get(ev.id) || []}
              memberById={memberById}
              branchById={branchById}
              onEdit={() => setEditingEvent(ev)}
              highlightToday
            />
          ))}
        </div>
      )}

      {/* עתידיים */}
      <section>
        <h3 className="font-black text-gray-900 text-sm mb-2">📅 אירועים מתוכננים ({upcoming.length})</h3>
        {upcoming.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm">
            אין אירועים מתוכננים. לחץ "אירוע חדש" כדי ליצור.
          </div>
        )}
        <div className="space-y-2">
          {upcoming.filter(e => e.event_date !== today).map(ev => (
            <EventRow
              key={ev.id}
              ev={ev}
              candidates={candByEvent.get(ev.id) || []}
              memberById={memberById}
              branchById={branchById}
              onEdit={() => setEditingEvent(ev)}
            />
          ))}
        </div>
      </section>

      {/* עברו / בוצעו */}
      {past.length > 0 && (
        <section>
          <h3 className="font-black text-gray-700 text-sm mb-2">📚 עבר ({past.length})</h3>
          <div className="space-y-2">
            {past.slice(0, 20).map(ev => (
              <EventRow
                key={ev.id}
                ev={ev}
                candidates={candByEvent.get(ev.id) || []}
                memberById={memberById}
                branchById={branchById}
                onEdit={() => setEditingEvent(ev)}
                readOnly
              />
            ))}
          </div>
        </section>
      )}

      {/* Dialog יצירת מבחן ילדים יוני */}
      {showKidsCreator && (
        <KidsAnnualTestCreator
          branches={branches}
          isAdmin={isAdmin}
          trainerId={profile?.id}
          onClose={() => setShowKidsCreator(false)}
          onCreated={() => { setShowKidsCreator(false); load() }}
        />
      )}

      {/* Dialog יצירה/עריכה */}
      {editingEvent && (
        <EventEditDialog
          ev={editingEvent}
          existingCandidates={editingEvent.id ? (candByEvent.get(editingEvent.id) || []) : []}
          presetMemberIds={pendingNewEvent || []}
          members={members}
          branches={branches}
          isAdmin={isAdmin}
          onClose={() => { setEditingEvent(null); setPendingNewEvent(null) }}
          onSaved={() => { setEditingEvent(null); setPendingNewEvent(null); load() }}
          trainerId={profile?.id}
        />
      )}
    </div>
  )
}

// ============================================================
// EventRow — שורת אירוע ברשימה
// ============================================================
function EventRow({ ev, candidates, memberById, branchById, onEdit, highlightToday, readOnly }) {
  const days = daysUntil(ev.event_date)
  const branchNames = (ev.branch_ids || [])
    .map(id => branchById.get(id)?.name)
    .filter(Boolean)
    .join(' · ') || 'כל הסניפים'

  const promotedCount   = candidates.filter(c => c.status === 'promoted').length
  const notPromotedCount = candidates.filter(c => c.status === 'not_promoted').length

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`w-full text-right border rounded-xl p-3 hover:bg-gray-50 transition ${
        highlightToday ? 'bg-white border-amber-400' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900">{ev.name || '(ללא שם)'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[ev.status] || ''}`}>
              {STATUS_LABEL[ev.status] || ev.status}
            </span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {formatHebrewDate(ev.event_date)}
            {days != null && days >= 0 && ev.status === 'planned' && (
              <> · עוד <b className="text-amber-700">{days === 0 ? 'היום' : `${days} ימים`}</b></>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">📍 {branchNames}</div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-2xl font-black text-blue-800">{candidates.length}</div>
          <div className="text-[10px] text-gray-500">מועמדים</div>
        </div>
      </div>
      {ev.status === 'completed' && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-600 flex gap-3">
          <span>✓ קודמו: <b className="text-emerald-700">{promotedCount}</b></span>
          <span>✗ לא קודמו: <b className="text-gray-700">{notPromotedCount}</b></span>
        </div>
      )}
    </button>
  )
}

// ============================================================
// EventEditDialog — יצירה/עריכה
// ============================================================
function EventEditDialog({ ev, existingCandidates, presetMemberIds, members, branches, isAdmin, onClose, onSaved, trainerId }) {
  const isEditing = !!ev.id
  const isLocked = ev.status === 'completed' || ev.status === 'cancelled'

  const [name, setName] = useState(ev.name || '')
  const [eventDate, setEventDate] = useState(ev.event_date || '')
  const [branchIds, setBranchIds] = useState(ev.branch_ids || [])
  const [notes, setNotes] = useState(ev.notes || '')
  const [draftCands, setDraftCands] = useState(() => {
    // טוענים candidates קיימים + לעיתים גם presetMemberIds
    const existing = existingCandidates.map(c => ({
      id: c.id,
      member_id: c.member_id,
      target_belt: c.target_belt,
      target_stripes: c.target_stripes ?? 0,
      status: c.status,
      _existing: true,
    }))
    if (!isEditing && presetMemberIds?.length) {
      const memMap = new Map(members.map(m => [m.id, m]))
      const fromPreset = presetMemberIds.map(id => {
        const mem = memMap.get(id)
        return {
          id: null,
          member_id: id,
          target_belt: nextBeltDefault(mem?.belt) || (mem?.belt_category === 'kids' ? 'kids_white' : 'white'),
          target_stripes: 0,
          status: 'planned',
          _existing: false,
        }
      })
      return [...existing, ...fromPreset]
    }
    return existing
  })
  const [showAddMember, setShowAddMember] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [memberClassData, setMemberClassData] = useState(null)
  const [loadingClasses, setLoadingClasses] = useState(false)

  // טוען קבוצות כשפותחים פאנל הוספה
  useEffect(() => {
    if (showAddMember && memberClassData === null && !loadingClasses) {
      fetchClassData()
    }
  }, [showAddMember])

  async function fetchClassData() {
    setLoadingClasses(true)
    try {
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const [clsRes, regRes] = await Promise.all([
        supabase.from('classes').select('id, name, branch_id, day_of_week, start_time, trains_gi'),
        supabase.from('class_registrations')
          .select('class_id, athlete_id').gte('week_start', since).range(0, 99999),
      ])
      // Gi+NoGi נחשבים אותו דירוג — כל שיעור = יחידה אחת, ללא הבדל
      const classMap = new Map((clsRes.data || []).map(c => [c.id, c]))
      const memberToClasses = new Map()
      for (const r of (regRes.data || [])) {
        if (!memberToClasses.has(r.athlete_id)) memberToClasses.set(r.athlete_id, new Set())
        memberToClasses.get(r.athlete_id).add(r.class_id)
      }
      setMemberClassData({ classMap, memberToClasses })
    } catch (e) {
      console.warn('fetchClassData:', e)
      setMemberClassData({ classMap: new Map(), memberToClasses: new Map() })
    } finally {
      setLoadingClasses(false)
    }
  }

  // ── סינון מתאמנים זמינים להוספה ─────────────────────────────
  const usedMemberIds = useMemo(() => new Set(draftCands.map(c => c.member_id)), [draftCands])
  const availableMembers = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    return members
      .filter(m => m.trains_gi !== false || m.trains_nogi === true)
      .filter(m => !usedMemberIds.has(m.id))
      .filter(m => {
        if (branchIds.length === 0) return true
        const mb = m.branch_ids?.length ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
        return branchIds.some(bid => mb.includes(bid))
      })
      .filter(m => !q || m.full_name?.toLowerCase().includes(q))
  }, [members, addSearch, usedMemberIds, branchIds])

  const DAY_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']

  // קיבוץ לפי קבוצות (אחרי טעינת class data)
  const groupedMembers = useMemo(() => {
    if (!memberClassData) return null
    const { classMap, memberToClasses } = memberClassData
    const relevantClasses = [...classMap.values()]
      .filter(c => branchIds.length === 0 || branchIds.includes(c.branch_id))
      .sort((a, b) => (a.day_of_week ?? 9) - (b.day_of_week ?? 9) || (a.start_time || '').localeCompare(b.start_time || ''))
    const groups = []
    const assigned = new Set()
    for (const cls of relevantClasses) {
      const clsMembers = availableMembers.filter(m => memberToClasses.get(m.id)?.has(cls.id))
      if (clsMembers.length === 0) continue
      clsMembers.forEach(m => assigned.add(m.id))
      const day = DAY_HE[cls.day_of_week] ?? ''
      const time = cls.start_time ? cls.start_time.slice(0, 5) : ''
      groups.push({ label: `${day} ${time}${cls.name ? ' · ' + cls.name : ''}`, members: clsMembers })
    }
    const rest = availableMembers.filter(m => !assigned.has(m.id))
    if (rest.length) groups.push({ label: 'ללא קבוצה', members: rest })
    return groups
  }, [availableMembers, memberClassData, branchIds])

  function addMember(mem) {
    setDraftCands(arr => [...arr, {
      id: null,
      member_id: mem.id,
      target_belt: nextBeltDefault(mem.belt) || (mem.belt_category === 'kids' ? 'kids_white' : 'white'),
      target_stripes: 0,
      status: 'planned',
      _existing: false,
    }])
    setShowAddMember(false)
    setAddSearch('')
  }

  function removeCandidate(idx) {
    setDraftCands(arr => arr.filter((_, i) => i !== idx))
  }

  function updateCandidate(idx, patch) {
    setDraftCands(arr => arr.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  // ── שמירה ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveErr('')
    try {
      if (!name.trim()) throw new Error('חובה לתת שם לאירוע')
      if (!eventDate) throw new Error('חובה לבחור תאריך')

      let eventId = ev.id
      const payload = {
        name: name.trim(),
        event_date: eventDate,
        branch_ids: branchIds,
        notes: notes.trim() || null,
        trainer_id: trainerId || null,
        updated_at: new Date().toISOString(),
      }

      if (!eventId) {
        const { data, error } = await supabase.from('promotion_events')
          .insert({ ...payload, status: 'planned' })
          .select('id').single()
        if (error) throw error
        eventId = data.id
      } else {
        const { error } = await supabase.from('promotion_events').update(payload).eq('id', eventId)
        if (error) throw error
      }

      // candidates: diff בין draftCands ל-existingCandidates
      const existingIds = new Set(existingCandidates.map(c => c.id))
      const draftExistingIds = new Set(draftCands.filter(c => c._existing).map(c => c.id))

      // מחיקה: existing שלא קיים יותר ב-draft
      const toDelete = existingCandidates.filter(c => !draftExistingIds.has(c.id))
      if (toDelete.length) {
        const { error } = await supabase.from('promotion_candidates')
          .delete().in('id', toDelete.map(c => c.id))
        if (error) throw error
      }

      // הוספה: draft חדשים (_existing=false)
      const toInsert = draftCands.filter(c => !c._existing).map(c => {
        const mem = members.find(m => m.id === c.member_id)
        return {
          event_id: eventId,
          member_id: c.member_id,
          current_belt: mem?.belt || null,
          current_stripes: mem?.belt_stripes ?? 0,
          target_belt: c.target_belt,
          target_stripes: c.target_stripes ?? 0,
          status: 'planned',
        }
      })
      if (toInsert.length) {
        const { error } = await supabase.from('promotion_candidates').insert(toInsert)
        if (error) throw error

        // 🔔 push notification לכל מועמד חדש
        // מוצאים user_id לפי email של המתאמן ב-profiles
        try {
          const newMemberIds = toInsert.map(t => t.member_id)
          const newMembers   = members.filter(m => newMemberIds.includes(m.id))
          const emails       = newMembers.map(m => m.email).filter(Boolean)
          if (emails.length > 0) {
            const { data: profs } = await supabase.from('profiles')
              .select('id, email').in('email', emails)
            const userIdByEmail = new Map((profs || []).map(p => [String(p.email).toLowerCase(), p.id]))

            // תאריך האירוע בעברית
            const evDate = new Date(eventDate + 'T12:00:00')
            const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
            const dateStr = `${evDate.getDate()} ב${months[evDate.getMonth()]}`

            for (const cand of toInsert) {
              const mem = newMembers.find(m => m.id === cand.member_id)
              if (!mem?.email) continue
              const uid = userIdByEmail.get(String(mem.email).toLowerCase())
              if (!uid) continue
              const beltLabel = getBeltLabel(cand.target_belt)
              await notifyPush({
                userIds: [uid],
                title: '🎉 סומנת לקידום!',
                body: `${name.trim()} · ${dateStr} · יעד: ${beltLabel}${cand.target_stripes > 0 ? ` (${cand.target_stripes} פסים)` : ''}`,
                url: '/',
                tag: `promotion-marked-${eventId}-${cand.member_id}`,
              })
            }
          }
        } catch (pushErr) {
          console.warn('[promotion] push notification on add failed:', pushErr?.message || pushErr)
        }
      }

      // עדכון: existing שעדיין קיים אך השתנה
      for (const dc of draftCands.filter(c => c._existing)) {
        const orig = existingCandidates.find(c => c.id === dc.id)
        if (!orig) continue
        if (orig.target_belt !== dc.target_belt || orig.target_stripes !== dc.target_stripes) {
          const { error } = await supabase.from('promotion_candidates')
            .update({ target_belt: dc.target_belt, target_stripes: dc.target_stripes })
            .eq('id', dc.id)
          if (error) throw error
        }
      }

      onSaved()
    } catch (e) {
      setSaveErr(e?.message || String(e))
      setSaving(false)
    }
  }

  // ── ביטול אירוע (status='cancelled') ────────────────────────
  async function handleCancel() {
    if (!isEditing) return
    if (!window.confirm('לבטל את האירוע? המתאמנים לא יקודמו ולא ייקבל push.')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('promotion_events')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', ev.id)
      if (error) throw error
      onSaved()
    } catch (e) {
      setSaveErr(e?.message || String(e))
      setSaving(false)
    }
  }

  // ── מחיקה (soft) ────────────────────────────────────────────
  async function handleDelete() {
    if (!isEditing) return
    if (!window.confirm('למחוק לצמיתות את האירוע + כל המועמדים? לא ניתן לבטל.')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('promotion_events')
        .update({ deleted_at: new Date().toISOString() }).eq('id', ev.id)
      if (error) throw error
      onSaved()
    } catch (e) {
      setSaveErr(e?.message || String(e))
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h3 className="font-black text-gray-900 text-base">
            {isEditing ? '✏️ עריכת אירוע' : '➕ אירוע קידום חדש'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl leading-none">✕</button>
        </header>

        <div className="p-4 space-y-3">
          {saveErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
              {saveErr}
            </div>
          )}

          {isLocked && (
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-2 text-xs text-gray-700">
              🔒 האירוע {STATUS_LABEL[ev.status]} — לא ניתן לערוך.
            </div>
          )}

          {/* שם */}
          <label className="block">
            <span className="text-xs font-bold text-gray-700">שם האירוע</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="למשל: מבחן חגורות סוף 2026"
              disabled={isLocked}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100"
            />
          </label>

          {/* תאריך */}
          <label className="block">
            <span className="text-xs font-bold text-gray-700">תאריך האירוע</span>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              disabled={isLocked}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100"
            />
            {eventDate && eventDate < todayISO() && (
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 mt-1 block">
                ⚠️ תאריך עבר — האירוע יבוצע אוטומטית בפתיחת ה-dashboard הבאה (כל המועמדים יקודמו).
              </span>
            )}
            {eventDate && eventDate >= todayISO() && (
              <span className="text-[11px] text-gray-500 mt-1 block">
                ביום שאחרי האירוע, המערכת תעדכן אוטומטית את החגורות ותשלח push.
              </span>
            )}
          </label>

          {/* סניפים — multi */}
          <div>
            <span className="text-xs font-bold text-gray-700">סניפים (בחר אחד או יותר)</span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {branches.map(b => {
                const selected = branchIds.includes(b.id)
                return (
                  <button
                    type="button"
                    key={b.id}
                    disabled={isLocked}
                    onClick={() => setBranchIds(arr =>
                      selected ? arr.filter(x => x !== b.id) : [...arr, b.id]
                    )}
                    className={`text-xs p-2 rounded-lg border transition ${
                      selected
                        ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold'
                        : 'bg-white border-gray-300 text-gray-700'
                    } disabled:opacity-60`}
                  >
                    {selected ? '✓ ' : ''}{b.name}
                  </button>
                )
              })}
            </div>
            <span className="text-[11px] text-gray-500 mt-1 block">
              {branchIds.length === 0 ? 'ריק = כל הסניפים' : `${branchIds.length} סניפים נבחרו`}
            </span>
          </div>

          {/* הערות */}
          <label className="block">
            <span className="text-xs font-bold text-gray-700">הערות (אופציונלי)</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              disabled={isLocked}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100"
            />
          </label>

          {/* מועמדים */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700">
                מועמדים ({draftCands.length})
              </span>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setShowAddMember(s => !s)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg"
                >
                  {showAddMember ? '× סגור' : '+ הוסף מתאמן'}
                </button>
              )}
            </div>

            {/* חיפוש להוספה */}
            {showAddMember && !isLocked && (
              <div className="mb-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                <input
                  type="text"
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder={branchIds.length > 0 ? 'חפש מתאמן מהסניף הנבחר…' : 'חפש מתאמן…'}
                  className="w-full border border-emerald-300 rounded p-1.5 text-sm"
                  autoFocus
                />
                <div className="mt-2 max-h-64 overflow-y-auto">
                  {loadingClasses && (
                    <div className="text-xs text-gray-400 text-center py-2">טוען קבוצות…</div>
                  )}
                  {!loadingClasses && availableMembers.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">לא נמצאו מתאמני BJJ{branchIds.length > 0 ? ' בסניף זה' : ''}</div>
                  )}
                  {/* תצוגה מקובצת לפי קבוצה */}
                  {!loadingClasses && groupedMembers && groupedMembers.map((grp, gi) => (
                    <div key={gi} className="mb-2">
                      <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wide px-1 py-0.5 bg-emerald-100 rounded mb-1">
                        {grp.label} ({grp.members.length})
                      </div>
                      <div className="space-y-1">
                        {grp.members.map(m => {
                          const meta = m.belt ? getBeltMeta(m.belt) : null
                          return (
                            <button
                              type="button"
                              key={m.id}
                              onClick={() => addMember(m)}
                              className="w-full text-right bg-white hover:bg-emerald-100 border border-gray-200 rounded p-2 text-xs flex items-center gap-2"
                            >
                              <span className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                                style={{ background: meta?.color || '#fff' }} />
                              <span className="font-bold flex-1">{m.full_name}</span>
                              <span className="text-gray-400 text-[10px]">{m.belt_category === 'kids' ? '🧒' : ''}</span>
                              <span className="text-gray-500">{m.belt ? getBeltLabel(m.belt) : '—'}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {/* fallback — לפני שנטען groupedMembers */}
                  {!loadingClasses && !groupedMembers && availableMembers.slice(0, 50).map(m => {
                    const meta = m.belt ? getBeltMeta(m.belt) : null
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => addMember(m)}
                        className="w-full text-right bg-white hover:bg-emerald-100 border border-gray-200 rounded p-2 text-xs flex items-center gap-2 mb-1"
                      >
                        <span className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                          style={{ background: meta?.color || '#fff' }} />
                        <span className="font-bold flex-1">{m.full_name}</span>
                        <span className="text-gray-500">{m.belt ? getBeltLabel(m.belt) : '—'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* רשימת מועמדים */}
            {draftCands.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center text-xs text-gray-500">
                אין מועמדים. לחץ "+ הוסף מתאמן" כדי להוסיף.
              </div>
            )}
            <div className="space-y-2">
              {draftCands.map((c, idx) => {
                const mem = members.find(m => m.id === c.member_id)
                const isKids = mem?.belt_category === 'kids' || c.target_belt?.startsWith('kids_')
                const beltOptions = isKids ? KIDS_BELTS : ADULT_BELTS
                const maxStripes = getMaxStripes(c.target_belt)
                const targetMeta = getBeltMeta(c.target_belt)
                return (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 truncate">
                          {mem?.full_name || '(לא נמצא)'}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          נוכחית: {mem?.belt ? getBeltLabel(mem.belt) : '—'}
                        </div>
                      </div>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => removeCandidate(idx)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          הסר
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-gray-600">חגורת יעד</span>
                        <select
                          value={c.target_belt}
                          onChange={e => updateCandidate(idx, { target_belt: e.target.value, target_stripes: 0 })}
                          disabled={isLocked}
                          className="mt-0.5 w-full border border-gray-300 rounded p-1 text-xs disabled:bg-gray-100"
                          style={{ background: targetMeta?.color || '#fff', color: targetMeta?.text || '#000' }}
                        >
                          {beltOptions.map(b => (
                            <option key={b.value} value={b.value} style={{ background: '#fff', color: '#000' }}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-gray-600">פסים</span>
                        <select
                          value={c.target_stripes}
                          onChange={e => updateCandidate(idx, { target_stripes: parseInt(e.target.value, 10) })}
                          disabled={isLocked}
                          className="mt-0.5 w-full border border-gray-300 rounded p-1 text-xs disabled:bg-gray-100"
                        >
                          {Array.from({ length: maxStripes + 1 }, (_, i) => (
                            <option key={i} value={i}>{i} פסים</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {c.status && c.status !== 'planned' && (
                      <div className="mt-1 text-[10px] text-gray-600">
                        סטטוס: <b>{c.status === 'promoted' ? '✓ קודם' : c.status === 'not_promoted' ? '✗ לא קודם' : c.status}</b>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* footer */}
        <footer className="sticky bottom-0 bg-white border-t border-gray-200 p-3 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {isEditing && !isLocked && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-3 py-2 rounded-lg"
              >
                בטל אירוע
              </button>
            )}
            {isAdmin && isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-2 rounded-lg"
              >
                מחק לצמיתות
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold px-3 py-2 rounded-lg"
            >
              ביטול
            </button>
            {!isLocked && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? 'שומר…' : isEditing ? 'שמור שינויים' : 'צור אירוע'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

// ============================================================
// KidsAnnualTestCreator — יצירת אירועי מבחן ילדים יוני
// ============================================================
// בוחר תאריך מבחן יחיד + רשימת קבוצות-ילדים → ייצור promotion_event לכל
// קבוצה (event_type='kids_annual_test', class_id, attendance_threshold=0.6),
// + candidates אוטומטיים לכל ילד פעיל ברישום הקבוצה (target_belt = הבא ב-KIDS_BELTS,
// או 'white' + target_to_adult=true אם הילד ימלא 16 בין יוני השנה ליוני הבא),
// + חישוב attendance_pct מבוסס registrations מאז belt_received_at של הילד עד היום.
// ============================================================
function KidsAnnualTestCreator({ branches, isAdmin, trainerId, onClose, onCreated }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [classes, setClasses] = useState([])
  const [members, setMembers] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [checkins, setCheckins] = useState([])
  const [selectedClassIds, setSelectedClassIds] = useState(() => new Set())
  // ברירת מחדל: שישי האחרון של יוני בשנה הנוכחית (אם אנחנו אחריו → השנה הבאה).
  const [eventDate, setEventDate] = useState(() => defaultJuneTestDate())
  const [progress, setProgress] = useState({ step: '', cur: 0, total: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true); setErr('')
    try {
      const sinceMaxISO = new Date(Date.now() - 180 * DAY_MS).toISOString()
      const [clsRes, memRes, regRes, chkRes] = await Promise.all([
        supabase.from('classes')
          .select('id, name, class_type, branch_id, day_of_week, start_time, duration_minutes')
          .range(0, 99999),
        supabase.from('members')
          .select('id, full_name, email, phone, belt, belt_stripes, belt_category, belt_received_at, birth_date, branch_id, branch_ids, status, deleted_at')
          .eq('belt_category', 'kids')
          .neq('status', 'pending').neq('status', 'pending_deletion')
          .is('deleted_at', null)
          .range(0, 99999),
        supabase.from('class_registrations')
          .select('class_id, athlete_id, week_start')
          .gte('week_start', sinceMaxISO.slice(0, 10))
          .range(0, 99999),
        supabase.from('checkins')
          .select('class_id, athlete_id, status, checked_in_at, checkin_date')
          .eq('status', 'present')
          .gte('checked_in_at', sinceMaxISO)
          .range(0, 99999),
      ])
      if (clsRes.error) throw clsRes.error
      if (memRes.error) throw memRes.error
      if (regRes.error) console.error('reg fetch:', regRes.error)
      if (chkRes.error) console.error('chk fetch:', chkRes.error)
      setClasses(clsRes.data || [])
      setMembers(memRes.data || [])
      setRegistrations(regRes.data || [])
      setCheckins(chkRes.data || [])
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // pivots
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const classById  = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes])
  const branchById = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches])

  // לכל class — ילדים ייחודיים שרשומים (registrations ב-180 יום)
  const kidsByClass = useMemo(() => {
    const m = new Map()
    for (const r of registrations) {
      const mem = memberById.get(r.athlete_id)
      if (!mem) continue
      if (mem.belt_category !== 'kids') continue
      if (!m.has(r.class_id)) m.set(r.class_id, new Set())
      m.get(r.class_id).add(r.athlete_id)
    }
    return m
  }, [registrations, memberById])

  // קבוצות ילדים: כל class שיש לו לפחות 1 ילד פעיל רשום (180 יום)
  const kidsClasses = useMemo(() => {
    return classes
      .filter(c => (kidsByClass.get(c.id)?.size || 0) > 0)
      .map(c => ({
        ...c,
        kidsCount: kidsByClass.get(c.id)?.size || 0,
        branchName: branchById.get(c.branch_id)?.name || '—',
      }))
      .sort((a, b) => (a.branchName || '').localeCompare(b.branchName || '', 'he') || (a.day_of_week ?? 9) - (b.day_of_week ?? 9))
  }, [classes, kidsByClass, branchById])

  function toggleClass(id) {
    setSelectedClassIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedClassIds.size === kidsClasses.length) setSelectedClassIds(new Set())
    else setSelectedClassIds(new Set(kidsClasses.map(c => c.id)))
  }

  // ===== חישוב candidate לילד אחד בתוך קבוצה =====
  // expected_sessions: registrations שלו לקבוצה הזו, מאז belt_received_at, של שיעורים שכבר התקיימו (endMs<=today).
  // attended_sessions: checkins שלו לקבוצה הזו במהלך אותם תאריכים.
  // attendance_pct = attended/expected. אם expected=0 → not_evaluated.
  function buildCandidate(member, classObj, eventDateStr) {
    const beltMs = member.belt_received_at ? new Date(member.belt_received_at).getTime() : 0
    const todayMs = new Date(eventDateStr + 'T23:59:59').getTime()

    // expected: registrations שלו ב-class הזה בטווח [beltMs..todayMs]
    let expected = 0
    const occurrenceDates = new Set() // דאחים שדתות לזיהוי checkins
    for (const r of registrations) {
      if (r.athlete_id !== member.id) continue
      if (r.class_id !== classObj.id) continue
      const occ = regOccurrenceDateStr(r.week_start, classObj.day_of_week)
      if (!occ) continue
      const endMs = classEndMs(occ, classObj.start_time, classObj.duration_minutes)
      if (endMs == null) continue
      if (endMs > todayMs) continue
      if (beltMs && endMs < beltMs) continue
      expected++
      occurrenceDates.add(occ)
    }

    // attended: checkins של הילד ב-class באותם תאריכים
    let attended = 0
    for (const c of checkins) {
      if (c.athlete_id !== member.id) continue
      if (c.class_id !== classObj.id) continue
      if (!c.checkin_date) continue
      if (!occurrenceDates.has(c.checkin_date)) continue
      attended++
    }

    let attendance_pct = null
    let attendance_recommendation = 'not_evaluated'
    if (expected > 0) {
      attendance_pct = Math.round((attended / expected) * 1000) / 1000
      attendance_recommendation = attendance_pct >= 0.6 ? 'promote' : 'review'
    }

    // האם הילד יעבור לבוגרים השנה? (יגיע ל-16 בין יוני השנה ליוני הבא)
    const turnsAdult = willTurn16InYear(member.birth_date, eventDateStr)
    const target_to_adult = !!turnsAdult

    let target_belt
    if (target_to_adult) {
      target_belt = 'white' // עובר לבוגרים = חגורה לבנה (מבוגרים)
    } else {
      // הבא ב-KIDS_BELTS לפי החגורה הנוכחית
      const idx = KIDS_BELTS.findIndex(b => b.value === member.belt)
      target_belt = idx >= 0 && idx < KIDS_BELTS.length - 1
        ? KIDS_BELTS[idx + 1].value
        : (member.belt || 'kids_white')
    }

    return {
      member_id: member.id,
      current_belt: member.belt || null,
      current_stripes: member.belt_stripes ?? 0,
      target_belt,
      target_stripes: 0,
      target_to_adult,
      expected_sessions: expected,
      attended_sessions: attended,
      attendance_pct,
      attendance_recommendation,
      status: 'planned',
    }
  }

  async function handleCreate() {
    if (selectedClassIds.size === 0) { setErr('בחר לפחות קבוצה אחת'); return }
    if (!eventDate) { setErr('בחר תאריך מבחן'); return }
    setSaving(true); setErr('')

    try {
      const ids = Array.from(selectedClassIds)
      let created = 0
      for (let i = 0; i < ids.length; i++) {
        const cls = classById.get(ids[i])
        if (!cls) continue
        const kidsIds = Array.from(kidsByClass.get(ids[i]) || [])
        if (kidsIds.length === 0) continue

        setProgress({ step: cls.name || 'קבוצה', cur: i + 1, total: ids.length })

        const branchName = branchById.get(cls.branch_id)?.name || ''
        const eventName = `מבחן ילדים יוני · ${cls.name || ''}${branchName ? ' · ' + branchName : ''}`.trim()

        // 1) צור event
        const { data: evRow, error: evErr } = await supabase.from('promotion_events').insert({
          name: eventName,
          event_date: eventDate,
          event_type: 'kids_annual_test',
          class_id: cls.id,
          attendance_threshold: 0.6,
          branch_ids: cls.branch_id ? [cls.branch_id] : [],
          notes: 'מבחן דרגות שנתי לילדים — נוצר אוטומטית.',
          status: 'planned',
          trainer_id: trainerId || null,
        }).select('id').single()
        if (evErr) throw evErr

        // 2) חשב candidates לכל ילד
        const cands = []
        for (const kidId of kidsIds) {
          const mem = memberById.get(kidId)
          if (!mem) continue
          const cand = buildCandidate(mem, cls, eventDate)
          cands.push({ event_id: evRow.id, ...cand })
        }
        if (cands.length > 0) {
          // chunked insert (50 בכל פעם — pg יכול לשבור בריצה גדולה)
          for (let j = 0; j < cands.length; j += 50) {
            const chunk = cands.slice(j, j + 50)
            const { error: candErr } = await supabase.from('promotion_candidates').insert(chunk)
            if (candErr) throw candErr
          }
        }
        created++
      }

      onCreated?.(created)
    } catch (e) {
      console.error('KidsAnnualTestCreator error:', e)
      setErr(e?.message || String(e))
    } finally {
      setSaving(false)
      setProgress({ step: '', cur: 0, total: 0 })
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !saving && onClose()}
      dir="rtl"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h3 className="font-black text-gray-900 text-base">
            🧒 יצירת מבחן ילדים יוני
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-500 hover:text-gray-800 text-xl leading-none disabled:opacity-30"
          >✕</button>
        </header>

        <div className="p-4 space-y-3">
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
              {err}
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-500 py-8">טוען נתונים…</div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
                המערכת תיצור <b>אירוע מבחן נפרד לכל קבוצת ילדים</b> שתבחר.
                לכל ילד תיווצר רשומת candidate עם חגורת היעד הבאה, אחוז נוכחות מחושב,
                והמלצה: 🟢 לקידום (≥60%) / 🟡 לבדיקה (&lt;60%).<br />
                ילדים שיגיעו ל־16 השנה יסומנו אוטומטית <b>🎓 מעבר לבוגרים</b> (target_belt=לבנה).
              </div>

              {/* תאריך */}
              <label className="block">
                <span className="text-xs font-bold text-gray-700">תאריך המבחן (יחול על כל הקבוצות שתבחר)</span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  disabled={saving}
                  className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100"
                />
              </label>

              {/* רשימת קבוצות */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700">
                    קבוצות ילדים זמינות ({kidsClasses.length})
                  </span>
                  {kidsClasses.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      disabled={saving}
                      className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-2 py-1 rounded disabled:opacity-50"
                    >
                      {selectedClassIds.size === kidsClasses.length ? 'נקה הכל' : 'בחר הכל'}
                    </button>
                  )}
                </div>

                {kidsClasses.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center text-xs text-gray-500">
                    לא נמצאו קבוצות עם ילדים פעילים (ב-180 הימים האחרונים).
                  </div>
                ) : (
                  <ul className="space-y-1 max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-1 bg-gray-50">
                    {kidsClasses.map(c => {
                      const selected = selectedClassIds.has(c.id)
                      const dayLabel = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][c.day_of_week] || ''
                      const time = c.start_time ? c.start_time.slice(0, 5) : ''
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => toggleClass(c.id)}
                            disabled={saving}
                            className={`w-full text-right p-2 rounded border transition flex items-center gap-2 ${
                              selected ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-200 hover:bg-gray-100'
                            } disabled:opacity-50`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              readOnly
                              className="w-4 h-4 accent-amber-600 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-gray-900 truncate">{c.name || '(ללא שם)'}</div>
                              <div className="text-[11px] text-gray-500">
                                📍 {c.branchName} · {dayLabel} {time}
                              </div>
                            </div>
                            <div className="text-center shrink-0">
                              <div className="text-base font-black text-amber-700">{c.kidsCount}</div>
                              <div className="text-[10px] text-gray-500">ילדים</div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* progress while saving */}
              {saving && progress.total > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-900">
                  יוצר אירוע {progress.cur}/{progress.total} · {progress.step}…
                </div>
              )}
            </>
          )}
        </div>

        <footer className="sticky bottom-0 bg-white border-t border-gray-200 p-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || loading || selectedClassIds.size === 0 || !eventDate}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? 'יוצר…' : `צור ${selectedClassIds.size} אירועים`}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ===== עזר ל-KidsAnnualTestCreator =====
// שישי אחרון ביוני של השנה הנוכחית (או הבאה אם כבר עבר).
function defaultJuneTestDate() {
  const today = new Date()
  let year = today.getFullYear()
  // אם כבר עברנו את 30.6 בשנה הנוכחית → השנה הבאה
  const juneEnd = new Date(year, 5, 30)
  if (today > juneEnd) year += 1
  // 30.6 → אחורה עד שמגיעים ליום שישי (5)
  const d = new Date(year, 5, 30)
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// האם הילד ימלא 16 בין eventDate ל-eventDate+שנה?
// (משמש לזיהוי "מעבר לבוגרים השנה")
function willTurn16InYear(birthDate, eventDateStr) {
  if (!birthDate) return false
  const bd = new Date(birthDate)
  if (isNaN(bd.getTime())) return false
  const ev = new Date(eventDateStr)
  if (isNaN(ev.getTime())) return false
  // יום הולדת 16 = birthDate + 16 שנים
  const b16 = new Date(bd.getFullYear() + 16, bd.getMonth(), bd.getDate())
  // טווח: [event_date, event_date + שנה)
  const yearLater = new Date(ev.getFullYear() + 1, ev.getMonth(), ev.getDate())
  return b16 >= ev && b16 < yearLater
}
