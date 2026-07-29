'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Meal, MealType, RecipeData } from '@/types'
import Link from 'next/link'
import { generateRecipe } from '@/app/actions/ai'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
const MEAL_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const SECTION_LABEL: Record<string, string> = { main: 'Main', side: 'Side', veggies: 'Veg', grain: 'Grain' }

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function dbDayIndex(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 6 : d - 1
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatDayLabel(date: Date): { day: string; date: string } {
  return {
    day: date.toLocaleDateString('en-US', { weekday: 'long' }),
    date: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getRecipe(meal: Meal, localRecipes: Record<string, RecipeData>): RecipeData | null {
  return localRecipes[meal.id] ?? meal.recipe_data ?? null
}

// ─── Flip Card ─────────────────────────────────────────────────────────────

function RecipeCard({
  meal,
  localRecipes,
  onOpenGenerator,
}: {
  meal: Meal
  localRecipes: Record<string, RecipeData>
  onOpenGenerator: (meal: Meal) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const recipe = getRecipe(meal, localRecipes)
  const hasRecipe = !!(recipe?.instructions || recipe?.ingredients?.length)
  const sectionLabel = meal.section && meal.section !== 'main'
    ? SECTION_LABEL[meal.section] ?? meal.section
    : null

  function handleFrontClick() {
    if (hasRecipe) setFlipped(true)
    else onOpenGenerator(meal)
  }

  return (
    <div
      style={{
        perspective: '1200px',
        height: flipped ? '480px' : '180px',
        transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* ── Front ── */}
        <div
          onClick={handleFrontClick}
          className={`absolute inset-0 bg-white rounded-2xl border border-stone-100 p-5 flex flex-col justify-between ${hasRecipe ? 'cursor-pointer hover:border-stone-200 hover:shadow-sm' : 'cursor-pointer'} active:scale-[0.98] transition-all`}
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                {sectionLabel && (
                  <span className="text-xs font-semibold text-stone-400 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">
                    {sectionLabel}
                  </span>
                )}
                {recipe?.is_healthy && <span className="text-xs text-stone-400">✦ healthy</span>}
              </div>
              {hasRecipe
                ? <span className="text-xs text-stone-300 flex-shrink-0">tap to flip →</span>
                : <span className="text-xs text-amber-400 flex-shrink-0">tap to generate →</span>
              }
            </div>
            <p className="text-lg font-bold text-stone-900 leading-snug">{meal.meal_name}</p>
            {recipe?.category && <p className="text-sm text-stone-400 mt-1">{recipe.category}</p>}
          </div>
          {recipe?.ingredients
            ? <p className="text-sm text-stone-400 mt-4">{recipe.ingredients.length} ingredients</p>
            : <p className="text-sm text-stone-400 mt-4">No recipe yet</p>
          }
        </div>

        {/* ── Back ── */}
        <div
          className="absolute inset-0 bg-stone-900 rounded-2xl overflow-y-auto"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Sticky header with flip-back button */}
          <div className="sticky top-0 bg-stone-900 border-b border-stone-800 px-5 py-3 flex items-center justify-between z-10">
            <p className="text-sm font-bold text-stone-200 truncate pr-3">{meal.meal_name}</p>
            <button
              onClick={e => { e.stopPropagation(); setFlipped(false) }}
              className="flex-shrink-0 text-xs text-stone-500 hover:text-stone-300 flex items-center gap-1 transition-colors"
            >
              ↩ flip back
            </button>
          </div>

          <div className="px-5 py-4 space-y-5">
            {recipe?.ingredients && recipe.ingredients.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3">Ingredients</p>
                <div className="space-y-2">
                  {recipe.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4 border-b border-stone-800 pb-1.5">
                      <span className="text-sm text-stone-200">{ing.name}</span>
                      {ing.measure && <span className="text-xs text-stone-500 text-right flex-shrink-0">{ing.measure}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recipe?.instructions && (
              <div className="pb-2">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3">Instructions</p>
                <p className="text-sm text-stone-300 leading-relaxed whitespace-pre-line">{recipe.instructions}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Generate + Edit Modal ─────────────────────────────────────────────────

type Phase = 'no-recipe' | 'generating' | 'review' | 'error'

interface DraftIngredient { name: string; measure: string }
interface Draft {
  category: string
  is_healthy: boolean
  servings: number
  ingredients: DraftIngredient[]
  instructions: string
}

function GenerateModal({
  meal,
  onClose,
  onGenerated,
}: {
  meal: Meal
  onClose: () => void
  onGenerated: (mealId: string, recipe: RecipeData) => void
}) {
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>('no-recipe')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleGenerate() {
    setPhase('generating')
    setErrorMsg('')
    try {
      const householdSize = parseInt(localStorage.getItem('household_size') ?? '4')
      const dietary = (() => {
        try { return JSON.parse(localStorage.getItem('dietary_restrictions') ?? '[]') as string[] }
        catch { return [] as string[] }
      })()
      const result = await generateRecipe(meal.meal_name ?? 'Recipe', householdSize, dietary)
      setDraft({
        category: result.category ?? '',
        is_healthy: result.is_healthy ?? false,
        servings: result.servings ?? householdSize,
        ingredients: (result.ingredients ?? []).map(i => ({ name: i.name, measure: i.measure })),
        instructions: result.instructions ?? '',
      })
      setPhase('review')
      setTimeout(() => scrollRef.current?.scrollTo({ top: 0 }), 50)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Generation failed')
      setPhase('error')
    }
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const newRecipe: RecipeData = {
        id: meal.id,
        name: meal.meal_name ?? 'Recipe',
        thumbnail: '',
        category: draft.category,
        area: '',
        instructions: draft.instructions,
        ingredients: draft.ingredients.filter(i => i.name.trim()),
        is_healthy: draft.is_healthy,
        servings: draft.servings,
        source: 'custom',
      }
      await supabase.from('meals').update({ recipe_data: newRecipe }).eq('id', meal.id)
      onGenerated(meal.id, newRecipe)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function updateIngredient(idx: number, field: 'name' | 'measure', value: string) {
    setDraft(d => d ? {
      ...d,
      ingredients: d.ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing),
    } : d)
  }

  function removeIngredient(idx: number) {
    setDraft(d => d ? { ...d, ingredients: d.ingredients.filter((_, i) => i !== idx) } : d)
  }

  function addIngredient() {
    setDraft(d => d ? { ...d, ingredients: [...d.ingredients, { name: '', measure: '' }] } : d)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-stone-100 flex-shrink-0">
          <div>
            <p className="text-xl font-bold text-stone-900 leading-snug">{meal.meal_name}</p>
            <p className="text-sm text-stone-400 mt-0.5">
              {phase === 'no-recipe' && 'Generate a recipe'}
              {phase === 'generating' && 'Writing your recipe…'}
              {phase === 'review' && 'Customize before saving'}
              {phase === 'error' && 'Something went wrong'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0 mt-0.5">✕</button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-6 py-5">
          {phase === 'no-recipe' && (
            <div className="py-10 text-center space-y-3">
              <p className="text-stone-500">No recipe saved for this item.</p>
              <p className="text-sm text-stone-400">Generate one with AI — you&apos;ll be able to swap ingredients before saving.</p>
              <button onClick={handleGenerate} className="mt-4 inline-flex items-center gap-2 bg-stone-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-stone-700 transition-colors">
                ✦ Generate Recipe
              </button>
            </div>
          )}

          {phase === 'generating' && (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-stone-200 border-t-stone-700 animate-spin" />
              <p className="text-sm text-stone-400">Generating…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-10 text-center space-y-4">
              <p className="text-sm text-red-500">{errorMsg}</p>
              <button onClick={handleGenerate} className="text-sm font-semibold text-stone-700 underline underline-offset-2">Try again</button>
            </div>
          )}

          {phase === 'review' && draft && (
            <div className="space-y-6 pb-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Ingredients</h3>
                  <span className="text-xs text-stone-400">Edit anything you want</span>
                </div>
                <div className="space-y-2">
                  {draft.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ing.name}
                        onChange={e => updateIngredient(i, 'name', e.target.value)}
                        placeholder="Ingredient"
                        className="flex-1 text-sm px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white transition-colors"
                      />
                      <input
                        type="text"
                        value={ing.measure}
                        onChange={e => updateIngredient(i, 'measure', e.target.value)}
                        placeholder="Amount"
                        className="w-24 text-sm px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white transition-colors"
                      />
                      <button onClick={() => removeIngredient(i)} className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0 text-base">×</button>
                    </div>
                  ))}
                </div>
                <button onClick={addIngredient} className="mt-3 text-xs font-semibold text-stone-400 hover:text-stone-700 flex items-center gap-1 transition-colors">
                  + Add ingredient
                </button>
              </div>

              <div>
                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Instructions</h3>
                <textarea
                  value={draft.instructions}
                  onChange={e => setDraft(d => d ? { ...d, instructions: e.target.value } : d)}
                  rows={8}
                  className="w-full text-sm px-3 py-2.5 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white transition-colors resize-none leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {phase === 'review' && draft && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button onClick={handleGenerate} className="text-sm font-medium text-stone-400 hover:text-stone-700 transition-colors">↺ Regenerate</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-stone-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Saving…</> : 'Save Recipe →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CookPage() {
  const supabase = createClient()
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()))
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [generatorMeal, setGeneratorMeal] = useState<Meal | null>(null)
  const [localRecipes, setLocalRecipes] = useState<Record<string, RecipeData>>({})

  const weekStart = getMonday(currentDate).toISOString().split('T')[0]

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: menuData } = await supabase
      .from('menus').select('id')
      .eq('user_id', user.id).eq('week_start', weekStart).single()

    if (menuData) {
      const { data: mealsData } = await supabase
        .from('meals').select('*').eq('menu_id', menuData.id)
      setMeals(mealsData ?? [])
    } else {
      setMeals([])
    }
    setLoading(false)
  }, [weekStart, supabase])

  useEffect(() => { loadData() }, [loadData])

  const navigate = (dir: -1 | 1) => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir)
      return d
    })
  }

  function handleGenerated(mealId: string, recipe: RecipeData) {
    setLocalRecipes(prev => ({ ...prev, [mealId]: recipe }))
    setMeals(prev => prev.map(m => m.id === mealId ? { ...m, recipe_data: recipe } : m))
  }

  const today = startOfDay(new Date())
  const isViewingToday = isSameDay(currentDate, today)
  const dayIdx = dbDayIndex(currentDate)
  const { day: dayName, date: dateLabel } = formatDayLabel(currentDate)

  const dayMeals = MEAL_TYPES.flatMap(type =>
    meals
      .filter(m => m.day_of_week === dayIdx && m.meal_type === type)
      .sort((a, b) => {
        const order = ['main', 'side', 'veggies', 'grain']
        return order.indexOf(a.section ?? 'main') - order.indexOf(b.section ?? 'main')
      })
  )

  return (
    <>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors text-xl">‹</button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-bold text-stone-900">{dayName}</h1>
              {isViewingToday && <span className="text-xs font-semibold bg-stone-900 text-white px-2 py-0.5 rounded-full">Today</span>}
            </div>
            <p className="text-sm text-stone-400 mt-0.5">{dateLabel}</p>
            {!isViewingToday && (
              <button onClick={() => setCurrentDate(today)} className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2 mt-1 transition-colors">
                Go to today
              </button>
            )}
          </div>

          <button onClick={() => navigate(1)} className="w-10 h-10 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors text-xl">›</button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-stone-200 border-t-stone-600 animate-spin" />
            <p className="text-sm text-stone-400">Loading…</p>
          </div>
        ) : dayMeals.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-stone-400 mb-3">No meals planned for {isViewingToday ? 'today' : dayName.toLowerCase()}.</p>
            <Link href="/dashboard" className="text-sm font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2">
              Go to Menu to plan meals →
            </Link>
          </div>
        ) : (
          <div className="space-y-8 pb-10">
            {MEAL_TYPES.map(type => {
              const typeMeals = dayMeals.filter(m => m.meal_type === type)
              if (!typeMeals.length) return null
              return (
                <div key={type}>
                  <h2 className="text-base font-semibold text-stone-500 mb-3">{MEAL_LABEL[type]}</h2>
                  <div className="space-y-4">
                    {typeMeals.map(meal => (
                      <RecipeCard
                        key={meal.id}
                        meal={meal}
                        localRecipes={localRecipes}
                        onOpenGenerator={setGeneratorMeal}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {generatorMeal && (
        <GenerateModal
          meal={generatorMeal}
          onClose={() => setGeneratorMeal(null)}
          onGenerated={handleGenerated}
        />
      )}
    </>
  )
}
