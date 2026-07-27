'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { scaleQuantity, normalizeIngKey, sumQuantities } from '@/lib/utils'
import { translateIngredients } from '@/app/actions/ai'
import { Menu, Meal, RecipeData, MealType } from '@/types'
import RecipePickerModal from '@/components/RecipePickerModal'
import QuickIngredientModal from '@/components/QuickIngredientModal'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Morning',
  lunch: 'Midday',
  dinner: 'Evening',
}

const LUNCH_SECTIONS = [
  { key: 'main',    label: 'Main'   },
  { key: 'side',    label: 'Side'   },
  { key: 'veggies', label: 'Veg'    },
  { key: 'grain',   label: 'Grain'  },
]

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel(monday: Date): string {
  const end = new Date(monday)
  end.setDate(monday.getDate() + 6)
  return `${monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
}

export default function DashboardPage() {
  const supabase = createClient()
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const [menu, setMenu] = useState<Menu | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerState, setPickerState] = useState<{ day: number; mealType: MealType; section: string } | null>(null)
  const [quickAddState, setQuickAddState] = useState<{ day: number; section: string } | null>(null)
  const [generatingList, setGeneratingList] = useState(false)
  const [householdSize, setHouseholdSize] = useState(4)

  const weekStart = currentMonday.toISOString().split('T')[0]

  const todayIndex = (() => {
    const todayWeekStart = getMonday(new Date()).toISOString().split('T')[0]
    if (weekStart !== todayWeekStart) return -1
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1
  })()

  useEffect(() => {
    const cached = localStorage.getItem('household_size')
    if (cached) setHouseholdSize(parseInt(cached))
    const handler = (e: Event) => setHouseholdSize((e as CustomEvent<number>).detail)
    window.addEventListener('household-size-changed', handler)
    return () => window.removeEventListener('household-size-changed', handler)
  }, [])

  const loadMenu = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      let { data: menuData } = await supabase
        .from('menus').select('*')
        .eq('user_id', user.id).eq('week_start', weekStart).single()

      if (!menuData) {
        const { data: created } = await supabase
          .from('menus').insert({ user_id: user.id, week_start: weekStart })
          .select().single()
        menuData = created
      }

      setMenu(menuData)
      if (menuData) {
        const { data: mealsData } = await supabase
          .from('meals').select('*').eq('menu_id', menuData.id)
        setMeals(mealsData ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [weekStart, supabase])

  useEffect(() => { loadMenu() }, [loadMenu])

  async function assignRecipe(dayIndex: number, mealType: MealType, section: string, recipe: RecipeData) {
    if (!menu) return
    const existing = meals.find(m =>
      m.day_of_week === dayIndex && m.meal_type === mealType && (m.section ?? 'main') === section
    )
    if (existing) {
      await supabase.from('meals').update({ meal_name: recipe.name, recipe_id: recipe.id, recipe_data: recipe }).eq('id', existing.id)
    } else {
      await supabase.from('meals').insert({ menu_id: menu.id, day_of_week: dayIndex, meal_type: mealType, section, meal_name: recipe.name, recipe_id: recipe.id, recipe_data: recipe })
    }
    await loadMenu()
    setPickerState(null)
  }

  async function clearMeal(dayIndex: number, mealType: MealType, section: string) {
    const existing = meals.find(m =>
      m.day_of_week === dayIndex && m.meal_type === mealType && (m.section ?? 'main') === section
    )
    if (!existing) return
    await supabase.from('meals').delete().eq('id', existing.id)
    setMeals(prev => prev.filter(m => m.id !== existing.id))
  }

  async function generateShoppingList() {
    if (!menu) return
    setGeneratingList(true)
    await supabase.from('shopping_items').delete().eq('menu_id', menu.id)

    // Collect raw ingredients from all meals
    const raw: { name: string; quantity: string }[] = []
    for (const meal of meals) {
      if (meal.recipe_data?.ingredients) {
        const servings = meal.recipe_data.servings ?? 4
        const scale = householdSize / servings
        for (const ing of meal.recipe_data.ingredients) {
          raw.push({
            name: ing.name,
            quantity: scale !== 1 ? scaleQuantity(ing.measure, scale) : ing.measure,
          })
        }
      }
    }

    // Translate all names to English in one call, then deduplicate
    const names = raw.map(r => r.name)
    const translated = await translateIngredients(names)

    const map = new Map<string, { name: string; quantities: string[] }>()
    for (let i = 0; i < raw.length; i++) {
      const name = translated[i] ?? raw[i].name
      const key = normalizeIngKey(name)
      if (map.has(key)) map.get(key)!.quantities.push(raw[i].quantity)
      else map.set(key, { name, quantities: [raw[i].quantity] })
    }

    const items = Array.from(map.values()).map(({ name, quantities }) => ({
      menu_id: menu!.id, ingredient: name, quantity: sumQuantities(quantities),
    }))
    if (items.length > 0) await supabase.from('shopping_items').insert(items)
    setGeneratingList(false)
    window.location.href = '/shopping'
  }

  const navigate = (dir: -1 | 1) => {
    setCurrentMonday(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Weekly menu</h1>
          <p className="text-xs text-stone-400 mt-1">{formatWeekLabel(currentMonday)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors text-lg">‹</button>
          <button onClick={() => setCurrentMonday(getMonday(new Date()))} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors">Today</button>
          <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors text-lg">›</button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-stone-200 border-t-stone-600 animate-spin" />
          <p className="text-xs text-stone-400">Loading…</p>
        </div>
      ) : (
        <>
          {/* ── Calendar Grid ── */}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            <div className="min-w-[580px]">

              {/* Day header row */}
              <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b-2 border-stone-200">
                <div className="border-r border-stone-200" /> {/* corner */}
                {DAYS.map((day, i) => {
                  const isToday = i === todayIndex
                  const dayDate = new Date(currentMonday)
                  dayDate.setDate(dayDate.getDate() + i)
                  return (
                    <div
                      key={day}
                      className={`py-3 text-center border-r last:border-r-0 border-stone-200 ${isToday ? 'bg-stone-900' : 'bg-stone-50'}`}
                    >
                      <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${isToday ? 'text-stone-400' : 'text-stone-400'}`}>
                        {day.slice(0, 3)}
                      </p>
                      <p className={`text-xl font-black leading-none mt-1 ${isToday ? 'text-white' : 'text-stone-300'}`}>
                        {dayDate.getDate()}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Meal rows */}
              {MEAL_TYPES.map(type => (
                <div key={type} className={`grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-stone-100 ${type === 'lunch' ? 'min-h-[130px]' : 'min-h-[90px]'}`}>
                  {/* Row label */}
                  <div className="border-r border-stone-200 p-2.5 flex items-start justify-end pt-3">
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-stone-400 text-right">
                      {MEAL_LABEL[type]}
                    </span>
                  </div>

                  {/* Day cells */}
                  {DAYS.map((_, i) => {
                    const isToday = i === todayIndex
                    const cellBase = `border-r last:border-r-0 border-stone-100 p-2.5 ${isToday ? 'bg-stone-50' : 'bg-white'}`

                    if (type === 'lunch') {
                      return (
                        <div key={i} className={cellBase}>
                          <div className="space-y-1">
                            {LUNCH_SECTIONS.map(sec => {
                              const meal = meals.find(m =>
                                m.day_of_week === i && m.meal_type === 'lunch' && (m.section ?? 'main') === sec.key
                              )
                              const isSimple = sec.key !== 'main'
                              const displayName = meal?.recipe_data?.grams_per_person
                                ? `${meal.recipe_data.name} · ${householdSize * meal.recipe_data.grams_per_person}g`
                                : meal?.meal_name

                              return meal ? (
                                <div key={sec.key} className="group">
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-400 mt-0.5 flex-shrink-0 w-6">{sec.label.slice(0,4)}</span>
                                    <p className="text-[11px] text-stone-700 flex-1 leading-snug">{displayName}</p>
                                    {meal.recipe_data?.is_healthy && <span className="text-[9px] text-stone-400 flex-shrink-0 mt-0.5">✦</span>}
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-0.5 ml-7">
                                    <button onClick={() => isSimple ? setQuickAddState({ day: i, section: sec.key }) : setPickerState({ day: i, mealType: 'lunch', section: sec.key })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">edit</button>
                                    <button onClick={() => clearMeal(i, 'lunch', sec.key)} className="text-[9px] text-stone-400 hover:text-red-500 transition-colors">remove</button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  key={sec.key}
                                  onClick={() => isSimple ? setQuickAddState({ day: i, section: sec.key }) : setPickerState({ day: i, mealType: 'lunch', section: sec.key })}
                                  className="flex items-center gap-1.5 group"
                                >
                                  <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-300 w-6 flex-shrink-0">{sec.label.slice(0,4)}</span>
                                  <span className="text-[11px] text-stone-200 group-hover:text-stone-500 transition-colors">+</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    }

                    const meal = meals.find(m =>
                      m.day_of_week === i && m.meal_type === type && (m.section ?? 'main') === 'main'
                    )

                    return (
                      <div key={i} className={cellBase}>
                        {meal ? (
                          <div className="group h-full">
                            <p className="text-[11px] text-stone-700 leading-snug">{meal.meal_name}</p>
                            {meal.recipe_data?.is_healthy && (
                              <span className="text-[9px] text-stone-400 font-medium mt-0.5 block">✦ healthy</span>
                            )}
                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-1.5 transition-opacity">
                              <button onClick={() => setPickerState({ day: i, mealType: type, section: 'main' })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">edit</button>
                              <button onClick={() => clearMeal(i, type, 'main')} className="text-[9px] text-stone-400 hover:text-red-500 transition-colors">remove</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPickerState({ day: i, mealType: type, section: 'main' })}
                            className="w-full h-full min-h-[70px] flex items-start text-sm text-stone-200 hover:text-stone-500 transition-colors"
                          >
                            +
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="mt-8 pb-6">
            {meals.length > 0 ? (
              <button
                onClick={generateShoppingList}
                disabled={generatingList}
                className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-700 disabled:bg-stone-300 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {generatingList ? 'Generating…' : `Generate shopping list · ${householdSize} ${householdSize === 1 ? 'person' : 'people'}`}
              </button>
            ) : (
              <p className="text-xs text-stone-400">Tap any cell to add a meal.</p>
            )}
          </div>
        </>
      )}

      {pickerState !== null && (
        <RecipePickerModal
          dayName={DAYS[pickerState.day]}
          mealType={pickerState.mealType}
          section={pickerState.section}
          householdSize={householdSize}
          onSelect={(recipe) => assignRecipe(pickerState.day, pickerState.mealType, pickerState.section, recipe)}
          onClose={() => setPickerState(null)}
        />
      )}

      {quickAddState !== null && (
        <QuickIngredientModal
          section={quickAddState.section}
          householdSize={householdSize}
          dayName={DAYS[quickAddState.day]}
          onAdd={(recipe) => {
            assignRecipe(quickAddState.day, 'lunch', quickAddState.section, recipe)
            setQuickAddState(null)
          }}
          onPickRecipe={() => {
            setPickerState({ day: quickAddState.day, mealType: 'lunch', section: quickAddState.section })
            setQuickAddState(null)
          }}
          onClose={() => setQuickAddState(null)}
        />
      )}
    </div>
  )
}
