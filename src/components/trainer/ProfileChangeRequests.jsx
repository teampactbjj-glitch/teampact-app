import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../a11y'
import { getBeltLabel } from '../../lib/belts'

const SUB_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

export default function ProfileChangeRequests({ onChange, branchFilter = null }) {
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [branchesMap, setBranchesMap] = useState({})
  const [membersMap, setMembersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data }, { data: branches }] = await Promise.all([
      supabase.from('profile_change_requests').select('*')
        .eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name'),
    ])
    const bMap = {}
    ;(branches || []).forEach(b => { bMap[b.id] = b.name })
    setBranchesMap(bMap)

    // שליפת פרטי המתאמנים כדי להציג שם + סניפים נוכחיים גם לבקשות ישנות
    const athleteIds = [...new Set((data || []).map(r => r.athlete_id).filter(Boolean))]
    let mMap = {}
    if (athleteIds.length > 0) {
      const { data: members } = await supabase.from('members')
        .select('id, full_name, branch_ids, branch_id, subscription_type, belt, belt_stripes, belt_received_at, bjj_start_date, trains_gi, trains_nogi, belt_category')
        .in('id', athleteIds)
      ;(members || []).forEach(m => { mMap[m.id] = m })
    }
    setMembersMap(mMap)
    // סינון לפי סניף (למזכירה שיש לה branchFilter)
    const allRequests = data || []
    const filtered = branchFilter
      ? allRequests.filter(r => {
          const m = mMap[r.athlete_id]
          if (!m) return false
          const bids = Array.isArray(m.branch_ids) && m.branch_ids.length > 0 ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
          return bids.includes(branchFilter)
        })
      : allRequests
    setRequests(filtered)
    setLoading(false)
  }

  async function approve(req) {
    setProcessingId(req.id)
    let memberError = null
    if (req.change_type === 'email') {
      const { error } = await supabase.from('members').update({ email: req.requested_value }).eq('id', req.athlete_id)
      memberError = error
    } else if (req.change_type === 'subscription') {
      const update = { subscription_type: req.requested_value }
      if (Array.isArray(req.requested_branch_ids) && req.requested_branch_ids.length > 0) {
        update.branch_ids = req.requested_branch_ids
      }
      const { error } = await supabase.from('members').update(update).eq('id', req.athlete_id)
      memberError = error
    } else if (req.change_type === 'membership_freeze') {
      const { error } = await supabase.from('members').update({ membership_status: 'frozen' }).eq('id', req.athlete_id)
      memberError = error
    } else if (req.change_type === 'membership_cancel') {
      // ביטול — תחול בסוף החודש
      const today = new Date()
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const cancelDate = lastDay.toISOString().split('T')[0]
      const { error } = await supabase.from('members').update({ cancel_date: cancelDate }).eq('id', req.athlete_id)
      memberError = error
    } else if (req.change_type === 'belt') {
      // אישור דרגה: עדכון members + INSERT ל-belt_history (source='manual')
      const beltVal = req.requested_belt || req.requested_value
      const stripes = Number(req.requested_belt_stripes) || 0
      const cat = beltVal && beltVal.startsWith('kids_') ? 'kids' : 'adult'
      const update = {
        belt: beltVal,
        belt_stripes: stripes,
        belt_category: cat,
        belt_received_at: req.requested_belt_received_at || null,
        bjj_start_date: req.requested_bjj_start_date || null,
      }
      if (req.requested_trains_gi != null) update.trains_gi = !!req.requested_trains_gi
      if (req.requested_trains_nogi != null) update.trains_nogi = !!req.requested_trains_nogi
      if (req.requested_birth_date) update.birth_date = req.requested_birth_date
      const { error: memErr } = await supabase.from('members').update(update).eq('id', req.athlete_id)
      memberError = memErr
      // INSERT ל-belt_history — fallback ל-bjj_start_date אם אין belt_received_at (לבנה חדשה)
      const historyDate = req.requested_belt_received_at || req.requested_bjj_start_date || null
      if (!memErr && historyDate) {
        const { error: histErr } = await supabase.from('belt_history').upsert({
          member_id: req.athlete_id,
          belt: beltVal,
          belt_stripes: stripes,
          received_at: historyDate,
          source: 'manual',
          notes: 'אושר מתוך בקשת אישור דרגה',
        }, { onConflict: 'member_id,belt,belt_stripes', ignoreDuplicates: true })
        if (histErr) console.warn('belt_history upsert (non-fatal):', histErr.message)
      }
    }
    if (memberError) {
      console.error('approve member update error:', memberError)
      toast.error('שגיאה בעדכון פרטי המתאמן: ' + (memberError.message || 'נסה שוב'))
      setProcessingId(null)
      return
    }
    const { error: reqError } = await supabase.from('profile_change_requests').update({ status: 'approved' }).eq('id', req.id)
    if (reqError) {
      console.error('approve request update error:', reqError)
      toast.error('שגיאה בעדכון סטטוס הבקשה: ' + (reqError.message || 'נסה שוב'))
      setProcessingId(null)
      return
    }
    setProcessingId(null)
    load()
    onChange?.()
  }

  async function reject(id) {
    setProcessingId(id)
    const { error } = await supabase.from('profile_change_requests').update({ status: 'rejected' }).eq('id', id)
    if (error) {
      console.error('reject error:', error)
      toast.error('שגיאה בדחיית הבקשה: ' + (error.message || 'נסה שוב'))
      setProcessingId(null)
      return
    }
    setProcessingId(null)
    load()
    onChange?.()
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
      <h3 className="text-lg font-bold text-gray-800">בקשות לאישור</h3>
      {requests.map(req => {
        const m = membersMap[req.athlete_id]
        const displayName = req.athlete_name || m?.full_name || '— ללא שם —'
        const currentBranchIds = Array.isArray(m?.branch_ids) && m.branch_ids.length > 0
          ? m.branch_ids
          : (m?.branch_id ? [m.branch_id] : [])
        const currentBranchNames = currentBranchIds.map(id => branchesMap[id] || '—').join(', ') || '—'
        const sessions = req.requested_branch_sessions // jsonb {branchId: count}
        const isBelt = req.change_type === 'belt'
        const beltVal = req.requested_belt || req.requested_value
        const trainTypeLabel = isBelt ? (
          (req.requested_trains_gi && req.requested_trains_nogi) ? 'גי + נו-גי'
          : req.requested_trains_nogi ? 'נו-גי בלבד'
          : req.requested_trains_gi ? 'גי בלבד'
          : '—'
        ) : null
        return (
        <div key={req.id} className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-semibold text-gray-800">{displayName}</p>
              <p className="text-sm text-gray-600 mt-1">
                {req.change_type === 'email' && '📧 שינוי מייל'}
                {req.change_type === 'subscription' && '🎫 שינוי מנוי'}
                {req.change_type === 'belt' && '🥋 בקשת אישור דרגה'}
                {req.change_type === 'membership_freeze' && '❄️ בקשת הקפאת מנוי'}
                {req.change_type === 'membership_cancel' && '🚫 בקשת ביטול מנוי'}
              </p>
              {(req.change_type === 'membership_freeze' || req.change_type === 'membership_cancel') && (
                <div className={`mt-2 text-xs rounded-lg p-2.5 space-y-1 ${req.change_type === 'membership_freeze' ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'}`}>
                  {req.change_type === 'membership_freeze' && (
                    <p className="text-blue-700 font-medium">הקפאה תחול מיידית עם האישור</p>
                  )}
                  {req.change_type === 'membership_cancel' && (
                    <p className="text-red-700 font-medium">הביטול ייכנס לתוקף בסוף החודש הנוכחי</p>
                  )}
                  {req.note && <p className="text-gray-600">סיבה: {req.note}</p>}
                </div>
              )}
              {!isBelt && req.change_type !== 'membership_freeze' && req.change_type !== 'membership_cancel' && (
                <div className="text-xs text-gray-500 mt-2 space-y-1">
                  <p>מ: <span className="line-through">
                    {req.change_type === 'subscription' ? (SUB_LABELS[req.current_value] || req.current_value) : req.current_value}
                  </span></p>
                  <p>ל: <span className="font-semibold text-emerald-700">
                    {req.change_type === 'subscription' ? (SUB_LABELS[req.requested_value] || req.requested_value) : req.requested_value}
                  </span></p>
                </div>
              )}
              {isBelt && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                  <p>חגורה נוכחית: <span className="line-through text-gray-500">{m?.belt ? getBeltLabel(m.belt) : '—'}</span></p>
                  <p>חגורה מבוקשת: <span className="font-bold text-amber-800">{getBeltLabel(beltVal)}</span>
                    {req.requested_belt_stripes > 0 && <span className="text-amber-700"> · {req.requested_belt_stripes} פסים</span>}
                  </p>
                  <p>סוג אימון: <span className="font-semibold">{trainTypeLabel}</span></p>
                  {req.requested_belt_received_at && (
                    <p>תאריך קבלת החגורה: <span className="font-semibold">{req.requested_belt_received_at}</span></p>
                  )}
                  {req.requested_bjj_start_date && (
                    <p>התחלת BJJ: <span className="font-semibold">{req.requested_bjj_start_date}</span></p>
                  )}
                  {req.requested_birth_date && (
                    <p>תאריך לידה: <span className="font-semibold text-blue-800">{req.requested_birth_date}</span></p>
                  )}
                  {req.prior_academy && (
                    <p>אקדמיה קודמת: <span className="font-semibold">{req.prior_academy}</span></p>
                  )}
                </div>
              )}
              {req.change_type === 'subscription' && (
                <div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                  <p>📍 סניפים נוכחיים: <span className="font-semibold text-gray-700">{currentBranchNames}</span></p>
                  {Array.isArray(req.requested_branch_ids) && req.requested_branch_ids.length > 0 && (
                    <p>📍 סניפים מבוקשים: <span className="font-semibold text-blue-700">
                      {req.requested_branch_ids.map(id => branchesMap[id] || '—').join(', ')}
                    </span></p>
                  )}
                  {sessions && typeof sessions === 'object' && Object.keys(sessions).length > 0 && (
                    <div>
                      <p className="font-semibold text-gray-700">חלוקת אימונים לפי סניף:</p>
                      <ul className="pr-4 list-disc">
                        {Object.entries(sessions).map(([bid, count]) => (
                          <li key={bid}>{branchesMap[bid] || '—'}: <span className="font-bold">{count}</span> אימונים בשבוע</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
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
        )
      })}
    </div>
  )
}
