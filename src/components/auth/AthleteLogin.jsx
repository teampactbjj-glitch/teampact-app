import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AthleteLogin({ onSwitch }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleMagicLink(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-800 to-emerald-600 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💪</div>
          <h1 className="text-2xl font-bold text-gray-800">TeamPact</h1>
          <p className="text-gray-500 mt-1">כניסת מתאמן</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="text-gray-700 font-medium">קישור נשלח!</p>
            <p className="text-gray-500 text-sm mt-2">בדוק את תיבת הדואר שלך ולחץ על הקישור להתחברות.</p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                placeholder="athlete@example.com"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'שולח...' : 'שלח קישור כניסה'}
            </button>
          </form>
        )}

        <button
          onClick={onSwitch}
          className="w-full mt-4 text-sm text-emerald-600 hover:underline text-center"
        >
          מאמן? לחץ כאן
        </button>
      </div>
    </div>
  )
}
