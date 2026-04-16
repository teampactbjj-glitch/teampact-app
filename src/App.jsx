import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import TrainerLogin from './components/auth/TrainerLogin'
import AthleteLogin from './components/auth/AthleteLogin'
import TrainerDashboard from './components/trainer/TrainerDashboard'
import AthleteDashboard from './components/athlete/AthleteDashboard'
import RegisterPage from './components/auth/RegisterPage'

export default function App() {
  if (window.location.pathname === '/register') return <RegisterPage />
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loginMode, setLoginMode] = useState('athlete') // 'trainer' | 'athlete'
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) fetchProfile(session.user.id)
    else setProfile(null)
  }, [session])

  async function fetchProfile(userId) {
    setLoadingProfile(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*, is_admin')
      .eq('id', userId)
      .maybeSingle()
    if (error) console.error('fetchProfile error:', error)
    setProfile(data)
    setLoadingProfile(false)
  }

  if (!session) {
    return loginMode === 'trainer'
      ? <TrainerLogin onSwitch={() => setLoginMode('athlete')} />
      : <AthleteLogin onSwitch={() => setLoginMode('trainer')} />
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  if (profile?.role === 'trainer') return <TrainerDashboard profile={profile} isAdmin={!!profile.is_admin} />
  return <AthleteDashboard profile={profile} />
}
