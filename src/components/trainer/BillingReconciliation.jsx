import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

// דוח התאמה חודשית — סניפי קאונטרי (branches.requires_facility_waiver=true).
// נבנה 06.09.2026 בעקבות בקשת דודי: לוודא כל סוף חודש שרשימת המתאמנים הפעילים
// תואמת את מה שבאמת נגבה דרך invoice4u-charge-monthly. לא שולף כלום מ-Invoice4u —
// מציג את מה שכבר נשמר ב-members (invoice4u_last_charge_at/status) מול מה שהיה
// אמור לקרות, לפי אותה שאילתת-זכאות בדיוק כמו ה-cron החודשי עצמו.
const SUB_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

const STATE_LABELS = {
  paid: 'שולם החודש',
  failed: 'נכשל החודש',
  pending: 'טרם נגבה החודש',
  no_token: 'בלי טוקן שמור',
  frozen: 'מוקפא',
  cancelling: 'בביטול',
  not_applicable: 'לא רלוונטי',
}
const STATE_TONES = {
  paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  no_token: 'bg-gray-100 text-gray-600',
  frozen: 'bg-blue-100 text-blue-800',
  cancelling: 'bg-orange-100 text-orange-800',
  not_applicable: 'bg-gray-50 text-gray-400',
}
const STATE_ORDER = { failed: 0, no_token: 1, pending: 2, cancelling: 3, frozen: 4, paid: 5, not_applicable: 6 }

// זהה בדיוק ל-effectiveAmount ב-invoice4u-charge-monthly — כדי שהסכום הצפוי כאן יתאים
// בדיוק למה שהחיוב החודשי בפועל ינסה לגבות.
function effectiveAmount(basePrice, discountPct, discountValidUntil, customPrice) {
  if (customPrice != null) return customPrice
  const today = new Date().toISOString().slice(0, 10)
  const discountActive = discountPct && discountPct > 0 && (!discountValidUntil || discountValidUntil >= today)
  if (discountActive) return Math.round(basePrice * (1 - discountPct / 100))
  return basePrice
}

function StateBadge({ state }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATE_TONES[state] || ''}`}>
      {STATE_LABELS[state] || state}
    </span>
  )
}

function MiniStat({ label, value, tone }) {
  const tones = {
    red: 'bg-red-50 text-red-800 border-red-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  }
  return (
    <div className={`rounded-lg border p-2 text-center ${tones[tone] || tones.gray}`}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  )
}

export default function BillingReconciliation() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const { data: branches, error: bErr } = await supabase
        .from('branches').select('id, name').eq('requires_facility_waiver', true)
      if (bErr) throw bErr
      const branchIds = (branches || []).map(b => b.id)
      if (!branchIds.length) { setRows([]); setLoading(false); return }

      const [{ data: members, error: mErr }, { data: prices, error: pErr }] = await Promise.all([
        supabase.from('members')
          .select('id, full_name, phone, branch_id, subscription_type, custom_price, discount_pct, discount_valid_until, invoice4u_customer_id, invoice4u_token_status, invoice4u_last_charge_at, invoice4u_last_charge_status, membership_status, status, active, cancel_date')
          .in('branch_id', branchIds)
          .eq('active', true)
          .eq('status', 'approved')
          .is('deleted_at', null),
        supabase.from('branch_subscription_prices').select('branch_id, subscription_type, price').in('branch_id', branchIds),
      ])
      if (mErr) throw mErr
      if (pErr) throw pErr

      const priceMap = new Map((prices || []).map(p => [`${p.branch_id}|${p.subscription_type}`, p.price]))
      const branchNameOf = new Map((branches || []).map(b => [b.id, b.name]))
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

      const out = (members || []).map(m => {
        const basePrice = priceMap.get(`${m.branch_id}|${m.subscription_type}`)
        const expected = effectiveAmount(basePrice ?? 0, m.discount_pct, m.discount_valid_until, m.custom_price)
        const chargedThisMonth = m.invoice4u_last_charge_at && new Date(m.invoice4u_last_charge_at) >= monthStart

        let state = 'not_applicable'
        if (m.membership_status === 'frozen') state = 'frozen'
        else if (m.cancel_date) state = 'cancelling'
        else if (!m.invoice4u_customer_id || m.invoice4u_token_status !== 'active') state = 'no_token'
        else if (m.membership_status === 'active') {
          if (chargedThisMonth && m.invoice4u_last_charge_status === 'success') state = 'paid'
          else if (chargedThisMonth && m.invoice4u_last_charge_status === 'failed') state = 'failed'
          else state = 'pending'
        }

        return {
          id: m.id,
          name: m.full_name,
          phone: m.phone,
          branch: branchNameOf.get(m.branch_id) || '—',
          sub: SUB_LABELS[m.subscription_type] || m.subscription_type,
          expected,
          state,
          lastChargeAt: m.invoice4u_last_charge_at,
        }
      })
      out.sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9))
      setRows(out)
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

  function exportExcel() {
    if (!rows?.length) return
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'שם': r.name,
      'טלפון': r.phone || '',
      'סניף': r.branch,
      'מנוי': r.sub,
      'סכום צפוי': r.expected,
      'סטטוס': STATE_LABELS[r.state] || r.state,
      'חיוב אחרון': r.lastChargeAt ? new Date(r.lastChargeAt).toLocaleDateString('he-IL') : '—',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'התאמה חודשית')
    const monthLabel = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    XLSX.writeFile(wb, `התאמת_גביה_${monthLabel}.xlsx`)
  }

  const failedCount = rows?.filter(r => r.state === 'failed').length || 0
  const pendingCount = rows?.filter(r => r.state === 'pending').length || 0
  const noTokenCount = rows?.filter(r => r.state === 'no_token').length || 0
  const paidTotal = rows?.filter(r => r.state === 'paid').reduce((s, r) => s + (r.expected || 0), 0) || 0
  const expectedTotal = rows?.filter(r => ['paid', 'failed', 'pending'].includes(r.state)).reduce((s, r) => s + (r.expected || 0), 0) || 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
      <button onClick={toggleOpen} className="w-full flex items-center justify-between text-right">
        <div className="flex items-center gap-2">
          <span className="text-xl">💳</span>
          <h3 className="font-black text-gray-900">התאמת גביה חודשית — קאונטרי</h3>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲ סגור' : '▼ פתח'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && <p className="text-sm text-gray-500">טוען...</p>}
          {err && <p className="text-sm text-red-600">שגיאה: {err}</p>}
          {!loading && rows && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MiniStat label="נכשלו החודש" value={failedCount} tone="red" />
                <MiniStat label="טרם נגבו החודש" value={pendingCount} tone="amber" />
                <MiniStat label="בלי טוקן שמור" value={noTokenCount} tone="gray" />
                <MiniStat label="נגבה בפועל החודש" value={`${paidTotal.toLocaleString()} ₪`} tone="green" />
              </div>
              {expectedTotal > 0 && paidTotal < expectedTotal && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  צפי גביה החודש (כולל טרם נגבה/נכשל): {expectedTotal.toLocaleString()} ₪ — פער של {(expectedTotal - paidTotal).toLocaleString()} ₪ מול מה שכבר נגבה בפועל.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={load} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-3 py-1.5 rounded-lg">🔄 רענן</button>
                <button onClick={exportExcel} disabled={!rows.length} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold px-3 py-1.5 rounded-lg">📥 Excel</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="py-1.5 pr-2">שם</th>
                      <th className="py-1.5">סניף</th>
                      <th className="py-1.5">מנוי</th>
                      <th className="py-1.5">סכום צפוי</th>
                      <th className="py-1.5">סטטוס</th>
                      <th className="py-1.5">חיוב אחרון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                        <td className="py-1.5">{r.branch}</td>
                        <td className="py-1.5">{r.sub}</td>
                        <td className="py-1.5">{r.expected ? `${r.expected} ₪` : '—'}</td>
                        <td className="py-1.5"><StateBadge state={r.state} /></td>
                        <td className="py-1.5 text-gray-500">{r.lastChargeAt ? new Date(r.lastChargeAt).toLocaleDateString('he-IL') : '—'}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="py-4 text-center text-gray-400">אין מתאמנים בסניף קאונטרי</td></tr>
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
