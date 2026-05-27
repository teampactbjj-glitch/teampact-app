import { useState, useEffect } from 'react'
import TodayClasses from './TodayClasses'
import AthleteManagement from './AthleteManagement'
import AnnouncementsManager from './AnnouncementsManager'
import LeadsManager from './LeadsManager'
import ProfileChangeRequests from './ProfileChangeRequests'
import ShopManager from './ShopManager'
import ReportsManager from './ReportsManager'
import CoachesManager from './CoachesManager'
import TrainerProfile from './TrainerProfile'
import BottomNav from '../BottomNav'
import InstallBanner from '../InstallBanner'
import EnablePushBanner from '../EnablePushBanner'
import { supabase } from '../../lib/supabase'
import { notifyPush } from '../../lib/notifyPush'
import { getBeltLabel } from '../../lib/belts'
import { isStandalone } from '../../lib/platform'
import logoUrl from '../../assets/logo.png'

function RegisterLinkCard() {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { prompt('העתק את הקישור:', url) }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'הצטרפות ל-TeamPact', text: 'הירשם כמתאמן חדש', url }) } catch {}
    } else { copy() }
  }
  function sendWhatsapp() {
    const text = encodeURIComponent(`היי, הוזמנת להצטרף ל-TeamPact כמתאמן. הירשם כאן: ${url}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-md">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🔗</span>
        <h3 className="font-black text-sm">קישור הרשמה למתאמנים חדשים</h3>
      </div>
      <p className="text-xs text-blue-100 mb-3">שלח את הקישור הזה למתאמן חדש — הוא ימלא פרטים ואתה תאשר אותו תחת "בקשות הצטרפות".</p>
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg px-3 py-2 text-xs font-mono break-all mb-2">{url}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={copy} className="bg-white text-blue-700 hover:bg-blue-50 font-bold py-2 rounded-lg text-sm">
          {copied ? '✓ הועתק' : '📋 העתק'}
        </button>
        <button onClick={share} className="bg-blue-900 hover:bg-blue-950 text-white font-bold py-2 rounded-lg text-sm">
          📤 שתף
        </button>
        <button onClick={sendWhatsapp} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-sm">
          💬 וואטסאפ
        </button>
        <button onClick={() => setShowQr(s => !s)} className="bg-blue-900/60 hover:bg-blue-900/80 text-white font-bold py-2 rounded-lg text-sm">
          {showQr ? '▲ סגור QR' : '📱 הצג QR'}
        </button>
      </div>
      {showQr && (
        <div className="mt-3 bg-white rounded-lg p-3 flex flex-col items-center">
          <img src={qrSrc} alt="QR להרשמת מתאמן" className="w-48 h-48" />
          <p className="text-xs text-gray-600 mt-2 text-center">סרוק את הקוד כדי להגיע ישירות לטופס ההרשמה</p>
        </div>
      )}
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
  const [pendingCoachesCount, setPendingCoachesCount] = useState(0)   // בקשות מאמנים ממתינות (אדמין בלבד)
  const [toast, setToast] = useState(null) // { name, id, kind }

  const lastSeenKey = profile?.id ? `announcements_last_seen_${profile.id}` : null

  useEffect(() => { refreshCounts() }, [])

  // ============================================================
  // 🎓 Lazy execution של אירועי קידום שעבר תאריכם
  // ============================================================
  // רץ פעם אחת בכל פתיחת dashboard. מאתר אירועים עם:
  //   status='planned' AND event_date < today AND deleted_at IS NULL
  // עבור כל candidate עם status='planned':
  //   - מעדכן members.belt + belt_received_at + belt_stripes (ל-target)
  //   - candidate.status='promoted', promoted_at=now()
  //   - שולח push notification + יוצר announcement type='promotion'
  // אחרי כל ה-candidates: event.status='completed', completed_at=now().
  //
  // race condition: אם 2 מאמנים פותחים ב-bo'אזית — שניהם ינסו לעדכן אבל UPDATE
  // הוא idempotent (אותם target_belt). push notification עלול להישלח כפול
  // (acceptable — מתאמן יקבל 2 הודעות).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const { data: events, error } = await supabase
          .from('promotion_events')
          .select('id, name, event_date, trainer_id')
          .eq('status', 'planned')
          .lt('event_date', today)
          .is('deleted_at', null)
        if (error) { console.warn('[lazy-promotion] events fetch error:', error.message); return }
        if (!events || events.length === 0) return
        if (cancelled) return

        for (const ev of events) {
          // 1. שלוף candidates planned של האירוע
          const { data: cands, error: candErr } = await supabase
            .from('promotion_candidates')
            .select('id, member_id, target_belt, target_stripes, current_belt, current_stripes')
            .eq('event_id', ev.id)
            .eq('status', 'planned')
          if (candErr) { console.warn('[lazy-promotion] candidates fetch error:', candErr.message); continue }

          // 2. עדכון לכל candidate
          const promotedMemberIds = []
          const promotionDetails = [] // { member_id, target_belt, target_stripes }
          for (const c of (cands || [])) {
            // עדכון members.belt
            const { error: memErr } = await supabase.from('members')
              .update({
                belt: c.target_belt,
                belt_stripes: c.target_stripes ?? 0,
                belt_received_at: ev.event_date,
              })
              .eq('id', c.member_id)
            if (memErr) {
              console.warn('[lazy-promotion] member update error:', memErr.message, c.member_id)
              continue
            }
            // INSERT ל-belt_history עם source='promotion' + event_id (idempotent עם UNIQUE)
            const { error: histErr } = await supabase.from('belt_history')
              .upsert({
                member_id: c.member_id,
                belt: c.target_belt,
                belt_stripes: c.target_stripes ?? 0,
                received_at: ev.event_date,
                source: 'promotion',
                event_id: ev.id,
                notes: `קודם דרך אירוע: ${ev.name}`,
              }, {
                onConflict: 'member_id,belt,belt_stripes',
                ignoreDuplicates: true,
              })
            if (histErr) {
              console.warn('[lazy-promotion] belt_history insert error:', histErr.message, c.member_id)
              // לא חוסם — ההיסטוריה כשלה אבל הקידום עצמו הצליח. ממשיכים.
            }
            // עדכון candidate.status
            const { error: cErr } = await supabase.from('promotion_candidates')
              .update({ status: 'promoted', promoted_at: new Date().toISOString() })
              .eq('id', c.id)
            if (cErr) {
              console.warn('[lazy-promotion] candidate update error:', cErr.message, c.id)
              continue
            }
            promotedMemberIds.push(c.member_id)
            promotionDetails.push({
              member_id: c.member_id,
              target_belt: c.target_belt,
              target_stripes: c.target_stripes ?? 0,
            })
          }

          // 3. סגירת האירוע
          await supabase.from('promotion_events')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', ev.id)

          // 4. announcement כללי על האירוע (type='promotion' → מופיע בטאב הודעות של מתאמנים)
          if (promotedMemberIds.length > 0) {
            const beltSummary = [...new Set(promotionDetails.map(d => getBeltLabel(d.target_belt)))].join(', ')
            await supabase.from('announcements').insert({
              trainer_id: ev.trainer_id || profile?.id || null,
              type: 'promotion',
              title: `🏆 ${ev.name} — ${promotedMemberIds.length} מתאמנים קיבלו חגורה`,
              content: `מזל טוב למקודמים: ${beltSummary}!`,
              event_date: new Date(ev.event_date + 'T12:00:00').toISOString(),
            })

            // 5. push לכל מי שקיבל קידום
            // מוצאים user_id לפי email של ה-member (members.email → profiles.email → profile.id)
            const memberDetails = await supabase.from('members')
              .select('id, email, full_name, belt')
              .in('id', promotedMemberIds)
            if (!memberDetails.error && memberDetails.data) {
              const emails = memberDetails.data.map(m => m.email).filter(Boolean)
              if (emails.length > 0) {
                const { data: profs } = await supabase.from('profiles').select('id, email').in('email', emails)
                const userIdByEmail = new Map((profs || []).map(p => [String(p.email).toLowerCase(), p.id]))
                for (const detail of promotionDetails) {
                  const mem = memberDetails.data.find(x => x.id === detail.member_id)
                  if (!mem?.email) continue
                  const uid = userIdByEmail.get(String(mem.email).toLowerCase())
                  if (!uid) continue
                  const beltLabel = getBeltLabel(detail.target_belt)
                  await notifyPush({
                    userIds: [uid],
                    title: '🏆 קודמת בחגורה!',
                    body: `${mem.full_name}, קיבלת ${beltLabel}${detail.target_stripes > 0 ? ` · ${detail.target_stripes} פסים` : ''}!`,
                    url: '/',
                    tag: `promotion-${ev.id}-${detail.member_id}`,
                  })
                }
              }
            }
          }
        }

        // עדכון counts אחרי הקידום
        if (!cancelled) refreshCounts()
      } catch (e) {
        console.warn('[lazy-promotion] unexpected error:', e?.message || e)
      }
    })()
    return () => { cancelled = true }
  }, []) // רץ פעם אחת בכל פתיחת dashboard

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
    const TAB_HASHES = ['schedule', 'athletes', 'reports', 'coaches', 'shop', 'announcements', 'profile']
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
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
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
      const [addsRes, delsRes, athDelRes, coachReqRes] = await Promise.all([
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
        supabase.from('classes').select('id', { count: 'exact', head: true }).not('deletion_requested_at', 'is', null).is('deleted_at', null),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending_deletion').is('deleted_at', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'trainer').eq('is_approved', false),
      ])
      const adds = addsRes.error ? 0 : (addsRes.count || 0)
      const dels = delsRes.error ? 0 : (delsRes.count || 0)
      setScheduleCount(adds + dels)
      setAthleteDeletionCount(athDelRes.error ? 0 : (athDelRes.count || 0))
      setPendingCoachesCount(coachReqRes.error ? 0 : (coachReqRes.count || 0))
    } else {
      setScheduleCount(0)
      setAthleteDeletionCount(0)
      setPendingCoachesCount(0)
    }
  }

  return (
    <div
      className="bg-gray-50 flex flex-col"
      dir="rtl"
      style={{ height: '100dvh', minHeight: '100vh' }}
    >
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
      <header className="shrink-0 bg-gradient-to-br from-black via-neutral-900 to-red-900 text-white px-5 py-2 shadow-lg safe-area-header">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="TeamPact"
            className="w-14 h-14 object-contain shrink-0"
            draggable="false"
          />
          <div>
            <div className="flex items-center gap-2 leading-none">
              <h1 className="font-black text-lg tracking-wide">TeamPact</h1>
              {isAdmin && (
                <span className="text-xs bg-yellow-400 text-yellow-900 font-semibold px-2 py-0.5 rounded-full">מנהל</span>
              )}
            </div>
            <p className="text-gray-300 text-xs mt-0.5">{isAdmin ? 'מנהל מערכת' : 'מאמן'}: <span className="font-bold text-white">{profile?.full_name}</span></p>
          </div>
        </div>
      </header>

      {/* main ברוחב מלא — scrollbar מופיע בקצה המסך, לא באמצע (כפי שהיה ב-desktop רחב).
          התוכן עצמו עדיין מרוכז ב-max-w-3xl כדי לשמור על קריאות במסכים רחבים. */}
      <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="p-4 max-w-3xl w-full mx-auto">
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

          {activeTab === 'reports' && (
            <ReportsManager isAdmin={isAdmin} profile={profile} />
          )}

          {activeTab === 'coaches' && isAdmin && (
            <CoachesManager profile={profile} onChange={refreshCounts} />
          )}

          {activeTab === 'shop' && (
            <ShopManager isAdmin={isAdmin} trainerId={profile?.id} onOrdersChange={(n) => { setOrdersCount(n); refreshCounts() }} />
          )}

          {activeTab === 'announcements' && <AnnouncementsManager trainerId={profile?.id} isAdmin={isAdmin} onChange={refreshCounts} />}

          {activeTab === 'profile' && <TrainerProfile profile={profile} isAdmin={isAdmin} />}
        </div>
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
        coachesCount={pendingCoachesCount}
      />
    </div>
  )
}
