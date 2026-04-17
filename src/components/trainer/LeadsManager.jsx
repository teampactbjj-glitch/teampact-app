import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

export default function LeadsManager() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState({})
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: leadsData }, { data: branchData }] = await Promise.all([
      supabase.from('members').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name'),
    ])
    setLeads(leadsData || [])
    const bmap = {}
    branchData?.forEach(b => { bmap[b.id] = b.name })
    setBranches(bmap)
    setLoading(false)
  }

  async function approveLead(lead, subType) {
    setActionLoading(p => ({ ...p, [lead.id]: 'approving' }))
    await supabase.from('members').update({ status: 'active', subscription_type: subType }).eq('id', lead.id)
    setLeads(p => p.filter(l => l.id !== lead.id))
    setActionLoading(p => ({ ...p, [lead.id]: null }))
  }

  async function rejectLead(id) {
    if (!window.confirm('למחוק את הבקשה?')) return
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
            onClick={() => { navigator.clipboard.writeText(registrationLink); alert('הקישור הועתק') }}
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
  const branchName = lead.branch_ids?.[0] ? branches[lead.branch_ids[0]] : branches[lead.branch_id] || '—'

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-800">{lead.full_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{lead.email}</p>
          {lead.phone && <p className="text-xs text-gray-500">{lead.phone}</p>}
          <p className="text-xs text-blue-600 mt-1">📍 {branchName}</p>
        </div>
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">ממתין</span>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">סוג מנוי לאישור</label>
        <select
          className="w-full border rounded-lg px-3 py-1.5 text-sm"
          value={subType}
          onChange={e => setSubType(e.target.value)}
        >
          {Object.entries(SUB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
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
