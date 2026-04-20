import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import TrainerLogin from './components/auth/TrainerLogin'
import AthleteLogin from './components/auth/AthleteLogin'
import TrainerDashboard from './components/trainer/TrainerDashboard'
import AthleteDashboard from './components/athlete/AthleteDashboard'
import RegisterPage from './components/RegisterPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loginMode, setLoginMode] = useState('athlete')
  const [loadingProfile, setLoadingProfile] = useState(false)

  if (window.location.pathname === '/register') return <RegisterPage />

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    // רישום service worker ל-PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => console.warn('SW register failed', err))
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
    else setProfile(null)
  }, [session])

  async function fetchProfile(user) {
    setLoadingProfile(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*, is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (error) console.error('fetchProfile error:', error)
    // ודא שיש email — לעיתים הוא לא שמור בטבלת profiles, אז ניקח מה-auth
    const merged = { ...(data || { id: user.id }), email: data?.email || user.email }
    setProfile(merged)
    setLoadingProfile(false)
  }

  if (!session) {
    return loginMode === 'trainer'
      ? <TrainerLogin onSwitch={() => setLoginMode('athlete')} />
      : <AthleteLogin onSwitch={() => setLoginMode('trainer')} />
  }

  if (loadingProfile) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">טוען...</p>
    </div>
  )

  if (profile?.role === 'trainer') return <TrainerDashboard profile={profile} isAdmin={!!profile.is_admin} />
  return <AthleteDashboard profile={profile} />
}
