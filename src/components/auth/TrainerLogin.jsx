import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'
import { Field } from '../a11y'

export default function TrainerLogin({ onSwitch }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
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
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-300"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
        <button
          type="button"
          onClick={onSwitch}
          className="w-full mt-4 text-sm text-blue-700 hover:underline text-center focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 rounded"
        >
          מתאמן? לחץ כאן
        </button>
      </main>
      </div>
    </div>
  )
}
