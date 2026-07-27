'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { scaleQuantity } from '@/lib/utils'
import { Menu, Meal, RecipeData, MealType } from '@/types'
import RecipePickerModal from '@/components/RecipePickerModal'
import QuickIngredientModal from '@/components/QuickIngredientModal'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
const MEAL_ICONS: Record<MealType, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }

const LUNCH_SECTIONS = [
  { key: 'main', label: 'Main', icon: '🍖' },
  { key: 'side', label: 'Side', icon: '🥣' },
  { key: 'veggies', label: 'Veggies', icon: '🥦' },
  { key: 'grain', label: 'Grain', icon: '🍚' },
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
  return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
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
        .from('menus')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .single()

      if (!menuData) {
        const { data: created } = await supabase
          .from('menus')
          .insert({ user_id: user.id, week_start: weekStart })
          .select()
          .single()
        menuData = created
      }

      setMenu(menuData)

      if (menuData) {
        const { data: mealsData } = await supabase
          .from('meals')
          .select('*')
          .eq('menu_id', menuData.id)
        setMeals(mealsData ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [weekStart, supabase])

  useEffect(() => {
    loadMenu()
  }, [loadMenu])

  async function assignRecipe(dayIndex: number, mealType: MealType, section: string, recipe: RecipeData) {
    if (!menu) return
    const existing = meals.find(m => m.day_of_week === dayIndex && m.meal_type === mealType && (m.section ?? 'main') === section)

    if (existing) {
      await supabase.from('meals').update({
        meal_name: recipe.name,
        recipe_id: recipe.id,
        recipe_data: recipe,
      }).eq('id', existing.id)
    } else {
      await supabase.from('meals').insert({
        menu_id: menu.id,
        day_of_week: dayIndex,
        meal_type: mealType,
        section,
        meal_name: recipe.name,
        recipe_id: recipe.id,
        recipe_data: recipe,
      })
    }

    await loadMenu()
    setPickerState(null)
  }

  async function clearMeal(dayIndex: number, mealType: MealType, section: string) {
    const existing = meals.find(m => m.day_of_week === dayIndex && m.meal_type === mealType && (m.section ?? 'main') === section)
    if (!existing) return
    await supabase.from('meals').delete().eq('id', existing.id)
    setMeals(prev => prev.filter(m => m.id !== existing.id))
  }

  async function generateShoppingList() {
    if (!menu) return
    setGeneratingList(true)

    await supabase.from('shopping_items').delete().eq('menu_id', menu.id)

    const items: { menu_id: string; ingredient: string; quantity: string }[] = []
    for (const meal of meals) {
      if (meal.recipe_data?.ingredients) {
        const servings = meal.recipe_data.servings ?? 4
        const scale = householdSize / servings
        for (const ing of meal.recipe_data.ingredients) {
          const quantity = scale !== 1 ? scaleQuantity(ing.measure, scale) : ing.measure
          items.push({ menu_id: menu.id, ingredient: ing.name, quantity })
        }
      }
    }

    if (items.length > 0) {
      await supabase.from('shopping_items').insert(items)
    }

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

  const hasMeals = meals.length > 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Weekly Menu</h1>
          <p className="text-sm text-stone-500 mt-0.5">{formatWeekLabel(currentMonday)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors">←</button>
          <button onClick={() => setCurrentMonday(getMonday(new Date()))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors">Today</button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors">→</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* Day grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 mb-6">
            {DAYS.map((day, i) => (
              <div key={day} className="bg-white rounded-2xl border border-stone-100 p-3 flex flex-col gap-2">
                <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                  {day.slice(0, 3)}
                </div>

                {MEAL_TYPES.map(type => {
                  if (type === 'lunch') {
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{MEAL_ICONS[type]}</span>
                          <span className="text-xs font-medium text-stone-400">Lunch</span>
                        </div>
                        <div className="space-y-1 pl-2 border-l-2 border-stone-100 ml-2">
                          {LUNCH_SECTIONS.map(sec => {
                            const meal = meals.find(m => m.day_of_week === i && m.meal_type === 'lunch' && (m.section ?? 'main') === sec.key)
                            const isQuickAdd = !!meal?.recipe_data?.grams_per_person
                            const displayName = isQuickAdd
                              ? `${meal!.recipe_data!.name} · ${householdSize * (meal!.recipe_data!.grams_per_person ?? 0)}g`
                              : meal?.meal_name
                            const isSimple = sec.key !== 'main'
                            return (
                              <div key={sec.key} className="flex items-center gap-1 min-h-[20px]">
                                <span className="text-xs w-4 flex-shrink-0 text-stone-300">{sec.icon}</span>
                                {meal ? (
                                  <div className="flex-1 min-w-0 flex items-center gap-0.5">
                                    <p className="text-xs text-stone-600 truncate flex-1 leading-snug">{displayName}</p>
                                    {meal.recipe_data?.is_healthy && <span className="text-[9px] text-green-500 flex-shrink-0">🌿</span>}
                                    <button
                                      onClick={() => isSimple ? setQuickAddState({ day: i, section: sec.key }) : setPickerState({ day: i, mealType: 'lunch', section: sec.key })}
                                      className="text-stone-300 hover:text-stone-600 text-xs p-0.5 flex-shrink-0 transition-colors" title="Change"
                                    >✎</button>
                                    <button onClick={() => clearMeal(i, 'lunch', sec.key)} className="text-stone-300 hover:text-red-400 text-xs p-0.5 flex-shrink-0 transition-colors" title="Remove">✕</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => isSimple ? setQuickAddState({ day: i, section: sec.key }) : setPickerState({ day: i, mealType: 'lunch', section: sec.key })}
                                    className="text-xs text-stone-300 hover:text-green-500 transition-colors leading-snug"
                                  >
                                    + {sec.label.toLowerCase()}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  } else {
                    const meal = meals.find(m => m.day_of_week === i && m.meal_type === type && (m.section ?? 'main') === 'main')
                    return (
                      <div key={type} className="flex items-start gap-1.5 min-h-[26px]">
                        <span className="text-sm mt-0.5 flex-shrink-0">{MEAL_ICONS[type]}</span>
                        {meal ? (
                          <div className="flex-1 min-w-0 flex items-start gap-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-stone-700 leading-snug line-clamp-2">{meal.meal_name}</p>
                              {meal.recipe_data?.is_healthy && <span className="text-[10px] text-green-600 font-medium">🌿 healthy</span>}
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                              <button onClick={() => setPickerState({ day: i, mealType: type, section: 'main' })} className="text-stone-300 hover:text-stone-600 text-xs p-0.5 transition-colors" title="Change">✎</button>
                              <button onClick={() => clearMeal(i, type, 'main')} className="text-stone-300 hover:text-red-400 text-xs p-0.5 transition-colors" title="Remove">✕</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setPickerState({ day: i, mealType: type, section: 'main' })} className="text-xs text-stone-300 hover:text-green-500 transition-colors text-left leading-snug">
                            + {type}
                          </button>
                        )}
                      </div>
                    )
                  }
                })}
              </div>
            ))}
          </div>

          {hasMeals && (
            <div className="flex justify-center">
              <button
                onClick={generateShoppingList}
                disabled={generatingList}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2"
              >
                <span>🛒</span>
                {generatingList
                  ? 'Generating...'
                  : `Generate Shopping List for ${householdSize} ${householdSize === 1 ? 'person' : 'people'}`}
              </button>
            </div>
          )}
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
