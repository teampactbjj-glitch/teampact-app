import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SUB_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

export default function ProfileChangeRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profile_change_requests').select('*')
      .eq('status', 'pending').order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function approve(req) {
    setProcessingId(req.id)
    if (req.change_type === 'email') {
      await supabase.from('members').update({ email: req.requested_value }).eq('id', req.athlete_id)
    } else if (req.change_type === 'subscription') {
      await supabase.from('members').update({ subscription_type: req.requested_value }).eq('id', req.athlete_id)
    }
    await supabase.from('profile_change_requests').update({ status: 'approved' }).eq('id', req.id)
    setProcessingId(null)
    load()
  }

  async function reject(id) {
    setProcessingId(id)
    await supabase.from('profile_change_requests').update({ status: 'rejected' }).eq('id', id)
    setProcessingId(null)
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-8">טוען...</p>

  if (requests.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-2">✅</div>
      <p>אין בקשות ממתינות</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-800">בקשות לאישור</h2>
      {requests.map(req => (
        <div key={req.id} className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-semibold text-gray-800">{req.athlete_name}</p>
              <p className="text-sm text-gray-600 mt-1">
                {req.change_type === 'email' ? '📧 שינוי מייל' : '🎫 שינוי מנוי'}
              </p>
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <p>מ: <span className="line-through">
                  {req.change_type === 'subscription' ? (SUB_LABELS[req.current_value] || req.current_value) : req.current_value}
                </span></p>
                <p>ל: <span className="font-semibold text-emerald-700">
                  {req.change_type === 'subscription' ? (SUB_LABELS[req.requested_value] || req.requested_value) : req.requested_value}
                </span></p>
              </div>
              {req.note && <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded">💬 {req.note}</p>}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => approve(req)} disabled={processingId === req.id}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {processingId === req.id ? '...' : '✓ אשר'}
            </button>
            <button onClick={() => reject(req.id)} disabled={processingId === req.id}
              className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg text-sm font-semibold hover:bg-red-100">
              ✗ דחה
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
