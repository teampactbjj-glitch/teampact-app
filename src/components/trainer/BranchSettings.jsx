/**
 * BranchSettings — הגדרות סניף (מנהל בלבד)
 *
 * לכל סניף:
 *   - ניכוי מתנס % (platform_cut) — ברירת מחדל 0, גמיש לחלוטין
 *   - הוצאות קבועות (branch_fixed_expenses) — נטענות אוטומטית בדוח החודשי
 *   - הגדרות בעלים (branch_owner_settings) — שם + אחוז לכל שותף
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const fmt = n => '₪' + Number(n).toLocaleString('he-IL')

export default function BranchSettings({ isAdmin, onClose }) {
  if (!isAdmin) return (
    <div className="p-6 text-center text-red-600 font-bold" dir="rtl">
      ⛔ גישה מורשית למנהל בלבד
    </div>
  )

  const [branches,      setBranches]      = useState([])
  const [fixedExp,      setFixedExp]      = useState([])   // branch_fixed_expenses
  const [ownerSettings, setOwnerSettings] = useState([])   // branch_owner_settings
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [saving,        setSaving]        = useState(null)

  // עריכה inline
  const [editCut,   setEditCut]   = useState({}) // { branch_id: '40' }
  const [editOwner, setEditOwner] = useState({}) // { branch_id: { o1n,o1p,o2n,o2p } }
  const [newExp,    setNewExp]    = useState({}) // { branch_id: { label:'', amount:'' } }
  const [editExp,   setEditExp]   = useState({}) // { expense_id: { label, amount } }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [brRes, feRes, owRes] = await Promise.all([
      supabase.from('branches').select('id, name, platform_cut').order('name'),
      supabase.from('branch_fixed_expenses').select('id, branch_id, label, amount, active').order('label'),
      supabase.from('branch_owner_settings').select('branch_id, owner1_name, owner1_pct, owner2_name, owner2_pct'),
    ])
    const err = [brRes, feRes, owRes].find(r => r.error)?.error
    if (err) { setError(err.message); setLoading(false); return }
    setBranches(brRes.data      || [])
    setFixedExp(feRes.data      || [])
    setOwnerSettings(owRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── שמירת ניכוי מתנס ────────────────────────────────────

  async function saveCut(branchId) {
    const val = parseFloat(editCut[branchId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`cut-${branchId}`)
    const { error } = await supabase.from('branches')
      .update({ platform_cut: val }).eq('id', branchId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditCut(p => { const n = { ...p }; delete n[branchId]; return n })
    fetchAll()
  }

  // ─── הוצאות קבועות ───────────────────────────────────────

  async function addFixed(branchId) {
    const e = newExp[branchId]
    if (!e?.label?.trim() || !e?.amount) return
    const amount = parseFloat(e.amount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(`addexp-${branchId}`)
    const { error } = await supabase.from('branch_fixed_expenses').upsert(
      { branch_id: branchId, label: e.label.trim(), amount, active: true },
      { onConflict: 'branch_id,label' }
    )
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setNewExp(p => ({ ...p, [branchId]: { label: '', amount: '' } }))
    fetchAll()
  }

  async function saveExp(expId) {
    const e = editExp[expId]
    if (!e) return
    const amount = parseFloat(e.amount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(`exp-${expId}`)
    const { error } = await supabase.from('branch_fixed_expenses')
      .update({ label: e.label.trim(), amount }).eq('id', expId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditExp(p => { const n = { ...p }; delete n[expId]; return n })
    fetchAll()
  }

  async function toggleExp(exp) {
    await supabase.from('branch_fixed_expenses')
      .update({ active: !exp.active }).eq('id', exp.id)
    fetchAll()
  }

  async function deleteExp(id) {
    if (!window.confirm('למחוק הוצאה קבועה זו?')) return
    await supabase.from('branch_fixed_expenses').delete().eq('id', id)
    fetchAll()
  }

  // ─── הגדרות בעלים ────────────────────────────────────────

  async function saveOwner(branchId) {
    const e = editOwner[branchId]
    if (!e) return
    const o1p = parseFloat(e.o1p), o2p = parseFloat(e.o2p)
    if (isNaN(o1p) || isNaN(o2p) || Math.abs(o1p + o2p - 100) > 0.01) {
      alert('סכום האחוזים חייב להיות 100%'); return
    }
    setSaving(`owner-${branchId}`)
    const { error } = await supabase.from('branch_owner_settings').upsert(
      { branch_id: branchId, owner1_name: e.o1n || 'דודי', owner1_pct: o1p,
        owner2_name: e.o2n || 'מושיק', owner2_pct: o2p },
      { onConflict: 'branch_id' }
    )
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditOwner(p => { const n = { ...p }; delete n[branchId]; return n })
    fetchAll()
  }

  // ─── UI ──────────────────────────────────────────────────

  return (
    <div className="space-y-4" dir="rtl">

      {/* כותרת */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚙️</span>
          <h2 className="font-black text-gray-900 text-lg">הגדרות סניפים</h2>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-700 font-bold px-3 py-1 rounded-lg hover:bg-gray-100">
            ✕ סגור
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading && <div className="text-center text-gray-400 py-10 text-sm">טוען...</div>}

      {!loading && !error && branches.map(branch => {
        const bFixed  = fixedExp.filter(e => e.branch_id === branch.id)
        const ownerCfg = ownerSettings.find(o => o.branch_id === branch.id) || {
          owner1_name: 'דודי', owner1_pct: 50, owner2_name: 'מושיק', owner2_pct: 50,
        }
        const totalFixed = bFixed.filter(e => e.active).reduce((s, e) => s + Number(e.amount), 0)
        const isEditCut  = editCut[branch.id] !== undefined
        const isEditOwn  = editOwner[branch.id] !== undefined
        const eo         = editOwner[branch.id] || {}

        return (
          <div key={branch.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

            {/* ── כותרת סניף ── */}
            <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
              <span className="font-black text-white text-base">🏢 {branch.name}</span>
              {totalFixed > 0 && (
                <span className="text-xs text-gray-400">
                  הוצאות קבועות: <span className="text-red-300 font-bold">{fmt(totalFixed)}/חודש</span>
                </span>
              )}
            </div>

            <div className="p-4 space-y-5">

              {/* ── ניכוי מתנס ── */}
              <section>
                <div className="font-black text-gray-800 text-sm mb-1">ניכוי מתנס / חברת ניהול</div>
                <div className="text-xs text-gray-400 mb-3">
                  רלוונטי רק אם יש חברה חיצונית שלוקחת אחוז מהמנויים (כמו חברת בידור ובילוי).
                </div>

                {/* toggle */}
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={async () => {
                      const cur = branch.platform_cut ?? 0
                      const newVal = cur > 0 ? 0 : 40
                      await supabase.from('branches').update({ platform_cut: newVal }).eq('id', branch.id)
                      fetchAll()
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${(branch.platform_cut ?? 0) > 0 ? 'bg-orange-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                      ${(branch.platform_cut ?? 0) > 0 ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-gray-700">
                    {(branch.platform_cut ?? 0) > 0
                      ? <span className="font-semibold text-orange-700">פעיל — יש ניכוי</span>
                      : <span className="text-gray-500">לא פעיל — אין ניכוי לסניף זה</span>}
                  </span>
                </div>

                {/* שדה אחוז — רק כשפעיל */}
                {(branch.platform_cut ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">אחוז ניכוי:</span>
                    {!isEditCut ? (
                      <button
                        onClick={() => setEditCut(p => ({ ...p, [branch.id]: branch.platform_cut }))}
                        className="text-lg font-black text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-xl border border-orange-200"
                      >
                        {branch.platform_cut}%
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="1" max="100"
                          value={editCut[branch.id]}
                          onChange={e => setEditCut(p => ({ ...p, [branch.id]: e.target.value }))}
                          className="w-16 text-sm border border-blue-400 rounded-lg px-2 py-1.5 text-center font-bold"
                        />
                        <span className="text-sm text-gray-500">%</span>
                        <button onClick={() => saveCut(branch.id)} disabled={saving === `cut-${branch.id}`}
                          className="text-sm bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg">
                          {saving === `cut-${branch.id}` ? '...' : '✓ שמור'}
                        </button>
                        <button onClick={() => setEditCut(p => { const n={...p}; delete n[branch.id]; return n })}
                          className="text-sm bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">ביטול</button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <hr className="border-gray-100" />

              {/* ── הוצאות קבועות ── */}
              <section>
                <div className="font-black text-gray-800 text-sm mb-1">הוצאות קבועות חודשיות</div>
                <div className="text-xs text-gray-400 mb-3">
                  נטענות אוטומטית בכל חודש בדוח השכר. אפשר להשבית זמנית בלי למחוק.
                </div>

                {bFixed.length === 0 && (
                  <div className="text-xs text-gray-400 italic mb-3">אין הוצאות קבועות עדיין</div>
                )}

                <div className="space-y-2 mb-3">
                  {bFixed.map(exp => {
                    const isEdit = editExp[exp.id] !== undefined
                    const isSav  = saving === `exp-${exp.id}`
                    const ee     = editExp[exp.id] || {}

                    return (
                      <div key={exp.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 border
                          ${exp.active ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-200 opacity-50'}`}
                      >
                        {/* פעיל/מושבת */}
                        <button
                          onClick={() => toggleExp(exp)}
                          title={exp.active ? 'השבת' : 'הפעל'}
                          className={`text-base leading-none ${exp.active ? 'text-green-500' : 'text-gray-400'}`}
                        >
                          {exp.active ? '✅' : '⏸'}
                        </button>

                        {isEdit ? (
                          <>
                            <input type="text"
                              value={ee.label ?? exp.label}
                              onChange={e => setEditExp(p => ({ ...p, [exp.id]: { ...p[exp.id], label: e.target.value } }))}
                              className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5"
                            />
                            <input type="number"
                              value={ee.amount ?? exp.amount}
                              onChange={e => setEditExp(p => ({ ...p, [exp.id]: { ...p[exp.id], amount: e.target.value } }))}
                              className="w-24 text-sm border border-blue-300 rounded px-2 py-0.5 text-center"
                            />
                            <button onClick={() => saveExp(exp.id)} disabled={isSav}
                              className="text-xs bg-blue-600 text-white font-bold px-2 py-1 rounded">
                              {isSav ? '...' : '✓'}
                            </button>
                            <button onClick={() => setEditExp(p => { const n={...p}; delete n[exp.id]; return n })}
                              className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">✕</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium text-gray-700">{exp.label}</span>
                            <span className="text-sm font-black text-gray-800">{fmt(exp.amount)}</span>
                            <button
                              onClick={() => setEditExp(p => ({ ...p, [exp.id]: { label: exp.label, amount: exp.amount } }))}
                              className="text-xs text-blue-500 hover:text-blue-700 px-1"
                            >✏️</button>
                            <button onClick={() => deleteExp(exp.id)}
                              className="text-xs text-red-400 hover:text-red-600 px-1">🗑</button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* הוספת הוצאה קבועה */}
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="שם הוצאה (שכירות, חשמל, מים...)"
                    value={newExp[branch.id]?.label || ''}
                    onChange={e => setNewExp(p => ({ ...p, [branch.id]: { ...p[branch.id], label: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && addFixed(branch.id)}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="number" placeholder="₪"
                    value={newExp[branch.id]?.amount || ''}
                    onChange={e => setNewExp(p => ({ ...p, [branch.id]: { ...p[branch.id], amount: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && addFixed(branch.id)}
                    className="w-24 text-sm border border-gray-300 rounded-lg px-3 py-2 text-center focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    onClick={() => addFixed(branch.id)}
                    disabled={saving === `addexp-${branch.id}`}
                    className="text-sm bg-gray-900 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-lg whitespace-nowrap"
                  >
                    {saving === `addexp-${branch.id}` ? '...' : '+ הוסף'}
                  </button>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* ── הגדרות בעלים ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-black text-gray-800 text-sm">חלוקת רווח בין בעלים</div>
                    <div className="text-xs text-gray-400 mt-0.5">סכום האחוזים חייב להיות 100%</div>
                  </div>
                  {!isEditOwn ? (
                    <button
                      onClick={() => setEditOwner(p => ({
                        ...p, [branch.id]: {
                          o1n: ownerCfg.owner1_name, o1p: ownerCfg.owner1_pct,
                          o2n: ownerCfg.owner2_name, o2p: ownerCfg.owner2_pct,
                        }
                      }))}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                    >✏️ ערוך</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => saveOwner(branch.id)} disabled={saving === `owner-${branch.id}`}
                        className="text-xs bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg">
                        {saving === `owner-${branch.id}` ? '...' : '✓ שמור'}
                      </button>
                      <button onClick={() => setEditOwner(p => { const n={...p}; delete n[branch.id]; return n })}
                        className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">ביטול</button>
                    </div>
                  )}
                </div>

                {isEditOwn ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { nk: 'o1n', pk: 'o1p', placeholder: 'דודי' },
                      { nk: 'o2n', pk: 'o2p', placeholder: 'מושיק' },
                    ].map(({ nk, pk, placeholder }) => (
                      <div key={nk} className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <input type="text" placeholder={placeholder}
                          value={eo[nk] || ''}
                          onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [nk]: e.target.value } }))}
                          className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 font-semibold"
                        />
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" max="100" placeholder="50"
                            value={eo[pk] || ''}
                            onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [pk]: e.target.value } }))}
                            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center font-black"
                          />
                          <span className="text-gray-500">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: ownerCfg.owner1_name, pct: ownerCfg.owner1_pct },
                      { name: ownerCfg.owner2_name, pct: ownerCfg.owner2_pct },
                    ].map(({ name, pct }) => (
                      <div key={name} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="font-black text-gray-800">{name}</div>
                        <div className="text-2xl font-black text-blue-700 mt-1">{pct}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </div>
        )
      })}
    </div>
  )
}
