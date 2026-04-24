import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ProductRequests({ onMarkedDone }) {
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
    console.log('product_requests data:', data, 'error:', error)
    const rows = data || []
    setRequests(rows)
    setLoading(false)
  }

  async function markDone(id) {
    setMarkingId(id)
    const { error } = await supabase
      .from('product_requests')
      .update({ status: 'done' })
      .eq('id', id)
    if (error) { console.error('markDone error:', error); setMarkingId(null); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'done' } : r))
    onMarkedDone?.()
    setMarkingId(null)
  }

  const pending = requests.filter(r => r.status !== 'done')
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
            const isDone = req.status === 'done' // pending / null / anything else → show button
            return (
              <li
                key={req.id}
                className={`rounded-xl border shadow-sm px-4 py-3 transition ${isDone ? 'bg-gray-50 border-gray-200' : 'bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* שורה 1: שם המתאמן + תאריך */}
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>{req.athlete_name}</p>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(req.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                      </span>
                    </div>
                    {/* שורה 2: שם המוצר */}
                    <p className={`text-sm mt-1 ${isDone ? 'text-gray-400' : 'text-gray-700'}`}>
                      📦 {req.product_name}
                    </p>
                    {/* שורה 3: מידה + צבע + כמות - badges */}
                    {(req.selected_size || req.selected_color || (req.quantity && req.quantity > 1)) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {req.selected_size && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                            📏 מידה: {req.selected_size}
                          </span>
                        )}
                        {req.selected_color && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                            🎨 צבע: {req.selected_color}
                          </span>
                        )}
                        {req.quantity && req.quantity > 1 && (
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-medium">
                            × {req.quantity}
                          </span>
                        )}
                      </div>
                    )}
                    {/* שורה 4: הערות (אפשרות רכישה + פרטים נוספים) */}
                    {req.notes && (
                      <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1 leading-relaxed">
                        💬 {req.notes}
                      </p>
                    )}
                    {/* שורה 5: מחיר */}
                    {(req.total_price != null || req.unit_price != null) && (
                      <p className="text-sm font-bold text-emerald-600 mt-1.5">
                        💰 ₪{req.total_price ?? req.unit_price}
                        {req.quantity > 1 && req.unit_price && (
                          <span className="text-xs text-gray-400 font-normal mr-1">
                            (₪{req.unit_price} × {req.quantity})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isDone ? (
                      <span className="text-xs text-gray-400">✓ נרכש</span>
                    ) : (
                      <button
                        onClick={() => markDone(req.id)}
                        disabled={markingId === req.id}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
                      >
                        {markingId === req.id ? '...' : 'סמן כנרכש'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
