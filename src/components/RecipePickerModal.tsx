'use client'

import { useState, useEffect, useCallback } from 'react'
import { searchRecipes, getCategories, filterByCategory, getRecipeById, getFeaturedRecipes } from '@/lib/mealdb'
import { createClient } from '@/lib/supabase'
import { scaleQuantity } from '@/lib/utils'
import { generateHealthyVersion } from '@/app/actions/ai'
import { RecipeData, MealType, CustomRecipe, RecipePrefill } from '@/types'
import AddRecipeModal from '@/components/AddRecipeModal'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

const SECTION_LABELS: Record<string, string> = {
  main: 'Main',
  side: 'Side',
  veggies: 'Veggies',
  grain: 'Grain',
}

const PRESET_SEARCHES: { label: string; q?: string; cat?: string }[] = [
  { label: '🍳 Breakfast', cat: 'Breakfast' },
  { label: '🥩 Steak', q: 'steak' },
  { label: '🐟 Salmon', q: 'salmon' },
  { label: '🍝 Pasta', q: 'pasta' },
  { label: '🍛 Curry', q: 'curry' },
  { label: '🥗 Salad', q: 'salad' },
  { label: '🍄 Risotto', q: 'risotto' },
  { label: '🌮 Tacos', q: 'tacos' },
]

interface Props {
  dayName: string
  mealType: MealType
  section?: string
  onSelect: (recipe: RecipeData) => void
  onClose: () => void
  householdSize?: number
}

function customToRecipeData(r: CustomRecipe): RecipeData {
  return {
    id: `custom_${r.id}`,
    name: r.name,
    thumbnail: '',
    category: r.category ?? 'Custom',
    area: '',
    instructions: r.instructions ?? '',
    ingredients: r.ingredients,
    is_healthy: r.is_healthy,
    servings: r.servings,
    source: 'custom',
  }
}

function findHealthyAlts(recipeName: string, customs: CustomRecipe[]): CustomRecipe[] {
  const words = recipeName.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
  if (!words.length) return []
  return customs.filter(r => r.is_healthy && words.some(w => r.name.toLowerCase().includes(w)))
}

export default function RecipePickerModal({ dayName, mealType, section, onSelect, onClose, householdSize = 4 }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeData[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<RecipeData | null>(null)
  const [customRecipes, setCustomRecipes] = useState<CustomRecipe[]>([])
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [healthyOnly, setHealthyOnly] = useState(false)
  const [generatingHealthy, setGeneratingHealthy] = useState(false)
  const [healthyPrefill, setHealthyPrefill] = useState<RecipePrefill | null>(null)

  useEffect(() => {
    getCategories().then(setCategories)
    setLoading(true)
    getFeaturedRecipes().then(r => { setResults(r); setLoading(false) })
  }, [])

  const loadCustomRecipes = useCallback(async () => {
    setLoadingCustom(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingCustom(false); return }
    const { data } = await supabase
      .from('custom_recipes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setCustomRecipes(data ?? [])
    setLoadingCustom(false)
  }, [supabase])

  useEffect(() => { loadCustomRecipes() }, [loadCustomRecipes])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setActiveCategory(null)
    setResults(await searchRecipes(q))
    setLoading(false)
  }, [])

  const browseCategory = useCallback(async (cat: string) => {
    setLoading(true)
    setActiveCategory(cat)
    setQuery('')
    setResults(await filterByCategory(cat))
    setLoading(false)
  }, [])

  async function openDetail(recipe: RecipeData) {
    if (recipe.source === 'custom' || recipe.instructions) {
      setDetail(recipe)
    } else {
      const full = await getRecipeById(recipe.id)
      if (full) setDetail(full)
    }
  }

  async function handleCreateHealthy() {
    if (!detail) return
    setGeneratingHealthy(true)
    try {
      const result = await generateHealthyVersion({
        name: detail.name,
        category: detail.category,
        servings: detail.servings ?? householdSize,
        ingredients: detail.ingredients,
        instructions: detail.instructions,
      })
      setHealthyPrefill({ ...result, servings: householdSize })
    } catch {
      setHealthyPrefill({
        name: `Healthy ${detail.name}`,
        category: detail.category,
        servings: householdSize,
        is_healthy: true,
        ingredients: detail.ingredients,
        instructions: detail.instructions || undefined,
      })
    } finally {
      setGeneratingHealthy(false)
    }
  }

  const filteredCustom = healthyOnly ? customRecipes.filter(r => r.is_healthy) : customRecipes
  const healthyAlts = detail && detail.source !== 'custom' ? findHealthyAlts(detail.name, customRecipes) : []
  const scale = detail ? householdSize / (detail.servings ?? 4) : 1

  // Header label for the picker
  const mealLabel = mealType === 'lunch' && section
    ? `Lunch · ${SECTION_LABELS[section] ?? section}`
    : MEAL_TYPE_LABELS[mealType]

  // "Add to" button label
  const addLabel = mealType === 'lunch' && section
    ? `Add ${SECTION_LABELS[section] ?? section} to ${dayName}`
    : `Add ${MEAL_TYPE_LABELS[mealType]} to ${dayName}`

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-stone-800">{mealLabel}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{dayName}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-50 transition-colors">✕</button>
        </div>

        {detail ? (
          <div className="flex-1 overflow-y-auto p-5">
            <button onClick={() => setDetail(null)} className="text-sm text-stone-400 hover:text-stone-700 mb-4 flex items-center gap-1">← Back</button>
            {detail.thumbnail ? (
              <img src={detail.thumbnail} alt={detail.name} className="w-full h-48 object-cover rounded-2xl mb-4" />
            ) : (
              <div className="w-full h-32 bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl mb-4 flex items-center justify-center">
                <span className="text-5xl">{detail.is_healthy ? '🥦' : '🍽️'}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-stone-800">{detail.name}</h3>
              {detail.is_healthy && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">🌿 Healthy</span>}
            </div>
            <p className="text-xs text-stone-400 mb-4">
              {detail.category}{detail.area ? ` · ${detail.area}` : ''}{detail.servings ? ` · Serves ${detail.servings}` : ''}
            </p>

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-stone-700">Ingredients</h4>
              {scale !== 1 && <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">Scaled for {householdSize} people</span>}
            </div>
            <ul className="grid grid-cols-2 gap-1 mb-4">
              {detail.ingredients.map((ing, i) => (
                <li key={i} className="text-xs text-stone-600 bg-stone-50 rounded-lg px-3 py-1.5">
                  <span className="font-medium">{scaleQuantity(ing.measure, scale)}</span> {ing.name}
                </li>
              ))}
            </ul>

            {detail.instructions && (
              <>
                <h4 className="text-sm font-medium text-stone-700 mb-2">Instructions</h4>
                <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line mb-4">{detail.instructions}</p>
              </>
            )}

            {detail.source !== 'custom' && (
              <div className="mb-4">
                {healthyAlts.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-stone-700 mb-2">🌿 Your Healthy Versions</h4>
                    <div className="space-y-2 mb-3">
                      {healthyAlts.map(alt => (
                        <button key={alt.id} onClick={() => setDetail(customToRecipeData(alt))} className="w-full text-left px-3.5 py-2.5 rounded-xl border border-green-100 bg-green-50 hover:border-green-300 hover:bg-green-100 transition-colors">
                          <p className="text-sm font-medium text-green-800">{alt.name}</p>
                          <p className="text-xs text-green-600 mt-0.5">Serves {alt.servings} · {alt.category ?? 'Custom'}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={handleCreateHealthy}
                  disabled={generatingHealthy}
                  className="w-full py-2.5 rounded-xl border border-dashed border-green-300 text-green-600 text-sm font-medium hover:bg-green-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                >
                  {generatingHealthy ? <><span className="animate-spin inline-block">⏳</span> Generating...</> : '🌿 Create Healthy Version with AI'}
                </button>
              </div>
            )}

            <button onClick={() => onSelect(detail)} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-xl text-sm transition-colors">
              {addLabel}
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-stone-100 flex-shrink-0">
              <div className="flex gap-1 mb-3 bg-stone-100 rounded-xl p-1">
                <button onClick={() => setTab('discover')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${tab === 'discover' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>Discover</button>
                <button onClick={() => setTab('mine')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${tab === 'mine' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>My Recipes</button>
              </div>

              {tab === 'discover' ? (
                <>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && search(query)}
                      placeholder="Search recipes..."
                      className="flex-1 px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <button onClick={() => search(query)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">Search</button>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none mb-2">
                    {PRESET_SEARCHES.map(p => (
                      <button
                        key={p.label}
                        onClick={() => p.cat ? browseCategory(p.cat) : (p.q && (setQuery(p.q), search(p.q)))}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium bg-stone-50 text-stone-600 border border-stone-200 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {categories.slice(0, 14).map(cat => (
                      <button key={cat} onClick={() => browseCategory(cat)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activeCategory === cat ? 'bg-green-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{cat}</button>
                    ))}
                  </div>
                </>
              ) : (
                <button onClick={() => setHealthyOnly(h => !h)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${healthyOnly ? 'bg-green-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>🌿 Healthy only</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'discover' ? (
                loading ? (
                  <div className="text-center py-10 text-stone-400 text-sm">Loading...</div>
                ) : results.length === 0 ? (
                  <div className="text-center py-10 text-stone-400 text-sm">No results found</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {results.map(recipe => (
                      <button key={recipe.id} onClick={() => openDetail(recipe)} className="text-left rounded-2xl overflow-hidden border border-stone-100 hover:border-green-300 hover:shadow-sm transition-all group">
                        <img src={recipe.thumbnail} alt={recipe.name} className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-200" />
                        <div className="p-2.5">
                          <p className="text-xs font-medium text-stone-700 leading-snug line-clamp-2">{recipe.name}</p>
                          {recipe.category && <p className="text-xs text-stone-400 mt-0.5">{recipe.category}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                loadingCustom ? (
                  <div className="text-center py-10 text-stone-400 text-sm">Loading...</div>
                ) : filteredCustom.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-stone-400 text-sm mb-1">{healthyOnly ? 'No healthy recipes yet' : 'No custom recipes yet'}</p>
                    <p className="text-stone-300 text-xs">Go to Recipes → My Recipes to add your own</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredCustom.map(recipe => (
                      <button key={recipe.id} onClick={() => openDetail(customToRecipeData(recipe))} className="text-left rounded-2xl overflow-hidden border border-stone-100 hover:border-green-300 hover:shadow-sm transition-all">
                        <div className="w-full h-28 bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
                          <span className="text-3xl">{recipe.is_healthy ? '🥦' : '🍽️'}</span>
                        </div>
                        <div className="p-2.5">
                          <div className="flex items-start gap-1">
                            <p className="text-xs font-medium text-stone-700 leading-snug line-clamp-2 flex-1">{recipe.name}</p>
                            {recipe.is_healthy && <span className="text-green-500 text-xs flex-shrink-0">🌿</span>}
                          </div>
                          {recipe.category && <p className="text-xs text-stone-400 mt-0.5">{recipe.category}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>

    {healthyPrefill && (
      <AddRecipeModal
        prefill={healthyPrefill}
        onSave={(recipe) => { setCustomRecipes(prev => [recipe, ...prev]); setHealthyPrefill(null) }}
        onClose={() => setHealthyPrefill(null)}
      />
    )}
    </>
  )
}
