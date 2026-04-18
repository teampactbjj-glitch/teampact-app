import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ImportAthletes from './ImportAthletes'

const MEMBERSHIP_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const SESSION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatClassOption(cls) {
  const day = typeof cls.day_of_week === 'number' ? DAYS_HE[cls.day_of_week] : (cls.day_of_week || '')
  const time = cls.start_time ? cls.start_time.slice(0, 5) : ''
  return [cls.name, day, time].filter(Boolean).join(' · ')
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  membership_type: '2x_week',
  group_ids: [],
  active: true,
  branch_ids: [],
}

export default function AthleteManagement({ trainerId, isAdmin, branchFilter = null, hideSchedule = false, registerLinkCard = null, onPendingChange = null }) {
  const [athletes, setAthletes] = useState([])
  const [pendingAthletes, setPendingAthletes] = useState([])
  const [branches, setBranches] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState('active')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    (async () => {
      const { data: all } = await supabase.from('branches').select('id, name').order('name')
      if (!all) return
      if (isAdmin || !trainerId) { setBranches(all); return }
      const { data: coaches } = await supabase.from('coaches').select('branch_id').eq('user_id', trainerId)
      const allowed = new Set((coaches || []).map(c => c.branch_id).filter(Boolean))
      setBranches(all.filter(b => allowed.has(b.id)))
    })()
  }, [isAdmin, trainerId])

  useEffect(() => { fetchAthletes() }, [trainerId, isAdmin])

  useEffect(() => {
    if (form.branch_ids.length > 0) fetchClasses(form.branch_ids)
    else setClasses([])
  }, [form.branch_ids])

  async function fetchClasses(branchIds) {
    const { data } = await supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, hall, class_type')
      .in('branch_id', branchIds)
      .order('day_of_week')
    setClasses(data || [])
  }

  async function fetchAthletes() {
    setLoading(true)

    // מאמן רגיל — סנן לסניפים שהוא מאמן בהם; admin רואה הכל
    let allowedBranchIds = null
    let myCoachIds = []
    let myCoachNames = []
    if (!isAdmin && trainerId) {
      const { data: coaches } = await supabase.from('coaches').select('id, branch_id, name').eq('user_id', trainerId)
      allowedBranchIds = [...new Set((coaches || []).map(c => c.branch_id).filter(Boolean))]
      myCoachIds   = (coaches || []).map(c => c.id).filter(Boolean)
      myCoachNames = (coaches || []).map(c => c.name).filter(Boolean)
    }

    const pendingQ = supabase.from('members').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    const activeQ  = supabase.from('members').select('*').neq('status', 'pending').order('full_name')

    const [{ data: pendingData }, { data, error }] = await Promise.all([pendingQ, activeQ])
    if (error) console.error('fetchAthletes error:', error)

    const matchesAllowed = (m) => {
      if (!allowedBranchIds) return true
      const bids = m.branch_ids?.length ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
      return bids.some(b => allowedBranchIds.includes(b))
    }

    // למאמן רגיל — pending רק של מי שבחר אותו כמאמן. unlimited למנהל בלבד
    const matchesPendingCoach = (m) => {
      if (isAdmin) return true
      if (m.subscription_type === 'unlimited') return false
      if (m.coach_id && myCoachIds.includes(m.coach_id)) return true
      if (m.requested_coach_name && myCoachNames.includes(m.requested_coach_name)) return true
      if (Array.isArray(m.requested_coach_names) && m.requested_coach_names.some(n => myCoachNames.includes(n))) return true
      return false
    }

    setPendingAthletes((pendingData || []).filter(m => matchesAllowed(m) && matchesPendingCoach(m)))
    setAthletes((data || []).filter(matchesAllowed))
    setLoading(false)
  }

  async function saveAthlete(e) {
    e.preventDefault()
    setSaveError('')
    const payload = {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      membership_type: form.membership_type,
      subscription_type: form.membership_type,
      group_ids: form.group_ids.length > 0 ? form.group_ids : null,
      group_id: form.group_ids[0] || null,
      active: form.active,
      branch_ids: form.branch_ids,
      branch_id: form.branch_ids[0] || null,
    }
    let error
    if (editing === 'new') {
      // מאמן מוסיף מתאמן = מאושר אוטומטית (לא pending)
      ;({ error } = await supabase.from('members').insert({ ...payload, status: 'approved' }))
    } else {
      ;({ error } = await supabase.from('members').update(payload).eq('id', editing))
    }
    if (error) { setSaveError(error.message); return }
    setEditing(null)
    fetchAthletes()
    onPendingChange?.()
  }

  async function deleteAthlete(id) {
    if (!window.confirm('למחוק את המתאמן לצמיתות?')) return
    await supabase.from('members').delete().eq('id', id)
    fetchAthletes()
  }

  async function approvePending(id) {
    const lead = pendingAthletes.find(a => a.id === id)
    await supabase.from('members').update({ status: 'approved', active: true }).eq('id', id)
    if (lead?.email) {
      supabase.functions.invoke('send-approval-email', {
        body: { email: lead.email, full_name: lead.full_name },
      }).catch(err => console.warn('send-approval-email skipped:', err?.message || err))
    }
    fetchAthletes()
    onPendingChange?.()
  }

  async function rejectPending(id) {
    await supabase.from('members').delete().eq('id', id)
    fetchAthletes()
    onPendingChange?.()
  }

  function toggleBranch(id) {
    setForm(p => {
      const already = p.branch_ids.includes(id)
      const next = already ? p.branch_ids.filter(b => b !== id) : [...p.branch_ids, id]
      return { ...p, branch_ids: next, group_ids: [] }
    })
  }

  function toggleGroupId(id) {
    const limit = SESSION_LIMITS[form.membership_type] ?? 2
    setForm(p => {
      const already = p.group_ids.includes(id)
      if (already) return { ...p, group_ids: p.group_ids.filter(g => g !== id) }
      if (p.group_ids.length >= limit) return p
      return { ...p, group_ids: [...p.group_ids, id] }
    })
  }

  function handleMembershipChange(val) {
    const newLimit = SESSION_LIMITS[val] ?? 2
    setForm(p => ({
      ...p,
      membership_type: val,
      group_ids: p.group_ids.slice(0, newLimit === Infinity ? undefined : newLimit),
    }))
  }

  function startEdit(athlete) {
    setSaveError('')
    const branchIds = athlete.branch_ids?.length
      ? athlete.branch_ids
      : athlete.branch_id ? [athlete.branch_id] : []
    setForm({
      full_name: athlete.full_name || '',
      email: athlete.email || '',
      phone: athlete.phone || '',
      membership_type: athlete.membership_type || athlete.subscription_type || '2x_week',
      group_ids: athlete.group_ids || (athlete.group_id ? [athlete.group_id] : []),
      active: athlete.active ?? true,
      branch_ids: branchIds,
    })
    setEditing(athlete.id)
  }

  function openAdd() {
    setSaveError('')
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  const limit = SESSION_LIMITS[form.membership_type] ?? 2
  const limitLabel = limit === Infinity ? 'בחר כמה שיעורים שתרצה' : `בחר עד ${limit} שיעורים`

  const filtered = athletes.filter(a =>
    (!branchFilter || (a.branch_ids || []).includes(branchFilter) || a.branch_id === branchFilter) &&
    (a.full_name?.includes(search) || a.email?.includes(search) || a.group_name?.includes(search))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">ניהול מתאמנים</h2>
        <div className="flex gap-2">
          <ImportAthletes onImported={fetchAthletes} />
          <button onClick={openAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
            + הוסף מתאמן
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button type="button" onClick={() => setSubTab('pending')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition relative ${subTab === 'pending' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
          ממתינים לאישור
          {pendingAthletes.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
              {pendingAthletes.length}
            </span>
          )}
        </button>
        <button type="button" onClick={() => setSubTab('active')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${subTab === 'active' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
          מתאמנים ({athletes.length})
        </button>
        {registerLinkCard && (
          <button type="button" onClick={() => setSubTab('link')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${subTab === 'link' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
            קישור הרשמה
          </button>
        )}
      </div>

      {subTab === 'active' && (
        <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="חיפוש לפי שם, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {editing && (
        <form onSubmit={saveAthlete} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="font-semibold text-gray-700">{editing === 'new' ? 'הוספת מתאמן' : 'עריכת מתאמן'}</h3>

          {/* Multi-branch selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">סניפים (ניתן לבחור יותר מאחד)</label>
            <div className="flex gap-2 flex-wrap">
              {branches.map(b => (
                <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.branch_ids.includes(b.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}>
                  {form.branch_ids.includes(b.id) ? '✓ ' : ''}{b.name}
                </button>
              ))}
            </div>
          </div>

          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שם מלא *"
            value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required />
          <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="אימייל"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="טלפון"
            value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />

          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.membership_type} onChange={e => handleMembershipChange(e.target.value)}>
            <option value="2x_week">2× שבוע</option>
            <option value="4x_week">4× שבוע</option>
            <option value="unlimited">ללא הגבלה</option>
          </select>

          {!hideSchedule && form.branch_ids.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">{limitLabel} ({form.group_ids.length} נבחרו)</p>
              {classes.length === 0 ? (
                <p className="text-xs text-gray-400">טוען שיעורים...</p>
              ) : (
                classes.map(cls => {
                  const selected = form.group_ids.includes(cls.id)
                  const atLimit = !selected && form.group_ids.length >= limit
                  return (
                    <label key={cls.id} className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer transition ${
                      selected ? 'bg-blue-50 text-blue-700' : atLimit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white text-gray-700'
                    }`}>
                      <input type="checkbox" checked={selected} disabled={atLimit}
                        onChange={() => toggleGroupId(cls.id)} className="w-4 h-4 accent-blue-600" />
                      <span>{formatClassOption(cls)}</span>
                    </label>
                  )
                })
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
            מתאמן פעיל
          </label>

          {saveError && <p className="text-red-500 text-xs bg-red-50 rounded p-2">{saveError}</p>}

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">שמור</button>
            <button type="button" onClick={() => { setEditing(null); setSaveError('') }}
              className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">ביטול</button>
          </div>
        </form>
      )}

      {subTab === 'link' && registerLinkCard}

      {subTab === 'pending' && (
        pendingAthletes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">✅</div>
            <p>אין נרשמים ממתינים לאישור</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pendingAthletes.map(a => {
              const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
              const bnames = bids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')
              return (
                <li key={a.id} className="bg-white rounded-xl border px-4 py-3 shadow-sm space-y-2">
                  <div>
                    <p className="font-semibold text-gray-800">{a.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {a.email && <span>{a.email} · </span>}
                      {a.phone && <span>{a.phone} · </span>}
                      {bnames && <span>📍 {bnames}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => approvePending(a.id)}
                      className="flex-1 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700">
                      ✓ אשר
                    </button>
                    <button type="button" onClick={() => rejectPending(a.id)}
                      className="flex-1 py-1.5 border border-red-300 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50">
                      ✕ דחה
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}

      {subTab === 'active' && (() => {
        // ספירה לכל סניף (לפני פילטר הסניף אבל אחרי חיפוש)
        const bySearch = athletes.filter(a =>
          !search.trim() ||
          a.full_name?.includes(search) || a.email?.includes(search) || a.group_name?.includes(search) || a.phone?.includes(search)
        )
        const branchCount = {}
        let noBranchCount = 0
        bySearch.forEach(a => {
          const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
          if (bids.length === 0) noBranchCount++
          else bids.forEach(bid => { branchCount[bid] = (branchCount[bid] || 0) + 1 })
        })

        // סינון סופי לפי סניף נבחר
        const finalList = bySearch.filter(a => {
          if (selectedBranch === 'all') return true
          if (selectedBranch === 'none') {
            const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
            return bids.length === 0
          }
          const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
          return bids.includes(selectedBranch)
        })

        return (
          <div className="space-y-3">
            {/* שורת chips לסינון לפי סניף */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              <style>{`.branch-chips::-webkit-scrollbar { display: none }`}</style>
              <button type="button" onClick={() => setSelectedBranch('all')}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                  selectedBranch === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>
                הכל ({bySearch.length})
              </button>
              {branches.map(b => {
                const count = branchCount[b.id] || 0
                const active = selectedBranch === b.id
                return (
                  <button key={b.id} type="button" onClick={() => setSelectedBranch(b.id)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}>
                    📍 {b.name} ({count})
                  </button>
                )
              })}
              {noBranchCount > 0 && (
                <button type="button" onClick={() => setSelectedBranch('none')}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                    selectedBranch === 'none'
                      ? 'bg-orange-500 text-white border-orange-500 shadow'
                      : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'
                  }`}>
                  ⚠️ ללא סניף ({noBranchCount})
                </button>
              )}
            </div>

            {/* הרשימה */}
            {loading ? (
              <p className="text-center text-gray-400 py-8">טוען מתאמנים...</p>
            ) : finalList.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">👥</div>
                <p>לא נמצאו מתאמנים</p>
              </div>
            ) : (
              <ul className="bg-white rounded-xl border shadow-sm divide-y overflow-hidden">
                {finalList.map(a => {
                  const bids = a.branch_ids?.length ? a.branch_ids : (a.branch_id ? [a.branch_id] : [])
                  const bnames = bids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')
                  return (
                    <li key={a.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-800 text-sm">{a.full_name}</p>
                          {!a.active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 rounded">לא פעיל</span>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {MEMBERSHIP_LABELS[a.membership_type || a.subscription_type] || '—'}
                          {a.phone && <span> · {a.phone}</span>}
                          {bnames && <span> · 📍 {bnames}</span>}
                        </p>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button onClick={() => startEdit(a)} className="text-xs text-blue-600 hover:underline">עריכה</button>
                        <button onClick={() => deleteAthlete(a.id)} className="text-xs text-red-400 hover:underline">מחק</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })()}
    </div>
  )
}
