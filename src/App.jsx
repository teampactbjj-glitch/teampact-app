import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import AthleteLogin from './components/auth/AthleteLogin'
import TrainerDashboard from './components/trainer/TrainerDashboard'
import AthleteDashboard from './components/athlete/AthleteDashboard'
import RegisterPage from './components/RegisterPage'
import RegisterCoachPage from './components/auth/RegisterCoachPage'
import PendingApprovalScreen from './components/PendingApprovalScreen'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberStatus, setMemberStatus] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  if (window.location.pathname === '/register') return <RegisterPage />
  if (window.location.pathname === '/register-coach') return <RegisterCoachPage />

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    // רישום service worker ל-PWA + זיהוי עדכון אוטומטי
    if ('serviceWorker' in navigator) {
      const hadControllerOnLoad = !!navigator.serviceWorker.controller
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          // בדיקת עדכון כל 60 שניות + בכל הפעלה חוזרת של הטאב
          const poll = () => { reg.update().catch(() => {}) }
          const intervalId = setInterval(poll, 60 * 1000)
          const onVis = () => { if (document.visibilityState === 'visible') poll() }
          document.addEventListener('visibilitychange', onVis)
          window.addEventListener('focus', poll)
        })
        .catch(err => console.warn('SW register failed', err))

      // כשה-SW החדש השתלט — מציגים באנר "עדכון זמין"
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadControllerOnLoad) return // התקנה ראשונה — לא נחשב כעדכון
        setUpdateAvailable(true)
      })
    }
    return () => subscription.unsubscribe()
  }, [])

  // כשפרופיל נטען וקיימת כבר הרשאה — נוודא subscription עדכני
  useEffect(() => {
    if (!profile?.id) return
    import('./lib/push').then(({ ensurePushSubscription }) => {
      ensurePushSubscription(profile).catch(() => {})
    }).catch(() => {})
  }, [profile?.id])

  // ניווט על לחיצה בהתראה מה-service worker (hash-based)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    function onMessage(e) {
      if (e?.data?.type === 'navigate' && typeof e.data.url === 'string') {
        const hashIdx = e.data.url.indexOf('#')
        if (hashIdx >= 0) window.location.hash = e.data.url.slice(hashIdx)
        else window.location.href = e.data.url
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (session?.user) fetchProfile(session.user)
    else { setProfile(null); setMemberStatus(null) }
  }, [session])

  async function fetchProfile(user) {
    setLoadingProfile(true)
    const [{ data, error }, { data: member }] = await Promise.all([
      supabase.from('profiles').select('*, is_admin, is_approved').eq('id', user.id).maybeSingle(),
      supabase.from('members').select('status').eq('id', user.id).maybeSingle(),
    ])
    if (error) console.error('fetchProfile error:', error)
    // ודא שיש email — לעיתים הוא לא שמור בטבלת profiles, אז ניקח מה-auth
    const merged = { ...(data || { id: user.id }), email: data?.email || user.email }
    setProfile(merged)
    setMemberStatus(member?.status || null)
    setLoadingProfile(false)
  }

  // כאשר יש בקשה ממתינה — בודקים כל 5 שניות אם המנהל אישר
  useEffect(() => {
    if (memberStatus !== 'pending' || !session?.user?.id) return
    const userId = session.user.id
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const { data: member } = await supabase
        .from('members')
        .select('status')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      if (member?.status && member.status !== 'pending') {
        setMemberStatus(member.status)
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [memberStatus, session?.user?.id])

  // מאמן ממתין לאישור — בודקים כל 5 שניות אם אושר
  useEffect(() => {
    if (profile?.role !== 'trainer' || profile?.is_approved !== false || !session?.user?.id) return
    const userId = session.user.id
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const { data } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      if (data?.is_approved) {
        setProfile(p => p ? { ...p, is_approved: true } : p)
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [profile?.role, profile?.is_approved, session?.user?.id])

  const UpdateBanner = () => updateAvailable ? (
    <div
      dir="rtl"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, paddingTop: 'env(safe-area-inset-top)' }}
      className="bg-emerald-600 text-white shadow-lg"
    >
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold flex items-center gap-2">
          <span className="text-lg">🔄</span>
          <span>עדכון חדש זמין</span>
        </span>
        <button
          onClick={() => window.location.reload()}
          className="bg-white text-emerald-700 font-black px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-50"
        >טען מחדש</button>
      </div>
    </div>
  ) : null

  if (!session) return (<><UpdateBanner /><AthleteLogin /></>)

  if (loadingProfile) return (
    <><UpdateBanner /><div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">טוען...</p>
    </div></>
  )

  // מאמן לא מאושר → מסך המתנה (ולא Dashboard עם נתוני מועדון)
  if (profile?.role === 'trainer' && profile?.is_approved === false) {
    return (<><UpdateBanner /><PendingApprovalScreen /></>)
  }
  if (profile?.role === 'trainer') return (<><UpdateBanner /><TrainerDashboard profile={profile} isAdmin={!!profile.is_admin} /></>)
  if (memberStatus === 'pending') return (<><UpdateBanner /><PendingApprovalScreen /></>)
  return (<><UpdateBanner /><AthleteDashboard profile={profile} /></>)
}
