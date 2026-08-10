import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ResetPasswordPage from './ResetPasswordPage'

/**
 * דף נחיתה לקישור שחזור סיסמה — 11.08.2026.
 *
 * למה זה קיים: אימתנו בפועל מול Resend (כלי "Insights", על מייל אמיתי שנשלח לאמיר
 * בן דוד — ראה MEMORY.md) ששני דברים גורמים לג'ימייל להתייחס למייל השחזור כחשוד,
 * למרות שה-SMTP/DNS/DKIM/DMARC כולם תקינים וה-Resend מדווח "Delivered":
 *   1. "Ensure link URLs match sending domain" — הקישור הישן הצביע ישר על
 *      pnicoluujpidguvniwub.supabase.co, דומיין שונה לגמרי מהשולח (noreply@teampact.co.il).
 *   2. "Don't use no-reply".
 * הפתרון (מומלץ רשמית ע"י Supabase בדיוק למקרה הזה): להחליף את הקישור בתבנית המייל
 * (Supabase Dashboard → Authentication → Emails → Templates → Reset Password) מ-
 * {{ .ConfirmationURL }} ל-{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
 * — כך שהקישור שרואה המשתמש (וגם מסנני ספאם) הוא תמיד בדומיין שלנו, לא של supabase.co.
 * העמוד הזה מקבל את token_hash ומאמת אותו בעצמו בצד הלקוח (verifyOtp).
 *
 * בונוס: זה גם חסין מפני "וואטסאפ/פרוקסי צורך את הטוקן מראש" — כי האימות קורה רק
 * כשקוד ה-JS רץ בפועל בדפדפן, לא בסתם GET אוטומטי לשרת (ר' הבאג שתוקן ב-11.08.2026
 * בכלי "יצירת קישור שחזור סיסמה" של המנהל).
 */
export default function ResetPasswordVerify() {
  const [status, setStatus] = useState('verifying') // verifying | ok | error

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token_hash = params.get('token_hash')
    const type = params.get('type')
    if (!token_hash || type !== 'recovery') {
      setStatus('error')
      return
    }
    supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).then(({ error }) => {
      setStatus(error ? 'error' : 'ok')
    })
  }, [])

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <p className="text-gray-500">בודק את הקישור...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-3">
          <div className="text-5xl" aria-hidden="true">⚠️</div>
          <p className="text-gray-800 font-bold text-lg">הקישור לא תקין או שכבר נוצל</p>
          <p className="text-gray-500 text-sm">
            קישורי שחזור סיסמה הם חד-פעמיים ופגי תוקף לאחר שימוש. בקש קישור חדש דרך
            "שכחתי סיסמה" באפליקציה, או פנה למאמן/מנהל שלך.
          </p>
        </div>
      </div>
    )
  }

  return <ResetPasswordPage onDone={() => { window.location.href = '/' }} />
}
