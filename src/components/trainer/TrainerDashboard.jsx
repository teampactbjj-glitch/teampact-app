import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import ProductRequests from './ProductRequests'
import LeadsManager from './LeadsManager'
import BottomNav from '../BottomNav'
import { supabase } from '../../lib/supabase'

const VALID_TABS = ['schedule', 'shop', 'profile', 'athletes', 'leads']

function getSavedTab() {
  const saved = localStorage.getItem('trainerTab')
  return VALID_TABS.includes(saved) ? saved : 'schedule'
}

export default function TrainerDashboard({ profile, isAdmin }) {
  const [activeTab, setActiveTab] = useState(getSavedTab)
  const [pendingCount, setPendingCount] = useState(0)
  const [leadsCount, setLeadsCount] = useState(0)
  const [branchMap, setBranchMap] = useState({})
  const [selectedBranch, setSelectedBranch] = useState(null)

  useEffect(() => {
    fetchPendingCount()
    fetchLeadsCount()
    fetchMemberCounts()
  }, [])

  async function fetchMemberCounts() {
    const { data: branchesData } = await supabase.from('branches').select('id, name')
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

  async function fetchLeadsCount() {
    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setLeadsCount(count || 0)
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
                <span className="text-xs bg-yellow-400 text-yellow-900 font-semibold px-2 py-0.5 rounded-full">מנהל</span>
              )}
            </div>
            <p className="text-blue-200 text-xs mt-0.5">
              {isAdmin ? 'מנהל מערכת' : 'מאמן'}: {profile?.full_name}
            </p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-blue-200 hover:text-white text-sm">
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
          {Object.keys(branchMap).length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedBranch(null)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  selectedBranch === null ? 'bg-blue-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                כל הסניפים
              </button>
              {Object.entries(branchMap).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedBranch(id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    selectedBranch === id ? 'bg-blue-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} branchFilter={selectedBranch} />
        </div>

        <div className={activeTab === 'leads' ? '' : 'hidden'}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800">בקשות הצטרפות</h2>
            {leadsCount > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {leadsCount} ממתינים
              </span>
            )}
          </div>
          <LeadsManager />
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
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-600 font-medium mb-1">לינק רישום למתאמנים חדשים:</p>
                <p className="text-xs text-blue-800 font-mono break-all">{window.location.origin}/register</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/register`)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  📋 העתק לינק
                </button>
              </div>
            </div>
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
        leadsCount={leadsCount}
      />
    </div>
  )
}
