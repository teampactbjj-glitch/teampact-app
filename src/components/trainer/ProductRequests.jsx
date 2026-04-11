import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ProductRequests({ onPendingCount }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState(null)

  useEffect(() => {
    fetchRequests()
  }, [])

  async function fetchRequests() {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('fetchRequests error:', error)
    const rows = data || []
    setRequests(rows)
    onPendingCount?.(rows.filter(r => r.status === 'pending').length)
    setLoading(false)
  }

  async function markDone(id) {
    setMarkingId(id)
    const { error } = await supabase
      .from('product_requests')
      .update({ status: 'done' })
      .eq('id', id)
    if (error) { console.error('markDone error:', error); setMarkingId(null); return }
    setRequests(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, status: 'done' } : r)
      onPendingCount?.(updated.filter(r => r.status === 'pending').length)
      return updated
    })
    setMarkingId(null)
  }

  const pending = requests.filter(r => r.status === 'pending')
  const done = requests.filter(r => r.status === 'done')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">בקשות מוצרים</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
          {pending.length} ממתינות · {done.length} טופלו
        </span>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">טוען...</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📦</div>
          <p>אין בקשות עדיין</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map(req => {
            const isDone = req.status === 'done'
            return (
              <li
                key={req.id}
                className={`rounded-xl border shadow-sm px-4 py-3 transition ${isDone ? 'bg-gray-50 border-gray-200' : 'bg-white'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>{req.athlete_name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {req.product_name}
                      <span className="text-gray-300 mx-1">·</span>
                      {new Date(req.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  {isDone ? (
                    <span className="text-xs text-gray-400 shrink-0">✓ נרכש</span>
                  ) : (
                    <button
                      onClick={() => markDone(req.id)}
                      disabled={markingId === req.id}
                      className="shrink-0 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
                    >
                      {markingId === req.id ? '...' : 'סמן כנרכש'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
