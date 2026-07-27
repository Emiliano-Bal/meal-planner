'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  current: number
  onSave: (size: number) => void
  onClose: () => void
}

export default function HouseholdSizeModal({ current, onSave, onClose }: Props) {
  const supabase = createClient()
  const [size, setSize] = useState(current)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ household_size: size }).eq('id', user.id)
    }
    onSave(size)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="font-semibold text-stone-800 mb-1">Household Size</h2>
        <p className="text-sm text-stone-500 mb-6">
          Recipes and shopping list quantities will be scaled for everyone.
        </p>

        <div className="flex items-center justify-center gap-6 mb-7">
          <button
            onClick={() => setSize(s => Math.max(1, s - 1))}
            className="w-11 h-11 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xl font-medium transition-colors flex items-center justify-center"
          >
            −
          </button>
          <div className="text-center min-w-[60px]">
            <div className="text-5xl font-bold text-stone-800">{size}</div>
            <div className="text-sm text-stone-400 mt-1">{size === 1 ? 'person' : 'people'}</div>
          </div>
          <button
            onClick={() => setSize(s => Math.min(12, s + 1))}
            className="w-11 h-11 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xl font-medium transition-colors flex items-center justify-center"
          >
            +
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
