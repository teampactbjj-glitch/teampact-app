import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useConfirm } from '../a11y'

/**
 * CoachesManager — מסך ניהול מאמנים לאדמין בלבד
 *
 * תכולה:
 *  - בקשות מאמנים ממתינות (profiles עם role='trainer' ו-is_approved=false)
 *  - רשימת כל המאמנים הפעילים (coaches table)
 *  - הוספה ידנית של מאמן (בלי תהליך הרשמה)
 *  - עריכת שם / סניף של מאמן
 *  - החלפה רוחבית: כל השיעורים של מאמן X → מאמן Y במכה אחת
 *  - מחיקת מאמן (רק אם אין לו שיעורים פעילים)
 */
export default function CoachesManager({ profile, onChange }) {
  const confirm = useConfirm()
  // Bug 1.3: defense-in-depth — TrainerDashboard כבר חוסם, אבל לא סומכים על UI בלבד.
  const isAdmin = !!profile?.is_admin
  const [pendingTrainers, setPendingTrainers] = useState([])
  const [coaches, setCoaches] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }
  const [showAdd, setShowAdd] = useState(false)
  const [newCoach, setNewCoach] = useState({ name: '', branch_id: '' })
  const [replacing, setReplacing] = useState(null) // { fromCoach, toCoachId, scope: 'all'|'branch' }
  const [classCounts, setClassCounts] = useState({}) // { coach_id: count }
  const [phoneByUserId, setPhoneByUserId] = useState({}) // { user_id: phone }

  useEffect(() => { fetchAll() }, [])

  // Realtime: בקשת מאמן חדשה → ריענון אוטומטי
  useEffect(() => {
    const ch = supabase
      .channel('coach-approval-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coaches' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [pendingRes, coachesRes, branchesRes, classesRes, trainerProfilesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, phone, requested_branch_id, requested_branch_ids, created_at')
        .eq('role', 'trainer')
        .eq('is_approved', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('coaches')
        .select('id, name, branch_id, user_id, branches(name)')
        .order('name'),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('classes').select('coach_id').is('deleted_at', null),
      // טלפונים של כל המאמנים המאושרים — לקישור לפי user_id
      supabase
        .from('profiles')
        .select('id, phone')
        .eq('role', 'trainer')
        .eq('is_approved', true),
    ])
    setPendingTrainers(pendingRes.data || [])
    setCoaches(coachesRes.data || [])
    setBranches(branchesRes.data || [])
    // ספירת שיעורים פעילים לכל מאמן
    const counts = {}
    ;(classesRes.data || []).forEach(c => {
      if (!c.coach_id) return
      counts[c.coach_id] = (counts[c.coach_id] || 0) + 1
    })
    setClassCounts(counts)
    // מיפוי user_id → phone
    const phones = {}
    ;(trainerProfilesRes.data || []).forEach(p => { phones[p.id] = p.phone || '' })
    setPhoneByUserId(phones)
    setLoading(false)
    if (typeof onChange === 'function') onChange()
  }

  function showMsg(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  // ---------- קיבוץ מאמנים לפי שם — מאמן עם 2 סניפים = שורה אחת ----------
  const coachGroups = (() => {
    const map = new Map()
    for (const c of coaches) {
      const key = c.name
      if (!map.has(key)) map.set(key, { name: c.name, rows: [], totalClasses: 0, hasUser: false, userId: null, phone: '' })
      const g = map.get(key)
      g.rows.push(c)
      g.totalClasses += classCounts[c.id] || 0
      if (c.user_id) {
        g.hasUser = true
        if (!g.userId) g.userId = c.user_id
        if (!g.phone) g.phone = phoneByUserId[c.user_id] || ''
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'))
  })()

  // ---------- עדכון טלפון של מאמן (בטבלת profiles לפי user_id) ----------
  async function updateCoachPhone(userId, newPhone) {
    if (!userId) { showMsg('err', 'אין משתמש מקושר — לא ניתן לעדכן טלפון'); return }
    const trimmed = (newPhone || '').trim()
    if (trimmed && !/^[0-9 +\-()]{6,20}$/.test(trimmed)) {
      showMsg('err', 'מספר טלפון לא תקין (ספרות בלבד, 6-20 תווים)')
      return
    }
    setBusyId(`phone:${userId}`)
    const { data, error } = await supabase
      .from('profiles')
      .update({ phone: trimmed || null })
      .eq('id', userId)
      .select('id, phone')
    setBusyId(null)
    if (error) { showMsg('err', error.message); return }
    if (!data || data.length === 0) {
      showMsg('err', 'לא עודכן (0 שורות) — כנראה חוסר הרשאה (RLS). פנה למפתח.')
      return
    }
    showMsg('ok', trimmed ? 'הטלפון עודכן' : 'הטלפון הוסר')
    fetchAll()
  }

  // ---------- אישור / דחיית בקשת מאמן ----------
  async function approveTrainer(t) {
    setBusyId(t.id)
    // 1. מסמן is_approved=true ב-profiles
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', t.id)
    if (profErr) {
      setBusyId(null)
      showMsg('err', `שגיאה באישור: ${profErr.message}`)
      return
    }

    // 2. בונים רשימת סניפים מבוקשים — תומך בריבוי סניפים (requested_branch_ids)
    //    עם נפילה אחורה ל-requested_branch_id (יחיד) אם המערך לא קיים.
    const requestedIds = Array.isArray(t.requested_branch_ids) && t.requested_branch_ids.length > 0
      ? t.requested_branch_ids
      : (t.requested_branch_id ? [t.requested_branch_id] : [null])

    // 3. שולפים את כל רשומות coaches עם אותו שם — לזיהוי כפילויות
    const { data: existingRows } = await supabase
      .from('coaches')
      .select('id, user_id, branch_id')
      .eq('name', t.full_name)

    const existingByBranch = new Map()
    let unboundRow = null // רשומה שכבר קיימת עם השם, ללא user_id וללא סניף — נשתמש בה לראשון
    for (const row of (existingRows || [])) {
      if (row.branch_id) existingByBranch.set(row.branch_id, row)
      else if (!row.user_id && !unboundRow) unboundRow = row
    }

    // 4. לכל סניף — או שמעדכנים רשומה קיימת ל-user_id, או שיוצרים חדשה
    for (const branchId of requestedIds) {
      const existing = branchId ? existingByBranch.get(branchId) : null
      if (existing) {
        // הרשומה כבר קיימת לסניף הזה — רק לקשר ל-user_id (אם חסר)
        if (!existing.user_id) {
          await supabase.from('coaches').update({ user_id: t.id }).eq('id', existing.id)
        }
      } else if (unboundRow) {
        // ניצול רשומה קיימת ללא קישור — מעדכנים אותה לסניף הראשון
        await supabase.from('coaches').update({ user_id: t.id, branch_id: branchId || null }).eq('id', unboundRow.id)
        unboundRow = null
      } else {
        // יצירת רשומה חדשה
        await supabase.from('coaches').insert({
          name: t.full_name,
          user_id: t.id,
          branch_id: branchId || null,
        })
      }
    }

    setBusyId(null)
    showMsg('ok', `${t.full_name} אושר כמאמן (${requestedIds.filter(Boolean).length} סניפים)`)
    fetchAll()
  }

  async function rejectTrainer(t) {
    const ok = await confirm({ title: 'דחיית בקשה', message: `לדחות את הבקשה של ${t.full_name}? הפרופיל יימחק.`, confirmText: 'דחה ומחק', danger: true })
    if (!ok) return
    setBusyId(t.id)
    const { error } = await supabase.from('profiles').delete().eq('id', t.id)
    setBusyId(null)
    if (error) { showMsg('err', `שגיאה: ${error.message}`); return }
    showMsg('ok', 'הבקשה נדחתה')
    fetchAll()
  }

  // ---------- הוספת מאמן ידנית ----------
  async function addCoach() {
    const name = newCoach.name.trim()
    if (!name) { showMsg('err', 'נא להזין שם מאמן'); return }
    setBusyId('new')
    const { error } = await supabase.from('coaches').insert({
      name,
      branch_id: newCoach.branch_id || null,
    })
    setBusyId(null)
    if (error) { showMsg('err', `שגיאה: ${error.message}`); return }
    showMsg('ok', `${name} נוסף`)
    setNewCoach({ name: '', branch_id: '' })
    setShowAdd(false)
    fetchAll()
  }

  // ---------- עריכת שם / סניף של מאמן קיים ----------
  async function updateCoach(id, patch) {
    setBusyId(id)
    const { error } = await supabase.from('coaches').update(patch).eq('id', id)
    setBusyId(null)
    if (error) { showMsg('err', `שגיאה: ${error.message}`); return }
    showMsg('ok', 'עודכן')
    fetchAll()
  }

  // ---------- שינוי שם של כל הקבוצה (כל הסניפים של אותו מאמן) ----------
  async function renameCoachGroup(group, newName) {
    const trimmed = (newName || '').trim()
    if (!trimmed || trimmed === group.name) return
    setBusyId(`group:${group.name}`)
    const ids = group.rows.map(r => r.id)
    const { error: cErr } = await supabase.from('coaches').update({ name: trimmed }).in('id', ids)
    if (cErr) { setBusyId(null); showMsg('err', cErr.message); return }
    // עדכון coach_name בשיעורים — לא חובה אבל שומר עקביות
    await supabase.from('classes').update({ coach_name: trimmed }).in('coach_id', ids)
    setBusyId(null)
    showMsg('ok', 'השם עודכן')
    fetchAll()
  }

  // ---------- הוספת סניף נוסף למאמן קיים (יוצר שורה חדשה עם אותו שם) ----------
  async function addBranchToCoach(group, branchId) {
    if (!branchId) return
    // לא לאפשר כפילות — אם הסניף כבר קיים אצלו
    if (group.rows.some(r => r.branch_id === branchId)) {
      showMsg('err', 'המאמן כבר משוייך לסניף הזה')
      return
    }
    const userId = group.rows.find(r => r.user_id)?.user_id || null
    setBusyId(`group:${group.name}`)
    const { error } = await supabase.from('coaches').insert({
      name: group.name,
      branch_id: branchId,
      user_id: userId,
    })
    setBusyId(null)
    if (error) { showMsg('err', error.message); return }
    showMsg('ok', 'הסניף נוסף למאמן')
    fetchAll()
  }

  // ---------- מחיקת שיוך-סניף יחיד של מאמן ----------
  async function deleteCoachRow(coachId) {
    const cnt = classCounts[coachId] || 0
    if (cnt > 0) {
      showMsg('err', `אי אפשר להסיר — יש ${cnt} שיעורים פעילים בסניף הזה. השתמש ב"החלף" קודם.`)
      return
    }
    const ok = await confirm({ title: 'הסרת שיוך', message: 'להסיר את שיוך הסניף הזה למאמן?', confirmText: 'הסר', danger: true })
    if (!ok) return
    setBusyId(coachId)
    const { error } = await supabase.from('coaches').delete().eq('id', coachId)
    setBusyId(null)
    if (error) { showMsg('err', error.message); return }
    showMsg('ok', 'הסניף הוסר')
    fetchAll()
  }

  // ---------- החלפה רוחבית: כל השיעורים של קבוצת מאמן (כל הסניפים) → מאמן יעד ----------
  // הלוגיקה: לכל שורת המקור (המאמן בסניף X), אנחנו מחפשים שורת יעד עם אותו סניף.
  // אם אין — נשארים על שורת היעד הראשונה (לא אידיאלי אבל לא שובר).
  async function performReplace() {
    if (!replacing) return
    const { fromGroup, toCoachId } = replacing
    const toCoach = coaches.find(c => c.id === toCoachId)
    if (!toCoach) { showMsg('err', 'לא נבחר מאמן יעד'); return }
    // לא לאפשר העברה לאותה קבוצה
    if (fromGroup.rows.some(r => r.id === toCoach.id)) {
      showMsg('err', 'מאמן היעד הוא אותו מאמן')
      return
    }
    const ok = await confirm({ title: 'העברת שיעורים', message: `להעביר את כל ${fromGroup.totalClasses} השיעורים של ${fromGroup.name} אל ${toCoach.name}?`, confirmText: 'העבר' })
    if (!ok) return

    setBusyId(`group:${fromGroup.name}`)
    const fromIds = fromGroup.rows.map(r => r.id)
    const { error } = await supabase
      .from('classes')
      .update({ coach_id: toCoach.id, coach_name: toCoach.name })
      .in('coach_id', fromIds)
      .is('deleted_at', null)
    setBusyId(null)
    if (error) { showMsg('err', `שגיאה: ${error.message}`); return }
    showMsg('ok', `השיעורים הועברו ל-${toCoach.name}`)
    setReplacing(null)
    fetchAll()
  }

  // ---------- מחיקת מאמן ----------
  async function deleteCoach(c) {
    const cnt = classCounts[c.id] || 0
    if (cnt > 0) {
      showMsg('err', `אי אפשר למחוק — יש ${cnt} שיעורים פעילים. השתמש ב"החלף" קודם.`)
      return
    }
    const ok = await confirm({ title: 'מחיקת מאמן', message: `למחוק את המאמן ${c.name}? הפעולה לא הפיכה.`, confirmText: 'מחק', danger: true })
    if (!ok) return
    setBusyId(c.id)
    const { error } = await supabase.from('coaches').delete().eq('id', c.id)
    setBusyId(null)
    if (error) { showMsg('err', `שגיאה: ${error.message}`); return }
    showMsg('ok', 'המאמן נמחק')
    fetchAll()
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border p-6 text-center text-gray-500" dir="rtl">
        ניהול מאמנים זמין למנהל בלבד.
      </div>
    )
  }
  if (loading) return <div className="text-center text-gray-400 py-8">טוען...</div>

  return (
    <div className="space-y-4" dir="rtl">
      {msg && (
        <div className={`rounded-xl px-4 py-2 text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* בקשות ממתינות */}
      <section className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
            <span>🆕</span>
            בקשות מאמנים חדשות
            {pendingTrainers.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {pendingTrainers.length}
              </span>
            )}
          </h2>
        </div>
        {pendingTrainers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">אין בקשות ממתינות</p>
        ) : (
          <div className="space-y-2">
            {pendingTrainers.map(t => {
              // תומך גם במערך (requested_branch_ids) וגם בשדה הישן (requested_branch_id)
              const requestedIds = Array.isArray(t.requested_branch_ids) && t.requested_branch_ids.length > 0
                ? t.requested_branch_ids
                : (t.requested_branch_id ? [t.requested_branch_id] : [])
              const requestedBranchNames = requestedIds
                .map(id => branches.find(b => b.id === id)?.name)
                .filter(Boolean)
              return (
                <div key={t.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3">
                  <div className="font-bold text-gray-800">{t.full_name}</div>
                  <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                    <div>📧 {t.email}</div>
                    {t.phone && <div>📱 {t.phone}</div>}
                    {requestedBranchNames.length > 0 && (
                      <div>
                        📍 ביקש שיוך {requestedBranchNames.length === 1 ? 'לסניף' : `ל-${requestedBranchNames.length} סניפים`}: {requestedBranchNames.join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => approveTrainer(t)}
                      disabled={busyId === t.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      {busyId === t.id ? '...' : '✓ אשר'}
                    </button>
                    <button
                      onClick={() => rejectTrainer(t)}
                      disabled={busyId === t.id}
                      className="flex-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      ✕ דחה
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* קישור הרשמה למאמן */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🔗</span>
          <h3 className="font-black text-sm">קישור הרשמה למאמנים חדשים</h3>
        </div>
        <p className="text-xs text-blue-100 mb-3">שלח את הקישור הזה רק למאמנים שאתה רוצה להוסיף — הם ימלאו פרטים ויחכו לאישור שלך.</p>
        <RegisterCoachLink />
      </section>

      {/* רשימת מאמנים פעילים + הוספה */}
      <section className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
            <span>👥</span>
            מאמנים פעילים ({coachGroups.length})
          </h2>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold"
          >
            {showAdd ? 'ביטול' : '+ הוסף ידנית'}
          </button>
        </div>

        {showAdd && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="שם מאמן"
              value={newCoach.name}
              onChange={e => setNewCoach(p => ({ ...p, name: e.target.value }))}
            />
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={newCoach.branch_id}
              onChange={e => setNewCoach(p => ({ ...p, branch_id: e.target.value }))}
            >
              <option value="">ללא סניף</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={addCoach}
              disabled={busyId === 'new'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {busyId === 'new' ? '...' : 'שמור מאמן'}
            </button>
            <p className="text-xs text-gray-500">
              הוספה ידנית = רשומת מאמן בלי משתמש Auth. הוא לא יוכל להיכנס לאפליקציה עד שיירשם דרך קישור ההרשמה.
            </p>
          </div>
        )}

        {coachGroups.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">אין מאמנים</p>
        ) : (
          <div className="space-y-2">
            {coachGroups.map(group => (
              <CoachGroupRow
                key={group.name}
                group={group}
                branches={branches}
                classCounts={classCounts}
                busyId={busyId}
                onRenameAll={(newName) => renameCoachGroup(group, newName)}
                onAddBranch={(branchId) => addBranchToCoach(group, branchId)}
                onRemoveBranch={(coachId) => deleteCoachRow(coachId)}
                onStartReplaceAll={() => setReplacing({ fromGroup: group, toCoachId: '', scope: 'all' })}
                onUpdatePhone={(newPhone) => updateCoachPhone(group.userId, newPhone)}
              />
            ))}
          </div>
        )}
      </section>

      {/* מודאל החלפה */}
      {replacing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setReplacing(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-gray-800">החלפת מאמן בכל השיעורים</h3>
            <p className="text-sm text-gray-600">
              העברה מ-<strong>{replacing.fromGroup.name}</strong> ({replacing.fromGroup.totalClasses} שיעורים) אל:
            </p>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={replacing.toCoachId}
              onChange={e => setReplacing(r => ({ ...r, toCoachId: e.target.value }))}
            >
              <option value="">בחר מאמן יעד</option>
              {coaches.filter(c => !replacing.fromGroup.rows.some(r => r.id === c.id)).map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.branches?.name ? ` — ${c.branches.name}` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2 pt-2">
              <button
                onClick={performReplace}
                disabled={!replacing.toCoachId || busyId === `group:${replacing.fromGroup.name}`}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {busyId === `group:${replacing.fromGroup.name}` ? '...' : 'אשר החלפה'}
              </button>
              <button
                onClick={() => setReplacing(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-bold"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- שורת קבוצת מאמן (מאוחד לפי שם) ----------
function CoachGroupRow({ group, branches, classCounts, busyId, onRenameAll, onAddBranch, onRemoveBranch, onStartReplaceAll, onUpdatePhone }) {
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(group.name)
  const [adding, setAdding] = useState(false)
  const [newBranchId, setNewBranchId] = useState('')
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState(group.phone || '')

  const groupBusy = busyId === `group:${group.name}`
  const phoneBusy = busyId === `phone:${group.userId}`

  // סניפים שעדיין לא משויכים לקבוצה
  const usedBranchIds = new Set(group.rows.map(r => r.branch_id).filter(Boolean))
  const availableBranches = branches.filter(b => !usedBranchIds.has(b.id))

  return (
    <div className="border rounded-xl p-3 hover:bg-gray-50 transition">
      {/* כותרת — שם המאמן */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex gap-1.5">
              <input
                className="flex-1 border rounded-lg px-2 py-1 text-sm"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
              <button
                onClick={() => { onRenameAll(newName); setRenaming(false) }}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-bold"
              >שמור</button>
              <button
                onClick={() => { setRenaming(false); setNewName(group.name) }}
                className="text-xs bg-gray-100 px-2 py-1 rounded font-bold"
              >ביטול</button>
            </div>
          ) : (
            <div className="font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              <span>{group.name}</span>
              {group.hasUser ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">מחובר</span>
              ) : (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">ללא משתמש</span>
              )}
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">📋 {group.totalClasses} שיעורים</span>
            </div>
          )}
        </div>
        {!renaming && (
          <button
            onClick={() => setRenaming(true)}
            disabled={groupBusy}
            className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded font-medium"
          >שנה שם</button>
        )}
      </div>

      {/* רשימת סניפים — כל סניף עם כפתור הסרה */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {group.rows.length === 0 ? (
          <span className="text-xs text-gray-400">ללא סניפים</span>
        ) : (
          group.rows.map(row => {
            const branchName = row.branches?.name || branches.find(b => b.id === row.branch_id)?.name || 'ללא סניף'
            const cnt = classCounts[row.id] || 0
            return (
              <span
                key={row.id}
                className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-1"
              >
                📍 {branchName}
                {cnt > 0 && <span className="text-[10px] text-gray-500">({cnt})</span>}
                <button
                  onClick={() => onRemoveBranch(row.id)}
                  disabled={busyId === row.id || cnt > 0}
                  className="text-blue-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={cnt > 0 ? `יש ${cnt} שיעורים — קודם החלף או מחק את השיעורים` : 'הסר את הסניף הזה'}
                >✕</button>
              </span>
            )
          })
        )}
      </div>

      {/* טלפון — רק אם המאמן מקושר ל-user (יש user_id) */}
      {group.hasUser && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-gray-500 shrink-0">📱 טלפון:</span>
          {editingPhone ? (
            <>
              <input
                type="tel"
                dir="ltr"
                inputMode="tel"
                className="flex-1 border rounded-lg px-2 py-1 text-xs text-left"
                value={phoneDraft}
                onChange={e => setPhoneDraft(e.target.value)}
                placeholder="050-1234567"
                autoFocus
              />
              <button
                onClick={() => { onUpdatePhone(phoneDraft); setEditingPhone(false) }}
                disabled={phoneBusy}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-bold disabled:opacity-50"
              >שמור</button>
              <button
                onClick={() => { setEditingPhone(false); setPhoneDraft(group.phone || '') }}
                className="text-xs bg-gray-100 px-2 py-1 rounded font-bold"
              >ביטול</button>
            </>
          ) : (
            <>
              <span dir="ltr" className={`flex-1 ${group.phone ? 'text-gray-800 font-mono' : 'text-gray-400 italic'}`}>
                {group.phone || 'לא הוזן'}
              </span>
              <button
                onClick={() => { setPhoneDraft(group.phone || ''); setEditingPhone(true) }}
                disabled={phoneBusy}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded font-medium disabled:opacity-50"
              >{group.phone ? 'ערוך' : '+ הוסף'}</button>
            </>
          )}
        </div>
      )}

      {/* הוספת סניף + פעולות */}
      {adding ? (
        <div className="flex gap-1.5 mb-2">
          <select
            className="flex-1 border rounded-lg px-2 py-1 text-sm"
            value={newBranchId}
            onChange={e => setNewBranchId(e.target.value)}
            autoFocus
          >
            <option value="">בחר סניף</option>
            {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button
            onClick={() => { if (newBranchId) { onAddBranch(newBranchId); setAdding(false); setNewBranchId('') } }}
            disabled={!newBranchId || groupBusy}
            className="text-xs bg-emerald-600 text-white px-2 py-1 rounded font-bold disabled:opacity-50"
          >הוסף</button>
          <button
            onClick={() => { setAdding(false); setNewBranchId('') }}
            className="text-xs bg-gray-100 px-2 py-1 rounded font-bold"
          >ביטול</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setAdding(true)}
            disabled={groupBusy || availableBranches.length === 0}
            className="flex-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 py-1.5 rounded font-bold disabled:opacity-40"
            title={availableBranches.length === 0 ? 'המאמן כבר בכל הסניפים' : 'הוסף שיוך לסניף נוסף'}
          >➕ הוסף סניף</button>
          <button
            onClick={onStartReplaceAll}
            disabled={groupBusy || group.totalClasses === 0}
            className="flex-1 text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 py-1.5 rounded font-bold disabled:opacity-40"
            title={group.totalClasses === 0 ? 'אין שיעורים להעברה' : 'העברת כל השיעורים למאמן אחר'}
          >🔄 החלף בכל השיעורים</button>
        </div>
      )}
    </div>
  )
}

// ---------- כרטיס קישור הרשמה למאמן ----------
function RegisterCoachLink() {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/register-coach` : '/register-coach'
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { prompt('העתק את הקישור:', url) }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'הצטרפות ל-TeamPact כמאמן', text: 'הירשם כמאמן חדש', url }) } catch {}
    } else { copy() }
  }
  function sendWhatsapp() {
    const text = encodeURIComponent(`היי, הוזמנת להצטרף ל-TeamPact כמאמן. הירשם כאן: ${url}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <>
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg px-3 py-2 text-xs font-mono break-all mb-2">{url}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={copy} className="bg-white text-blue-700 hover:bg-blue-50 font-bold py-2 rounded-lg text-sm">
          {copied ? '✓ הועתק' : '📋 העתק'}
        </button>
        <button onClick={share} className="bg-blue-900 hover:bg-blue-950 text-white font-bold py-2 rounded-lg text-sm">
          📤 שתף
        </button>
        <button onClick={sendWhatsapp} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-sm">
          💬 וואטסאפ
        </button>
        <button onClick={() => setShowQr(s => !s)} className="bg-blue-900/60 hover:bg-blue-900/80 text-white font-bold py-2 rounded-lg text-sm">
          {showQr ? '▲ סגור QR' : '📱 הצג QR'}
        </button>
      </div>
      {showQr && (
        <div className="mt-3 bg-white rounded-lg p-3 flex flex-col items-center">
          <img src={qrSrc} alt="QR להרשמת מאמן" className="w-48 h-48" />
          <p className="text-xs text-gray-600 mt-2 text-center">סרוק את הקוד כדי להגיע ישירות לטופס ההרשמה</p>
        </div>
      )}
    </>
  )
}
