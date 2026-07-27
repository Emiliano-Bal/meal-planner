'use client'

import { useState } from 'react'
import { login, signup } from '@/app/actions/auth'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = mode === 'login' ? await login(formData) : await signup(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🥗</div>
          <h1 className="text-2xl font-semibold text-stone-800">Meal Planner</h1>
          <p className="text-stone-500 mt-1 text-sm">Plan your week, eat well</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
          <h2 className="text-lg font-medium text-stone-800 mb-6">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h2>

          <form action={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  placeholder="Your name"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Email
              </label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Password
              </label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-xl text-sm transition mt-2"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-stone-500 mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
              className="text-green-600 hover:text-green-700 font-medium"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
