import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function TrainerProfile({ profile, isAdmin }) {
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)
  const [hasPendingName, setHasPendingName] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('profile_change_requests')
      .select('id')
      .eq('athlete_id', profile.id)
      .eq('change_type', 'name')
      .eq('status', 'pending')
      .then(({ data }) => setHasPendingName((data || []).length > 0))
  }, [profile?.id])

  const [phone, setPhone] = useState(profile?.phone || '')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  async function saveName() {
    setNameMsg(null)
    const trimmed = fullName.trim()
    if (!trimmed) { setNameMsg({ type: 'err', text: 'שם לא יכול להיות ריק' }); return }
    if (trimmed === (profile?.full_name || '').trim()) { setNameMsg({ type: 'err', text: 'השם זהה לשם הנוכחי' }); return }
    setNameSaving(true)
    const { error } = await supabase.from('profile_change_requests').insert({
      athlete_id: profile.id,
      athlete_name: profile.full_name || profile.email,
      change_type: 'name',
      current_value: profile.full_name || '',
      requested_value: trimmed,
    })
    setNameSaving(false)
    if (error) { setNameMsg({ type: 'err', text: error.message }); return }
    setHasPendingName(true)
    setNameMsg({ type: 'ok', text: 'הבקשה נשלחה — ממתין לאישור מנהל' })
  }

  async function savePhone() {
    setPhoneMsg(null)
    // ניקוי: מסיר תווי RTL/LTR נסתרים, NBSP, control chars שמגיעים מהדבקות
    const cleaned = (phone || '')
      .replace(/[​-‏‪-‮⁠﻿]/g, '')
      .replace(/[ \t]/g, ' ')
      .trim()
    // ולידציה רכה — מאפשר ספרות, רווח, מקף, פלוס, סוגריים. ריק = מחיקה.
    if (cleaned && !/^[0-9 +\-()]{6,20}$/.test(cleaned)) {
      setPhoneMsg({ type: 'err', text: 'מספר טלפון לא תקין (ספרות בלבד, 6-20 תווים)' })
      return
    }
    const trimmed = cleaned
    setPhoneSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ phone: trimmed || null })
      .eq('id', profile.id)
      .select('id, phone')
    setPhoneSaving(false)
    if (error) { setPhoneMsg({ type: 'err', text: error.message }); return }
    if (!data || data.length === 0) {
      setPhoneMsg({ type: 'err', text: 'לא עודכן (0 שורות) — כנראה חוסר הרשאה' })
      return
    }
    setPhoneMsg({ type: 'ok', text: trimmed ? 'הטלפון עודכן' : 'הטלפון הוסר' })
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
        {hasPendingName ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">יש בקשת שינוי שם ממתינה לאישור מנהל</p>
        ) : (
          <>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="שם מלא"
            />
            <button onClick={saveName} disabled={nameSaving}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {nameSaving ? 'שולח...' : 'שלח בקשה לאישור מנהל'}
            </button>
            {nameMsg && (
              <p className={`text-xs ${nameMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                {nameMsg.text}
              </p>
            )}
          </>
        )}
      </div>

      {/* מספר טלפון */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm">📱 מספר טלפון</h3>
        <input
          type="tel"
          dir="ltr"
          inputMode="tel"
          className="w-full border rounded-lg px-3 py-2 text-sm text-left"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="050-1234567"
        />
        <button onClick={savePhone} disabled={phoneSaving}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {phoneSaving ? 'שומר...' : 'שמור טלפון'}
        </button>
        {phoneMsg && (
          <p className={`text-xs ${phoneMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {phoneMsg.text}
          </p>
        )}
        <p className="text-[11px] text-gray-400">הטלפון נשמר בפרופיל שלך ומוצג למנהל.</p>
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
      <div className="text-center pt-2">
        <a href="https://www.teampact.co.il" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 hover:underline font-medium">
          <span aria-hidden="true">🌐</span> בקרו באתר המועדון — teampact.co.il
        </a>
      </div>

      {/* קישור לדף נגישות — חובה לפי תקנות הנגישות לשירות */}
      <div className="text-center pb-4">
        <a
          href="/accessibility"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 hover:underline font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 rounded"
        >
          <span aria-hidden="true">♿</span> הצהרת נגישות
        </a>
      </div>
    </div>
  )
}
