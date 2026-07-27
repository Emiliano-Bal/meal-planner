'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { logout } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase'
import HouseholdSizeModal from '@/components/HouseholdSizeModal'

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

  useEffect(() => {
    const cached = localStorage.getItem('household_size')
    if (cached) setHouseholdSize(parseInt(cached))

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

  function handleSave(size: number) {
    setHouseholdSize(size)
    localStorage.setItem('household_size', String(size))
    window.dispatchEvent(new CustomEvent('household-size-changed', { detail: size }))
    setShowModal(false)
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
    </>
  )
}
