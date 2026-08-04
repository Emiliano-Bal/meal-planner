'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { scaleQuantity, normalizeIngKey, sumQuantities, isBasicPantryStaple, getCachedTranslations, saveCachedTranslations, getLangPref, LangPref } from '@/lib/utils'
import { translateIngredients, batchTranslateRecipeNames } from '@/app/actions/ai'
import { Menu, Meal, RecipeData, MealType } from '@/types'
import RecipePickerModal from '@/components/RecipePickerModal'
import QuickIngredientModal from '@/components/QuickIngredientModal'

const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAY_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

// ─── Copy Meal Modal ───────────────────────────────────────────────────────

function CopyMealModal({
  meal,
  currentMonday,
  onCopy,
  onClose,
  langPref,
}: {
  meal: Meal
  currentMonday: Date
  onCopy: (source: Meal, weekOffset: number, day: number, type: MealType, section: string) => Promise<void>
  onClose: () => void
  langPref: LangPref
}) {
  const dayShort = langPref === 'es' ? DAY_SHORT_ES : DAY_SHORT_EN
  const [weekOffset, setWeekOffset] = useState(1)
  const [targetDay, setTargetDay] = useState(0)
  const [targetType, setTargetType] = useState<MealType>('lunch')
  const [targetSection, setTargetSection] = useState('main')
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    setCopying(true)
    const section = targetType === 'lunch' ? targetSection : 'main'
    await onCopy(meal, weekOffset, targetDay, targetType, section)
    setCopying(false)
  }

  const weekLabels = ['This week', 'Next week', '+2 weeks', '+3 weeks']

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-5 border-b border-stone-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-stone-900">Copy meal</p>
              <p className="text-sm text-stone-400 mt-0.5 truncate">&ldquo;{meal.meal_name}&rdquo;</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 transition-colors flex-shrink-0">✕</button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Week */}
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">To week</p>
            <div className="flex gap-2 flex-wrap">
              {weekLabels.map((label, offset) => (
                <button
                  key={offset}
                  onClick={() => setWeekOffset(offset)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${weekOffset === offset ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Day */}
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Day</p>
            <div className="flex gap-1.5 flex-wrap">
              {dayShort.map((d, idx) => (
                <button
                  key={idx}
                  onClick={() => setTargetDay(idx)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${targetDay === idx ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Meal type */}
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Meal</p>
            <div className="flex gap-2">
              {(['breakfast', 'lunch', 'dinner'] as MealType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${targetType === t ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Section (lunch only) */}
          {targetType === 'lunch' && (
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Section</p>
              <div className="flex gap-2">
                {[['main', 'Main'], ['side', 'Side'], ['veggies', 'Veg'], ['grain', 'Grain']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTargetSection(key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetSection === key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-700 transition-colors">Cancel</button>
          <button
            onClick={handleCopy}
            disabled={copying}
            className="inline-flex items-center gap-2 bg-stone-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {copying ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Copying…</> : 'Copy here →'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MEAL_LABEL_EN: Record<MealType, string> = {
  breakfast: 'Morning',
  lunch: 'Midday',
  dinner: 'Evening',
}
const MEAL_LABEL_ES: Record<MealType, string> = {
  breakfast: 'Mañana',
  lunch: 'Mediodía',
  dinner: 'Noche',
}

const LUNCH_SECTIONS_EN = [
  { key: 'main',    label: 'Main'  },
  { key: 'side',    label: 'Side'  },
  { key: 'veggies', label: 'Veg'   },
  { key: 'grain',   label: 'Grain' },
]
const LUNCH_SECTIONS_ES = [
  { key: 'main',    label: 'Plato' },
  { key: 'side',    label: 'Lado'  },
  { key: 'veggies', label: 'Veg'   },
  { key: 'grain',   label: 'Grano' },
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
  const [copyModalState, setCopyModalState] = useState<{ meal: Meal } | null>(null)
  const [langPref, setLangPref] = useState<LangPref>('original')
  const [translatedMealNames, setTranslatedMealNames] = useState<Record<string, string>>({})

  const isES = langPref === 'es'
  const localDays = isES ? DAYS_ES : DAYS_EN
  const localMealLabel = isES ? MEAL_LABEL_ES : MEAL_LABEL_EN
  const localLunchSections = isES ? LUNCH_SECTIONS_ES : LUNCH_SECTIONS_EN

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

    setLangPref(getLangPref())
    const langHandler = (e: Event) => setLangPref((e as CustomEvent<LangPref>).detail)
    window.addEventListener('language-changed', langHandler)

    return () => {
      window.removeEventListener('household-size-changed', handler)
      window.removeEventListener('language-changed', langHandler)
    }
  }, [])

  useEffect(() => {
    if (langPref === 'original' || meals.length === 0) {
      setTranslatedMealNames({})
      return
    }
    const unique = Array.from(new Set(meals.map(m => m.meal_name).filter((n): n is string => !!n)))
    const items = unique.map(name => ({ id: name, name }))
    batchTranslateRecipeNames(items, langPref).then(map => {
      setTranslatedMealNames(map)
    }).catch(() => {})
  }, [meals, langPref])

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

  async function copyMealTo(
    source: Meal,
    weekOffset: number,
    targetDay: number,
    targetType: MealType,
    targetSection: string,
  ) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const targetMonday = new Date(currentMonday)
    targetMonday.setDate(targetMonday.getDate() + weekOffset * 7)
    const targetWeekStart = targetMonday.toISOString().split('T')[0]

    let { data: targetMenu } = await supabase
      .from('menus').select('id')
      .eq('user_id', user.id).eq('week_start', targetWeekStart).single()

    if (!targetMenu) {
      const { data: created } = await supabase
        .from('menus').insert({ user_id: user.id, week_start: targetWeekStart })
        .select().single()
      targetMenu = created
    }
    if (!targetMenu) return

    const { data: existing } = await supabase
      .from('meals').select('id')
      .eq('menu_id', targetMenu.id)
      .eq('day_of_week', targetDay)
      .eq('meal_type', targetType)
      .eq('section', targetSection)
      .maybeSingle()

    const payload = {
      meal_name: source.meal_name,
      recipe_id: source.recipe_id,
      recipe_data: source.recipe_data,
    }

    if (existing) {
      await supabase.from('meals').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('meals').insert({
        menu_id: targetMenu.id,
        day_of_week: targetDay,
        meal_type: targetType,
        section: targetSection,
        ...payload,
      })
    }

    if (weekOffset === 0) await loadMenu()
    setCopyModalState(null)
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
          if (isBasicPantryStaple(ing.name)) continue
          raw.push({
            name: ing.name,
            quantity: scale !== 1 ? scaleQuantity(ing.measure, scale) : ing.measure,
          })
        }
      }
    }

    // Translate to English — skip names already cached, skip call if everything is cached
    const names = raw.map(r => r.name)
    const cache = getCachedTranslations()
    const uncachedNames = names.filter(n => !(n.toLowerCase() in cache))
    let translated: string[]
    if (uncachedNames.length === 0) {
      translated = names.map(n => cache[n.toLowerCase()] ?? n)
    } else {
      const results = await translateIngredients(uncachedNames)
      const updated = { ...cache }
      uncachedNames.forEach((n, i) => { updated[n.toLowerCase()] = results[i] ?? n })
      saveCachedTranslations(updated)
      let idx = 0
      translated = names.map(n => n.toLowerCase() in cache ? cache[n.toLowerCase()] : (results[idx++] ?? n))
    }

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
                {localDays.map((day, i) => {
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
                      {localMealLabel[type]}
                    </span>
                  </div>

                  {/* Day cells */}
                  {localDays.map((_, i) => {
                    const isToday = i === todayIndex
                    const cellBase = `border-r last:border-r-0 border-stone-100 p-2.5 ${isToday ? 'bg-stone-50' : 'bg-white'}`

                    if (type === 'lunch') {
                      return (
                        <div key={i} className={cellBase}>
                          <div className="space-y-1">
                            {localLunchSections.map(sec => {
                              const meal = meals.find(m =>
                                m.day_of_week === i && m.meal_type === 'lunch' && (m.section ?? 'main') === sec.key
                              )
                              const isSimple = sec.key !== 'main'
                              const baseName = (meal?.meal_name ? (translatedMealNames[meal.meal_name] ?? meal.meal_name) : undefined)
                              const displayName = meal?.recipe_data?.grams_per_person
                                ? `${baseName} · ${householdSize * meal.recipe_data.grams_per_person}g`
                                : baseName

                              return meal ? (
                                <div key={sec.key} className="group">
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-400 mt-0.5 flex-shrink-0 w-6">{sec.label.slice(0,4)}</span>
                                    <p className="text-[11px] text-stone-700 flex-1 leading-snug">{displayName}</p>
                                    {meal.recipe_data?.is_healthy && <span className="text-[9px] text-stone-400 flex-shrink-0 mt-0.5">✦</span>}
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-0.5 ml-7">
                                    <button onClick={() => isSimple ? setQuickAddState({ day: i, section: sec.key }) : setPickerState({ day: i, mealType: 'lunch', section: sec.key })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">edit</button>
                                    <button onClick={() => setCopyModalState({ meal: meal! })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">copy</button>
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
                            <p className="text-[11px] text-stone-700 leading-snug">{(meal.meal_name ? (translatedMealNames[meal.meal_name] ?? meal.meal_name) : '')}</p>
                            {meal.recipe_data?.is_healthy && (
                              <span className="text-[9px] text-stone-400 font-medium mt-0.5 block">✦ healthy</span>
                            )}
                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-1.5 transition-opacity">
                              <button onClick={() => setPickerState({ day: i, mealType: type, section: 'main' })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">edit</button>
                              <button onClick={() => setCopyModalState({ meal })} className="text-[9px] text-stone-400 hover:text-stone-700 transition-colors">copy</button>
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
          dayName={localDays[pickerState.day]}
          mealType={pickerState.mealType}
          section={pickerState.section}
          householdSize={householdSize}
          onSelect={(recipe) => assignRecipe(pickerState.day, pickerState.mealType, pickerState.section, recipe)}
          onClose={() => setPickerState(null)}
        />
      )}

      {copyModalState !== null && (
        <CopyMealModal
          meal={copyModalState.meal}
          currentMonday={currentMonday}
          onCopy={copyMealTo}
          onClose={() => setCopyModalState(null)}
          langPref={langPref}
        />
      )}

      {quickAddState !== null && (
        <QuickIngredientModal
          section={quickAddState.section}
          householdSize={householdSize}
          dayName={localDays[quickAddState.day]}
          langPref={langPref}
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
