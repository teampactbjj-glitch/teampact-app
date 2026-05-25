import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast, useConfirm } from '../a11y'

const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

export default function LeadsManager({ trainerId = null, isAdmin = false } = {}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState({})
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => { fetchAll() }, [trainerId, isAdmin])

  async function fetchAll() {
    setLoading(true)

    // מאמן רגיל רואה רק לידים שנרשמו אליו (לפי coach_id/requested_coach_name);
    // מנהל רואה הכל, כולל unlimited (שלא משויך למאמן)
    let coachNames = []
    let coachIds = []
    if (!isAdmin && trainerId) {
      const { data: myCoaches } = await supabase
        .from('coaches').select('id, name').eq('user_id', trainerId)
      coachNames = (myCoaches || []).map(c => c.name).filter(Boolean)
      coachIds   = (myCoaches || []).map(c => c.id).filter(Boolean)
    }

    const [{ data: leadsData }, { data: branchData }] = await Promise.all([
      supabase.from('members').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name'),
    ])

    let filtered = leadsData || []
    if (!isAdmin && trainerId) {
      filtered = filtered.filter(l => {
        if (l.subscription_type === 'unlimited') return false
        if (l.coach_id && coachIds.includes(l.coach_id)) return true
        if (l.requested_coach_name && coachNames.includes(l.requested_coach_name)) return true
        if (Array.isArray(l.requested_coach_names) && l.requested_coach_names.some(n => coachNames.includes(n))) return true
        return false
      })
    }

    setLeads(filtered)
    const bmap = {}
    branchData?.forEach(b => { bmap[b.id] = b.name })
    setBranches(bmap)
    setLoading(false)
  }

  async function approveLead(lead, subType) {
    setActionLoading(p => ({ ...p, [lead.id]: 'approving' }))
    await supabase.from('members').update({ status: 'active', subscription_type: subType }).eq('id', lead.id)
    // מייל אישור (אם ה-Edge Function לא מוגדרת — פשוט נתעלם משגיאה)
    if (lead.email) {
      supabase.functions.invoke('send-approval-email', {
        body: { email: lead.email, full_name: lead.full_name },
      }).catch(err => console.warn('send-approval-email skipped:', err?.message || err))
    }
    setLeads(p => p.filter(l => l.id !== lead.id))
    setActionLoading(p => ({ ...p, [lead.id]: null }))
  }

  async function rejectLead(id) {
    const ok = await confirm({ title: 'מחיקת בקשה', message: 'למחוק את הבקשה?', confirmText: 'מחק', danger: true })
    if (!ok) return
    setActionLoading(p => ({ ...p, [id]: 'rejecting' }))
    await supabase.from('members').delete().eq('id', id)
    setLeads(p => p.filter(l => l.id !== id))
    setActionLoading(p => ({ ...p, [id]: null }))
  }

  const registrationLink = `${window.location.origin}/register`

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-900 mb-2">🔗 קישור רישום למתאמנים חדשים</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={registrationLink}
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700"
          />
          <button
            onClick={() => { navigator.clipboard.writeText(registrationLink); toast.success('הקישור הועתק') }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          >
            העתק
          </button>
        </div>
        <p className="text-xs text-blue-700 mt-2">שלח את הקישור במייל / וואטסאפ. מתאמנים שנרשמים דרכו יופיעו ברשימה למטה לאישור.</p>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען...</p>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm">אין בקשות הצטרפות ממתינות</p>
        </div>
      ) : (
        leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            branches={branches}
            loading={actionLoading[lead.id]}
            onApprove={(sub) => approveLead(lead, sub)}
            onReject={() => rejectLead(lead.id)}
          />
        ))
      )}
    </div>
  )
}

function LeadCard({ lead, branches, loading, onApprove, onReject }) {
  const [subType, setSubType] = useState(lead.subscription_type || '2x_week')
  const leadBranchIds = lead.branch_ids?.length ? lead.branch_ids : (lead.branch_id ? [lead.branch_id] : [])
  const branchNames = leadBranchIds.map(id => branches[id]).filter(Boolean).join(', ') || '—'

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-800">{lead.full_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{lead.email}</p>
          {lead.phone && <p className="text-xs text-gray-500">{lead.phone}</p>}
          <p className="text-xs text-blue-600 mt-1">📍 {branchNames}</p>
          {(() => {
            const coachName = lead.requested_coach_name
              || (Array.isArray(lead.requested_coach_names) ? lead.requested_coach_names.filter(Boolean).join(', ') : '')
            return coachName ? <p className="text-xs text-purple-600 mt-0.5">👤 מאמן מבוקש: {coachName}</p> : null
          })()}
          {lead.subscription_type && (
            <p className="text-xs text-emerald-700 mt-0.5">🏋️ נרשם ל-: {SUB_LABELS[lead.subscription_type] || lead.subscription_type}</p>
          )}
        </div>
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">ממתין</span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">סוג מנוי לאישור</label>
          {lead.subscription_type && (
            <span className="text-[11px] text-gray-500">
              בחירת המתאמן: <span className="font-semibold text-gray-700">{SUB_LABELS[lead.subscription_type] || lead.subscription_type}</span>
              {subType !== lead.subscription_type && <span className="text-orange-600 mr-1">(שונה)</span>}
            </span>
          )}
        </div>
        <select
          className="w-full border rounded-lg px-3 py-1.5 text-sm"
          value={subType}
          onChange={e => setSubType(e.target.value)}
        >
          {Object.entries(SUB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">ניתן לערוך לפני אישור</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(subType)}
          disabled={!!loading}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading === 'approving' ? '...' : '✓ אשר'}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={!!loading}
          className="flex-1 py-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading === 'rejecting' ? '...' : '✕ דחה'}
        </button>
      </div>
    </div>
  )
}
