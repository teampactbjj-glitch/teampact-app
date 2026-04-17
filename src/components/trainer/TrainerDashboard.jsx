import { useState } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ProfileChangeRequests from './ProfileChangeRequests'
import BottomNav from '../BottomNav'
import { supabase } from '../../lib/supabase'
import { useEffect } from 'react'

export default function TrainerDashboard({ profile, isAdmin }) {
  const [activeTab, setActiveTab] = useState('schedule')
  const [leadsCount, setLeadsCount] = useState(0)

  useEffect(() => {
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setLeadsCount(count || 0))
  }, [])

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
        {activeTab === 'schedule'      && <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} />}
        {activeTab === 'shop'          && <AnnouncementsManager trainerId={profile?.id} />}
        {activeTab === 'athletes'      && <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} />}
        {activeTab === 'leads'         && <LeadsManager trainerId={profile?.id} onLeadsChange={setLeadsCount} />}
        {activeTab === 'changeRequests' && <ProfileChangeRequests />}
        {activeTab === 'profile'       && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl mx-auto mb-3">🥋</div>
              <h2 className="text-lg font-bold text-gray-800">{profile?.full_name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{profile?.email}</p>
              {isAdmin && <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-medium">מנהל מערכת</span>}
            </div>
            <button onClick={() => supabase.auth.signOut()} className="w-full bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-medium text-sm">יציאה מהמערכת</button>
          </div>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isTrainer={true}
        leadsCount={leadsCount}
      />
    </div>
  )
}
