'use client'

import { useState, useRef, useEffect } from 'react'
import { RecipeData } from '@/types'

const SECTION_CONFIG: Record<string, { label: string; placeholder: string; defaultGrams: number; note: string }> = {
  side: {
    label: 'Side Dish',
    placeholder: 'e.g. Roasted potatoes, Coleslaw, Hummus...',
    defaultGrams: 150,
    note: 'g per person',
  },
  veggies: {
    label: 'Veggies',
    placeholder: 'e.g. Broccoli, Green beans, Carrots...',
    defaultGrams: 150,
    note: 'g per person',
  },
  grain: {
    label: 'Grain',
    placeholder: 'e.g. Brown rice, Quinoa, Pasta...',
    defaultGrams: 75,
    note: 'g per person (dry)',
  },
}

interface Props {
  section: string
  householdSize: number
  dayName: string
  onAdd: (recipe: RecipeData) => void
  onPickRecipe: () => void
  onClose: () => void
}

export default function QuickIngredientModal({ section, householdSize, dayName, onAdd, onPickRecipe, onClose }: Props) {
  const cfg = SECTION_CONFIG[section] ?? SECTION_CONFIG.side
  const [ingredient, setIngredient] = useState('')
  const [gramsPerPerson, setGramsPerPerson] = useState(cfg.defaultGrams)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const totalGrams = gramsPerPerson * householdSize

  function handleAdd() {
    if (!ingredient.trim()) { inputRef.current?.focus(); return }
    const name = ingredient.trim()
    const recipe: RecipeData = {
      id: `quick_${Date.now()}`,
      name,
      thumbnail: '',
      category: cfg.label,
      area: '',
      instructions: '',
      ingredients: [{ name, measure: `${gramsPerPerson}g` }],
      servings: 1,
      grams_per_person: gramsPerPerson,
    }
    onAdd(recipe)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-stone-800">Add {cfg.label}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-50 transition-colors">✕</button>
        </div>
        <p className="text-xs text-stone-400 mb-4">{dayName}</p>

        <input
          ref={inputRef}
          value={ingredient}
          onChange={e => setIngredient(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={cfg.placeholder}
          className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent mb-4"
        />

        <div className="flex items-end gap-4 mb-5">
          <div className="flex-1">
            <label className="block text-xs font-medium text-stone-500 mb-1.5">{cfg.note}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={1000}
                step={5}
                value={gramsPerPerson}
                onChange={e => setGramsPerPerson(Math.max(10, parseInt(e.target.value) || cfg.defaultGrams))}
                className="w-20 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
              />
              <span className="text-sm text-stone-400">g</span>
            </div>
          </div>

          <div className="text-right pb-1">
            <p className="text-3xl font-bold text-stone-700 leading-none">
              {totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(1)}kg` : `${totalGrams}g`}
            </p>
            <p className="text-xs text-stone-400 mt-1">for {householdSize} {householdSize === 1 ? 'person' : 'people'}</p>
          </div>
        </div>

        <button
          onClick={handleAdd}
          className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl text-sm transition-colors mb-3"
        >
          Add to {dayName}
        </button>

        <button
          onClick={onPickRecipe}
          className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors"
        >
          Or pick a full recipe instead →
        </button>
      </div>
    </div>
  )
}
