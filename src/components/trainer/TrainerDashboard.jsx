import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ProfileChangeRequests from './ProfileChangeRequests'
import ShopManager from './ShopManager'
import TrainerProfile from './TrainerProfile'
import BottomNav from '../BottomNav'
import { supabase } from '../../lib/supabase'

function RegisterLinkCard() {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { prompt('העתק את הקישור:', url) }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'הצטרפות ל-TeamPact', text: 'הירשם כמתאמן חדש', url }) } catch {}
    } else { copy() }
  }
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-md">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🔗</span>
        <h3 className="font-black text-sm">קישור הרשמה למתאמנים חדשים</h3>
      </div>
      <p className="text-xs text-blue-100 mb-3">שלח את הקישור הזה למתאמן חדש — הוא ימלא פרטים ואתה תאשר אותו תחת "בקשות הצטרפות".</p>
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg px-3 py-2 text-xs font-mono break-all mb-2">{url}</div>
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 bg-white text-blue-700 hover:bg-blue-50 font-bold py-2 rounded-lg text-sm">
          {copied ? '✓ הועתק' : '📋 העתק קישור'}
        </button>
        <button onClick={share} className="flex-1 bg-blue-900 hover:bg-blue-950 text-white font-bold py-2 rounded-lg text-sm">
          📤 שתף
        </button>
      </div>
    </div>
  )
}

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
          <AthleteManagement
            trainerId={profile?.id}
            isAdmin={isAdmin}
            hideSchedule
            registerLinkCard={<RegisterLinkCard />}
            onPendingChange={refreshCounts}
          />
        )}

        {activeTab === 'shop' && (
          <div className="space-y-6">
            <ShopManager isAdmin={isAdmin} trainerId={profile?.id} onOrdersChange={(n) => { setOrdersCount(n); refreshCounts() }} />
            {requestsCount > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                <h3 className="font-bold text-purple-900 text-sm mb-3">⚙️ בקשות שינוי פרופיל ({requestsCount})</h3>
                <ProfileChangeRequests onChange={refreshCounts} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'announcements' && <AnnouncementsManager trainerId={profile?.id} isAdmin={isAdmin} />}

        {activeTab === 'profile' && <TrainerProfile profile={profile} isAdmin={isAdmin} />}
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
