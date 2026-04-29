import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// כרטיס שיתוף קישור הרשמת מאמן — לאדמין בלבד
function CoachInviteCard() {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/register-coach` : '/register-coach'
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { prompt('העתק את הקישור:', url) }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'הצטרפות ל-TeamPact כמאמן', text: 'הירשם כמאמן חדש', url }) } catch {}
    } else { copy() }
  }
  async function sendWhatsapp() {
    const text = encodeURIComponent(`היי, הוזמנת להצטרף ל-TeamPact כמאמן. הירשם כאן: ${url}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-md">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🥋</span>
        <h3 className="font-black text-sm">קישור הזמנת מאמן חדש</h3>
      </div>
      <p className="text-xs text-blue-100 mb-3">שלח את הקישור רק למאמנים שאתה רוצה להוסיף — הם ימלאו פרטים ויחכו לאישור שלך.</p>
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
          <img src={qrSrc} alt="QR להרשמת מאמן" className="w-48 h-48" />
          <p className="text-xs text-gray-600 mt-2 text-center">סרוק את הקוד כדי להגיע ישירות לטופס ההרשמה</p>
        </div>
      )}
    </div>
  )
}

export default function TrainerProfile({ profile, isAdmin }) {
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  async function saveName() {
    setNameMsg(null)
    if (!fullName.trim()) { setNameMsg({ type: 'err', text: 'שם לא יכול להיות ריק' }); return }
    setNameSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', profile.id)
    setNameSaving(false)
    if (error) { setNameMsg({ type: 'err', text: error.message }); return }
    setNameMsg({ type: 'ok', text: 'השם עודכן — רענן את הדף' })
  }

  async function updatePassword() {
    setPwMsg(null)
    if (!newPassword || newPassword.length < 6) { setPwMsg({ type: 'err', text: 'סיסמה חייבת להכיל לפחות 6 תווים' }); return }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: 'הסיסמאות לא תואמות' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwMsg({ type: 'err', text: error.message }); return }
    setPwMsg({ type: 'ok', text: 'הסיסמה עודכנה בהצלחה' })
    setNewPassword(''); setConfirmPassword('')
  }

  return (
    <div className="space-y-4">
      {/* כרטיס הזמנת מאמן — אדמין בלבד, נגיש מיידית */}
      {isAdmin && <CoachInviteCard />}

      {/* כרטיס זהות */}
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl mx-auto mb-3">🥋</div>
        <h2 className="text-lg font-bold text-gray-800">{profile?.full_name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{profile?.email}</p>
        <p className="text-xs text-blue-600 mt-1 font-semibold">{isAdmin ? '👑 מנהל מערכת' : '🥋 מאמן'}</p>
      </div>

      {/* שינוי שם */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">שם מלא</h3>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="שם מלא"
        />
        <button onClick={saveName} disabled={nameSaving}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {nameSaving ? 'שומר...' : 'שמור שם'}
        </button>
        {nameMsg && (
          <p className={`text-xs ${nameMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {nameMsg.text}
          </p>
        )}
      </div>

      {/* שינוי סיסמה */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">שינוי סיסמה</h3>
        <input
          type="password"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="סיסמה חדשה (6+ תווים)"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="אישור סיסמה"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />
        <button onClick={updatePassword} disabled={pwSaving}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {pwSaving ? 'מעדכן...' : 'עדכן סיסמה'}
        </button>
        {pwMsg && (
          <p className={`text-xs ${pwMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {pwMsg.text}
          </p>
        )}
      </div>

      {/* יציאה */}
      <button onClick={() => supabase.auth.signOut()}
        className="w-full bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-semibold hover:bg-red-100">
        🚪 התנתק
      </button>

      {/* קישור לאתר המועדון */}
      <div className="text-center pt-2 pb-4">
        <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 hover:underline font-medium">
          🌐 בקרו באתר המועדון — teampact.co.il
        </a>
      </div>
    </div>
  )
}
