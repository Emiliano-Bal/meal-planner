'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { logout } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase'
import HouseholdSizeModal from '@/components/HouseholdSizeModal'
import PreferencesModal from '@/components/PreferencesModal'

const links = [
  { href: '/dashboard', label: 'Menu', icon: '📅' },
  { href: '/shopping', label: 'Shopping', icon: '🛒' },
  { href: '/recipes', label: 'Recipes', icon: '🍳' },
]

export default function Nav() {
  const pathname = usePathname()
  const supabase = createClient()
  const [householdSize, setHouseholdSize] = useState(4)
  const [showModal, setShowModal] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const [region, setRegion] = useState('')
  const [editingRegion, setEditingRegion] = useState(false)
  const [regionDraft, setRegionDraft] = useState('')
  const regionInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const cached = localStorage.getItem('household_size')
    if (cached) setHouseholdSize(parseInt(cached))

    const cachedRegion = localStorage.getItem('user_region')
    if (cachedRegion) setRegion(cachedRegion)

    async function loadFromDB() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('household_size').eq('id', user.id).single()
      if (data?.household_size) {
        setHouseholdSize(data.household_size)
        localStorage.setItem('household_size', String(data.household_size))
      }
    }
    loadFromDB()
  }, [supabase])

  useEffect(() => {
    if (editingRegion) {
      setRegionDraft(region)
      setTimeout(() => regionInputRef.current?.focus(), 50)
    }
  }, [editingRegion, region])

  function handleSave(size: number) {
    setHouseholdSize(size)
    localStorage.setItem('household_size', String(size))
    window.dispatchEvent(new CustomEvent('household-size-changed', { detail: size }))
    setShowModal(false)
  }

  function saveRegion() {
    const trimmed = regionDraft.trim()
    setRegion(trimmed)
    localStorage.setItem('user_region', trimmed)
    window.dispatchEvent(new CustomEvent('region-changed', { detail: trimmed }))
    setEditingRegion(false)
  }

  return (
    <>
      <header className="bg-white border-b border-stone-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-stone-800 flex items-center gap-2">
            <span>🥗</span>
            <span className="text-sm">Meal Planner</span>
          </Link>

          <nav className="flex items-center gap-1">
            {/* Region button */}
            {editingRegion ? (
              <div className="flex items-center gap-1 mr-1">
                <input
                  ref={regionInputRef}
                  value={regionDraft}
                  onChange={e => setRegionDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRegion(); if (e.key === 'Escape') setEditingRegion(false) }}
                  placeholder="City or region..."
                  className="w-36 px-2.5 py-1 text-xs rounded-lg border border-green-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button onClick={saveRegion} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 transition-colors">Save</button>
                <button onClick={() => setEditingRegion(false)} className="text-xs text-stone-400 hover:text-stone-600 px-1.5 py-1 rounded-lg">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setEditingRegion(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 transition-colors mr-1"
                title="Set your city for local product suggestions"
              >
                📍 {region || 'Set city'}
              </button>
            )}

            <button
              onClick={() => setShowPrefs(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 transition-colors mr-1"
              title="Dietary restrictions & preferred supermarkets"
            >
              ⚙️ Prefs
            </button>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors mr-1"
            >
              👥 {householdSize} {householdSize === 1 ? 'person' : 'people'}
            </button>

            {links.map(({ href, label, icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-green-50 text-green-700'
                      : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                  }`}
                >
                  <span>{icon}</span>
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              )
            })}

            <form action={logout} className="ml-2">
              <button
                type="submit"
                className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      {showModal && (
        <HouseholdSizeModal
          current={householdSize}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} />}
    </>
  )
}
