'use client'

import { useEffect, useRef, useState } from 'react'

const DIETARY_OPTIONS = [
  { key: 'vegetarian', label: 'Vegetarian', icon: '🥦' },
  { key: 'vegan', label: 'Vegan', icon: '🌱' },
  { key: 'gluten-free', label: 'Gluten-free', icon: '🌾' },
  { key: 'dairy-free', label: 'Dairy-free', icon: '🥛' },
  { key: 'halal', label: 'Halal', icon: '☪️' },
  { key: 'kosher', label: 'Kosher', icon: '✡️' },
  { key: 'nut-free', label: 'Nut-free', icon: '🥜' },
  { key: 'low-carb', label: 'Low-carb', icon: '📉' },
]

interface Props {
  onClose: () => void
}

export default function PreferencesModal({ onClose }: Props) {
  const [dietary, setDietary] = useState<string[]>([])
  const [supermarkets, setSupermarkets] = useState<string[]>([])
  const [storeInput, setStoreInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const d = localStorage.getItem('user_dietary')
      if (d) setDietary(JSON.parse(d))
      const s = localStorage.getItem('user_supermarkets')
      if (s) setSupermarkets(JSON.parse(s))
    } catch {}
  }, [])

  function toggleDietary(key: string) {
    setDietary(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key])
  }

  function addStore() {
    const val = storeInput.trim()
    if (!val || supermarkets.includes(val)) { setStoreInput(''); return }
    setSupermarkets(prev => [...prev, val])
    setStoreInput('')
  }

  function removeStore(store: string) {
    setSupermarkets(prev => prev.filter(s => s !== store))
  }

  function save() {
    localStorage.setItem('user_dietary', JSON.stringify(dietary))
    localStorage.setItem('user_supermarkets', JSON.stringify(supermarkets))
    window.dispatchEvent(new CustomEvent('dietary-changed', { detail: dietary }))
    window.dispatchEvent(new CustomEvent('supermarkets-changed', { detail: supermarkets }))
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-stone-800">Preferences</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-50 transition-colors">✕</button>
        </div>

        <div className="mb-5">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Dietary restrictions</h3>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => toggleDietary(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  dietary.includes(opt.key)
                    ? 'bg-stone-900 border-stone-900 text-white'
                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-500 hover:text-stone-700'
                }`}
              >
                <span>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
          {dietary.length > 0 && (
            <p className="text-xs text-stone-500 mt-2">
              AI-generated recipes will respect these restrictions.
            </p>
          )}
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Preferred supermarkets</h3>
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              value={storeInput}
              onChange={e => setStoreInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStore()}
              placeholder="e.g. Mercadona, Lidl..."
              className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
            />
            <button
              onClick={addStore}
              disabled={!storeInput.trim()}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-200 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
          {supermarkets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {supermarkets.map(store => (
                <span key={store} className="flex items-center gap-1 bg-stone-100 border border-stone-200 text-stone-700 text-xs px-2.5 py-1 rounded-full font-medium">
                  🏪 {store}
                  <button onClick={() => removeStore(store)} className="hover:text-red-500 transition-colors ml-0.5">✕</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">Local suggestions will prioritize these stores.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium transition-colors">Save</button>
        </div>
      </div>
    </div>
  )
}
