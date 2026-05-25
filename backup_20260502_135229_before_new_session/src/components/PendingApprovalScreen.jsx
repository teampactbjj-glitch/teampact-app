import { supabase } from '../lib/supabase'
import InstallBanner from './InstallBanner'

export default function PendingApprovalScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.replace('/')
  }

  return (
    <main id="main-content" className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-3">
        <div role="status" aria-live="polite" className="bg-white rounded-2xl shadow p-8 text-center space-y-3">
          <div className="text-5xl" aria-hidden="true">✅</div>
          <h1 className="font-bold text-xl text-gray-800">הבקשה נשלחה לטיפול</h1>
          <p className="text-gray-500 text-sm">בקשת ההצטרפות שלך ממתינה לאישור הצוות.</p>
          <p className="text-gray-400 text-xs">לאחר האישור תקבל גישה מלאה לאפליקציה ותוכל להירשם לאימונים.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 mt-2">
            <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>ממתין לאישור... הדף יתעדכן אוטומטית</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 text-sm text-gray-500 underline"
          >
            התנתק
          </button>
        </div>
        <InstallBanner />
      </div>
    </main>
  )
}
