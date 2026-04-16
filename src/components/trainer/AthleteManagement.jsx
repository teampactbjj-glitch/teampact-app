import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ImportAthletes from './ImportAthletes'

const BRANCHES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'חולון' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'תל אביב' },
]

const MEMBERSHIP_LABELS = {
  '2x_week': '2× שבוע',
  '4x_week': '4× שבוע',
  'unlimited': 'ללא הגבלה',
}

// Max sessions (שיעורים) allowed per membership type
const SESSION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatClassOption(cls) {
  const day = typeof cls.day_of_week === 'number' ? DAYS_HE[cls.day_of_week] : (cls.day_of_week || '')
  const time = cls.start_time ? cls.start_time.slice(0, 5) : '' // "18:00:00" → "18:00"
  return [cls.name, day, time].filter(Boolean).join(' · ')
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  membership_type: '2x_week',
  group_ids: [],
  active: true,
  branch_id: BRANCHES[0].id,
}

export default function AthleteManagement({ trainerId, isAdmin, branchFilter = null }) {
  const [athletes, setAthletes] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    fetchAthletes()
  }, [trainerId, isAdmin])

  useEffect(() => {
    fetchClasses(form.branch_id)
  }, [form.branch_id])

  async function fetchClasses(branchId) {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, hall, class_type')
      .eq('branch_id', branchId)
      .order('day_of_week')
    if (error) console.error('fetchClasses error:', error)
    setClasses(data || [])
  }

  async function fetchAthletes() {
    setLoading(true)

    if (isAdmin) {
      // Admin: all members from all branches
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('full_name')
      if (error) console.error('fetchAthletes [admin] error:', error)
      setAthletes(data || [])
      setLoading(false)
      return
    }

    // Regular trainer: only members assigned to trainer's classes
    const { data: coaches, error: coachErr } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', trainerId)
    if (coachErr) console.error('fetchCoaches error:', coachErr)

    const coachIds = (coaches || []).map(c => c.id)
    if (coachIds.length === 0) {
      setAthletes([])
      setLoading(false)
      return
    }

    // Get class IDs that belong to this trainer
    const { data: trainerClasses, error: classErr } = await supabase
      .from('classes')
      .select('id')
      .in('coach_id', coachIds)
    if (classErr) console.error('fetchTrainerClasses error:', classErr)

    const classIds = (trainerClasses || []).map(c => c.id)
    if (classIds.length === 0) {
      setAthletes([])
      setLoading(false)
      return
    }

    // Get members whose group_ids overlap with trainer's class IDs
    // Using containedBy / overlap — fetch all and filter client-side as fallback
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .overlaps('group_ids', classIds)
      .order('full_name')

    if (error) {
      console.error('fetchAthletes [trainer] error:', error)
      // Fallback: fetch all and filter client-side
      const { data: all } = await supabase.from('members').select('*').order('full_name')
      const filtered = (all || []).filter(m =>
        (m.group_ids || []).some(gid => classIds.includes(gid)) ||
        classIds.includes(m.group_id)
      )
      setAthletes(filtered)
    } else {
      setAthletes(data || [])
    }
    setLoading(false)
  }

  async function saveAthlete(e) {
    e.preventDefault()
    setSaveError('')

    const selectedNames = form.group_ids
      .map(id => classes.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join(', ')

    const payload = {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      membership_type: form.membership_type,
      subscription_type: form.membership_type,
      group_ids: form.group_ids.length > 0 ? form.group_ids : null,
      group_id: form.group_ids[0] || null,        // backwards compat
      group_name: selectedNames || null,
      active: form.active,
      branch_id: form.branch_id,
    }
    console.log('saving athlete:', payload)

    let error
    if (editing === 'new') {
      ;({ error } = await supabase.from('members').insert(payload))
    } else {
      ;({ error } = await supabase.from('members').update(payload).eq('id', editing))
    }

    if (error) {
      console.error('saveAthlete error:', error)
      setSaveError(error.message)
      return
    }
    setEditing(null)
    fetchAthletes()
  }

  function toggleGroupId(id) {
    const limit = SESSION_LIMITS[form.membership_type] ?? 2
    setForm(p => {
      const already = p.group_ids.includes(id)
      if (already) return { ...p, group_ids: p.group_ids.filter(g => g !== id) }
      if (p.group_ids.length >= limit) return p // at limit, ignore
      return { ...p, group_ids: [...p.group_ids, id] }
    })
  }

  // When membership type changes, trim group_ids to new limit
  function handleMembershipChange(val) {
    const newLimit = SESSION_LIMITS[val] ?? 2
    setForm(p => ({
      ...p,
      membership_type: val,
      group_ids: p.group_ids.slice(0, newLimit === Infinity ? undefined : newLimit),
    }))
  }

  function handleBranchChange(branchId) {
    setForm(p => ({ ...p, branch_id: branchId, group_ids: [] }))
  }

  function startEdit(athlete) {
    setSaveError('')
    setForm({
      full_name: athlete.full_name || '',
      email: athlete.email || '',
      phone: athlete.phone || '',
      membership_type: athlete.membership_type || athlete.subscription_type || '2x_week',
      group_ids: athlete.group_ids || (athlete.group_id ? [athlete.group_id] : []),
      active: athlete.active ?? true,
      branch_id: athlete.branch_id || BRANCHES[0].id,
    })
    setEditing(athlete.id)
  }

  function openAdd() {
    setSaveError('')
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  const limit = SESSION_LIMITS[form.membership_type] ?? 2
  const limitLabel = limit === Infinity
    ? 'בחר כמה שיעורים שתרצה'
    : `בחר עד ${limit} שיעורים`

  const filtered = athletes.filter(a =>
    (!branchFilter || a.branch_id === branchFilter) &&
    (a.full_name?.includes(search) ||
     a.email?.includes(search) ||
     a.group_name?.includes(search))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">ניהול מתאמנים</h2>
        <div className="flex gap-2">
          <ImportAthletes onImported={fetchAthletes} />
          <button
            onClick={openAdd}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
          >
            + הוסף מתאמן
          </button>
        </div>
      </div>

      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="חיפוש לפי שם, אימייל או קבוצה..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {editing && (
        <form onSubmit={saveAthlete} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="font-semibold text-gray-700">
            {editing === 'new' ? 'הוספת מתאמן' : 'עריכת מתאמן'}
          </h3>

          {/* Branch selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">סניף</label>
            <div className="flex gap-2">
              {BRANCHES.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBranchChange(b.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    form.branch_id === b.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="שם מלא *"
            value={form.full_name}
            onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
            required
          />
          <input
            type="email"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="אימייל"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          />
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="טלפון"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
          />

          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.membership_type}
            onChange={e => handleMembershipChange(e.target.value)}
          >
            <option value="2x_week">2× שבוע</option>
            <option value="4x_week">4× שבוע</option>
            <option value="unlimited">ללא הגבלה</option>
          </select>

          {/* Group checkboxes */}
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <p className="text-xs font-medium text-gray-600">
              שיעורים שבועיים — {limitLabel} ({form.group_ids.length} נבחרו)
            </p>
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400">טוען קבוצות...</p>
            ) : (
              classes.map(cls => {
                const selected = form.group_ids.includes(cls.id)
                const atLimit = !selected && form.group_ids.length >= limit
                return (
                  <label
                    key={cls.id}
                    className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer transition ${
                      selected ? 'bg-blue-50 text-blue-700' : atLimit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white text-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={atLimit}
                      onChange={() => toggleGroupId(cls.id)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span>{formatClassOption(cls)}</span>
                    {cls.hall && <span className="text-xs text-gray-400">({cls.hall})</span>}
                  </label>
                )
              })
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
              className="w-4 h-4"
            />
            מתאמן פעיל
          </label>

          {saveError && (
            <p className="text-red-500 text-xs bg-red-50 rounded p-2">{saveError}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">
              שמור
            </button>
            <button
              type="button"
              onClick={() => { setEditing(null); setSaveError('') }}
              className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען מתאמנים...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">👥</div>
          <p>לא נמצאו מתאמנים</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(a => (
            <li key={a.id} className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800">{a.full_name}</p>
                  {!a.active && (
                    <span className="text-xs bg-gray-100 text-gray-400 px-1.5 rounded">לא פעיל</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {a.group_name && <span>{a.group_name} · </span>}
                  {MEMBERSHIP_LABELS[a.membership_type || a.subscription_type] || '—'}
                  {a.phone && <span> · {a.phone}</span>}
                </p>
              </div>
              <button
                onClick={() => startEdit(a)}
                className="text-xs text-blue-600 hover:underline px-2 shrink-0"
              >
                עריכה
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
