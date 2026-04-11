import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ProductRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

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
    setRequests(data || [])
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">בקשות מוצרים</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{requests.length} בקשות</span>
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
          {requests.map(req => (
            <li key={req.id} className="bg-white rounded-xl border shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-800">{req.athlete_name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">מעוניין ב: <span className="font-medium text-green-700">{req.product_name}</span></p>
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(req.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
