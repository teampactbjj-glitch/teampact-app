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
import ResetPasswordPage from './components/auth/ResetPasswordPage'

// קריאה סינכרונית של ה-cache של Supabase — לפני שה-React מרנדר אפילו פעם אחת.
// זה מאפשר לנו לדעת מיד אם המשתמש "סגר את האפליקציה כשהוא היה מחובר",
// ובמקרה כזה לדלג על מסך הלוגין ולעבור ישר לטעינת הדשבורד —
// בדיוק כמו אפליקציה native שלא "יוצאת" כשסוגרים אותה.
// המפתח 'teampact-session' מוגדר ב-src/lib/supabase.js (storageKey).
// בדיקה סינכרונית: האם ה-URL מכיל קישור איפוס סיסמה של Supabase
const IS_RECOVERY = window.location.hash.includes('type=recovery')

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

// באג "מסך לבן תקוע" (דווח ע"י מאמן סהר, 2.7.2026): אם קריאת רשת ל-Supabase
// (getSession / fetchProfile) נתקעת בלי לחזור (למשל ניתוק רשת רגעי באולם האימונים),
// המסכים למטה (!sessionChecked / loadingProfile) הם div ריק לגמרי בכוונה (למניעת "פלאש") —
// אז בלי timeout המשתמש נשאר תקוע על מסך לבן ריק לנצח, בלי שום הודעה או דרך לצאת מזה.
// הפתרון: race מול טיימר — אם הקריאה לא חוזרת תוך TIMEOUT_MS, ממשיכים הלאה בכל זאת
// (במקום להמתין לנצח) ומציגים מסך "לוקח יותר מדי זמן" עם כפתור רענון.
const NETWORK_TIMEOUT_MS = 15000
function withTimeout(promise, ms = NETWORK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve({ __timedOut: true }), ms)),
  ])
}

export default function App() {
  const [session, setSession] = useState(null)
  // sessionChecked מתחיל true כשאין session שמור — ואז נראה ישר את מסך הלוגין בלי "פלאש".
  // הוא מתחיל false רק כשיש cache, וזה אומר: "חכה רגע לאימות אסינכרוני, ואז ישר לדשבורד".
  const [sessionChecked, setSessionChecked] = useState(!HAS_CACHED_SESSION)
  const [profile, setProfile] = useState(null)
  const [memberStatus, setMemberStatus] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  // מסומן כשקריאת רשת (getSession/fetchProfile) עברה את NETWORK_TIMEOUT_MS בלי לחזור —
  // מוצג מסך "לוקח יותר מדי זמן" במקום מסך לבן תקוע לנצח.
  const [networkStuck, setNetworkStuck] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(IS_RECOVERY)
  // Version counter למניעת race condition: כשהsession מתחלף מהר, fetchProfile ישן לא ידרוס פרופיל חדש
  const fetchVersionRef = useRef(0)

  // Rules of Hooks fix (Bug 1.7): כל ה-hooks חייבים לרוץ באותו סדר בכל render.
  // ה-early-returns של נתיבים מיוחדים (/register, /register-coach, /accessibility)
  // הוזזו לסוף הקומפוננטה — *אחרי* כל קריאות ה-useEffect.
  useEffect(() => {
    withTimeout(supabase.auth.getSession()).then((result) => {
      if (result?.__timedOut) {
        // הרשת תקועה — לא נשאר על splash לבן לנצח. מציגים מסך "לוקח יותר מדי זמן".
        console.warn('getSession timed out after', NETWORK_TIMEOUT_MS, 'ms')
        setNetworkStuck(true)
        setSessionChecked(true)
        return
      }
      setSession(result.data.session)
      setSessionChecked(true)
    }).catch(() => {
      // גם בכשל — מסמנים שבדקנו כדי לא להיתקע על splash לנצח
      setSessionChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
      }
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
    setNetworkStuck(false)
    const result = await withTimeout(Promise.all([
      supabase.from('profiles').select('*, is_admin, is_approved').eq('id', user.id).maybeSingle(),
      supabase.from('members').select('status').eq('id', user.id).maybeSingle(),
    ]))
    // אם בינתיים נשלחה קריאה חדשה ל-fetchProfile — לא נדרוס.
    if (myVersion !== fetchVersionRef.current) {
      console.warn('fetchProfile: stale response ignored (newer fetch in flight)')
      return
    }
    if (result?.__timedOut) {
      // הרשת תקועה — זה בדיוק הבאג שדיווח סהר (2.7.2026): מסך לבן תקוע בלי סוף.
      // עוצרים את הטעינה ומראים למשתמש מסך עם הסבר וכפתור "נסה שוב" / "טען מחדש".
      console.warn('fetchProfile timed out after', NETWORK_TIMEOUT_MS, 'ms')
      setLoadingProfile(false)
      setNetworkStuck(true)
      return
    }
    const [{ data, error }, { data: member }] = result
    if (error) console.error('fetchProfile error:', error)
    // ודא שיש email — לעיתים הוא לא שמור בטבלת profiles, אז ניקח מה-auth
    const merged = { ...(data || { id: user.id }), email: data?.email || user.email }
    setProfile(merged)
    setMemberStatus(member?.status || null)
    setLoadingProfile(false)
    setNetworkStuck(false)
  }

  // (הוסר) פולינג מתאמן ממתין-לאישור: מתאמן ממתין נכנס עכשיו לדשבורד במצב צפייה,
  // והסטטוס מתרענן בעת חזרה למסך (visibilitychange ב-AthleteDashboard) — בלי פולינג רציף.

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
    }, 30000) // 30ש' (היה 5ש') — חוסך egress; מאמן ממתין-לאישור עובר אוטומטית כשמאושר (עד 30ש')
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

  // מצב שחזור סיסמה — מגיע מקישור המייל של Supabase
  if (isPasswordRecovery) return (
    <ResetPasswordPage onDone={() => setIsPasswordRecovery(false)} />
  )

  // הרשת תקועה (getSession/fetchProfile לא חזרו תוך NETWORK_TIMEOUT_MS) — במקום מסך
  // לבן ריק תקוע לנצח (הבאג שדיווח סהר, 2.7.2026), מציגים הודעה ברורה + אפשרות לנסות שוב.
  if (networkStuck) return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div role="alert" aria-live="assertive" className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-5xl" aria-hidden="true">📡</div>
        <h1 className="text-xl font-bold text-gray-800">הטעינה לוקחת יותר מדי זמן</h1>
        <p className="text-gray-500 text-sm">
          נראה שיש בעיית חיבור לרשת. בדוק את החיבור לאינטרנט ונסה שוב.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setNetworkStuck(false)
              if (session?.user) fetchProfile(session.user)
              else window.location.reload()
            }}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            נסה שוב
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full border-2 border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition"
          >
            טען מחדש
          </button>
        </div>
      </div>
    </main>
  )

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
  // מזכירה — לפני בדיקת מאמן רגיל כדי שתקבל את הממשק שלה
  if (profile?.role === 'trainer' && profile?.is_secretary && profile?.secretary_branch_id) {
    return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><TrainerDashboard profile={profile} isAdmin={false} isSecretary={true} secretaryBranchId={profile.secretary_branch_id} /></>)
  }
  if (profile?.role === 'trainer') return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><TrainerDashboard profile={profile} isAdmin={!!profile.is_admin} /></>)
  // מתאמן ממתין-לאישור נכנס עכשיו לדשבורד במצב צפייה (פעולות נעולות עד אישור),
  // במקום מסך חוסם נפרד. הנעילה נאכפת ב-AthleteDashboard + ב-RLS (current_user_can_book).
  return (<><SkipLink /><UpdateBanner /><AccessibilityWidget /><AthleteDashboard profile={profile} /></>)
}
