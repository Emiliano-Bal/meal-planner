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
  generateHealthyVersion, enrichRecipe, generateRecipe,
  translateRecipe, batchTranslateRecipeNames,
} from '@/app/actions/ai'
import { RecipeData, MealType, CustomRecipe, RecipePrefill } from '@/types'
import AddRecipeModal from '@/components/AddRecipeModal'
import RecipeThumb from '@/components/RecipeThumb'

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

function customToRecipeData(r: CustomRecipe): RecipeData {
  return {
    id: `custom_${r.id}`,
    name: r.name,
    thumbnail: r.thumbnail ?? '',
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

interface Props {
  dayName: string
  mealType: MealType
  section?: string
  onSelect: (recipe: RecipeData) => void
  onClose: () => void
  householdSize?: number
}

export default function RecipePickerModal({ dayName, mealType, section, onSelect, onClose, householdSize = 4 }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [customRecipes, setCustomRecipes] = useState<CustomRecipe[]>([])
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [healthyOnly, setHealthyOnly] = useState(false)
  const [detail, setDetail] = useState<RecipeData | null>(null)
  const [generatingRecipe, setGeneratingRecipe] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [generatingHealthy, setGeneratingHealthy] = useState(false)
  const [healthyPrefill, setHealthyPrefill] = useState<RecipePrefill | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [dietary, setDietary] = useState<string[]>([])
  const [showImportModal, setShowImportModal] = useState(false)

  // Global language preference
  const [langPref, setLangPrefState] = useState<LangPref>('original')
  // Translated recipe names for the grid
  const [translatedNames, setTranslatedNames] = useState<Record<string, string>>({})
  // Full translation for the detail view
  const [translatedData, setTranslatedData] = useState<{
    name: string; category: string
    ingredients: { name: string; measure: string }[]
    instructions: string
  } | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translateLang, setTranslateLang] = useState<'en' | 'es' | null>(null)

  // Sync with global language preference
  useEffect(() => {
    setLangPrefState(getLangPref())
    const handler = (e: Event) => setLangPrefState((e as CustomEvent<LangPref>).detail)
    window.addEventListener('language-changed', handler)
    return () => window.removeEventListener('language-changed', handler)
  }, [])

  // Sync dietary
  useEffect(() => {
    try {
      const d = localStorage.getItem('user_dietary')
      if (d) setDietary(JSON.parse(d))
    } catch {}
    const handler = (e: Event) => setDietary((e as CustomEvent<string[]>).detail)
    window.addEventListener('dietary-changed', handler)
    return () => window.removeEventListener('dietary-changed', handler)
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
  useEffect(() => {
    if (langPref === 'original' || !customRecipes.length) {
      setTranslatedNames({})
      return
    }
    const lang = langPref as 'en' | 'es'
    const cache = getNameTransCache(lang)
    const uncached = customRecipes.filter(r => !(r.id in cache))
    if (uncached.length === 0) { setTranslatedNames(cache); return }

    batchTranslateRecipeNames(uncached.map(r => ({ id: r.id, name: r.name })), lang)
      .then(newNames => {
        const updated = { ...cache, ...newNames }
        setTranslatedNames(updated)
        setNameTransCache(lang, updated)
      })
      .catch(() => setTranslatedNames(cache))
  }, [customRecipes, langPref])

  // Auto-translate detail when it opens and lang is set
  useEffect(() => {
    if (!detail) { setTranslatedData(null); setTranslateLang(null); return }
    if (langPref === 'original') { setTranslatedData(null); setTranslateLang(null); return }

    const lang = langPref as 'en' | 'es'
    const cached = getFullTransCache(lang, detail.id)
    if (cached) { setTranslatedData(cached); setTranslateLang(lang); return }

    let cancelled = false
    setTranslating(true)
    translateRecipe({
      name: detail.name, category: detail.category,
      ingredients: detail.ingredients, instructions: detail.instructions,
    }, lang)
      .then(result => {
        if (cancelled) return
        setTranslatedData(result)
        setTranslateLang(lang)
        setFullTransCache(lang, detail.id, result)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTranslating(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, langPref])

  const filteredRecipes = customRecipes.filter(r => {
    if (healthyOnly && !r.is_healthy) return false
    if (query.trim() && !r.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  async function manualTranslate(lang: 'en' | 'es') {
    if (!detail || translating) return
    if (translateLang === lang && translatedData) return
    const cached = getFullTransCache(lang, detail.id)
    if (cached) { setTranslatedData(cached); setTranslateLang(lang); return }
    setTranslating(true)
    try {
      const result = await translateRecipe({
        name: detail.name, category: detail.category,
        ingredients: detail.ingredients, instructions: detail.instructions,
      }, lang)
      setTranslatedData(result)
      setTranslateLang(lang)
      setFullTransCache(lang, detail.id, result)
    } catch {} finally { setTranslating(false) }
  }

  async function handleEnrich() {
    if (!detail || enriching) return
    setEnriching(true)
    try {
      const enriched = await enrichRecipe({
        name: detail.name, ingredients: detail.ingredients,
        instructions: detail.instructions, servings: detail.servings,
      })
      setDetail(prev => prev ? { ...prev, ...enriched } : prev)
      setTranslatedData(null); setTranslateLang(null)
    } catch {} finally { setEnriching(false) }
  }

  async function handleCreateHealthy() {
    if (!detail) return
    setGeneratingHealthy(true)
    try {
      const result = await generateHealthyVersion({
        name: detail.name, category: detail.category,
        servings: detail.servings ?? householdSize,
        ingredients: detail.ingredients, instructions: detail.instructions,
      }, dietary)
      setHealthyPrefill({ ...result, servings: householdSize })
    } catch {
      setHealthyPrefill({
        name: `Healthy ${detail.name}`, category: detail.category,
        servings: householdSize, is_healthy: true,
        ingredients: detail.ingredients, instructions: detail.instructions || undefined,
      })
    } finally { setGeneratingHealthy(false) }
  }

  async function handleGenerateRecipe(name: string) {
    setGeneratingRecipe(true)
    setSavedToLibrary(false)
    try {
      const result = await generateRecipe(name, householdSize, dietary)
      const recipeName = result.name ?? name
      const payload = {
        name: recipeName, category: result.category ?? 'Custom',
        servings: result.servings ?? householdSize,
        is_healthy: result.is_healthy ?? false,
        instructions: result.instructions ?? '',
        ingredients: result.ingredients ?? [],
      }
      let recipeId = `ai_${Date.now()}`
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: saved } = await supabase
          .from('custom_recipes').insert({ user_id: user.id, ...payload }).select().single()
        if (saved) { recipeId = `custom_${saved.id}`; setCustomRecipes(prev => [saved, ...prev]); setSavedToLibrary(true) }
      }
      setDetail({ id: recipeId, thumbnail: '', area: '', source: 'custom', ...payload })
    } finally { setGeneratingRecipe(false) }
  }

  const healthyAlts = detail ? findHealthyAlts(detail.name, customRecipes) : []
  const scale = detail ? householdSize / (detail.servings ?? 4) : 1

  const displayName = translatedData?.name ?? detail?.name ?? ''
  const displayIngredients = translatedData?.ingredients ?? detail?.ingredients ?? []
  const displayInstructions = translatedData?.instructions ?? detail?.instructions ?? ''

  const mealLabel = mealType === 'lunch' && section
    ? `Lunch · ${SECTION_LABELS[section] ?? section}` : MEAL_TYPE_LABELS[mealType]
  const addLabel = mealType === 'lunch' && section
    ? `Add ${SECTION_LABELS[section] ?? section} to ${dayName}` : `Add ${MEAL_TYPE_LABELS[mealType]} to ${dayName}`

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
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImportModal(true)} className="text-xs font-medium text-stone-600 hover:text-stone-800 px-3 py-1.5 rounded-lg hover:bg-stone-50 border border-stone-200 transition-colors">
              + Import
            </button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-50 transition-colors">✕</button>
          </div>
        </div>

        {/* Detail view */}
        {detail ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setDetail(null); setSavedToLibrary(false) }} className="text-sm text-stone-400 hover:text-stone-700 flex items-center gap-1">
                ← Back
              </button>
              {savedToLibrary && <span className="text-xs text-stone-500 font-medium">✓ Saved to My Recipes</span>}
            </div>

            <div className="rounded-2xl overflow-hidden mb-4">
              <RecipeThumb thumbnail={detail.thumbnail} category={detail.category} name={detail.name} height="h-48" />
            </div>

            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-lg font-semibold text-stone-800 leading-snug">{displayName}</h3>
              {detail.is_healthy && <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-1">✦ Healthy</span>}
            </div>
            <p className="text-xs text-stone-400 mb-3">
              {detail.category}{detail.servings ? ` · Serves ${detail.servings}` : ''}
            </p>

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

            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="w-full mb-4 py-2 rounded-xl border border-dashed border-stone-200 text-stone-400 text-xs font-medium hover:border-stone-300 hover:text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {enriching ? <><span className="animate-spin inline-block">⏳</span> Enhancing...</> : '✨ Enhance ingredients & steps'}
            </button>

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-stone-700">Ingredients</h4>
              {scale !== 1 && <span className="text-xs text-stone-700 font-medium bg-stone-50 px-2 py-0.5 rounded-full">Scaled for {householdSize} people</span>}
            </div>
            <ul className="grid grid-cols-2 gap-1 mb-4">
              {displayIngredients.map((ing, i) => (
                <li key={i} className="text-xs text-stone-600 bg-stone-50 rounded-lg px-3 py-1.5">
                  <span className="font-medium">{scaleQuantity(ing.measure, scale)}</span> {ing.name}
                </li>
              ))}
            </ul>

            {displayInstructions && (
              <>
                <h4 className="text-sm font-medium text-stone-700 mb-2">Instructions</h4>
                <ol className="space-y-2 mb-4">
                  {splitIntoSteps(displayInstructions).map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-xs text-stone-600 leading-relaxed">
                      <span className="flex-shrink-0 w-5 h-5 bg-stone-100 text-stone-700 rounded-full flex items-center justify-center font-semibold text-[10px]">{i + 1}</span>
                      <span className="flex-1 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <div className="mb-4">
              {healthyAlts.length > 0 && (
                <>
                  <h4 className="text-sm font-medium text-stone-700 mb-2">🌿 Your Healthy Versions</h4>
                  <div className="space-y-2 mb-3">
                    {healthyAlts.map(alt => (
                      <button key={alt.id} onClick={() => setDetail(customToRecipeData(alt))} className="w-full text-left px-3.5 py-2.5 rounded-xl border border-stone-100 bg-stone-50 hover:border-stone-300 hover:bg-stone-100 transition-colors">
                        <p className="text-sm font-medium text-stone-800">{alt.name}</p>
                        <p className="text-xs text-stone-700 mt-0.5">Serves {alt.servings} · {alt.category ?? 'Custom'}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={handleCreateHealthy}
                disabled={generatingHealthy}
                className="w-full py-2.5 rounded-xl border border-dashed border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
              >
                {generatingHealthy ? <><span className="animate-spin inline-block">⏳</span> Generating...</> : '🌿 Create Healthy Version with AI'}
              </button>
            </div>

            <button onClick={() => onSelect(detail)} className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl text-sm transition-colors">
              {addLabel}
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-stone-100 flex-shrink-0 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search your recipes..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
                <button
                  onClick={() => setHealthyOnly(h => !h)}
                  title={healthyOnly ? 'Show all' : 'Healthy only'}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${healthyOnly ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-300'}`}
                >
                  🌿
                </button>
              </div>
              {query.trim() && (
                <button
                  onClick={() => handleGenerateRecipe(query.trim())}
                  disabled={generatingRecipe}
                  className="w-full py-2 rounded-xl bg-stone-50 hover:bg-stone-100 disabled:opacity-60 text-stone-700 text-xs font-medium border border-stone-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  {generatingRecipe
                    ? <><span className="animate-spin inline-block">⏳</span> Generating recipe...</>
                    : <>✨ Generate &ldquo;{query.trim()}&rdquo; with AI</>}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingCustom ? (
                <div className="text-center py-10 text-stone-400 text-sm">Loading...</div>
              ) : filteredRecipes.length === 0 ? (
                <div className="text-center py-10">
                  {customRecipes.length === 0 ? (
                    <>
                      <p className="text-2xl mb-3">📝</p>
                      <p className="text-stone-400 text-sm mb-3">No recipes yet</p>
                      <button onClick={() => setShowImportModal(true)} className="text-sm font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2">Import your first recipe →</button>
                    </>
                  ) : (
                    <p className="text-stone-400 text-sm">No match — try the generate button above</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredRecipes.map(recipe => (
                    <button key={recipe.id} onClick={() => setDetail(customToRecipeData(recipe))} className="text-left rounded-2xl overflow-hidden border border-stone-100 hover:border-stone-300 hover:shadow-sm transition-all group">
                      <div className="overflow-hidden">
                        <RecipeThumb thumbnail={recipe.thumbnail} category={recipe.category} name={recipe.name} height="h-28" className="group-hover:scale-105 transition-transform duration-200" />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-medium text-stone-700 leading-snug line-clamp-2">
                          {translatedNames[recipe.id] ?? recipe.name}
                        </p>
                        <div className="flex items-center justify-between mt-0.5">
                          {recipe.category && <p className="text-xs text-stone-400">{recipe.category}</p>}
                          {recipe.is_healthy && <span className="text-stone-400 text-xs">🌿</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
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

    {showImportModal && (
      <AddRecipeModal
        onSave={(recipe) => { setCustomRecipes(prev => [recipe, ...prev]); setShowImportModal(false) }}
        onClose={() => setShowImportModal(false)}
      />
    )}
    </>
  )
}
