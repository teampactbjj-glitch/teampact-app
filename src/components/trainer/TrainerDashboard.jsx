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
      <nav className="bg-white border-b grid grid-cols-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              {t.label}
              {t.id === 'products' && pendingCount > 0 && (
                <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 leading-none">
                  {pendingCount}
                </span>
              )}
            </span>
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
