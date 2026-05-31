/**
 * SalaryReport — דוח שכר חודשי למאמנים + חלוקת רווח לבעלים
 * גישה: מנהל בלבד (isAdmin נאכף ב-TrainerDashboard לפני רינדור)
 *
 * זרימת חישוב:
 *   הכנסות (מנויים פעילים) → נטו (אחרי ניכוי מתנס) → שכר מאמנים → הוצאות → רווח נקי → חלוקה לבעלים
 *
 * נוסחת שכר מאמן:
 *   מחיר_מנוי × (1 − platform_cut%) × payment_rate% × (אימונים_אצלו ÷ סה"כ_אימוני_מתאמן)
 *
 * חלוקה לפי סניף: כל סניף עם platform_cut + הגדרות בעלים משלו.
 * אין זליגה: class_id → branch_id — אין שיוך ידני.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

// ─── קבועים ──────────────────────────────────────────────────

const SUB_PRICE = {
  '1x_week':   200,
  '2x_week':   365,
  '4x_week':   500,
  'unlimited': 600,
}

const SUB_LABELS = {
  '1x_week':   '1× שבוע',
  '2x_week':   '2× שבוע',
  '4x_week':   '4× שבוע',
  'unlimited': 'ללא הגבלה',
}

// ─── עזרים ───────────────────────────────────────────────────

const fmt = n => '₪' + Math.round(n).toLocaleString('he-IL')
const pct = n => Math.round(n * 100) + '%'

function monthLabel(year, month) {
  return new Date(year, month - 1, 1)
    .toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })
}

function recentMonths(n = 6) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to   = `${year}-${String(month).padStart(2, '0')}-${last}`
  return { from, to }
}

// ─── קומפוננט ראשי ───────────────────────────────────────────

export default function SalaryReport({ isAdmin }) {
  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-red-600 font-bold" dir="rtl">
        ⛔ גישה מורשית למנהל בלבד
      </div>
    )
  }

  const months = useMemo(() => recentMonths(6), [])
  const [selectedMonth, setSelectedMonth] = useState(months[0])
  const [branchFilter,  setBranchFilter]  = useState('all')

  // נתונים
  const [coaches,       setCoaches]       = useState([])
  const [checkins,      setCheckins]      = useState([])
  const [classes,       setClasses]       = useState([])
  const [members,       setMembers]       = useState([])
  const [branches,      setBranches]      = useState([])
  const [ownerSettings, setOwnerSettings] = useState([]) // branch_owner_settings
  const [expenses,      setExpenses]      = useState([]) // branch_monthly_expenses (משתנות)
  const [fixedExp,      setFixedExp]      = useState([]) // branch_fixed_expenses (קבועות)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  // עריכה inline
  const [editCoachRate,   setEditCoachRate]   = useState({})
  const [editPlatformCut, setEditPlatformCut] = useState({})
  const [editOwner,       setEditOwner]       = useState({}) // { branch_id: { o1n, o1p, o2n, o2p } }
  const [saving,          setSaving]          = useState(null)

  // הוצאות — הזנה ידנית
  const [newExpense, setNewExpense] = useState({}) // { branch_id: { label:'', amount:'' } }

  // ─── שליפת נתונים ─────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { from, to } = monthRange(selectedMonth.year, selectedMonth.month)

    const [coachesRes, checkinsRes, classesRes, membersRes, branchesRes, ownerRes, expRes, fixedRes] =
      await Promise.all([
        supabase.from('coaches').select('id, name, branch_id, payment_rate').order('name'),

        supabase
          .from('checkins')
          .select('class_id, athlete_id, checkin_date, status')
          .gte('checkin_date', from)
          .lte('checkin_date', to)
          .eq('status', 'present'),

        supabase.from('classes').select('id, coach_id, branch_id').is('deleted_at', null),

        supabase.from('members').select('id, full_name, subscription_type').eq('active', true),

        supabase.from('branches').select('id, name, platform_cut').order('name'),

        supabase
          .from('branch_owner_settings')
          .select('branch_id, owner1_name, owner1_pct, owner2_name, owner2_pct'),

        supabase
          .from('branch_monthly_expenses')
          .select('id, branch_id, year, month, label, amount')
          .eq('year',  selectedMonth.year)
          .eq('month', selectedMonth.month),

        supabase
          .from('branch_fixed_expenses')
          .select('id, branch_id, label, amount, active')
          .eq('active', true),
      ])

    const err = [coachesRes, checkinsRes, classesRes, membersRes, branchesRes, ownerRes, expRes, fixedRes]
      .find(r => r.error)?.error
    if (err) { setError(err.message); setLoading(false); return }

    setCoaches(coachesRes.data       || [])
    setCheckins(checkinsRes.data     || [])
    setClasses(classesRes.data       || [])
    setMembers(membersRes.data       || [])
    setBranches(branchesRes.data     || [])
    setOwnerSettings(ownerRes.data   || [])
    setExpenses(expRes.data          || [])
    setFixedExp(fixedRes.data        || [])
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── חישוב שכר מאמנים ─────────────────────────────────────

  const { salaryData, revenueByBranch, coachSalaryByBranch } = useMemo(() => {
    const classById  = new Map(classes.map(c  => [c.id, c]))
    const memberById = new Map(members.map(m  => [m.id, m]))
    const branchById = new Map(branches.map(b => [b.id, b]))

    // צבירת נוכחויות: מאמן → סניף → מתאמן → ספירה
    const coachBranchAthleteCheckins = new Map()
    // סה"כ נוכחויות מתאמן בחודש
    const athleteTotalCheckins = new Map()
    // הכנסות לפי סניף (מבוססות על מנויים שהגיעו)
    const revenueByBranch = new Map()   // branch_id → Set<athlete_id>

    for (const chk of checkins) {
      const cls = classById.get(chk.class_id)
      if (!cls?.coach_id || !cls?.branch_id) continue
      const { coach_id, branch_id } = cls

      // מאמן → סניף → מתאמן
      if (!coachBranchAthleteCheckins.has(coach_id))
        coachBranchAthleteCheckins.set(coach_id, new Map())
      const byBranch = coachBranchAthleteCheckins.get(coach_id)
      if (!byBranch.has(branch_id))
        byBranch.set(branch_id, new Map())
      const byAthlete = byBranch.get(branch_id)
      byAthlete.set(chk.athlete_id, (byAthlete.get(chk.athlete_id) || 0) + 1)

      // סה"כ מתאמן
      athleteTotalCheckins.set(chk.athlete_id,
        (athleteTotalCheckins.get(chk.athlete_id) || 0) + 1)

      // מתאמנים ייחודיים לפי סניף (לחישוב הכנסות)
      if (!revenueByBranch.has(branch_id))
        revenueByBranch.set(branch_id, new Set())
      revenueByBranch.get(branch_id).add(chk.athlete_id)
    }

    // הכנסות גולמיות לפי סניף (מנוי × מתאמנים ייחודיים שהגיעו)
    const revenueMap = new Map()
    for (const [branchId, athleteSet] of revenueByBranch) {
      let rev = 0
      for (const aid of athleteSet) {
        const m = memberById.get(aid)
        rev += SUB_PRICE[m?.subscription_type] || 0
      }
      revenueMap.set(branchId, rev)
    }

    // חישוב שכר לכל מאמן
    const coachSalaryByBranch = new Map() // branch_id → total coach salary
    const salaryData = coaches.map(coach => {
      const coachRate = (coach.payment_rate ?? 50) / 100
      const byBranch  = coachBranchAthleteCheckins.get(coach.id) || new Map()

      const branchBreakdowns = []
      let totalSalary = 0

      for (const [branchId, byAthlete] of byBranch) {
        const branch  = branchById.get(branchId)
        const cutPct  = branch?.platform_cut ?? 40
        const netRate = 1 - cutPct / 100

        let branchSalary = 0
        const athletes = []

        for (const [athleteId, sessionsHere] of byAthlete) {
          const member = memberById.get(athleteId)
          if (!member) continue
          const price = SUB_PRICE[member.subscription_type]
          if (!price) continue

          const totalSessions = athleteTotalCheckins.get(athleteId) || 1
          const fraction      = sessionsHere / totalSessions
          const salary        = price * netRate * coachRate * fraction

          branchSalary += salary
          athletes.push({ athleteId, name: member.full_name, subType: member.subscription_type,
            price, sessionsHere, totalSessions, fraction, salary })
        }

        athletes.sort((a, b) => b.salary - a.salary)
        totalSalary += branchSalary

        // צבור שכר מאמנים לפי סניף
        coachSalaryByBranch.set(branchId,
          (coachSalaryByBranch.get(branchId) || 0) + branchSalary)

        branchBreakdowns.push({
          branchId, branchName: branch?.name || '?',
          cutPct, branchSalary, athleteCount: byAthlete.size, athletes,
        })
      }

      branchBreakdowns.sort((a, b) => b.branchSalary - a.branchSalary)
      return {
        coachId: coach.id, coachName: coach.name,
        coachRate: coach.payment_rate ?? 50,
        totalSalary, branchBreakdowns,
        totalAthletes: branchBreakdowns.reduce((s, b) => s + b.athleteCount, 0),
      }
    })
    .filter(c => branchFilter === 'all' || c.branchBreakdowns.some(b => b.branchId === branchFilter))
    .map(c => branchFilter === 'all' ? c : {
      ...c,
      branchBreakdowns: c.branchBreakdowns.filter(b => b.branchId === branchFilter),
      totalSalary: c.branchBreakdowns
        .filter(b => b.branchId === branchFilter)
        .reduce((s, b) => s + b.branchSalary, 0),
    })
    .sort((a, b) => b.totalSalary - a.totalSalary)

    return { salaryData, revenueByBranch: revenueMap, coachSalaryByBranch }
  }, [coaches, checkins, classes, members, branches, branchFilter])

  // ─── שמירת הגדרות ─────────────────────────────────────────

  async function saveCoachRate(coachId) {
    const val = parseFloat(editCoachRate[coachId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`coach-${coachId}`)
    const { error } = await supabase.from('coaches')
      .update({ payment_rate: val }).eq('id', coachId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditCoachRate(p => { const n={...p}; delete n[coachId]; return n })
    fetchAll()
  }

  async function savePlatformCut(branchId) {
    const val = parseFloat(editPlatformCut[branchId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`plat-${branchId}`)
    const { error } = await supabase.from('branches')
      .update({ platform_cut: val }).eq('id', branchId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditPlatformCut(p => { const n={...p}; delete n[branchId]; return n })
    fetchAll()
  }

  async function saveOwnerSettings(branchId) {
    const e = editOwner[branchId]
    if (!e) return
    const o1p = parseFloat(e.o1p), o2p = parseFloat(e.o2p)
    if (isNaN(o1p) || isNaN(o2p) || Math.abs(o1p + o2p - 100) > 0.01) {
      alert('סכום האחוזים חייב להיות 100%')
      return
    }
    setSaving(`owner-${branchId}`)
    const payload = {
      branch_id:   branchId,
      owner1_name: e.o1n || 'דודי',
      owner1_pct:  o1p,
      owner2_name: e.o2n || 'מושיק',
      owner2_pct:  o2p,
    }
    const { error } = await supabase
      .from('branch_owner_settings')
      .upsert(payload, { onConflict: 'branch_id' })
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditOwner(p => { const n={...p}; delete n[branchId]; return n })
    fetchAll()
  }

  async function addExpense(branchId) {
    const e = newExpense[branchId]
    if (!e?.label?.trim() || !e?.amount) return
    const amount = parseFloat(e.amount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(`exp-${branchId}`)
    const { error } = await supabase
      .from('branch_monthly_expenses')
      .upsert({
        branch_id: branchId,
        year:      selectedMonth.year,
        month:     selectedMonth.month,
        label:     e.label.trim(),
        amount,
      }, { onConflict: 'branch_id,year,month,label' })
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setNewExpense(p => ({ ...p, [branchId]: { label: '', amount: '' } }))
    fetchAll()
  }

  // ─── ייצוא Excel ──────────────────────────────────────────

  function exportCoach(coach) {
    const label = monthLabel(selectedMonth.year, selectedMonth.month)
    const wb    = XLSX.utils.book_new()

    coach.branchBreakdowns.forEach(branch => {
      const rows = [
        [`דוח שכר — ${coach.coachName} — ${label}`],
        [`סניף: ${branch.branchName} | ניכוי מתנס: ${branch.cutPct}% | אחוז מאמן: ${coach.coachRate}%`],
        [],
        ['מתאמן', 'סוג מנוי', 'מחיר מנוי', 'אימונים אצלו', 'סה"כ אימונים', '% חלוקה', 'שכר (₪)'],
        ...branch.athletes.map(r => [
          r.name,
          SUB_LABELS[r.subType] || r.subType,
          r.price,
          r.sessionsHere,
          r.totalSessions,
          Math.round(r.fraction * 100) / 100,
          Math.round(r.salary),
        ]),
        [],
        ['', '', '', '', '', 'סה"כ', Math.round(branch.branchSalary)],
      ]

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [22, 14, 12, 14, 14, 12, 12].map(w => ({ wch: w }))

      // כותרות בולד
      const headerRow = 4
      ;['A','B','C','D','E','F','G'].forEach(col => {
        const cell = ws[`${col}${headerRow}`]
        if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F0FE' } } }
      })

      const sheetName = branch.branchName.substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })

    XLSX.writeFile(wb, `שכר_${coach.coachName}_${selectedMonth.year}_${String(selectedMonth.month).padStart(2,'0')}.xlsx`)
  }

  function exportAll() {
    const label = monthLabel(selectedMonth.year, selectedMonth.month)
    const wb    = XLSX.utils.book_new()

    // גיליון סיכום
    const summaryRows = [
      [`דוח שכר חודשי — ${label}`],
      [],
      ['מאמן', 'מתאמנים', 'אחוז', 'שכר כולל (₪)'],
      ...salaryData.map(c => [
        c.coachName,
        c.totalAthletes,
        `${c.coachRate}%`,
        Math.round(c.totalSalary),
      ]),
      [],
      ['', '', 'סה"כ', Math.round(salaryData.reduce((s,c) => s + c.totalSalary, 0))],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [22, 12, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום')

    // גיליון לכל מאמן
    salaryData.forEach(coach => {
      const rows = [
        [`${coach.coachName} — ${label} — אחוז: ${coach.coachRate}%`],
        [],
        ['מתאמן', 'מנוי', 'מחיר', 'סניף', 'אימונים אצלו', 'סה"כ אימונים', '% חלוקה', 'שכר (₪)'],
      ]

      coach.branchBreakdowns.forEach(branch => {
        branch.athletes.forEach(r => {
          rows.push([
            r.name,
            SUB_LABELS[r.subType] || r.subType,
            r.price,
            branch.branchName,
            r.sessionsHere,
            r.totalSessions,
            Math.round(r.fraction * 100) / 100,
            Math.round(r.salary),
          ])
        })
      })

      rows.push([], ['', '', '', '', '', '', 'סה"כ', Math.round(coach.totalSalary)])

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [22, 12, 10, 14, 14, 14, 12, 12].map(w => ({ wch: w }))
      const sheetName = coach.coachName.substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })

    XLSX.writeFile(wb, `שכר_כל_המאמנים_${selectedMonth.year}_${String(selectedMonth.month).padStart(2,'0')}.xlsx`)
  }

  async function deleteExpense(id) {
    await supabase.from('branch_monthly_expenses').delete().eq('id', id)
    fetchAll()
  }

  // ─── UI ───────────────────────────────────────────────────

  const grandCoachSalary = salaryData.reduce((s, c) => s + c.totalSalary, 0)
  const activeCoaches    = salaryData.filter(c => c.totalAthletes > 0).length

  // סניפים להצגה בחלק הרווחיות
  const profitBranches = branchFilter === 'all'
    ? branches
    : branches.filter(b => b.id === branchFilter)

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── כותרת + פילטרים ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h2 className="font-black text-gray-900 text-lg">דוח שכר ורווחיות</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSelectedMonth({ year: y, month: m })
            }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium"
          >
            {months.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {monthLabel(year, month)}
              </option>
            ))}
          </select>
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium"
          >
            <option value="all">כל הסניפים</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={fetchAll} disabled={loading}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg">
            🔄 רענן
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-red-800 text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {loading && <div className="text-center text-gray-400 py-10 text-sm">טוען...</div>}

      {!loading && !error && (
        <>
          {/* ── ניכוי מתנס לפי סניף ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="font-black text-gray-800 mb-3">🏢 ניכוי מתנס לפי סניף</div>
            <div className="flex flex-wrap gap-3">
              {branches.map(branch => {
                const isEdit = editPlatformCut[branch.id] !== undefined
                const isSav  = saving === `plat-${branch.id}`
                return (
                  <div key={branch.id}
                    className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <span className="text-sm font-semibold text-gray-700">{branch.name}</span>
                    <span className="text-xs text-gray-400">ניכוי:</span>
                    {isEdit ? (
                      <>
                        <input type="number" min="0" max="100"
                          value={editPlatformCut[branch.id]}
                          onChange={e => setEditPlatformCut(p => ({ ...p, [branch.id]: e.target.value }))}
                          className="w-14 text-sm border border-blue-400 rounded-lg px-2 py-0.5 text-center font-bold" />
                        <span className="text-xs">%</span>
                        <button onClick={() => savePlatformCut(branch.id)} disabled={isSav}
                          className="text-xs bg-blue-600 text-white font-bold px-2 py-0.5 rounded-lg">
                          {isSav ? '...' : '✓'}
                        </button>
                        <button onClick={() => setEditPlatformCut(p => { const n={...p}; delete n[branch.id]; return n })}
                          className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-lg">✕</button>
                      </>
                    ) : (
                      <button onClick={() => setEditPlatformCut(p => ({ ...p, [branch.id]: branch.platform_cut ?? 40 }))}
                        className="text-sm font-black text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded-lg border border-orange-200">
                        {branch.platform_cut ?? 40}%
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── סיכום שכר + ייצוא כולל ── */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="סה״כ שכר מאמנים" value={fmt(grandCoachSalary)} tone="red" />
            <StatCard label="מאמנים פעילים"   value={activeCoaches}         tone="blue" />
            <StatCard label="נוכחויות"         value={checkins.length}       tone="purple" />
          </div>

          {salaryData.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={exportAll}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-4 py-2 rounded-xl shadow"
              >
                📥 ייצא דוח כולל — Excel
              </button>
            </div>
          )}

          {/* ── כרטיסי מאמנים ── */}
          {salaryData.length === 0 && (
            <div className="text-center text-gray-400 py-6 text-sm">אין נוכחויות לתקופה זו</div>
          )}
          {salaryData.map(coach => (
            <CoachCard key={coach.coachId} coach={coach}
              editCoachRate={editCoachRate} setEditCoachRate={setEditCoachRate}
              saving={saving} saveCoachRate={saveCoachRate}
              onExport={() => exportCoach(coach)} />
          ))}

          {/* ══════════════════════════════════════════════
              חלק 2 — רווחיות + חלוקת בעלים לפי סניף
          ══════════════════════════════════════════════ */}
          <div className="bg-gray-900 rounded-2xl p-4">
            <div className="font-black text-white text-base mb-4 flex items-center gap-2">
              📊 <span>רווחיות וחלוקת בעלים — {monthLabel(selectedMonth.year, selectedMonth.month)}</span>
            </div>

            {profitBranches.map(branch => {
              const cutPct        = branch.platform_cut ?? 40
              const grossRevenue  = revenueByBranch.get(branch.id) || 0
              const netRevenue    = grossRevenue * (1 - cutPct / 100)
              const coachSalary   = coachSalaryByBranch.get(branch.id) || 0
              const branchExp      = expenses.filter(e => e.branch_id === branch.id)
              const branchFixed    = fixedExp.filter(e => e.branch_id === branch.id)
              const totalExpenses  = [...branchExp, ...branchFixed].reduce((s, e) => s + Number(e.amount), 0)
              const netProfit     = netRevenue - coachSalary - totalExpenses

              const ownerCfg = ownerSettings.find(o => o.branch_id === branch.id) || {
                owner1_name: 'דודי',  owner1_pct: 50,
                owner2_name: 'מושיק', owner2_pct: 50,
              }
              const isEditOwner = editOwner[branch.id] !== undefined
              const isSavOwner  = saving === `owner-${branch.id}`
              const eo          = editOwner[branch.id] || {}

              const o1Amount = netProfit > 0 ? netProfit * (ownerCfg.owner1_pct / 100) : 0
              const o2Amount = netProfit > 0 ? netProfit * (ownerCfg.owner2_pct / 100) : 0

              return (
                <div key={branch.id} className="bg-gray-800 rounded-xl p-4 mb-3 last:mb-0">
                  <div className="font-black text-white mb-3">🏢 {branch.name}</div>

                  {/* סכום זרימה */}
                  <div className="space-y-1.5 mb-4">
                    <ProfitRow label="הכנסות גולמיות" value={fmt(grossRevenue)} color="text-white" />
                    <ProfitRow label={`ניכוי מתנס (${cutPct}%)`} value={`− ${fmt(grossRevenue - netRevenue)}`} color="text-red-400" />
                    <ProfitRow label="נטו אחרי מתנס" value={fmt(netRevenue)} color="text-yellow-300" bold />
                    <ProfitRow label="שכר מאמנים" value={`− ${fmt(coachSalary)}`} color="text-red-400" />

                    {/* הוצאות קבועות (אוטומטי) */}
                    {branchFixed.map(exp => (
                      <div key={`f-${exp.id}`} className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">{exp.label} <span className="text-xs text-gray-500">(קבוע)</span></span>
                        <span className="text-red-400 text-sm font-medium">− {fmt(exp.amount)}</span>
                      </div>
                    ))}

                    {/* הוצאות משתנות (ידני) */}
                    {branchExp.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteExpense(exp.id)}
                            className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                          <span className="text-gray-400 text-sm">{exp.label}</span>
                        </div>
                        <span className="text-red-400 text-sm font-medium">− {fmt(exp.amount)}</span>
                      </div>
                    ))}

                    {/* הוספת הוצאה */}
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text" placeholder="סוג הוצאה (שכירות, חשמל...)"
                        value={newExpense[branch.id]?.label || ''}
                        onChange={e => setNewExpense(p => ({
                          ...p, [branch.id]: { ...p[branch.id], label: e.target.value }
                        }))}
                        className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white placeholder-gray-500"
                      />
                      <input
                        type="number" placeholder="סכום"
                        value={newExpense[branch.id]?.amount || ''}
                        onChange={e => setNewExpense(p => ({
                          ...p, [branch.id]: { ...p[branch.id], amount: e.target.value }
                        }))}
                        className="w-24 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white placeholder-gray-500"
                      />
                      <button
                        onClick={() => addExpense(branch.id)}
                        disabled={saving === `exp-${branch.id}`}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg"
                      >+ הוסף</button>
                    </div>

                    <div className="border-t border-gray-600 pt-2 mt-1">
                      <ProfitRow
                        label="רווח נקי"
                        value={fmt(netProfit)}
                        color={netProfit >= 0 ? 'text-green-400' : 'text-red-400'}
                        bold
                        large
                      />
                    </div>
                  </div>

                  {/* חלוקת בעלים */}
                  <div className="bg-gray-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-gray-300">חלוקת בעלים</span>
                      {!isEditOwner ? (
                        <button
                          onClick={() => setEditOwner(p => ({
                            ...p, [branch.id]: {
                              o1n: ownerCfg.owner1_name, o1p: ownerCfg.owner1_pct,
                              o2n: ownerCfg.owner2_name, o2p: ownerCfg.owner2_pct,
                            }
                          }))}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >✏️ ערוך</button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => saveOwnerSettings(branch.id)} disabled={isSavOwner}
                            className="text-xs bg-blue-600 text-white font-bold px-2 py-0.5 rounded">
                            {isSavOwner ? '...' : 'שמור'}
                          </button>
                          <button onClick={() => setEditOwner(p => { const n={...p}; delete n[branch.id]; return n })}
                            className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded">ביטול</button>
                        </div>
                      )}
                    </div>

                    {isEditOwner ? (
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { nameKey: 'o1n', pctKey: 'o1p' },
                          { nameKey: 'o2n', pctKey: 'o2p' },
                        ].map(({ nameKey, pctKey }) => (
                          <div key={nameKey} className="space-y-1">
                            <input type="text" placeholder="שם"
                              value={eo[nameKey] || ''}
                              onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [nameKey]: e.target.value } }))}
                              className="w-full text-xs bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white"
                            />
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max="100" placeholder="%"
                                value={eo[pctKey] || ''}
                                onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [pctKey]: e.target.value } }))}
                                className="w-full text-xs bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white"
                              />
                              <span className="text-gray-400 text-xs">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <OwnerShare name={ownerCfg.owner1_name} pct={ownerCfg.owner1_pct} amount={o1Amount} />
                        <OwnerShare name={ownerCfg.owner2_name} pct={ownerCfg.owner2_pct} amount={o2Amount} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── הסבר נוסחה ── */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <div className="font-bold text-gray-700 mb-1">📐 נוסחת חישוב</div>
            <div>שכר מאמן = מחיר מנוי × (100%−ניכוי מתנס) × אחוז מאמן × (אימונים אצלו ÷ סה"כ אימוני מתאמן)</div>
            <div>רווח נקי = נטו − שכר מאמנים − הוצאות</div>
            <div>חלוקת בעלים = רווח נקי × אחוז בעלים</div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── רכיבי עזר ───────────────────────────────────────────────

function ProfitRow({ label, value, color = 'text-gray-300', bold = false, large = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-gray-400 ${large ? 'text-sm font-black' : 'text-xs'}`}>{label}</span>
      <span className={`${color} ${bold ? 'font-black' : 'font-medium'} ${large ? 'text-base' : 'text-sm'}`}>
        {value}
      </span>
    </div>
  )
}

function OwnerShare({ name, pct, amount }) {
  return (
    <div className="bg-gray-600 rounded-lg p-2.5 text-center">
      <div className="text-xs text-gray-300 font-semibold mb-1">{name}</div>
      <div className="text-xs text-gray-400">{pct}%</div>
      <div className={`text-lg font-black mt-1 ${amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {fmt(amount)}
      </div>
    </div>
  )
}

function CoachCard({ coach, editCoachRate, setEditCoachRate, saving, saveCoachRate, onExport }) {
  const [expanded, setExpanded] = useState(false)
  const isEdit = editCoachRate[coach.coachId] !== undefined
  const isSav  = saving === `coach-${coach.coachId}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-black text-blue-700 text-lg select-none">
            {coach.coachName?.charAt(0) || '?'}
          </div>
          <div>
            <div className="font-black text-gray-900">{coach.coachName}</div>
            <div className="text-xs text-gray-500">
              {coach.totalAthletes} מתאמנים · {coach.branchBreakdowns.length} סניף{coach.branchBreakdowns.length !== 1 ? 'ים' : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">חלק מאמן:</span>
            {isEdit ? (
              <>
                <input type="number" min="0" max="100"
                  value={editCoachRate[coach.coachId]}
                  onChange={e => setEditCoachRate(p => ({ ...p, [coach.coachId]: e.target.value }))}
                  className="w-14 text-sm border border-blue-400 rounded-lg px-2 py-1 text-center font-bold" />
                <span className="text-xs text-gray-500">%</span>
                <button onClick={() => saveCoachRate(coach.coachId)} disabled={isSav}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-1 rounded-lg">
                  {isSav ? '...' : '✓'}
                </button>
                <button onClick={() => setEditCoachRate(p => { const n={...p}; delete n[coach.coachId]; return n })}
                  className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg">✕</button>
              </>
            ) : (
              <button onClick={() => setEditCoachRate(p => ({ ...p, [coach.coachId]: coach.coachRate }))}
                className="text-sm font-black text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200">
                {coach.coachRate}%
              </button>
            )}
          </div>
          <div className="text-xl font-black text-green-700 bg-green-50 px-3 py-1 rounded-xl border border-green-200">
            {fmt(coach.totalSalary)}
          </div>
          <button
            onClick={onExport}
            title="ייצא לאקסל"
            className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 font-bold px-2 py-1 rounded-lg"
          >📥 Excel</button>

          {coach.totalAthletes > 0 && (
            <button onClick={() => setExpanded(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-700 font-medium">
              {expanded ? '▲ סגור' : '▼ פירוט'}
            </button>
          )}
        </div>
      </div>

      {expanded && coach.branchBreakdowns.map(branch => (
        <div key={branch.branchId} className="border-t border-gray-100">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-700">🏢 {branch.branchName}</span>
              <span className="text-xs text-gray-400">ניכוי {branch.cutPct}%</span>
            </div>
            <div className="text-sm font-black text-green-700">{fmt(branch.branchSalary)}</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-t border-gray-100">
                <th className="text-right py-1.5 px-3 font-semibold">מתאמן</th>
                <th className="text-center py-1.5 px-2 font-semibold">מנוי</th>
                <th className="text-center py-1.5 px-2 font-semibold">אצלו</th>
                <th className="text-center py-1.5 px-2 font-semibold">סה"כ</th>
                <th className="text-center py-1.5 px-2 font-semibold">%</th>
                <th className="text-left py-1.5 px-3 font-semibold">שכר</th>
              </tr>
            </thead>
            <tbody>
              {branch.athletes.map((row, i) => (
                <tr key={row.athleteId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-1.5 px-3 font-medium text-gray-800">{row.name}</td>
                  <td className="py-1.5 px-2 text-center text-gray-500">{SUB_LABELS[row.subType] || row.subType}</td>
                  <td className="py-1.5 px-2 text-center font-bold text-blue-700">{row.sessionsHere}</td>
                  <td className="py-1.5 px-2 text-center text-gray-400">{row.totalSessions}</td>
                  <td className="py-1.5 px-2 text-center text-gray-400">{pct(row.fraction)}</td>
                  <td className="py-1.5 px-3 font-black text-green-700 text-left">{fmt(row.salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

const TONE = {
  green:  ['bg-green-50',  'border-green-200',  'text-green-900',  'text-green-700'],
  blue:   ['bg-blue-50',   'border-blue-200',   'text-blue-900',   'text-blue-700'],
  purple: ['bg-purple-50', 'border-purple-200', 'text-purple-900', 'text-purple-700'],
  red:    ['bg-red-50',    'border-red-200',    'text-red-900',    'text-red-700'],
}

function StatCard({ label, value, tone = 'blue' }) {
  const [bg, border, val, lbl] = TONE[tone]
  return (
    <div className={`${bg} ${border} border rounded-xl p-3 text-center`}>
      <div className={`text-xs font-semibold mb-1 ${lbl}`}>{label}</div>
      <div className={`text-xl font-black ${val}`}>{value}</div>
    </div>
  )
}
