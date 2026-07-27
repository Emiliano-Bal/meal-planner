'use client'

import { useState, useEffect, useCallback } from 'react'
import { searchRecipes, getCategories, filterByCategory, getRecipeById, getFeaturedRecipes } from '@/lib/mealdb'
import { createClient } from '@/lib/supabase'
import { scaleQuantity } from '@/lib/utils'
import { generateHealthyVersion } from '@/app/actions/ai'
import { RecipeData, CustomRecipe, RecipePrefill } from '@/types'
import AddRecipeModal from '@/components/AddRecipeModal'

const PRESET_SEARCHES: { label: string; q?: string; cat?: string }[] = [
  { label: '🍳 Breakfast', cat: 'Breakfast' },
  { label: '🥩 Steak', q: 'steak' },
  { label: '🐟 Salmon', q: 'salmon' },
  { label: '🦞 Seafood', q: 'prawn' },
  { label: '🍝 Pasta', q: 'pasta' },
  { label: '🍛 Curry', q: 'curry' },
  { label: '🥗 Salad', q: 'salad' },
  { label: '🍄 Risotto', q: 'risotto' },
  { label: '🌮 Tacos', q: 'tacos' },
  { label: '🥦 Veggie', cat: 'Vegetarian' },
]

function findHealthyAlts(recipeName: string, customs: CustomRecipe[]): CustomRecipe[] {
  const words = recipeName.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
  if (!words.length) return []
  return customs.filter(r => r.is_healthy && words.some(w => r.name.toLowerCase().includes(w)))
}

export default function RecipesPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [householdSize, setHouseholdSize] = useState(4)

  // Discover tab
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeData[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<RecipeData | null>(null)

  // My Recipes tab
  const [customRecipes, setCustomRecipes] = useState<CustomRecipe[]>([])
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalPrefill, setAddModalPrefill] = useState<RecipePrefill | undefined>(undefined)
  const [editingRecipe, setEditingRecipe] = useState<CustomRecipe | null>(null)
  const [customDetail, setCustomDetail] = useState<CustomRecipe | null>(null)
  const [healthyFilter, setHealthyFilter] = useState(false)
  const [generatingHealthy, setGeneratingHealthy] = useState(false)

  useEffect(() => {
    getCategories().then(setCategories)
    setLoading(true)
    getFeaturedRecipes().then(r => { setResults(r); setLoading(false) })
  }, [])

  // Sync household size from Nav
  useEffect(() => {
    const cached = localStorage.getItem('household_size')
    if (cached) setHouseholdSize(parseInt(cached))
    const handler = (e: Event) => setHouseholdSize((e as CustomEvent<number>).detail)
    window.addEventListener('household-size-changed', handler)
    return () => window.removeEventListener('household-size-changed', handler)
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

  useEffect(() => {
    loadCustomRecipes()
  }, [loadCustomRecipes])

  async function search(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setActiveCategory(null)
    const data = await searchRecipes(q)
    setResults(data)
    setLoading(false)
  }

  async function browseCategory(cat: string) {
    setLoading(true)
    setActiveCategory(cat)
    setQuery('')
    const data = await filterByCategory(cat)
    setResults(data)
    setLoading(false)
  }

  async function openDetail(recipe: RecipeData) {
    if (recipe.instructions) {
      setDetail(recipe)
    } else {
      const full = await getRecipeById(recipe.id)
      if (full) setDetail(full)
    }
  }

  async function deleteRecipe(id: string) {
    await supabase.from('custom_recipes').delete().eq('id', id)
    setCustomRecipes(prev => prev.filter(r => r.id !== id))
    setCustomDetail(null)
  }

  async function openCreateHealthy(baseRecipe: RecipeData) {
    setGeneratingHealthy(true)
    try {
      const result = await generateHealthyVersion({
        name: baseRecipe.name,
        category: baseRecipe.category,
        servings: baseRecipe.servings ?? householdSize,
        ingredients: baseRecipe.ingredients,
        instructions: baseRecipe.instructions,
      })
      setAddModalPrefill({ ...result, servings: householdSize })
    } catch {
      setAddModalPrefill({
        name: `Healthy ${baseRecipe.name}`,
        category: baseRecipe.category,
        servings: householdSize,
        is_healthy: true,
        ingredients: baseRecipe.ingredients,
        instructions: baseRecipe.instructions || undefined,
      })
    } finally {
      setGeneratingHealthy(false)
      setShowAddModal(true)
    }
  }

  const filteredCustom = healthyFilter ? customRecipes.filter(r => r.is_healthy) : customRecipes

  // Custom recipe detail
  if (customDetail) {
    const scale = householdSize / (customDetail.servings ?? 4)
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setCustomDetail(null)}
          className="text-sm text-stone-400 hover:text-stone-700 mb-5 flex items-center gap-1"
        >
          ← Back to my recipes
        </button>
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="w-full h-48 bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center">
            <span className="text-6xl">{customDetail.is_healthy ? '🥦' : '🍽️'}</span>
          </div>
          <div className="p-6">
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-xl font-semibold text-stone-800">{customDetail.name}</h1>
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                <button
                  onClick={() => { setEditingRecipe(customDetail); setShowAddModal(true) }}
                  className="text-xs text-stone-500 hover:text-stone-800 transition-colors py-1 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteRecipe(customDetail.id)}
                  className="text-stone-300 hover:text-red-400 text-xs transition-colors py-1"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {customDetail.category && (
                <span className="text-xs bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full font-medium">
                  {customDetail.category}
                </span>
              )}
              {customDetail.is_healthy && (
                <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-medium">
                  🌿 Healthy
                </span>
              )}
              <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-medium">
                Serves {customDetail.servings}
              </span>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-700">Ingredients</h2>
              {scale !== 1 && (
                <span className="text-xs text-stone-700 font-medium bg-stone-100 px-2 py-0.5 rounded-full">
                  Scaled for {householdSize} people
                </span>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-2 mb-6">
              {customDetail.ingredients.map((ing, i) => (
                <li key={i} className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2">
                  <span className="font-medium">{scaleQuantity(ing.measure, scale)}</span> {ing.name}
                </li>
              ))}
            </ul>

            {customDetail.instructions && (
              <>
                <h2 className="text-sm font-semibold text-stone-700 mb-3">Instructions</h2>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                  {customDetail.instructions}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // MealDB recipe detail
  if (detail) {
    const scale = householdSize / (detail.servings ?? 4)
    const healthyAlts = findHealthyAlts(detail.name, customRecipes)
    return (
      <>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setDetail(null)}
            className="text-sm text-stone-400 hover:text-stone-700 mb-5 flex items-center gap-1"
          >
            ← Back to recipes
          </button>
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <img src={detail.thumbnail} alt={detail.name} className="w-full h-64 object-cover" />
            <div className="p-6">
              <h1 className="text-xl font-semibold text-stone-800 mb-1">{detail.name}</h1>
              <div className="flex gap-2 mb-5">
                {detail.category && (
                  <span className="text-xs bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full font-medium">
                    {detail.category}
                  </span>
                )}
                {detail.area && (
                  <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-medium">
                    {detail.area}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-stone-700">Ingredients</h2>
                {scale !== 1 && (
                  <span className="text-xs text-stone-700 font-medium bg-stone-100 px-2 py-0.5 rounded-full">
                    Scaled for {householdSize} people
                  </span>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-2 mb-6">
                {detail.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2">
                    <span className="font-medium">{scaleQuantity(ing.measure, scale)}</span> {ing.name}
                  </li>
                ))}
              </ul>

              <h2 className="text-sm font-semibold text-stone-700 mb-3">Instructions</h2>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line mb-6">
                {detail.instructions}
              </p>

              {/* Healthy alternatives */}
              <div className="border-t border-stone-100 pt-5">
                {healthyAlts.length > 0 && (
                  <>
                    <h2 className="text-sm font-semibold text-stone-700 mb-3">🌿 Your Healthy Versions</h2>
                    <div className="space-y-2 mb-4">
                      {healthyAlts.map(alt => (
                        <button
                          key={alt.id}
                          onClick={() => { setDetail(null); setCustomDetail(alt) }}
                          className="w-full text-left px-4 py-3 rounded-xl border border-stone-100 bg-stone-50 hover:border-stone-200 hover:bg-stone-100 transition-colors"
                        >
                          <p className="text-sm font-medium text-stone-800">{alt.name}</p>
                          <p className="text-xs text-stone-700 mt-0.5">Serves {alt.servings} · {alt.category ?? 'Custom'}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={() => openCreateHealthy(detail)}
                  disabled={generatingHealthy}
                  className="w-full py-2.5 rounded-xl border border-dashed border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                >
                  {generatingHealthy ? (
                    <><span className="animate-spin inline-block">⏳</span> Generating healthy version...</>
                  ) : '🌿 Create Healthy Version with AI'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {showAddModal && (
          <AddRecipeModal
            prefill={addModalPrefill}
            editRecipe={editingRecipe ?? undefined}
            onSave={(saved: CustomRecipe) => {
              setCustomRecipes(prev => editingRecipe
                ? prev.map(r => r.id === saved.id ? saved : r)
                : [saved, ...prev]
              )
              setShowAddModal(false)
              setEditingRecipe(null)
              setAddModalPrefill(undefined)
            }}
            onClose={() => { setShowAddModal(false); setEditingRecipe(null); setAddModalPrefill(undefined) }}
          />
        )}
      </>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Recipes</h1>
        {tab === 'mine' && (
          <button
            onClick={() => { setAddModalPrefill(undefined); setShowAddModal(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            + Add Recipe
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-stone-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('discover')}
          className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'discover' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
        >
          Discover
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'mine' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
        >
          My Recipes
        </button>
      </div>

      {tab === 'discover' ? (
        <>
          {/* Search */}
          <div className="bg-white rounded-2xl border border-stone-100 p-4 mb-5">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search(query)}
                placeholder="Search any recipe..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
              />
              <button
                onClick={() => search(query)}
                className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Search
              </button>
            </div>
            {/* Preset quick searches */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none mb-3">
              {PRESET_SEARCHES.map(p => (
                <button
                  key={p.label}
                  onClick={() => p.cat ? browseCategory(p.cat) : (p.q && (setQuery(p.q), search(p.q)))}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium bg-stone-50 text-stone-600 border border-stone-200 hover:border-stone-400 hover:text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => browseCategory(cat)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activeCategory === cat ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 text-stone-400 text-sm">Loading...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 text-stone-400 text-sm">No results found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => openDetail(recipe)}
                  className="text-left rounded-2xl overflow-hidden border border-stone-100 bg-white hover:border-stone-200 hover:shadow-md transition-all group"
                >
                  <img
                    src={recipe.thumbnail}
                    alt={recipe.name}
                    className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="p-3">
                    <p className="text-sm font-medium text-stone-700 leading-snug line-clamp-2">{recipe.name}</p>
                    {recipe.category && <p className="text-xs text-stone-400 mt-1">{recipe.category}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Healthy filter */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setHealthyFilter(h => !h)}
              className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-medium transition-colors ${healthyFilter ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
            >
              🌿 Healthy only
            </button>
            <span className="text-sm text-stone-400">
              {filteredCustom.length} recipe{filteredCustom.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loadingCustom ? (
            <div className="text-center py-20 text-stone-400 text-sm">Loading...</div>
          ) : filteredCustom.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-stone-500 text-sm mb-4">
                {healthyFilter ? 'No healthy recipes yet' : 'No recipes yet'}
              </p>
              {!healthyFilter && (
                <button
                  onClick={() => { setAddModalPrefill(undefined); setShowAddModal(true) }}
                  className="text-sm text-stone-700 hover:text-stone-700 font-medium"
                >
                  Add your first recipe →
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredCustom.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => setCustomDetail(recipe)}
                  className="text-left rounded-2xl overflow-hidden border border-stone-100 bg-white hover:border-stone-200 hover:shadow-md transition-all"
                >
                  <div className="w-full h-36 bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center">
                    <span className="text-4xl">{recipe.is_healthy ? '🥦' : '🍽️'}</span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start gap-1 mb-1">
                      <p className="text-sm font-medium text-stone-700 leading-snug line-clamp-2 flex-1">
                        {recipe.name}
                      </p>
                      {recipe.is_healthy && <span className="text-stone-500 text-sm flex-shrink-0">🌿</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {recipe.category && <p className="text-xs text-stone-400">{recipe.category}</p>}
                      {recipe.category && <span className="text-stone-200 text-xs">·</span>}
                      <p className="text-xs text-stone-300">{recipe.servings} servings</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <AddRecipeModal
          prefill={addModalPrefill}
          editRecipe={editingRecipe ?? undefined}
          onSave={(recipe) => {
            if (editingRecipe) {
              setCustomRecipes(prev => prev.map(r => r.id === recipe.id ? recipe : r))
            } else {
              setCustomRecipes(prev => [recipe, ...prev])
            }
            setShowAddModal(false)
            setEditingRecipe(null)
            setAddModalPrefill(undefined)
          }}
          onClose={() => { setShowAddModal(false); setEditingRecipe(null); setAddModalPrefill(undefined) }}
        />
      )}
    </div>
  )
}
