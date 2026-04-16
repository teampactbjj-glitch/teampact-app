import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import ProductRequests from './ProductRequests'
import BottomNav from '../BottomNav'
import { supabase } from '../../lib/supabase'

const VALID_TABS = ['schedule', 'shop', 'profile', 'athletes']

function getSavedTab() {
  const saved = localStorage.getItem('trainerTab')
  return VALID_TABS.includes(saved) ? saved : 'schedule'
}

export default function TrainerDashboard({ profile, isAdmin }) {
  const [activeTab, setActiveTab] = useState(getSavedTab)
  const [pendingCount, setPendingCount] = useState(0)
  const [memberCounts, setMemberCounts] = useState({})
  const [branchMap, setBranchMap] = useState({})

  useEffect(() => {
    fetchPendingCount()
    fetchMemberCounts()
  }, [])

  async function fetchMemberCounts() {
    const [{ data: membersData }, { data: branchesData }] = await Promise.all([
      supabase.from('members').select('branch_id'),
      supabase.from('branches').select('id, name'),
    ])
    const counts = {}
    membersData?.forEach(m => { counts[m.branch_id] = (counts[m.branch_id] || 0) + 1 })
    setMemberCounts(counts)
    const bmap = {}
    branchesData?.forEach(b => { bmap[b.id] = b.name })
    setBranchMap(bmap)
  }

  async function fetchPendingCount() {
    const { count } = await supabase
      .from('product_requests')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'done')
    setPendingCount(count || 0)
  }

  function handleTabChange(id) {
    setActiveTab(id)
    localStorage.setItem('trainerTab', id)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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

      <main className="p-4 max-w-3xl mx-auto">
        <div className={activeTab === 'schedule' ? '' : 'hidden'}>
          <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} />
        </div>

        <div className={activeTab === 'shop' ? '' : 'hidden'}>
          <AnnouncementsManager trainerId={profile?.id} />
          <div className="mt-6">
            <ProductRequests onMarkedDone={fetchPendingCount} />
          </div>
        </div>

        <div className={activeTab === 'athletes' ? '' : 'hidden'}>
          <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} />
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-3xl">🥋</span>
                <div>
                  <p className="font-bold text-gray-800 text-lg leading-tight">{profile?.full_name}</p>
                  <p className="text-sm text-gray-500">{isAdmin ? 'מנהל מערכת' : 'מאמן'}</p>
                </div>
              </div>
            </div>

            {isAdmin && Object.keys(memberCounts).length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-600 mb-3">מתאמנים לפי סניף</p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {Object.entries(memberCounts).map(([branchId, count]) => (
                    <div key={branchId} style={{
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '8px',
                      padding: '12px 20px',
                      textAlign: 'center',
                      minWidth: '80px',
                    }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{count}</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>{branchMap[branchId] || branchId}</div>
                      <div style={{ fontSize: '11px', color: '#4ade80' }}>מתאמנים</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full py-3 border border-red-200 text-red-500 rounded-xl font-medium hover:bg-red-50 transition"
            >
              יציאה מהמערכת
            </button>
          </div>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isTrainer={true}
        pendingCount={pendingCount}
      />
    </div>
  )
}
