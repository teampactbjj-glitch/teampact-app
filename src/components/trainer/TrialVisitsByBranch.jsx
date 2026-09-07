import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { monthLabel, recentMonths, monthBoundsMs } from '../../lib/reportMonths'

// דוח אימוני ניסיון ששולמו בפועל, מפוצל לפי סניף — לצורך התחשבנות (למשל בין הסניפים
// שדודי מנהל לבד לעומת סניפים בשותפות). נבנה 07.09.2026 בעקבות בקשת דודי. מציג רק
// payment_status='paid' של הרשמות עצמאיות מהאפליקציה (source='app_self_serve') —
// הרשמה שלא הושלמה בתשלום לא נחשבת (אי אפשר להמשיך רישום בלי לשלם, אז אין טעם לספור אותה).
//
// ✅ 07.09.2026 — בורר חודש קלנדרי (כמו שאר הדוחות) במקום "N ימים אחרונים", כדי שדודי
// יוכל לבדוק חודש קודם (למשל אוגוסט כשיושבים בספטמבר) בלי בעיה.
export default function TrialVisitsByBranch() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const availableMonths = recentMonths(6)
  const [selectedMonth, setSelectedMonth] = useState(availableMonths[0])
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  async function load(month = selectedMonth) {
    setLoading(true)
    setErr('')
    try {
      const { start, end } = monthBoundsMs(month.year, month.month)
      const sinceISO = new Date(start).toISOString()
      const untilISO = new Date(end).toISOString()
      const [{ data: branches, error: bErr }, { data: visits, error: vErr }] = await Promise.all([
        supabase.from('branches').select('id, name'),
        supabase.from('trial_visits')
          .select('id, branch_id, visitor_name, paid_amount, paid_at')
          .eq('source', 'app_self_serve')
          .eq('payment_status', 'paid')
          .gte('paid_at', sinceISO)
          .lte('paid_at', untilISO)
          .order('paid_at', { ascending: false }),
      ])
      if (bErr) throw bErr
      if (vErr) throw vErr
      const branchNameOf = new Map((branches || []).map(b => [b.id, b.name]))
      const byBranch = new Map()
      ;(visits || []).forEach(v => {
        const name = branchNameOf.get(v.branch_id) || 'סניף לא ידוע'
        if (!byBranch.has(name)) byBranch.set(name, { name, count: 0, total: 0 })
        const entry = byBranch.get(name)
        entry.count += 1
        entry.total += v.paid_amount || 0
      })
      setRows(Array.from(byBranch.values()).sort((a, b) => b.count - a.count))
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && rows === null) load()
  }

  function changeMonth(m) {
    setSelectedMonth(m)
    load(m)
  }

  const grandTotal = rows?.reduce((s, r) => s + r.total, 0) || 0
  const grandCount = rows?.reduce((s, r) => s + r.count, 0) || 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
      <button onClick={toggleOpen} className="w-full flex items-center justify-between text-right">
        <div className="flex items-center gap-2">
          <span className="text-xl">🥋</span>
          <h3 className="font-black text-gray-900">אימוני ניסיון ששולמו — לפי סניף</h3>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲ סגור' : '▼ פתח'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600 font-semibold">חודש:</span>
            {availableMonths.map(m => (
              <button key={`${m.year}-${m.month}`} onClick={() => changeMonth(m)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg ${selectedMonth.year === m.year && selectedMonth.month === m.month ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                {monthLabel(m.year, m.month)}
              </button>
            ))}
          </div>
          {loading && <p className="text-sm text-gray-500">טוען...</p>}
          {err && <p className="text-sm text-red-600">שגיאה: {err}</p>}
          {!loading && rows && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
                  <div className="text-lg font-black text-emerald-800">{grandCount}</div>
                  <div className="text-[11px] text-emerald-700">סה״כ אימוני ניסיון ששולמו</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
                  <div className="text-lg font-black text-emerald-800">{grandTotal.toLocaleString()} ₪</div>
                  <div className="text-[11px] text-emerald-700">סה״כ נגבה</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="py-1.5 pr-2">סניף</th>
                      <th className="py-1.5">מס׳ ניסיונות ששולמו</th>
                      <th className="py-1.5">סה״כ נגבה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.name} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                        <td className="py-1.5">{r.count}</td>
                        <td className="py-1.5">{r.total.toLocaleString()} ₪</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-400">אין אימוני ניסיון ששולמו בחודש זה</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
