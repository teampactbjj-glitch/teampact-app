import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import InstallBanner from '../InstallBanner'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 p-4">
      <div className="w-full max-w-md space-y-3">
      <InstallBanner />
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🥋</div>
          <h1 className="text-2xl font-bold text-gray-800">TeamPact</h1>
          <p className="text-gray-500 mt-1">כניסת מאמן</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="trainer@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
        <button
          onClick={onSwitch}
          className="w-full mt-4 text-sm text-blue-600 hover:underline text-center"
        >
          מתאמן? לחץ כאן
        </button>
      </div>
      </div>
    </div>
  )
}
