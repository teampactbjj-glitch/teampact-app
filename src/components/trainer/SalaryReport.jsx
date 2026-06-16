/**
 * SalaryReport — דוח שכר חודשי למאמנים + חלוקת רווח לבעלים
 * גישה: מנהל בלבד (isAdmin נאכף ב-TrainerDashboard לפני רינדור)
 *
 * מחיר אפקטיבי למתאמן:
 *   custom_price ?? branch_subscription_prices[branch][type] ?? DEFAULT_SUB_PRICE[type]
 *   × (1 − discount_pct / 100)
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import BranchSettings from './BranchSettings'

// ─── קבועי ברירת מחדל ────────────────────────────────────────

const DEFAULT_SUB_PRICE = {
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

const SUB_TYPES = ['1x_week', '2x_week', '4x_week', 'unlimited']

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

function getEffectivePrice(member, branchPricesMap) {
  const base = member.custom_price != null
    ? member.custom_price
    : (branchPricesMap.get(`${member.branch_id}:${member.subscription_type}`) ?? DEFAULT_SUB_PRICE[member.subscription_type] ?? 0)
  const disc = member.discount_pct || 0
  return base * (1 - disc / 100)
}

// ─── קומפוננט ראשי ───────────────────────────────────────────

export default function SalaryReport({ isAdmin }) {
  if (!isAdmin) {
    return <div className="p-6 text-center text-red-600 font-bold" dir="rtl">⛔ גישה מורשית למנהל בלבד</div>
  }

  const months = useMemo(() => recentMonths(6), [])
  const [selectedMonth, setSelectedMonth] = useState(months[0])
  const [branchFilter,  setBranchFilter]  = useState('all')

  const [coaches,         setCoaches]         = useState([])
  const [checkins,        setCheckins]        = useState([])
  const [classes,         setClasses]         = useState([])
  const [members,         setMembers]         = useState([])
  const [branches,        setBranches]        = useState([])
  const [ownerSettings,   setOwnerSettings]   = useState([])
  const [expenses,        setExpenses]        = useState([])
  const [fixedExp,        setFixedExp]        = useState([])
  const [branchPricesRaw, setBranchPricesRaw] = useState([])
  const [vatRate,         setVatRate]         = useState(18) // % — נטען מ-app_settings
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)

  const [editCoachRate,   setEditCoachRate]   = useState({})
  const [editVatType,     setEditVatType]     = useState({}) // coachId → 'murshe'|'patur'
  const [editPlatformCut, setEditPlatformCut] = useState({})
  const [editOwner,       setEditOwner]       = useState({})
  const [saving,          setSaving]          = useState(null)
  const [newExpense,      setNewExpense]      = useState({})

  const [showSubManager,     setShowSubManager]     = useState(false)
  const [showSettings,       setShowSettings]       = useState(false)
  const [subPriceEdits,      setSubPriceEdits]      = useState({})
  const [memberEdits,        setMemberEdits]        = useState({})
  const [memberBranchFilter, setMemberBranchFilter] = useState('all')
  const [savingPrice,        setSavingPrice]        = useState(null)
  const [savingMember,       setSavingMember]       = useState(null)

  const branchPricesMap = useMemo(() => {
    const m = new Map()
    for (const row of branchPricesRaw)
      m.set(`${row.branch_id}:${row.subscription_type}`, row.price)
    return m
  }, [branchPricesRaw])

  // ─── שליפה ────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    const { from, to } = monthRange(selectedMonth.year, selectedMonth.month)

    const [coachesRes, checkinsRes, classesRes, membersRes, branchesRes,
           ownerRes, expRes, fixedRes, pricesRes, appSettingsRes] = await Promise.all([
      supabase.from('coaches').select('id, name, branch_id, payment_rate, vat_type').order('name'),
      supabase.from('checkins').select('class_id, athlete_id, checkin_date, status')
        .gte('checkin_date', from).lte('checkin_date', to).eq('status', 'present'),
      supabase.from('classes').select('id, coach_id, branch_id').is('deleted_at', null),
      supabase.from('members')
        .select('id, full_name, subscription_type, branch_id, custom_price, discount_pct')
        .eq('active', true),
      supabase.from('branches').select('id, name, platform_cut').order('name'),
      supabase.from('branch_owner_settings')
        .select('branch_id, owner1_name, owner1_pct, owner2_name, owner2_pct'),
      supabase.from('branch_monthly_expenses')
        .select('id, branch_id, year, month, label, amount')
        .eq('year', selectedMonth.year).eq('month', selectedMonth.month),
      supabase.from('branch_fixed_expenses')
        .select('id, branch_id, label, amount, active').eq('active', true),
      supabase.from('branch_subscription_prices')
        .select('branch_id, subscription_type, price'),
      supabase.from('app_settings').select('vat_rate').eq('id', 1).maybeSingle(),
    ])

    const err = [coachesRes, checkinsRes, classesRes, membersRes, branchesRes,
                 ownerRes, expRes, fixedRes, pricesRes].find(r => r.error)?.error
    if (err) { setError(err.message); setLoading(false); return }

    setCoaches(coachesRes.data       || [])
    setCheckins(checkinsRes.data     || [])
    setClasses(classesRes.data       || [])
    setMembers(membersRes.data       || [])
    setBranches(branchesRes.data     || [])
    setOwnerSettings(ownerRes.data   || [])
    setExpenses(expRes.data          || [])
    if (appSettingsRes.data?.vat_rate != null) setVatRate(Number(appSettingsRes.data.vat_rate))
    setFixedExp(fixedRes.data        || [])
    setBranchPricesRaw(pricesRes.data || [])
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => { fetchAll() }, [fetchAll])

  // סנכרן פילטר מתאמנים — תמיד עוקב אחרי הפילטר הראשי
  useEffect(() => {
    setMemberBranchFilter(branchFilter)
  }, [branchFilter])

  // ─── חישוב ────────────────────────────────────────────────

  const { salaryData, revenueByBranch, coachSalaryByBranch } = useMemo(() => { // eslint-disable-next-line react-hooks/exhaustive-deps
    const classById  = new Map(classes.map(c => [c.id, c]))
    const memberById = new Map(members.map(m => [m.id, m]))
    const branchById = new Map(branches.map(b => [b.id, b]))

    const coachBranchAthleteCheckins = new Map()
    const athleteTotalCheckins = new Map()

    for (const chk of checkins) {
      const cls = classById.get(chk.class_id)
      if (!cls?.coach_id || !cls?.branch_id) continue
      const { coach_id, branch_id } = cls
      if (!coachBranchAthleteCheckins.has(coach_id))
        coachBranchAthleteCheckins.set(coach_id, new Map())
      const byBranch = coachBranchAthleteCheckins.get(coach_id)
      if (!byBranch.has(branch_id)) byBranch.set(branch_id, new Map())
      const byAthlete = byBranch.get(branch_id)
      byAthlete.set(chk.athlete_id, (byAthlete.get(chk.athlete_id) || 0) + 1)
      athleteTotalCheckins.set(chk.athlete_id, (athleteTotalCheckins.get(chk.athlete_id) || 0) + 1)
    }

    const revenueMap = new Map()
    for (const m of members) {
      if (!m.subscription_type || !m.branch_id) continue
      const price = getEffectivePrice(m, branchPricesMap)
      revenueMap.set(m.branch_id, (revenueMap.get(m.branch_id) || 0) + price)
    }

    const coachSalaryByBranch = new Map()
    const VAT_RATE = 1 + vatRate / 100 // נטען מ-app_settings (ברירת מחדל 18%)

    const salaryData = coaches.map(coach => {
      const coachRate = (coach.payment_rate ?? 50) / 100
      const isPatur   = (coach.vat_type ?? 'murshe') === 'patur'
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
          const price = getEffectivePrice(member, branchPricesMap)
          if (!price) continue
          const totalSessions = athleteTotalCheckins.get(athleteId) || 1
          const fraction      = sessionsHere / totalSessions
          // עוסק פטור: מחיר המנוי כולל מע"מ → מורידים מע"מ מהשכר
          const salaryGross   = price * netRate * coachRate * fraction
          const salary        = isPatur ? salaryGross / VAT_RATE : salaryGross
          branchSalary += salary
          athletes.push({
            athleteId, name: member.full_name, subType: member.subscription_type,
            price, sessionsHere, totalSessions, fraction, salary, salaryGross,
            customPrice: member.custom_price, discountPct: member.discount_pct,
          })
        }

        athletes.sort((a, b) => b.salary - a.salary)
        totalSalary += branchSalary
        coachSalaryByBranch.set(branchId, (coachSalaryByBranch.get(branchId) || 0) + branchSalary)
        branchBreakdowns.push({
          branchId, branchName: branch?.name || '?',
          cutPct, branchSalary, athleteCount: byAthlete.size, athletes,
        })
      }

      branchBreakdowns.sort((a, b) => b.branchSalary - a.branchSalary)
      return {
        coachId: coach.id, coachName: coach.name,
        coachRate: coach.payment_rate ?? 50,
        vatType: coach.vat_type ?? 'murshe',
        totalSalary, branchBreakdowns,
        totalAthletes: branchBreakdowns.reduce((s, b) => s + b.athleteCount, 0),
      }
    })
    .filter(c => branchFilter === 'all' || c.branchBreakdowns.some(b => b.branchId === branchFilter))
    .map(c => branchFilter === 'all' ? c : {
      ...c,
      branchBreakdowns: c.branchBreakdowns.filter(b => b.branchId === branchFilter),
      totalSalary: c.branchBreakdowns.filter(b => b.branchId === branchFilter)
        .reduce((s, b) => s + b.branchSalary, 0),
    })
    .sort((a, b) => b.totalSalary - a.totalSalary)

    return { salaryData, revenueByBranch: revenueMap, coachSalaryByBranch }
  }, [coaches, checkins, classes, members, branches, branchFilter, branchPricesMap, vatRate])

  // ─── שמירות ───────────────────────────────────────────────

  async function saveCoachRate(coachId) {
    const val = parseFloat(editCoachRate[coachId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`coach-${coachId}`)
    const { error } = await supabase.from('coaches').update({ payment_rate: val }).eq('id', coachId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditCoachRate(p => { const n={...p}; delete n[coachId]; return n })
    fetchAll()
  }

  async function saveVatType(coachId, vatType) {
    setSaving(`vat-${coachId}`)
    const { error } = await supabase.from('coaches').update({ vat_type: vatType }).eq('id', coachId)
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setEditVatType(p => { const n={...p}; delete n[coachId]; return n })
    fetchAll()
  }

  async function savePlatformCut(branchId) {
    const val = parseFloat(editPlatformCut[branchId])
    if (isNaN(val) || val < 0 || val > 100) return
    setSaving(`plat-${branchId}`)
    const { error } = await supabase.from('branches').update({ platform_cut: val }).eq('id', branchId)
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
      alert('סכום האחוזים חייב להיות 100%'); return
    }
    setSaving(`owner-${branchId}`)
    const { error } = await supabase.from('branch_owner_settings').upsert({
      branch_id: branchId, owner1_name: e.o1n || 'דודי', owner1_pct: o1p,
      owner2_name: e.o2n || 'מושיק', owner2_pct: o2p,
    }, { onConflict: 'branch_id' })
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
    const { error } = await supabase.from('branch_monthly_expenses').upsert({
      branch_id: branchId, year: selectedMonth.year, month: selectedMonth.month,
      label: e.label.trim(), amount,
    }, { onConflict: 'branch_id,year,month,label' })
    if (error) alert('שגיאה: ' + error.message)
    setSaving(null)
    setNewExpense(p => ({ ...p, [branchId]: { label: '', amount: '' } }))
    fetchAll()
  }

  async function deleteExpense(id) {
    await supabase.from('branch_monthly_expenses').delete().eq('id', id)
    fetchAll()
  }

  async function saveBranchPrice(branchId, subType) {
    const key = `${branchId}:${subType}`
    const val = subPriceEdits[key]
    if (val === undefined || val === '') return
    const price = Number(val)
    if (isNaN(price) || price < 0) return
    setSavingPrice(key)
    const { error } = await supabase.from('branch_subscription_prices')
      .upsert({ branch_id: branchId, subscription_type: subType, price },
        { onConflict: 'branch_id,subscription_type' })
    if (error) alert('שגיאה: ' + error.message)
    setSavingPrice(null)
    setSubPriceEdits(p => { const n={...p}; delete n[key]; return n })
    fetchAll()
  }

  async function saveMemberSub(memberId) {
    const e = memberEdits[memberId]
    if (!e) return
    const payload = {}
    if (e.subscription_type !== undefined) {
      payload.subscription_type = e.subscription_type
      payload.membership_type = e.subscription_type // לסנכרן את שני שדות המנוי כדי שלא ייווצר פער
    }
    if (e.custom_price !== undefined)
      payload.custom_price = e.custom_price === '' ? null : Number(e.custom_price)
    if (e.discount_pct !== undefined)
      payload.discount_pct = e.discount_pct === '' ? 0 : Number(e.discount_pct)
    setSavingMember(memberId)
    const { error } = await supabase.from('members').update(payload).eq('id', memberId)
    if (error) alert('שגיאה: ' + error.message)
    setSavingMember(null)
    setMemberEdits(p => { const n={...p}; delete n[memberId]; return n })
    fetchAll()
  }

  // ─── Excel ────────────────────────────────────────────────

  function exportCoach(coach) {
    const label = monthLabel(selectedMonth.year, selectedMonth.month)
    const wb = XLSX.utils.book_new()
    coach.branchBreakdowns.forEach(branch => {
      const rows = [
        [`דוח שכר — ${coach.coachName} — ${label}`],
        [`סניף: ${branch.branchName} | ניכוי: ${branch.cutPct}% | מאמן: ${coach.coachRate}%`],
        [],
        ['מתאמן', 'מנוי', 'מחיר אפקטיבי', 'אצלו', 'סה"כ', '%', 'שכר (₪)'],
        ...branch.athletes.map(r => [
          r.name, SUB_LABELS[r.subType] || r.subType, Math.round(r.price),
          r.sessionsHere, r.totalSessions, Math.round(r.fraction * 100) / 100, Math.round(r.salary),
        ]),
        [], ['', '', '', '', '', 'סה"כ', Math.round(branch.branchSalary)],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [22, 14, 14, 10, 10, 10, 12].map(w => ({ wch: w }))
      XLSX.utils.book_append_sheet(wb, ws, branch.branchName.substring(0, 31))
    })
    XLSX.writeFile(wb, `שכר_${coach.coachName}_${selectedMonth.year}_${String(selectedMonth.month).padStart(2,'0')}.xlsx`)
  }

  function exportAll() {
    const label = monthLabel(selectedMonth.year, selectedMonth.month)
    const wb = XLSX.utils.book_new()
    const summaryRows = [
      [`דוח שכר חודשי — ${label}`], [],
      ['מאמן', 'מתאמנים', 'אחוז', 'שכר (₪)'],
      ...salaryData.map(c => [c.coachName, c.totalAthletes, `${c.coachRate}%`, Math.round(c.totalSalary)]),
      [], ['', '', 'סה"כ', Math.round(salaryData.reduce((s,c) => s + c.totalSalary, 0))],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [22, 12, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום')
    salaryData.forEach(coach => {
      const rows = [
        [`${coach.coachName} — ${label}`], [],
        ['מתאמן', 'מנוי', 'מחיר', 'סניף', 'אצלו', 'סה"כ', '%', 'שכר (₪)'],
      ]
      coach.branchBreakdowns.forEach(branch => {
        branch.athletes.forEach(r => rows.push([
          r.name, SUB_LABELS[r.subType] || r.subType, Math.round(r.price),
          branch.branchName, r.sessionsHere, r.totalSessions,
          Math.round(r.fraction * 100) / 100, Math.round(r.salary),
        ]))
      })
      rows.push([], ['', '', '', '', '', '', 'סה"כ', Math.round(coach.totalSalary)])
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [22, 12, 12, 14, 10, 10, 10, 12].map(w => ({ wch: w }))
      XLSX.utils.book_append_sheet(wb, ws, coach.coachName.substring(0, 31))
    })
    XLSX.writeFile(wb, `שכר_כל_המאמנים_${selectedMonth.year}_${String(selectedMonth.month).padStart(2,'0')}.xlsx`)
  }

  // ─── UI חישובים ───────────────────────────────────────────

  const grandCoachSalary = salaryData.reduce((s, c) => s + c.totalSalary, 0)
  const activeCoaches    = salaryData.filter(c => c.totalAthletes > 0).length
  const filteredCheckinsCount = useMemo(() => {
    if (branchFilter === 'all') return checkins.length
    const classById = new Map(classes.map(c => [c.id, c]))
    return checkins.filter(chk => classById.get(chk.class_id)?.branch_id === branchFilter).length
  }, [checkins, classes, branchFilter])

  const profitBranches  = branchFilter === 'all' ? branches : branches.filter(b => b.id === branchFilter)
  const filteredMembers = useMemo(() =>
    memberBranchFilter === 'all' ? members : members.filter(m => m.branch_id === memberBranchFilter),
    [members, memberBranchFilter])

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-4" dir="rtl">

      {/* כותרת */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h2 className="font-black text-gray-900 text-lg">דוח שכר ורווחיות</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={e => { const [y,m] = e.target.value.split('-').map(Number); setSelectedMonth({year:y,month:m}) }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium"
          >
            {months.map(({year,month}) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>{monthLabel(year,month)}</option>
            ))}
          </select>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium">
            <option value="all">כל הסניפים</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={fetchAll} disabled={loading}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg">
            🔄 רענן
          </button>
          <button onClick={() => {
              setShowSubManager(v => {
                if (!v) setMemberBranchFilter(branchFilter)
                return !v
              })
            }}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors
              ${showSubManager ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'}`}>
            💳 ניהול מנויים
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-red-800 text-sm font-medium">⚠️ {error}</div>
      )}

      {/* ── ניהול מנויים ── */}
      {showSubManager && (
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex items-center gap-2">
            <span className="text-lg">💳</span>
            <span className="font-black text-indigo-900">ניהול מנויים ומחירים לפי סניף</span>
          </div>

          {/* מחירים לפי סניף */}
          <div className="p-4 border-b border-gray-100">
            <div className="font-bold text-gray-700 mb-3 text-sm">🏷️ מחירי מנוי לפי סניף</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-right py-2 px-3 font-semibold text-gray-600 border border-gray-200">סניף</th>
                    {SUB_TYPES.map(t => (
                      <th key={t} className="text-center py-2 px-3 font-semibold text-gray-600 border border-gray-200">
                        {SUB_LABELS[t]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(branchFilter === 'all' ? branches : branches.filter(b => b.id === branchFilter)).map(branch => (
                    <tr key={branch.id} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-semibold text-gray-800 border border-gray-200">{branch.name}</td>
                      {SUB_TYPES.map(subType => {
                        const key = `${branch.id}:${subType}`
                        const currentPrice = branchPricesMap.get(key) ?? DEFAULT_SUB_PRICE[subType]
                        const isCustom = branchPricesMap.has(key)
                        const isEditing = subPriceEdits[key] !== undefined
                        const isSav = savingPrice === key
                        return (
                          <td key={subType} className="py-1.5 px-2 text-center border border-gray-200">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <input type="number" min="0"
                                  value={subPriceEdits[key]}
                                  onChange={e => setSubPriceEdits(p => ({ ...p, [key]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && saveBranchPrice(branch.id, subType)}
                                  className="w-20 text-center text-sm border border-indigo-400 rounded-lg px-2 py-0.5 font-bold" />
                                <button onClick={() => saveBranchPrice(branch.id, subType)} disabled={isSav}
                                  className="text-xs bg-indigo-600 text-white font-bold px-2 py-0.5 rounded">
                                  {isSav ? '...' : '✓'}
                                </button>
                                <button onClick={() => setSubPriceEdits(p => { const n={...p}; delete n[key]; return n })}
                                  className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setSubPriceEdits(p => ({ ...p, [key]: currentPrice }))}
                                className={`font-bold px-2 py-0.5 rounded-lg border text-sm hover:bg-indigo-50
                                  ${isCustom ? 'text-indigo-700 border-indigo-200 bg-indigo-50' : 'text-gray-500 border-gray-200 bg-gray-50'}`}
                                title={isCustom ? 'מחיר מותאם לסניף' : 'ברירת מחדל — לחץ לעריכה'}
                              >
                                ₪{currentPrice}
                                {!isCustom && <span className="text-gray-400 text-xs mr-1">(ברירת מחדל)</span>}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2">לחץ על מחיר לעריכה · כחול = מחיר ייעודי לסניף · אפור = ברירת מחדל כללית</div>
          </div>

          {/* עדכון מנוי למתאמן */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-gray-700 text-sm">👥 עדכון מנוי ומחיר למתאמן</div>
              {branchFilter === 'all' ? (
                <select value={memberBranchFilter} onChange={e => setMemberBranchFilter(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white">
                  <option value="all">כל הסניפים ({members.length})</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({members.filter(m => m.branch_id === b.id).length})</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded-lg">
                  🏢 {branches.find(b => b.id === branchFilter)?.name} — {filteredMembers.length} מתאמנים
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                    <th className="text-right py-2 px-3 font-semibold">מתאמן</th>
                    <th className="text-center py-2 px-2 font-semibold">סניף</th>
                    <th className="text-center py-2 px-2 font-semibold">סוג מנוי</th>
                    <th className="text-center py-2 px-2 font-semibold">מחיר מותאם (₪)</th>
                    <th className="text-center py-2 px-2 font-semibold">הנחה %</th>
                    <th className="text-center py-2 px-2 font-semibold">מחיר סופי</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member, i) => {
                    const edit = memberEdits[member.id]
                    const isEditing = !!edit
                    const isSav = savingMember === member.id
                    const branchName = branches.find(b => b.id === member.branch_id)?.name || '—'

                    const displaySubType  = edit?.subscription_type ?? member.subscription_type
                    const displayCustom   = edit?.custom_price      ?? (member.custom_price != null ? String(member.custom_price) : '')
                    const displayDiscount = edit?.discount_pct      ?? (member.discount_pct || 0)

                    const previewMember = {
                      ...member,
                      subscription_type: displaySubType,
                      custom_price: displayCustom !== '' ? Number(displayCustom) : null,
                      discount_pct: Number(displayDiscount),
                    }
                    const effectivePreview = getEffectivePrice(previewMember, branchPricesMap)
                    const hasCustomization = member.custom_price != null || (member.discount_pct && member.discount_pct > 0)

                    return (
                      <tr key={member.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                        <td className="py-2 px-3 font-medium text-gray-800 border-b border-gray-100">
                          {member.full_name}
                          {hasCustomization && <span className="mr-1 text-indigo-500 text-xs">★</span>}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-500 border-b border-gray-100">{branchName}</td>

                        <td className="py-1.5 px-2 text-center border-b border-gray-100">
                          {isEditing ? (
                            <select value={displaySubType || ''}
                              onChange={e => setMemberEdits(p => ({ ...p, [member.id]: { ...p[member.id], subscription_type: e.target.value } }))}
                              className="text-xs border border-indigo-400 rounded px-1 py-0.5 bg-white w-full">
                              {SUB_TYPES.map(t => <option key={t} value={t}>{SUB_LABELS[t]}</option>)}
                            </select>
                          ) : (
                            <span className="text-gray-600">{SUB_LABELS[member.subscription_type] || member.subscription_type}</span>
                          )}
                        </td>

                        <td className="py-1.5 px-2 text-center border-b border-gray-100">
                          {isEditing ? (
                            <input type="number" min="0" placeholder="ברירת מחדל"
                              value={displayCustom}
                              onChange={e => setMemberEdits(p => ({ ...p, [member.id]: { ...p[member.id], custom_price: e.target.value } }))}
                              className="w-20 text-center text-xs border border-indigo-400 rounded px-1 py-0.5" />
                          ) : (
                            <span className={member.custom_price != null ? 'text-indigo-700 font-bold' : 'text-gray-300'}>
                              {member.custom_price != null ? `₪${member.custom_price}` : '—'}
                            </span>
                          )}
                        </td>

                        <td className="py-1.5 px-2 text-center border-b border-gray-100">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-0.5">
                              <input type="number" min="0" max="100"
                                value={displayDiscount}
                                onChange={e => setMemberEdits(p => ({ ...p, [member.id]: { ...p[member.id], discount_pct: e.target.value } }))}
                                className="w-14 text-center text-xs border border-indigo-400 rounded px-1 py-0.5" />
                              <span className="text-gray-400">%</span>
                            </div>
                          ) : (
                            <span className={member.discount_pct > 0 ? 'text-green-600 font-bold' : 'text-gray-300'}>
                              {member.discount_pct > 0 ? `${member.discount_pct}%` : '—'}
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-2 text-center border-b border-gray-100">
                          <span className="font-black text-gray-800">₪{Math.round(effectivePreview)}</span>
                        </td>

                        <td className="py-1.5 px-2 text-center border-b border-gray-100">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => saveMemberSub(member.id)} disabled={isSav}
                                className="text-xs bg-indigo-600 text-white font-bold px-2 py-0.5 rounded">
                                {isSav ? '...' : 'שמור'}
                              </button>
                              <button onClick={() => setMemberEdits(p => { const n={...p}; delete n[member.id]; return n })}
                                className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">ביטול</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setMemberEdits(p => ({
                                ...p, [member.id]: {
                                  subscription_type: member.subscription_type,
                                  custom_price: member.custom_price != null ? String(member.custom_price) : '',
                                  discount_pct: member.discount_pct || 0,
                                },
                              }))}
                              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                            >✏️ ערוך</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2 space-y-0.5">
              <div>★ = מתאמן עם מחיר/הנחה מותאמים אישית</div>
              <div>מחיר מותאם: עוקף את מחיר הסניף. הנחה: מופחתת על גבי מחיר מותאם / מחיר סניף.</div>
            </div>
          </div>
        </div>
      )}


      {loading && <div className="text-center text-gray-400 py-10 text-sm">טוען...</div>}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="font-black text-gray-800 mb-3">🏢 ניכוי מתנס לפי סניף</div>
              <div className="flex flex-wrap gap-3">
                {(branchFilter === 'all' ? branches : branches.filter(b => b.id === branchFilter)).map(branch => {
                  const isEdit = editPlatformCut[branch.id] !== undefined
                  const isSav  = saving === `plat-${branch.id}`
                  return (
                    <div key={branch.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
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

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="סה״כ שכר מאמנים" value={fmt(grandCoachSalary)} tone="red" />
            <StatCard label="מאמנים פעילים"   value={activeCoaches}         tone="blue" />
            <StatCard label="נוכחויות"         value={filteredCheckinsCount} tone="purple" />
          </div>

          {salaryData.length > 0 && (
            <div className="flex justify-end">
              <button onClick={exportAll}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-4 py-2 rounded-xl shadow">
                📥 ייצא דוח כולל — Excel
              </button>
            </div>
          )}

          {salaryData.length === 0 && (
            <div className="text-center text-gray-400 py-6 text-sm">אין נוכחויות לתקופה זו</div>
          )}
          {salaryData.map(coach => (
            <CoachCard key={coach.coachId} coach={coach}
              editCoachRate={editCoachRate} setEditCoachRate={setEditCoachRate}
              editVatType={editVatType} setEditVatType={setEditVatType} saveVatType={saveVatType}
              saving={saving} saveCoachRate={saveCoachRate}
              onExport={() => exportCoach(coach)} />
          ))}

          {/* רווחיות */}
          <div className="bg-gray-900 rounded-2xl p-4">
            <div className="font-black text-white text-base mb-4 flex items-center gap-2">
              📊 <span>רווחיות וחלוקת בעלים — {monthLabel(selectedMonth.year, selectedMonth.month)}</span>
            </div>
            {profitBranches.map(branch => {
              const cutPct       = branch.platform_cut ?? 40
              const grossRevenue = revenueByBranch.get(branch.id) || 0
              const netRevenue   = grossRevenue * (1 - cutPct / 100)
              const coachSalary  = coachSalaryByBranch.get(branch.id) || 0
              const branchExp    = expenses.filter(e => e.branch_id === branch.id)
              const branchFixed  = fixedExp.filter(e => e.branch_id === branch.id)
              const totalExpenses = [...branchExp, ...branchFixed].reduce((s, e) => s + Number(e.amount), 0)
              const netProfit    = netRevenue - coachSalary - totalExpenses

              const ownerCfg = ownerSettings.find(o => o.branch_id === branch.id) || {
                owner1_name: 'דודי', owner1_pct: 50, owner2_name: 'מושיק', owner2_pct: 50,
              }
              const isEditOwner = editOwner[branch.id] !== undefined
              const isSavOwner  = saving === `owner-${branch.id}`
              const eo          = editOwner[branch.id] || {}
              const o1Amount = netProfit > 0 ? netProfit * (ownerCfg.owner1_pct / 100) : 0
              const o2Amount = netProfit > 0 ? netProfit * (ownerCfg.owner2_pct / 100) : 0

              return (
                <div key={branch.id} className="bg-gray-800 rounded-xl p-4 mb-3 last:mb-0">
                  <div className="font-black text-white mb-3">🏢 {branch.name}</div>
                  <div className="space-y-1.5 mb-4">
                    <ProfitRow label="הכנסות גולמיות"      value={fmt(grossRevenue)}           color="text-white" />
                    <ProfitRow label={`ניכוי מתנס (${cutPct}%)`} value={`− ${fmt(grossRevenue - netRevenue)}`} color="text-red-400" />
                    <ProfitRow label="נטו אחרי מתנס"       value={fmt(netRevenue)}             color="text-yellow-300" bold />
                    <ProfitRow label="שכר מאמנים"          value={`− ${fmt(coachSalary)}`}    color="text-red-400" />

                    {branchFixed.map(exp => (
                      <div key={`f-${exp.id}`} className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">{exp.label} <span className="text-xs text-gray-500">(קבוע)</span></span>
                        <span className="text-red-400 text-sm font-medium">− {fmt(exp.amount)}</span>
                      </div>
                    ))}
                    {branchExp.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteExpense(exp.id)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                          <span className="text-gray-400 text-sm">{exp.label}</span>
                        </div>
                        <span className="text-red-400 text-sm font-medium">− {fmt(exp.amount)}</span>
                      </div>
                    ))}

                    <div className="flex gap-2 mt-2">
                      <input type="text" placeholder="סוג הוצאה"
                        value={newExpense[branch.id]?.label || ''}
                        onChange={e => setNewExpense(p => ({ ...p, [branch.id]: { ...p[branch.id], label: e.target.value } }))}
                        className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white placeholder-gray-500" />
                      <input type="number" placeholder="סכום"
                        value={newExpense[branch.id]?.amount || ''}
                        onChange={e => setNewExpense(p => ({ ...p, [branch.id]: { ...p[branch.id], amount: e.target.value } }))}
                        className="w-24 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white placeholder-gray-500" />
                      <button onClick={() => addExpense(branch.id)} disabled={saving === `exp-${branch.id}`}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg">+ הוסף</button>
                    </div>

                    <div className="border-t border-gray-600 pt-2 mt-1">
                      <ProfitRow label="רווח נקי" value={fmt(netProfit)}
                        color={netProfit >= 0 ? 'text-green-400' : 'text-red-400'} bold large />
                    </div>
                  </div>

                  <div className="bg-gray-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-gray-300">חלוקת בעלים</span>
                      {!isEditOwner ? (
                        <button onClick={() => setEditOwner(p => ({ ...p, [branch.id]: {
                          o1n: ownerCfg.owner1_name, o1p: ownerCfg.owner1_pct,
                          o2n: ownerCfg.owner2_name, o2p: ownerCfg.owner2_pct,
                        } }))} className="text-xs text-blue-400 hover:text-blue-300">✏️ ערוך</button>
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
                        {[{ nameKey: 'o1n', pctKey: 'o1p' }, { nameKey: 'o2n', pctKey: 'o2p' }].map(({ nameKey, pctKey }) => (
                          <div key={nameKey} className="space-y-1">
                            <input type="text" placeholder="שם" value={eo[nameKey] || ''}
                              onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [nameKey]: e.target.value } }))}
                              className="w-full text-xs bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white" />
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max="100" placeholder="%" value={eo[pctKey] || ''}
                                onChange={e => setEditOwner(p => ({ ...p, [branch.id]: { ...p[branch.id], [pctKey]: e.target.value } }))}
                                className="w-full text-xs bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white" />
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

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <div className="font-bold text-gray-700 mb-1">📐 נוסחת חישוב</div>
            <div>מחיר אפקטיבי = מחיר מותאם אישית ?? מחיר סניף ?? ברירת מחדל — לאחר הנחה %</div>
            <div>שכר מאמן = מחיר אפקטיבי × (100%−ניכוי מתנס) × אחוז מאמן × (אימונים אצלו ÷ סה"כ)</div>
            <div>רווח נקי = נטו − שכר מאמנים − הוצאות</div>
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
      <span className={`${color} ${bold ? 'font-black' : 'font-medium'} ${large ? 'text-base' : 'text-sm'}`}>{value}</span>
    </div>
  )
}

function OwnerShare({ name, pct, amount }) {
  return (
    <div className="bg-gray-600 rounded-lg p-2.5 text-center">
      <div className="text-xs text-gray-300 font-semibold mb-1">{name}</div>
      <div className="text-xs text-gray-400">{pct}%</div>
      <div className={`text-lg font-black mt-1 ${amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(amount)}</div>
    </div>
  )
}

function CoachCard({ coach, editCoachRate, setEditCoachRate, editVatType, setEditVatType, saveVatType, saving, saveCoachRate, onExport }) {
  const [expanded, setExpanded] = useState(false)
  const isEdit    = editCoachRate[coach.coachId] !== undefined
  const isSav     = saving === `coach-${coach.coachId}`
  const isVatSav  = saving === `vat-${coach.coachId}`
  const isPatur   = (editVatType[coach.coachId] ?? coach.vatType) === 'patur'

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
          {/* סוג עוסק — מורשה / פטור */}
          <button
            onClick={() => {
              const next = isPatur ? 'murshe' : 'patur'
              setEditVatType(p => ({ ...p, [coach.coachId]: next }))
              saveVatType(coach.coachId, next)
            }}
            disabled={isVatSav}
            title={isPatur ? 'עוסק פטור — לחץ לשינוי' : 'עוסק מורשה — לחץ לשינוי'}
            className={`text-xs font-bold px-2 py-0.5 rounded-lg border transition ${
              isPatur
                ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            }`}
          >
            {isVatSav ? '...' : isPatur ? 'פטור מע"מ' : 'מורשה מע"מ'}
          </button>
          <div className="text-xl font-black text-green-700 bg-green-50 px-3 py-1 rounded-xl border border-green-200">
            {fmt(coach.totalSalary)}
            {isPatur && <span className="text-xs font-medium text-amber-600 mr-1"> (נטו)</span>}
          </div>
          <button onClick={onExport} title="ייצא לאקסל"
            className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 font-bold px-2 py-1 rounded-lg">
            📥 Excel
          </button>
          {coach.totalAthletes > 0 && (
            <button onClick={() => setExpanded(v => !v)} className="text-xs text-gray-400 hover:text-gray-700 font-medium">
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
                <th className="text-center py-1.5 px-2 font-semibold">מחיר</th>
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
                  <td className="py-1.5 px-2 text-center text-gray-500">
                    ₪{Math.round(row.price)}
                    {(row.customPrice != null || row.discountPct > 0) && <span className="text-indigo-400 mr-0.5">★</span>}
                  </td>
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
