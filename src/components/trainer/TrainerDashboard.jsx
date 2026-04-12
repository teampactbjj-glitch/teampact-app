import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import ProductRequests from './ProductRequests'
import { supabase } from '../../lib/supabase'

const TABS = [
  { id: 'classes', icon: '📅', label: 'היום' },
  { id: 'athletes', icon: '👥', label: 'מתאמנים' },
  { id: 'announcements', icon: '📢', label: 'הודעות' },
  { id: 'products', icon: '📦', label: 'בקשות' },
]

export default function TrainerDashboard({ profile, isAdmin }) {
  const [tab, setTab] = useState(() => localStorage.getItem('trainerTab') || 'classes')
  const [pendingCount, setPendingCount] = useState(0)
  const [memberCounts, setMemberCounts] = useState({})

  useEffect(() => {
    console.log('TrainerDashboard mounted, tab:', tab)
    fetchPendingCount()
    fetchMemberCounts()
  }, [])

  async function fetchMemberCounts() {
    const { data: membersData } = await supabase.from('members').select('branch_id')
    const counts = {}
    membersData?.forEach(m => { counts[m.branch_id] = (counts[m.branch_id] || 0) + 1 })
    setMemberCounts(counts)
  }

  async function fetchPendingCount() {
    const { count, error } = await supabase
      .from('product_requests')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'done')
    console.log('fetchPendingCount → count:', count, 'error:', error)
    setPendingCount(count || 0)
  }

  function handleTabChange(id) {
    setTab(id)
    localStorage.setItem('trainerTab', id)
  }

  console.log('TABS length:', TABS.length, TABS.map(t => t.id))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🥋</span>
          <div>
            <div className="flex items-center gap-2 leading-none">
              <h1 className="font-bold text-lg">TeamPact</h1>
              {isAdmin && (
                <span className="text-xs bg-yellow-400 text-yellow-900 font-semibold px-2 py-0.5 rounded-full">
                  מנהל
                </span>
              )}
            </div>
            <p className="text-blue-200 text-xs mt-0.5">
              {isAdmin ? 'מנהל מערכת' : 'מאמן'}: {profile?.full_name}
            </p>
          </div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-blue-200 hover:text-white text-sm"
        >
          יציאה
        </button>
      </header>

      {console.log('TrainerDashboard render — tab:', tab, 'pendingCount:', pendingCount)}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'auto auto', background:'white', borderBottom:'1px solid #e5e7eb'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            style={{padding:'12px', fontSize:'13px', fontWeight:'500', textAlign:'center',
              borderBottom: tab === t.id ? '2px solid #1d4ed8' : '2px solid transparent',
              color: tab === t.id ? '#1d4ed8' : '#6b7280', background:'none', cursor:'pointer',
              position:'relative'}}>
            {t.icon} {t.label}
            {t.id === 'products' && pendingCount > 0 &&
              <span style={{position:'absolute', top:'6px', right:'6px', background:'red', color:'white',
                borderRadius:'50%', width:'16px', height:'16px', fontSize:'10px', display:'flex',
                alignItems:'center', justifyContent:'center', fontWeight:'bold'}}>{pendingCount}</span>}
          </button>
        ))}
      </div>

      <main className="p-4 max-w-3xl mx-auto">
        <div style={{display:'flex', gap:'16px', marginBottom:'16px'}}>
          {Object.entries(memberCounts).map(([branchId, count]) => (
            <div key={branchId} style={{background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'8px', padding:'12px 20px', textAlign:'center'}}>
              <div style={{fontSize:'24px', fontWeight:'bold', color:'#166534'}}>{count}</div>
              <div style={{fontSize:'13px', color:'#166534'}}>מתאמנים</div>
            </div>
          ))}
        </div>
        <div className={tab === 'classes' ? '' : 'hidden'}>
          <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} />
        </div>
        <div className={tab === 'athletes' ? '' : 'hidden'}>
          <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} />
        </div>
        <div className={tab === 'announcements' ? '' : 'hidden'}>
          <AnnouncementsManager trainerId={profile?.id} />
        </div>
        <div className={tab === 'products' ? '' : 'hidden'}>
          <ProductRequests onMarkedDone={fetchPendingCount} />
        </div>
      </main>
    </div>
  )
}
