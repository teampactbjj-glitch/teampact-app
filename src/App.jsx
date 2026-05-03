import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import AthleteLogin from './components/auth/AthleteLogin'
import TrainerDashboard from './components/trainer/TrainerDashboard'
import AthleteDashboard from './components/athlete/AthleteDashboard'
import RegisterPage from './components/RegisterPage'
import RegisterCoachPage from './components/auth/RegisterCoachPage'
import PendingApprovalScreen from './components/PendingApprovalScreen'
import AccessibilityPage from './components/AccessibilityPage'
import AccessibilityWidget from './components/AccessibilityWidget'
import { SkipLink } from './components/a11y'

// קריאה סינכרונית של ה-cache של Supabase — לפני שה-React מרנדר אפילו פעם אחת.
// זה מאפשר לנו לדעת מיד אם המשתמש "סגר את האפליקציה כשהוא היה מחובר",
// ובמקרה כזה לדלג על מסך הלוגין ולעבור ישר לטעינת הדשבורד —
// בדיוק כמו אפליקציה native שלא "יוצאת" כשסוגרים אותה.
// המפתח 'teampact-session' מוגדר ב-src/lib/supabase.js (storageKey).
const HAS_CACHED_SESSION = (() => {
  try {
    const raw = window.localStorage.getItem('teampact-session')
    if (!raw) return false
    // קיומו של ה-token מספיק; גם אם פג — Supabase יבצע refreshToken אוטומטית.
    const parsed = JSON.parse(raw)
    return !!(parsed?.access_token || parsed?.refresh_token)
  } catch {
    return false
  }
})()

export default function App() {
  const [session, setSession] = useState(null)
  // sessionChecked מתחיל true כשאין session שמור — ואז נראה ישר את מסך הלוגין בלי "פלאש".
  // הוא מתחיל false רק כשיש cache, וזה אומר: "חכה רגע לאימות אסינכרוני, ואז ישר לדשבורד".
  const [sessionChecked, setSessionChecked] = useState(!HAS_CACHED_SESSION)
  const [profile, setProfile] = useState(null)
  const [memberStatus, setMemberStatus] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // Version counter למניעת race condition: כשהsession מתחלף מהר, fetchProfile ישן לא ידרוס פרופיל חדש
  const fetchVersionRef = useRef(0)

  // Rules of Hooks fix (Bug 1.7): כל ה-hooks חייבים לרוץ באותו סדר בכל render.
  // ה-early-returns של נתיבים מיוחדים (/register, /register-coach, /accessibility)
  // הוזזו לסוף הקומפוננטה — *אחרי* כל קריאות ה-useEffect.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessionChecked(true)
    }).catch(() => {
      // גם בכשל — מסמנים שבדקנו כדי לא להיתקע על splash לנצח
      setSessionChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      setSessionChecked(true)
    })
    // רישום service worker ל-PWA + זיהוי עדכון אוטומטי
    // משתנים חיצוניים ל-promise כדי שה-cleanup יוכל לנקות אותם
    let intervalId = null
    let onVis = null
    let pollFn = null
    let onControllerChange = null
    if ('serviceWorker' in navigator) {
      const hadControllerOnLoad = !!navigator.serviceWorker.controller
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          // בדיקת עדכון כל 60 שניות + בכל הפעלה חוזרת של הטאב
          pollFn = () => { reg.update().catch(() => {}) }
          intervalId = setInterval(pollFn, 60 * 1000)
          onVis = () => { if (document.visibilityState === 'visible') pollFn() }
          document.addEventListener('visibilitychange', onVis)
          window.addEventListener('focus', pollFn)
        })
        .catch(err => console.warn('SW register failed', err))

      // כשה-SW החדש השתלט — מציגים באנר "עדכון זמין"
      onControllerChange = () => {
        if (!hadControllerOnLoad) return // התקנה ראשונה — לא נחשב כעדכון
        setUpdateAvailable(true)
      }
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    }
    return () => {
      subscription.unsubscribe()
      if (intervalId) clearInterval(intervalId)
      if (onVis) document.removeEventListener('visibilitychange', onVis)
      if (pollFn) window.removeEventListener('focus', pollFn)
      if (onControllerChange && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      }
    }
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
    // לכוד גרסה לפני ה-fetch. אם session התחלף בזמן ש-fetch זה רץ, נדע שזה stale ולא נדרוס.
    const myVersion = ++fetchVersionRef.current
    setLoadingProfile(true)
    const [{ data, error }, { data: member }] = await Promise.all([
      supabase.from('profiles').select('*, is_admin, is_approved').eq('id', user.id).maybeSingle(),
      supabase.from('members').select('status').eq('id', user.id).maybeSingle(),
    ])
    // אם בינתיים נשלחה קריאה חדשה ל-fetchProfile — לא נדרוס.
    if (myVersion !== fetchVersionRef.current) {
      console.warn('fetchProfile: stale response ignored (newer fetch in flight)')
      return
    }
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
      role="status"
      aria-live="polite"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, paddingTop: 'env(safe-area-inset-top)' }}
      className="bg-emerald-600 text-white shadow-lg"
    >
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">🔄</span>
          <span>עדכון חדש זמין</span>
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="טען מחדש את האפליקציה לקבלת העדכון"
          className="bg-white text-emerald-700 font-black px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
        >טען מחדש</button>
      </div>
    </div>
  ) : null

  // נתיבים ציבוריים — אחרי כל ה-hooks כדי לקיים את Rules of Hooks (Bug 1.7).
  if (window.location.pathname === '/register') return (<><RegisterPage /><AccessibilityWidget /></>)
  if (window.location.pathname === '/register-coach') return (<><RegisterCoachPage /><AccessibilityWidget /></>)
  if (window.location.pathname === '/accessibility') return <AccessibilityPage />

  // אם יש session שמור (מצב "האפליקציה לא נסגרה") — אנחנו לא יודעים עדיין מי המשתמש
  // (מתאמן/מאמן/מנהל), אז נציג רקע אפור בהיר חלק שמתמזג עם הדשבורד, בלי טקסט ובלי לוגו.
  // המעבר לדשבורד יקרה תוך מאות מ"ש ולא יורגש כ-"פלאש".
  // אם אין cache — sessionChecked כבר true ונדלג ישר ל-AthleteLogin בלי המסך הזה.
  if (!sessionChecked) return (
    <div
      role="status"
      aria-live="polite"
      aria-label="טוען"
      style={{
        position: 'fixed', inset: 0,
        background: '#f9fafb',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      dir="rtl"
    />
  )

  if (!session) return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><AthleteLogin /></>)

  // טעינת הפרופיל — אותו רקע נקי כמו של ה-splash הראשוני, כדי שהמעבר ייראה רציף
  // ולא יהיה פלאש של "טוען..." באמצע המסך כשפותחים את האפליקציה.
  if (loadingProfile) return (
    <><SkipLink /><UpdateBanner /><AccessibilityWidget /><div
      role="status"
      aria-live="polite"
      aria-label="טוען"
      style={{
        position: 'fixed', inset: 0,
        background: '#f9fafb',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      dir="rtl"
    /></>
  )

  // מאמן לא מאושר → מסך המתנה (ולא Dashboard עם נתוני מועדון)
  if (profile?.role === 'trainer' && profile?.is_approved === false) {
    return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><PendingApprovalScreen /></>)
  }
  if (profile?.role === 'trainer') return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><TrainerDashboard profile={profile} isAdmin={!!profile.is_admin} /></>)
  if (memberStatus === 'pending') return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><PendingApprovalScreen /></>)
  return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><AthleteDashboard profile={profile} /></>)
}
