/**
 * AdminSettings — דף הגדרות מנהל
 * עיצוב: iOS Settings — רשימת שורות מקובצות לפי נושא,
 * כל שורה נפתחת inline בהקלקה. ללא טאבים מקוננים.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const fmt = n => '₪' + Number(n).toLocaleString('he-IL')

// ─── קומפוננטה ראשית ────────────────────────────────────────────────────────

export default function AdminSettings({ profile }) {
  const [branches,       setBranches]       = useState([])
  const [fixedExp,       setFixedExp]       = useState([])
  const [ownerSettings,  setOwnerSettings]  = useState([])
  const [appSettings,    setAppSettings]    = useState({ vat_rate: 18 })
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(null)

  // איזו שורה פתוחה
  const [expanded, setExpanded] = useState(null)
  function toggle(id) { setExpanded(p => (p === id ? null : id)) }

  // edit states
  const [editVatRate, setEditVatRate] = useState(null)
  const [editCut,     setEditCut]     = useState({})
  const [editOwner,   setEditOwner]   = useState({})
  const [newExp,      setNewExp]      = useState({})
  const [editExp,     setEditExp]     = useState({})

  // password
  const [newPw,    setNewPw]    = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showNew,  setShowNew]  = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg,    setPwMsg]    = useState(null)

  // email
  const [newEmail,    setNewEmail]    = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg,    setEmailMsg]    = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [brRes, feRes, owRes, asRes] = await Promise.all([
      supabase.from('branches').select('id, name, platform_cut').order('name'),
      supabase.from('branch_fixed_expenses').select('id, branch_id, label, amount, active').order('label'),
      supabase.from('branch_owner_settings').select('branch_id, owner1_name, owner1_pct, owner2_name, owner2_pct'),
      supabase.from('app_settings').select('vat_rate').eq('id', 1).maybeSingle(),
    ])
    setBranches(brRes.data      || [])
    setFixedExp(feRes.data      || [])
    setOwnerSettings(owRes.data || [])
    if (asRes.data) setAppSettings(asRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── שמירות ──────────────────────────────────────────────────────────────

  async function saveVatRate() {
    const val = parseFloat(editVatRate)
    if (isNaN(val) || val < 0 || val > 50) return
    setSaving('vat')
    await supabase.from('app_settings').update({ vat_rate: val }).eq('id', 1)
    setSaving(null); setEditVatRate(null); fetchAll()
  }

  async function saveCut(branchId) {
    const val = parseFloat(editCut[branchId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`cut-${branchId}`)
    await supabase.from('branches').update({ platform_cut: val }).eq('id', branchId)
    setSaving(null)
    setEditCut(p => { const n = { ...p }; delete n[branchId]; return n })
    fetchAll()
  }

  async function saveOwner(branchId) {
    const e = editOwner[branchId]
    const o1p = parseFloat(e.o1p), o2p = parseFloat(e.o2p)
    if (Math.abs(o1p + o2p - 100) > 0.01) { alert('סכום האחוזים חייב להיות 100%'); return }
    setSaving(`owner-${branchId}`)
    await supabase.from('branch_owner_settings').upsert(
      { branch_id: branchId, owner1_name: e.o1n || 'דודי', owner1_pct: o1p,
        owner2_name: e.o2n || 'מושיק', owner2_pct: o2p },
      { onConflict: 'branch_id' }
    )
    setSaving(null)
    setEditOwner(p => { const n = { ...p }; delete n[branchId]; return n })
    fetchAll()
  }

  async function addFixed(branchId) {
    const e = newExp[branchId]
    if (!e?.label?.trim() || !e?.amount) return
    const amount = parseFloat(e.amount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(`addexp-${branchId}`)
    await supabase.from('branch_fixed_expenses').upsert(
      { branch_id: branchId, label: e.label.trim(), amount, active: true },
      { onConflict: 'branch_id,label' }
    )
    setSaving(null)
    setNewExp(p => ({ ...p, [branchId]: { label: '', amount: '' } }))
    fetchAll()
  }

  async function saveExp(expId) {
    const e = editExp[expId]
    const amount = parseFloat(e.amount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(`exp-${expId}`)
    await supabase.from('branch_fixed_expenses').update({ label: e.label.trim(), amount }).eq('id', expId)
    setSaving(null)
    setEditExp(p => { const n = { ...p }; delete n[expId]; return n })
    fetchAll()
  }

  async function toggleExp(exp) {
    await supabase.from('branch_fixed_expenses').update({ active: !exp.active }).eq('id', exp.id)
    fetchAll()
  }

  async function deleteExp(id) {
    if (!window.confirm('למחוק הוצאה זו?')) return
    await supabase.from('branch_fixed_expenses').delete().eq('id', id)
    fetchAll()
  }

  async function updateEmail() {
    setEmailMsg(null)
    const trimmed = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailMsg({ ok: false, text: 'כתובת מייל לא תקינה' }); return }
    if (trimmed === (profile?.email || '').trim().toLowerCase()) { setEmailMsg({ ok: false, text: 'המייל זהה לנוכחי' }); return }
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    if (!error) {
      // עדכון תצוגה בפרופיל (לא חוסם)
      await supabase.from('profiles').update({ email: trimmed }).eq('id', profile.id)
    }
    setEmailSaving(false)
    if (error) { setEmailMsg({ ok: false, text: error.message }); return }
    setEmailMsg({ ok: true, text: 'נשלח קישור אימות לכתובת החדשה. ההתחברות תתעדכן רק אחרי לחיצה על הקישור — עד אז התחבר עם המייל הקודם.' })
    setNewEmail('')
  }

  async function updatePassword() {
    setPwMsg(null)
    if (!newPw || newPw.length < 6) { setPwMsg({ ok: false, text: 'לפחות 6 תווים' }); return }
    if (newPw !== confirm) { setPwMsg({ ok: false, text: 'הסיסמאות לא תואמות' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (error) { setPwMsg({ ok: false, text: error.message }); return }
    setPwMsg({ ok: true, text: 'הסיסמה עודכנה' })
    setNewPw(''); setConfirm('')
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="space-y-0 pb-8">

      {/* ── כרטיס מנהל ── */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl mb-6 px-5 py-4 flex items-center gap-4 shadow-md">
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-2xl shadow">
            🥋
          </div>
          <span className="absolute -bottom-1 -left-1 text-sm leading-none">👑</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-white text-base leading-tight truncate">{profile?.full_name || '—'}</div>
          <div className="text-gray-400 text-xs mt-0.5 truncate">{profile?.email}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-gray-300 font-medium">מנהל מערכת</span>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()}
          className="flex-shrink-0 text-gray-500 hover:text-red-400 transition-colors p-2 rounded-xl hover:bg-white/5"
          title="התנתק">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
        </button>
      </div>

      {/* ══ סעיף: חשבון ══ */}
      <SectionLabel>חשבון</SectionLabel>
      <Group>
        <Row icon="🔒" iconBg="bg-slate-600" label="שינוי סיסמה"
          open={expanded === 'password'} onToggle={() => toggle('password')}>
          <div className="space-y-3">
            <PwInput value={newPw} onChange={e => setNewPw(e.target.value)}
              show={showNew} toggle={() => setShowNew(s => !s)} placeholder="סיסמה חדשה (6+ תווים)" />
            <PwInput value={confirm} onChange={e => setConfirm(e.target.value)}
              show={showConf} toggle={() => setShowConf(s => !s)} placeholder="אישור סיסמה" />
            <ActionBtn onClick={updatePassword} loading={pwSaving}>עדכן סיסמה</ActionBtn>
            {pwMsg && <Msg ok={pwMsg.ok}>{pwMsg.text}</Msg>}
          </div>
        </Row>
        <Row icon="📧" iconBg="bg-blue-500" label="שינוי מייל"
          open={expanded === 'email'} onToggle={() => toggle('email')} isLast>
          <div className="space-y-3">
            <input
              type="email" dir="ltr" inputMode="email" autoComplete="email"
              value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className={inputCls + ' text-left'} />
            <ActionBtn onClick={updateEmail} loading={emailSaving}>עדכן מייל</ActionBtn>
            {emailMsg && <Msg ok={emailMsg.ok}>{emailMsg.text}</Msg>}
            <p className="text-[11px] text-gray-400">יישלח קישור אימות לכתובת החדשה. ההתחברות תתעדכן רק לאחר אישור הקישור.</p>
          </div>
        </Row>
      </Group>

      {/* ══ סעיף: מערכת ══ */}
      <SectionLabel>מערכת</SectionLabel>
      <Group>
        <Row icon="🧾" iconBg="bg-purple-500" label='מע"מ'
          value={loading ? '...' : `${appSettings.vat_rate}%`}
          open={expanded === 'vat'} onToggle={() => toggle('vat')} isLast>
          {editVatRate === null ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">שיעור מע"מ נוכחי:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-purple-700">{appSettings.vat_rate}%</span>
                <button onClick={() => setEditVatRate(String(appSettings.vat_rate))}
                  className="text-xs text-blue-600 font-semibold px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50">
                  ערוך
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="50" step="0.1"
                value={editVatRate} onChange={e => setEditVatRate(e.target.value)}
                className={inputCls + ' w-20 text-center font-black text-purple-700'} />
              <span className="text-sm text-gray-500 font-medium">%</span>
              <div className="flex gap-2 flex-1">
                <ActionBtn onClick={saveVatRate} loading={saving === 'vat'}>שמור</ActionBtn>
                <CancelBtn onClick={() => setEditVatRate(null)} />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">משפיע על חישוב שכר מאמנים עוסקים פטורים</p>
        </Row>
      </Group>

      {/* ══ סעיף: סניפים ══ */}
      <SectionLabel>סניפים</SectionLabel>
      {loading ? (
        <Group><div className="px-4 py-5 text-center text-sm text-gray-400">טוען...</div></Group>
      ) : (
        <Group>
          {branches.map((branch, i) => {
            const bFixed    = fixedExp.filter(e => e.branch_id === branch.id)
            const totalFixed = bFixed.filter(e => e.active).reduce((s, e) => s + Number(e.amount), 0)
            const ownerCfg  = ownerSettings.find(o => o.branch_id === branch.id) || { owner1_name: 'דודי', owner1_pct: 50, owner2_name: 'מושיק', owner2_pct: 50 }
            const isEditCut = editCut[branch.id] !== undefined
            const isEditOwn = editOwner[branch.id] !== undefined
            const eo        = editOwner[branch.id] || {}
            const rowId     = `branch-${branch.id}`

            const subtitle = [
              (branch.platform_cut ?? 0) > 0 ? `ניכוי ${branch.platform_cut}%` : null,
              totalFixed > 0 ? `הוצאות ${fmt(totalFixed)}` : null,
            ].filter(Boolean).join(' · ') || 'לחץ לעריכה'

            return (
              <Row key={branch.id} icon="🏢" iconBg="bg-blue-500"
                label={branch.name} value={subtitle}
                open={expanded === rowId} onToggle={() => toggle(rowId)}
                isLast={i === branches.length - 1}>

                <div className="space-y-5">

                  {/* ── ניכוי מתנס ── */}
                  <SubSection title="ניכוי מתנס / חברת ניהול"
                    hint="רלוונטי אם חברה חיצונית לוקחת אחוז מהמנויים">
                    <div className="flex items-center gap-3">
                      <Toggle
                        on={(branch.platform_cut ?? 0) > 0}
                        onToggle={async () => {
                          const cur = branch.platform_cut ?? 0
                          await supabase.from('branches').update({ platform_cut: cur > 0 ? 0 : 40 }).eq('id', branch.id)
                          fetchAll()
                        }}
                      />
                      <span className={`text-sm font-medium ${(branch.platform_cut ?? 0) > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                        {(branch.platform_cut ?? 0) > 0 ? `פעיל — ${branch.platform_cut}%` : 'לא פעיל'}
                      </span>
                      {(branch.platform_cut ?? 0) > 0 && !isEditCut && (
                        <button onClick={() => setEditCut(p => ({ ...p, [branch.id]: branch.platform_cut }))}
                          className="mr-auto text-xs text-blue-600 font-semibold px-2 py-1 border border-blue-200 rounded-lg">
                          ערוך %
                        </button>
                      )}
                    </div>
                    {isEditCut && (
                      <div className="flex items-center gap-2 mt-2">
                        <input type="number" min="1" max="100"
                          value={editCut[branch.id]}
                          onChange={e => setEditCut(p => ({ ...p, [branch.id]: e.target.value }))}
                          className={inputCls + ' w-20 text-center font-black text-orange-700'} />
                        <span className="text-sm text-gray-500">%</span>
                        <ActionBtn onClick={() => saveCut(branch.id)} loading={saving === `cut-${branch.id}`}>שמור</ActionBtn>
                        <CancelBtn onClick={() => setEditCut(p => { const n={...p}; delete n[branch.id]; return n })} />
                      </div>
                    )}
                  </SubSection>

                  {/* ── הוצאות קבועות ── */}
                  <SubSection title="הוצאות קבועות חודשיות"
                    hint="נטענות אוטומטית בדוח השכר. ניתן להשבית זמנית">
                    <div className="space-y-2 mb-2">
                      {bFixed.length === 0 && <p className="text-xs text-gray-400 italic">אין הוצאות עדיין</p>}
                      {bFixed.map(exp => {
                        const isEdit = editExp[exp.id] !== undefined
                        const ee     = editExp[exp.id] || {}
                        return (
                          <div key={exp.id}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-sm
                              ${exp.active ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-50'}`}>
                            <button onClick={() => toggleExp(exp)} className={exp.active ? 'text-emerald-500' : 'text-gray-400'}>
                              {exp.active ? '✅' : '⏸'}
                            </button>
                            {isEdit ? (
                              <>
                                <input type="text" value={ee.label ?? exp.label}
                                  onChange={e => setEditExp(p => ({ ...p, [exp.id]: { ...p[exp.id], label: e.target.value } }))}
                                  className="flex-1 border border-blue-300 rounded-lg px-2 py-0.5 text-sm" />
                                <input type="number" value={ee.amount ?? exp.amount}
                                  onChange={e => setEditExp(p => ({ ...p, [exp.id]: { ...p[exp.id], amount: e.target.value } }))}
                                  className="w-20 border border-blue-300 rounded-lg px-2 py-0.5 text-center text-sm" />
                                <button onClick={() => saveExp(exp.id)} disabled={saving === `exp-${exp.id}`}
                                  className="text-xs bg-blue-600 text-white font-bold px-2 py-1 rounded-lg">
                                  {saving === `exp-${exp.id}` ? '...' : '✓'}
                                </button>
                                <button onClick={() => setEditExp(p => { const n={...p}; delete n[exp.id]; return n })}
                                  className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg">✕</button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 font-medium text-gray-700">{exp.label}</span>
                                <span className="font-black text-gray-800">{fmt(exp.amount)}</span>
                                <button onClick={() => setEditExp(p => ({ ...p, [exp.id]: { label: exp.label, amount: exp.amount } }))}
                                  className="text-blue-500 hover:text-blue-700 text-xs px-1">✏️</button>
                                <button onClick={() => deleteExp(exp.id)}
                                  className="text-red-400 hover:text-red-600 text-xs px-1">🗑</button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-white">
                      <input type="text" placeholder="שם ההוצאה — שכירות, חשמל, אינטרנט, אפליקציה..."
                        value={newExp[branch.id]?.label || ''}
                        onChange={e => setNewExp(p => ({ ...p, [branch.id]: { ...p[branch.id], label: e.target.value } }))}
                        onKeyDown={e => e.key === 'Enter' && addFixed(branch.id)}
                        className={inputCls} />
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold select-none">₪</span>
                          <input type="number" placeholder="סכום חודשי"
                            value={newExp[branch.id]?.amount || ''}
                            onChange={e => setNewExp(p => ({ ...p, [branch.id]: { ...p[branch.id], amount: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && addFixed(branch.id)}
                            className={inputCls + ' pr-8'} />
                        </div>
                        <button onClick={() => addFixed(branch.id)} disabled={saving === `addexp-${branch.id}`}
                          className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-bold px-4 rounded-xl whitespace-nowrap">
                          {saving === `addexp-${branch.id}` ? '...' : '+ הוסף'}
                        </button>
                      </div>
                    </div>
                  </SubSection>

                  {/* ── חלוקת רווח בין בעלים ── */}
                  <SubSection title="חלוקת רווח בין בעלים"
                    hint="סכום האחוזים חייב להיות 100%">
                    {isEditOwn ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {[{ nk:'o1n', pk:'o1p', ph:'דודי' }, { nk:'o2n', pk:'o2p', ph:'מושיק' }].map(({ nk, pk, ph }) => (
                            <div key={nk} className="space-y-1.5">
                              <input type="text" placeholder={ph} value={eo[nk] || ''}
                                onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [nk]: e.target.value } }))}
                                className={inputCls} />
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" max="100" placeholder="50" value={eo[pk] || ''}
                                  onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [pk]: e.target.value } }))}
                                  className={inputCls + ' text-center font-black'} />
                                <span className="text-gray-500 text-sm">%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <ActionBtn onClick={() => saveOwner(branch.id)} loading={saving === `owner-${branch.id}`}>שמור</ActionBtn>
                          <CancelBtn onClick={() => setEditOwner(p => { const n={...p}; delete n[branch.id]; return n })} />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          {[
                            { name: ownerCfg.owner1_name, pct: ownerCfg.owner1_pct },
                            { name: ownerCfg.owner2_name, pct: ownerCfg.owner2_pct },
                          ].map(({ name, pct }) => (
                            <div key={name} className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
                              <div className="text-xs text-gray-500 font-medium">{name}</div>
                              <div className="text-xl font-black text-blue-700">{pct}%</div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => setEditOwner(p => ({
                          ...p, [branch.id]: { o1n: ownerCfg.owner1_name, o1p: ownerCfg.owner1_pct, o2n: ownerCfg.owner2_name, o2p: ownerCfg.owner2_pct }
                        }))} className="text-xs text-blue-600 font-semibold px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50">
                          ערוך
                        </button>
                      </div>
                    )}
                  </SubSection>

                </div>
              </Row>
            )
          })}
        </Group>
      )}

      {/* ── קישורים ── */}
      <div className="flex justify-center gap-6 pt-5 pb-2">
        <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
          className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1">
          🌐 teampact.co.il
        </a>
        <a href="/accessibility"
          className="text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1">
          ♿ נגישות
        </a>
      </div>
    </div>
  )
}

// ─── layout helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="px-1 pt-5 pb-1.5">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{children}</span>
    </div>
  )
}

function Group({ children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
      {children}
    </div>
  )
}

function Row({ icon, iconBg, label, value, open, onToggle, isLast, children }) {
  return (
    <div>
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-right">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${iconBg}`}>
          {icon}
        </span>
        <span className="flex-1 font-semibold text-gray-800 text-sm">{label}</span>
        {value && !open && (
          <span className="text-xs text-gray-400 font-medium truncate max-w-[120px]">{value}</span>
        )}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
          className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100 space-y-2">
          {children}
        </div>
      )}
    </div>
  )
}

function SubSection({ title, hint, children }) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-xs font-black text-gray-700 uppercase tracking-wide">{title}</div>
        {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onToggle }) {
  return (
    <button onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${on ? 'bg-orange-500' : 'bg-gray-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

// ─── form helpers ────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-400 focus:outline-none'

function ActionBtn({ onClick, loading, children }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-bold transition-colors">
      {loading ? '...' : children}
    </button>
  )
}

function CancelBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 py-2 rounded-xl text-sm font-medium transition-colors">
      ביטול
    </button>
  )
}

function Msg({ ok, children }) {
  return (
    <p className={`text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
      {ok ? '✓ ' : '✕ '}{children}
    </p>
  )
}

function EyeIcon({ open }) {
  return open
    ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
    : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
}

function PwInput({ value, onChange, show, toggle, placeholder }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} className={inputCls + ' pl-10'} />
      <button type="button" tabIndex={-1} onClick={toggle}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        <EyeIcon open={show} />
      </button>
    </div>
  )
}
