import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'
import { Field, useToast } from '../a11y'

export default function AthleteLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'מייל או סיסמה שגויים' : error.message)
    setLoading(false)
  }

  async function handleForgot() {
    if (!email.trim()) { setError('הזן מייל קודם'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error) setError(error.message)
    else toast.success('קישור לאיפוס סיסמה נשלח למייל שלך')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 p-4" dir="rtl">
      <div className="w-full max-w-md space-y-3">
      <InstallBanner />
      <main id="main-content" className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg mb-3" aria-hidden="true">
            <span className="text-3xl">🥋</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">TeamPact</h1>
          <p className="text-gray-600 mt-1">כניסת מאמן / מתאמן</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          <Field label="אימייל" required>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                placeholder="athlete@example.com"
              />
            )}
          </Field>
          <Field label="סיסמה" required>
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                placeholder="••••••••"
              />
            )}
          </Field>
          {error && (
            <p role="alert" aria-live="assertive" className="text-red-600 text-sm text-center font-medium">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading || undefined}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2.5 rounded-lg transition disabled:opacity-50 shadow focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-300"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
          <button
            type="button"
            onClick={handleForgot}
            className="w-full text-xs text-gray-600 hover:text-red-700 underline text-center focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-400 rounded"
          >
            שכחתי סיסמה
          </button>
        </form>

        <div className="mt-6 pt-6 border-t text-center">
          <a
            href="/register"
            className="block w-full py-2 text-sm font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-400"
          >
            עדיין לא רשום? הרשמה כאן
          </a>
          <a
            href="https://www.teampact.co.il"
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-4 text-xs text-gray-600 hover:text-red-700 transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-400 rounded"
          >
            <span aria-hidden="true">🌐 </span>בקרו באתר המועדון — teampact.co.il
            <span className="sr-only"> (נפתח בחלון חדש)</span>
          </a>
        </div>
      </main>
      </div>
    </div>
  )
}
