'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  scaleQuantity, splitIntoSteps,
  getLangPref, type LangPref,
  getNameTransCache, setNameTransCache,
  getFullTransCache, setFullTransCache,
} from '@/lib/utils'
import {
  generateHealthyVersion, translateRecipe, batchTranslateRecipeNames,
} from '@/app/actions/ai'
import { CustomRecipe, RecipePrefill } from '@/types'
import AddRecipeModal from '@/components/AddRecipeModal'
import RecipeThumb from '@/components/RecipeThumb'

function findHealthyAlts(recipeName: string, customs: CustomRecipe[]): CustomRecipe[] {
  const words = recipeName.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
  if (!words.length) return []
  return customs.filter(r => r.is_healthy && words.some(w => r.name.toLowerCase().includes(w)))
}

export default function RecipesPage() {
  const supabase = createClient()
  const [householdSize, setHouseholdSize] = useState(4)
  const [query, setQuery] = useState('')
  const [customRecipes, setCustomRecipes] = useState<CustomRecipe[]>([])
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalPrefill, setAddModalPrefill] = useState<RecipePrefill | undefined>(undefined)
  const [editingRecipe, setEditingRecipe] = useState<CustomRecipe | null>(null)
  const [customDetail, setCustomDetail] = useState<CustomRecipe | null>(null)
  const [healthyFilter, setHealthyFilter] = useState(false)
  const [generatingHealthy, setGeneratingHealthy] = useState(false)

  // Global language preference
  const [langPref, setLangPrefState] = useState<LangPref>('original')
  // Translated names for the grid
  const [translatedNames, setTranslatedNames] = useState<Record<string, string>>({})
  // Full translation for the detail view
  const [translatedData, setTranslatedData] = useState<{
    name: string; category: string
    ingredients: { name: string; measure: string }[]
    instructions: string
  } | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translateLang, setTranslateLang] = useState<'en' | 'es' | null>(null)

  // Sync global language preference
  useEffect(() => {
    setLangPrefState(getLangPref())
    const handler = (e: Event) => setLangPrefState((e as CustomEvent<LangPref>).detail)
    window.addEventListener('language-changed', handler)
    return () => window.removeEventListener('language-changed', handler)
  }, [])

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

  useEffect(() => { loadCustomRecipes() }, [loadCustomRecipes])

  // Batch-translate recipe names for the grid whenever recipes or lang change
  const [translatingNames, setTranslatingNames] = useState(false)
  useEffect(() => {
    if (langPref === 'original' || !customRecipes.length) {
      setTranslatedNames({})
      return
    }
    const lang = langPref as 'en' | 'es'
    const cache = getNameTransCache(lang)
    const uncached = customRecipes.filter(r => !(r.id in cache))
    if (uncached.length === 0) { setTranslatedNames(cache); return }

    setTranslatingNames(true)
    batchTranslateRecipeNames(uncached.map(r => ({ id: r.id, name: r.name })), lang)
      .then(newNames => {
        const updated = { ...cache, ...newNames }
        setTranslatedNames(updated)
        setNameTransCache(lang, updated)
      })
      .catch(err => { console.error('[Translation] batch names failed:', err); setTranslatedNames(cache) })
      .finally(() => setTranslatingNames(false))
  }, [customRecipes, langPref])

  // Auto-translate detail when it opens and global lang is set
  useEffect(() => {
    if (!customDetail) { setTranslatedData(null); setTranslateLang(null); return }
    if (langPref === 'original') { setTranslatedData(null); setTranslateLang(null); return }

    const lang = langPref as 'en' | 'es'
    const cached = getFullTransCache(lang, customDetail.id)
    if (cached) { setTranslatedData(cached); setTranslateLang(lang); return }

    let cancelled = false
    setTranslating(true)
    translateRecipe({
      name: customDetail.name,
      category: customDetail.category ?? undefined,
      ingredients: customDetail.ingredients,
      instructions: customDetail.instructions ?? '',
    }, lang)
      .then(result => {
        if (cancelled) return
        setTranslatedData(result)
        setTranslateLang(lang)
        setFullTransCache(lang, customDetail.id, result)
      })
      .catch(err => { console.error('[Translation] recipe detail failed:', err) })
      .finally(() => { if (!cancelled) setTranslating(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDetail?.id, langPref])

  async function deleteRecipe(id: string) {
    await supabase.from('custom_recipes').delete().eq('id', id)
    setCustomRecipes(prev => prev.filter(r => r.id !== id))
    setCustomDetail(null)
  }

  async function openCreateHealthy(base: CustomRecipe) {
    setGeneratingHealthy(true)
    try {
      const result = await generateHealthyVersion({
        name: base.name,
        category: base.category ?? '',
        servings: base.servings ?? householdSize,
        ingredients: base.ingredients,
        instructions: base.instructions ?? undefined,
      })
      setAddModalPrefill({ ...result, servings: householdSize })
    } catch {
      setAddModalPrefill({
        name: `Healthy ${base.name}`,
        category: base.category ?? undefined,
        servings: householdSize,
        is_healthy: true,
        ingredients: base.ingredients,
        instructions: base.instructions ?? undefined,
      })
    } finally {
      setGeneratingHealthy(false)
      setShowAddModal(true)
    }
  }

  async function manualTranslate(lang: 'en' | 'es') {
    if (!customDetail || translating) return
    if (translateLang === lang && translatedData) return
    const cached = getFullTransCache(lang, customDetail.id)
    if (cached) { setTranslatedData(cached); setTranslateLang(lang); return }
    setTranslating(true)
    try {
      const result = await translateRecipe({
        name: customDetail.name,
        category: customDetail.category ?? undefined,
        ingredients: customDetail.ingredients,
        instructions: customDetail.instructions ?? '',
      }, lang)
      setTranslatedData(result)
      setTranslateLang(lang)
      setFullTransCache(lang, customDetail.id, result)
    } catch { } finally {
      setTranslating(false)
    }
  }

  const filteredRecipes = customRecipes.filter(r => {
    if (healthyFilter && !r.is_healthy) return false
    if (query.trim() && !r.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  // Recipe detail view
  if (customDetail) {
    const scale = householdSize / (customDetail.servings ?? 4)
    const healthyAlts = findHealthyAlts(customDetail.name, customRecipes)
    const displayName = translatedData?.name ?? customDetail.name
    const displayIngredients = translatedData?.ingredients ?? customDetail.ingredients
    const displayInstructions = translatedData?.instructions ?? customDetail.instructions ?? ''
    return (
      <>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => { setCustomDetail(null); setTranslatedData(null); setTranslateLang(null) }}
          className="text-sm text-stone-400 hover:text-stone-700 mb-5 flex items-center gap-1"
        >
          ← Back to recipes
        </button>
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <RecipeThumb
            thumbnail={customDetail.thumbnail}
            category={customDetail.category}
            name={customDetail.name}
            height="h-56"
          />
          <div className="p-6">
            {translating && (
              <div className="flex items-center gap-2 mb-3 text-xs text-stone-400">
                <span className="w-3 h-3 rounded-full border-2 border-stone-300 border-t-stone-600 animate-spin inline-block" />
                Translating…
              </div>
            )}
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-xl font-semibold text-stone-800 leading-snug">{displayName}</h1>
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

            {/* Language toggle */}
            <div className="flex items-center gap-1 mb-4 p-1 bg-stone-50 rounded-xl w-fit border border-stone-100">
              <button
                onClick={() => { setTranslatedData(null); setTranslateLang(null) }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${!translateLang ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
              >
                Original
              </button>
              <button
                onClick={() => manualTranslate('en')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${translateLang === 'en' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
              >
                {translating && translateLang !== 'es' ? '...' : 'English'}
              </button>
              <button
                onClick={() => manualTranslate('es')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${translateLang === 'es' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
              >
                {translating && translateLang !== 'en' ? '...' : 'Español'}
              </button>
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
              {displayIngredients.map((ing, i) => (
                <li key={i} className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2">
                  <span className="font-medium">{scaleQuantity(ing.measure, scale)}</span> {ing.name}
                </li>
              ))}
            </ul>

            {displayInstructions && (
              <>
                <h2 className="text-sm font-semibold text-stone-700 mb-3">Instructions</h2>
                <ol className="space-y-2 mb-6">
                  {splitIntoSteps(displayInstructions).map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-stone-600 leading-relaxed">
                      <span className="flex-shrink-0 w-6 h-6 bg-stone-100 text-stone-700 rounded-full flex items-center justify-center font-semibold text-xs">
                        {i + 1}
                      </span>
                      <span className="flex-1 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <div className="border-t border-stone-100 pt-5">
              {healthyAlts.length > 0 && (
                <>
                  <h2 className="text-sm font-semibold text-stone-700 mb-3">🌿 Your Healthy Versions</h2>
                  <div className="space-y-2 mb-4">
                    {healthyAlts.map(alt => (
                      <button
                        key={alt.id}
                        onClick={() => { setCustomDetail(alt); setTranslatedData(null); setTranslateLang(null) }}
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
                onClick={() => openCreateHealthy(customDetail)}
                disabled={generatingHealthy}
                className="w-full py-2.5 rounded-xl border border-dashed border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
              >
                {generatingHealthy
                  ? <><span className="animate-spin inline-block">⏳</span> Generating healthy version...</>
                  : '🌿 Create Healthy Version with AI'}
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
            if (editingRecipe && customDetail?.id === saved.id) setCustomDetail(saved)
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
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-stone-800">My Recipes</h1>
          {translatingNames && (
            <span className="flex items-center gap-1.5 text-xs text-stone-400">
              <span className="w-3 h-3 rounded-full border-2 border-stone-300 border-t-stone-600 animate-spin inline-block" />
              Translating…
            </span>
          )}
        </div>
        <button
          onClick={() => { setAddModalPrefill(undefined); setEditingRecipe(null); setShowAddModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors"
        >
          + Add Recipe
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search recipes..."
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
        />
        <button
          onClick={() => setHealthyFilter(h => !h)}
          className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-medium transition-colors ${healthyFilter ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}
        >
          🌿 Healthy
        </button>
      </div>

      {loadingCustom ? (
        <div className="text-center py-20 text-stone-400 text-sm">Loading...</div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">{customRecipes.length === 0 ? '📝' : '🔍'}</div>
          <p className="text-stone-500 text-sm mb-4">
            {customRecipes.length === 0
              ? 'No recipes yet'
              : healthyFilter ? 'No healthy recipes match' : 'No recipes match'}
          </p>
          {customRecipes.length === 0 && (
            <button
              onClick={() => { setAddModalPrefill(undefined); setShowAddModal(true) }}
              className="text-sm text-stone-700 hover:text-stone-900 font-medium underline underline-offset-2"
            >
              Add your first recipe →
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-400 mb-4">
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredRecipes.map(recipe => (
              <button
                key={recipe.id}
                onClick={() => { setCustomDetail(recipe); setTranslatedData(null); setTranslateLang(null) }}
                className="text-left rounded-2xl overflow-hidden border border-stone-100 bg-white hover:border-stone-200 hover:shadow-md transition-all group"
              >
                <div className="overflow-hidden">
                  <RecipeThumb
                    thumbnail={recipe.thumbnail}
                    category={recipe.category}
                    name={recipe.name}
                    className="group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-start gap-1 mb-1">
                    <p className="text-sm font-medium text-stone-700 leading-snug line-clamp-2 flex-1">
                      {translatedNames[recipe.id] ?? recipe.name}
                    </p>
                    {recipe.is_healthy && <span className="text-stone-400 text-sm flex-shrink-0">🌿</span>}
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
