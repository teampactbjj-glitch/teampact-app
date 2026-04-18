import { useState } from 'react'
import { supabase } from '../../lib/supabase'

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
    </div>
  )
}
