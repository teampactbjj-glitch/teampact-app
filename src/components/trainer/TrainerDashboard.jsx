import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import ProductRequests from './ProductRequests'
import { supabase } from '../../lib/supabase'

const TABS = [
  { id: 'classes', label: '📅 היום' },
  { id: 'athletes', label: '👥 מתאמנים' },
  { id: 'announcements', label: '📢 הודעות' },
  { id: 'products', label: '📦 בקשות' },
]

export default function TrainerDashboard({ profile, isAdmin }) {
  const [tab, setTab] = useState(() => localStorage.getItem('trainerTab') || 'classes')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    console.log('TrainerDashboard mounted, tab:', tab)
    fetchPendingCount()
  }, [])

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
      <nav style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', borderBottom:'1px solid #e5e7eb', background:'white'}}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            style={{
              padding:'10px 4px',
              fontSize:'12px',
              fontWeight:'500',
              textAlign:'center',
              borderBottom: tab === t.id ? '2px solid #1d4ed8' : '1px solid #e5e7eb',
              color: tab === t.id ? '#1d4ed8' : '#6b7280',
              background: tab === t.id ? '#eff6ff' : 'none',
              cursor:'pointer',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              gap:'4px',
            }}
          >
            {t.label}
            {t.id === 'products' && pendingCount > 0 && (
              <span style={{background:'red',color:'white',borderRadius:'9999px',fontSize:'10px',padding:'1px 5px',lineHeight:'1.4'}}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="p-4 max-w-3xl mx-auto">
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
