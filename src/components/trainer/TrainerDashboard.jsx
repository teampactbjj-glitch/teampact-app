import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ProfileChangeRequests from './ProfileChangeRequests'
import ShopManager from './ShopManager'
import ReportsManager from './ReportsManager'
import TrainerProfile from './TrainerProfile'
import BottomNav from '../BottomNav'
import InstallBanner from '../InstallBanner'
import EnablePushBanner from '../EnablePushBanner'
import { supabase } from '../../lib/supabase'
import { isStandalone } from '../../lib/platform'

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
  const [announcementsCount, setAnnouncementsCount] = useState(0)
  const [latestAnnouncementAt, setLatestAnnouncementAt] = useState('')
  const [scheduleCount, setScheduleCount] = useState(0) // שיעורים ממתינים לאישור + בקשות מחיקה (אדמין בלבד)
  const [athleteDeletionCount, setAthleteDeletionCount] = useState(0) // בקשות מחיקת מתאמנים (אדמין בלבד)
  const [toast, setToast] = useState(null) // { name, id, kind }

  const lastSeenKey = profile?.id ? `announcements_last_seen_${profile.id}` : null

  useEffect(() => { refreshCounts() }, [])

  useEffect(() => {
    const ch = supabase.channel('announcements-trainer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => refreshCounts())
      .subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') refreshCounts() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [profile?.id])

  useEffect(() => {
    if (activeTab === 'announcements' && lastSeenKey && latestAnnouncementAt) {
      window.localStorage.setItem(lastSeenKey, latestAnnouncementAt)
      setAnnouncementsCount(0)
    }
  }, [activeTab, latestAnnouncementAt, lastSeenKey])

  // hash → tab (מאפשר ניווט מהתראת push)
  useEffect(() => {
    const TAB_HASHES = ['schedule', 'athletes', 'reports', 'shop', 'announcements', 'profile']
    function syncFromHash() {
      const h = (window.location.hash || '').replace('#', '')
      if (TAB_HASHES.includes(h)) setActiveTab(h)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  // Realtime: new pending registrations (in-app toast when tab is open)
  useEffect(() => {
    const channel = supabase
      .channel('pending-members')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'members',
        filter: 'status=eq.pending',
      }, (payload) => {
        const row = payload.new || {}
        refreshCounts()
        setToast({ id: row.id || Date.now(), name: row.full_name || 'מתאמן חדש' })
        setTimeout(() => setToast(null), 8000)
        try {
          if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            new Notification('בקשת הצטרפות חדשה', { body: row.full_name || 'מתאמן חדש נרשם', icon: '/favicon.ico' })
          }
        } catch {}
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Realtime: בקשת מחיקת מתאמן חדשה → toast למנהל בלבד
  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel('athlete-deletion-requests')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'members',
      }, (payload) => {
        const becamePending = payload.old?.status !== 'pending_deletion' && payload.new?.status === 'pending_deletion'
        if (!becamePending) return
        refreshCounts()
        const name = payload.new?.full_name || 'מתאמן'
        setToast({ id: payload.new?.id || Date.now(), name, kind: 'deletion' })
        setTimeout(() => setToast(null), 8000)
        try {
          if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            new Notification('בקשת מחיקת מתאמן', { body: name, icon: '/favicon.ico' })
          }
        } catch {}
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAdmin])

  // Realtime: שינויי שיעורים (הוספה/בקשת מחיקה/אישור) → עדכון הבאדג' של טאב הלו״ז
  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel('classes-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, (payload) => {
        refreshCounts()
        const isNewPending = payload.eventType === 'INSERT' && payload.new?.status === 'pending'
        const isNewDeletionRequest = payload.eventType === 'UPDATE'
          && !payload.old?.deletion_requested_at
          && payload.new?.deletion_requested_at
        if (isNewPending || isNewDeletionRequest) {
          const name = payload.new?.name || 'שיעור'
          const action = isNewPending ? 'שיעור חדש ממתין לאישור' : 'בקשת מחיקת שיעור'
          try {
            if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
              new Notification(action, { body: name, icon: '/favicon.ico' })
            }
          } catch {}
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAdmin])

  async function refreshCounts() {
    const lastSeen = (lastSeenKey && typeof window !== 'undefined' ? window.localStorage.getItem(lastSeenKey) : '') || ''
    const [{ count: leads }, { count: orders }, { count: requests }, { data: latest }, { count: unread }] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('product_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profile_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('announcements').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('announcements').select('id', { count: 'exact', head: true }).gt('created_at', lastSeen || '1970-01-01'),
    ])
    setLeadsCount(leads || 0)
    setOrdersCount(orders || 0)
    setRequestsCount(requests || 0)
    setLatestAnnouncementAt(latest?.[0]?.created_at || '')
    setAnnouncementsCount(unread || 0)

    // שינויי לו״ז שמחכים לאישור המנהל (שיעור חדש שמאמן הוסיף + בקשות מחיקה)
    if (isAdmin) {
      // .is('deleted_at', null) מחויב — אחרת שיעורים שנדחו (soft-delete) ימשיכו להיספר
      // והבאדג' על טאב הלו"ז יראה מספר שכבר לא רלוונטי.
      const [addsRes, delsRes, athDelRes] = await Promise.all([
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
        supabase.from('classes').select('id', { count: 'exact', head: true }).not('deletion_requested_at', 'is', null).is('deleted_at', null),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending_deletion').is('deleted_at', null),
      ])
      const adds = addsRes.error ? 0 : (addsRes.count || 0)
      const dels = delsRes.error ? 0 : (delsRes.count || 0)
      setScheduleCount(adds + dels)
      setAthleteDeletionCount(athDelRes.error ? 0 : (athDelRes.count || 0))
    } else {
      setScheduleCount(0)
      setAthleteDeletionCount(0)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {toast && (() => {
        const isDeletion = toast.kind === 'deletion'
        const bg = isDeletion ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
        const titleText = isDeletion ? 'בקשת מחיקת מתאמן' : 'בקשת הצטרפות חדשה'
        const subColor = isDeletion ? 'text-red-50' : 'text-emerald-50'
        return (
          <button
            type="button"
            onClick={() => { setActiveTab('athletes'); setToast(null) }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 ${bg} text-white px-4 py-3 rounded-xl shadow-lg max-w-md w-[92%] flex items-center gap-3 animate-[pulse_1s_ease-in-out_1]`}
          >
            <span className="text-2xl">{isDeletion ? '🗑' : '🔔'}</span>
            <div className="text-right flex-1">
              <div className="font-bold text-sm">{titleText}</div>
              <div className={`text-xs ${subColor}`}>{toast.name} — לחץ למעבר</div>
            </div>
            <span
              onClick={(e) => { e.stopPropagation(); setToast(null) }}
              className="text-white/80 hover:text-white text-lg px-2"
            >✕</span>
          </button>
        )
      })()}
      <header className="bg-blue-700 text-white px-6 shadow safe-area-header">
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
      </header>

      <main className="p-4 max-w-3xl mx-auto pb-24">
        <div className="mb-3 space-y-2">
          {!isStandalone() && <InstallBanner variant="slim" />}
          <EnablePushBanner profile={profile} />
        </div>
        {activeTab === 'schedule' && <TodayClasses trainerId={profile?.id} isAdmin={isAdmin} onChange={refreshCounts} />}

        {activeTab === 'athletes' && (
          <div className="space-y-6">
            <AthleteManagement
              trainerId={profile?.id}
              isAdmin={isAdmin}
              hideSchedule
              stackedLayout
              registerLinkCard={<RegisterLinkCard />}
              extraTop={
                requestsCount > 0 ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                    <h3 className="font-bold text-purple-900 text-sm mb-3">⚙️ בקשות שינוי מנוי ({requestsCount})</h3>
                    <ProfileChangeRequests onChange={refreshCounts} />
                  </div>
                ) : null
              }
              onPendingChange={refreshCounts}
            />
          </div>
        )}

        {activeTab === 'reports' && isAdmin && (
          <ReportsManager isAdmin={isAdmin} />
        )}

        {activeTab === 'shop' && (
          <ShopManager isAdmin={isAdmin} trainerId={profile?.id} onOrdersChange={(n) => { setOrdersCount(n); refreshCounts() }} />
        )}

        {activeTab === 'announcements' && <AnnouncementsManager trainerId={profile?.id} isAdmin={isAdmin} onChange={refreshCounts} />}

        {activeTab === 'profile' && <TrainerProfile profile={profile} isAdmin={isAdmin} />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isTrainer={true}
        isAdmin={isAdmin}
        leadsCount={leadsCount + athleteDeletionCount}
        ordersCount={ordersCount}
        pendingCount={requestsCount}
        announcementsCount={announcementsCount}
        scheduleCount={scheduleCount}
      />
    </div>
  )
}
