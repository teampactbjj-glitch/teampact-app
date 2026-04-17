import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ShopManager from './ShopManager'
import { supabase } from '../../lib/supabase'

const TABS = [
  { id: 'classes',       label: '📅 שיעורים היום' },
  { id: 'athletes',      label: '👥 מתאמנים' },
  { id: 'announcements', label: '📢 הודעות' },
  { id: 'shop',          label: '🛒 חנות' },
  { id: 'leads',         label: '🙋 לידים' },
]

export default function TrainerDashboard({ profile, isAdmin }) {
  const [tab, setTab] = useState('classes')
  const [leadsCount, setLeadsCount] = useState(0)
  const [ordersCount, setOrdersCount] = useState(0)

  useEffect(() => {
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setLeadsCount(count || 0))

    supabase.from('product_orders').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setOrdersCount(count || 0))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
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

      <nav className="bg-white border-b flex overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition ${
              tab === t.id ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.id === 'leads' && leadsCount > 0 && (
              <span className="absolute top-1.5 right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{leadsCount}</span>
            )}
            {t.id === 'shop' && ordersCount > 0 && (
              <span className="absolute top-1.5 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{ordersCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="p-4 max-w-3xl mx-auto">
        {tab === 'classes'       && <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} />}
        {tab === 'athletes'      && <AthleteManagement trainerId={profile?.id} isAdmin={isAdmin} />}
        {tab === 'announcements' && <AnnouncementsManager trainerId={profile?.id} />}
        {tab === 'shop'          && <ShopManager onOrdersChange={setOrdersCount} />}
        {tab === 'leads'         && <LeadsManager trainerId={profile?.id} onLeadsChange={setLeadsCount} />}
      </main>
    </div>
  )
}
