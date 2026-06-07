import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('סיסמה חייבת להכיל לפחות 6 תווים'); return }
    if (password !== confirm) { setError('הסיסמאות אינן תואמות'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => onDone?.(), 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg mb-3">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">הגדרת סיסמה חדשה</h1>
          <p className="text-gray-500 mt-1 text-sm">בחר סיסמה חזקה לחשבון שלך</p>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-green-700 font-bold text-lg">הסיסמה עודכנה בהצלחה!</p>
            <p className="text-gray-500 text-sm mt-1">מעביר אותך לאפליקציה...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">סיסמה חדשה</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                placeholder="לפחות 6 תווים"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">אימות סיסמה</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                placeholder="הקלד שוב את הסיסמה"
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-red-600 text-sm text-center font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2.5 rounded-lg transition disabled:opacity-50 shadow"
            >
              {loading ? 'שומר...' : 'שמור סיסמה חדשה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
