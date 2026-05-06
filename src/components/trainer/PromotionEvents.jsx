import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import {
  ADULT_BELTS, KIDS_BELTS, getBeltMeta, getBeltLabel, getMaxStripes,
} from '../../lib/belts'

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
          .select('id, full_name, belt, belt_stripes, belt_category, belt_received_at, branch_id, branch_ids, trains_gi, status, deleted_at')
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

      <header className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-900">🎓 אירועי קידום</h2>
        <button
          type="button"
          onClick={() => setEditingEvent({ id: null, name: '', event_date: '', branch_ids: [], notes: '' })}
          className="bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <span className="text-lg leading-none">+</span> אירוע חדש
        </button>
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

  // ── סינון מתאמנים זמינים להוספה ─────────────────────────────
  const usedMemberIds = useMemo(() => new Set(draftCands.map(c => c.member_id)), [draftCands])
  const availableMembers = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    return members
      .filter(m => m.trains_gi !== false)             // רק BJJ
      .filter(m => !usedMemberIds.has(m.id))          // לא כבר ברשימה
      .filter(m => !q || m.full_name?.toLowerCase().includes(q))
      .slice(0, 50)
  }, [members, addSearch, usedMemberIds])

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
                  placeholder="חפש מתאמן…"
                  className="w-full border border-emerald-300 rounded p-1.5 text-sm"
                  autoFocus
                />
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {availableMembers.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">לא נמצאו מתאמני BJJ זמינים.</div>
                  )}
                  {availableMembers.map(m => {
                    const meta = m.belt ? getBeltMeta(m.belt) : null
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => addMember(m)}
                        className="w-full text-right bg-white hover:bg-emerald-100 border border-gray-200 rounded p-2 text-xs flex items-center gap-2"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                          style={{ background: meta?.color || '#fff' }}
                        />
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
                          {mem?.belt_stripes > 0 && ` · ${mem.belt_stripes} פסים`}
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
