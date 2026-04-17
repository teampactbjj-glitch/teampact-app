import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ProfileChangeRequests from './ProfileChangeRequests'
import ShopManager from './ShopManager'
import BottomNav from '../BottomNav'
import { supabase } from '../../lib/supabase'

export default function TrainerDashboard({ profile, isAdmin }) {
  const [activeTab, setActiveTab]       = useState('schedule')
  const [leadsCount, setLeadsCount]     = useState(0)
  const [ordersCount, setOrdersCount]   = useState(0)
  const [requestsCount, setRequestsCount] = useState(0)

  useEffect(() => { refreshCounts() }, [])

  async function refreshCounts() {
    const [{ count: leads }, { count: orders }, { count: requests }] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('product_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profile_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setLeadsCount(leads || 0)
    setOrdersCount(orders || 0)
    setRequestsCount(requests || 0)
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
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
            <p className="text-blue-200 text-xs mt-0.5">{isAdmin ? 'מנהל מערכת' : 'מאמן'}: {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-blue-200 hover:text-white text-sm">יציאה</button>
      </header>

      <main className="p-4 max-w-3xl mx-auto pb-24">
        {activeTab === 'schedule' && <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} />}

        {activeTab === 'athletes' && (
          <div className="space-y-6">
            {leadsCount > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <h3 className="font-bold text-orange-900 text-sm mb-3">🙋 בקשות הצטרפות ממתינות ({leadsCount})</h3>
                <LeadsManager trainerId={profile?.id} onLeadsChange={(n) => { setLeadsCount(n); refreshCounts() }} />
              </div>
            )}
            <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} hideSchedule />
          </div>
        )}

        {activeTab === 'shop' && (
          <div className="space-y-6">
            <ShopManager onOrdersChange={(n) => { setOrdersCount(n); refreshCounts() }} />
            {requestsCount > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                <h3 className="font-bold text-purple-900 text-sm mb-3">⚙️ בקשות שינוי פרופיל ({requestsCount})</h3>
                <ProfileChangeRequests onChange={refreshCounts} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'announcements' && <AnnouncementsManager trainerId={profile?.id} />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isTrainer={true}
        leadsCount={leadsCount}
        ordersCount={ordersCount}
        pendingCount={requestsCount}
      />
    </div>
  )
}
