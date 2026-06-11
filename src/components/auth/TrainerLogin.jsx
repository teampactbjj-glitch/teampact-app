import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'
import { Field, useToast } from '../a11y'

export default function TrainerLogin({ onSwitch }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgot() {
    if (!email.trim()) { setError('הזן מייל קודם'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + '/',
    })
    setLoading(false)
    if (error) setError(error.message)
    else toast.success('קישור לאיפוס סיסמה נשלח למייל שלך')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 p-4" dir="rtl">
      <div className="w-full max-w-md space-y-3">
      <InstallBanner />
      <main id="main-content" className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3" aria-hidden="true">🥋</div>
          <h1 className="text-2xl font-bold text-gray-800">TeamPact</h1>
          <p className="text-gray-600 mt-1">כניסת מאמן</p>
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
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                placeholder="trainer@example.com"
              />
            )}
          </Field>
          <Field label="סיסמה" required>
            {(props) => (
              <div className="relative">
                <input
                  {...props}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-11 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  aria-pressed={showPassword}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-400 rounded"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-300"
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
        <button
          type="button"
          onClick={onSwitch}
          className="w-full mt-4 text-sm text-blue-700 hover:underline text-center focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded"
        >
          מתאמן? לחץ כאן
        </button>
        <a
          href="/accessibility"
          className="block mt-3 text-xs text-gray-500 hover:text-gray-700 text-center transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded"
        >
          <span aria-hidden="true">♿ </span>הצהרת נגישות
        </a>
      </main>
      </div>
    </div>
  )
}
