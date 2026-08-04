'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { parseRecipeText, parseRecipeUrl, parseRecipeImage } from '@/app/actions/ai'
import { CustomRecipe, RecipePrefill } from '@/types'

interface Props {
  onSave: (recipe: CustomRecipe) => void
  onClose: () => void
  prefill?: RecipePrefill
  editRecipe?: CustomRecipe
}

export default function AddRecipeModal({ onSave, onClose, prefill, editRecipe }: Props) {
  const supabase = createClient()
  const isEdit = !!editRecipe
  const hasPrefill = isEdit || !!prefill

  const [mode, setMode] = useState<'url' | 'paste' | 'photo' | 'manual'>(hasPrefill ? 'manual' : 'url')
  const [urlInput, setUrlInput] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  const [thumbnail, setThumbnail] = useState(editRecipe?.thumbnail ?? prefill?.thumbnail ?? '')
  const [name, setName] = useState(editRecipe?.name ?? prefill?.name ?? '')
  const [category, setCategory] = useState(editRecipe?.category ?? prefill?.category ?? '')
  const [servings, setServings] = useState(editRecipe?.servings ?? prefill?.servings ?? 4)
  const [isHealthy, setIsHealthy] = useState(editRecipe?.is_healthy ?? prefill?.is_healthy ?? false)
  const [instructions, setInstructions] = useState(editRecipe?.instructions ?? prefill?.instructions ?? '')
  const [ingredients, setIngredients] = useState(
    editRecipe?.ingredients?.length ? editRecipe.ingredients
    : prefill?.ingredients?.length ? prefill.ingredients
    : [{ name: '', measure: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyParsed(result: RecipePrefill) {
    if (result.thumbnail) setThumbnail(result.thumbnail)
    if (result.name) setName(result.name)
    if (result.category) setCategory(result.category)
    if (result.servings) setServings(result.servings)
    if (typeof result.is_healthy === 'boolean') setIsHealthy(result.is_healthy)
    if (result.instructions) setInstructions(result.instructions)
    if (result.ingredients?.length) setIngredients(result.ingredients)
    setMode('manual')
  }

  async function fetchFromUrl() {
    if (!urlInput.trim()) { setUrlError('Enter a URL first'); return }
    setFetchingUrl(true)
    setUrlError(null)
    try {
      const result = await parseRecipeUrl(urlInput.trim())
      if (!result.name && !result.ingredients?.length) {
        setUrlError("Couldn't extract recipe from this page. Try the Paste tab — copy the recipe text and paste it there.")
        return
      }
      applyParsed(result)
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : 'Failed to fetch the URL. Some sites block automated access.')
    } finally {
      setFetchingUrl(false)
    }
  }

  async function parsePasted() {
    if (!pasteText.trim()) { setParseError('Paste a recipe first'); return }
    setParsing(true)
    setParseError(null)
    try {
      const result = await parseRecipeText(pasteText)
      applyParsed(result)
    } catch {
      setParseError('Failed to parse the recipe. Try adjusting the format or fill in manually.')
    } finally {
      setParsing(false)
    }
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImageError(null)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function parseImage() {
    if (!imageFile) { setImageError('Select an image first'); return }
    setImageLoading(true)
    setImageError(null)
    try {
      const buffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const type = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      const result = await parseRecipeImage(base64, type)
      if (!result.name && !result.ingredients?.length) {
        setImageError("Couldn't find a recipe in this image. Try a clearer screenshot or paste the recipe text instead.")
        return
      }
      applyParsed(result)
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Failed to read the image.')
    } finally {
      setImageLoading(false)
    }
  }

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', measure: '' }])
  }

  function updateIngredient(i: number, field: 'name' | 'measure', value: string) {
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing))
  }

  function removeIngredient(i: number) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!name.trim()) { setError('Recipe name is required'); return }
    const validIngredients = ingredients.filter(i => i.name.trim())
    if (validIngredients.length === 0) { setError('Add at least one ingredient'); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const payload = {
      name: name.trim(),
      category: category.trim() || null,
      servings,
      is_healthy: isHealthy,
      instructions: instructions.trim() || null,
      ingredients: validIngredients,
      thumbnail: thumbnail.trim() || null,
    }

    if (isEdit) {
      const { data, error: dbError } = await supabase
        .from('custom_recipes')
        .update(payload)
        .eq('id', editRecipe!.id)
        .eq('user_id', user.id)
        .select()
        .single()
      if (dbError) { setError(dbError.message); setSaving(false); return }
      onSave(data)
    } else {
      const { data, error: dbError } = await supabase
        .from('custom_recipes')
        .insert({ user_id: user.id, ...payload })
        .select()
        .single()
      if (dbError) { setError(dbError.message); setSaving(false); return }
      onSave(data)
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-100 flex-shrink-0">
          <h2 className="font-semibold text-stone-800">{isEdit ? 'Edit Recipe' : 'Add Recipe'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-50 transition-colors">✕</button>
        </div>

        {/* Mode tabs — hidden when editing or pre-filled by AI */}
        {!hasPrefill && (
          <div className="px-5 pt-4 flex-shrink-0">
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
              <button onClick={() => setMode('url')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${mode === 'url' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>🔗 URL</button>
              <button onClick={() => setMode('photo')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${mode === 'photo' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>📷 Photo</button>
              <button onClick={() => setMode('paste')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${mode === 'paste' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>📋 Paste</button>
              <button onClick={() => setMode('manual')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${mode === 'manual' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>✍️ Write</button>
            </div>
          </div>
        )}

        {mode === 'url' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-stone-400">Paste any recipe URL and we'll fetch and parse it automatically. Works best on recipe blogs and most cooking sites.</p>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchFromUrl()}
              placeholder="https://www.example.com/recipes/chicken-tikka..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
            />
            {urlError && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">{urlError}</p>}
            <button
              onClick={fetchFromUrl}
              disabled={fetchingUrl}
              className="w-full bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-medium py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {fetchingUrl ? <><span className="animate-spin inline-block">⏳</span> Fetching recipe...</> : '✨ Fetch & Parse'}
            </button>
            <button onClick={() => setMode('paste')} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors">Or paste the recipe text instead →</button>
          </div>
        )}

        {mode === 'paste' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-stone-400">Paste any recipe text — from a website, a blog, a screenshot caption, or your own notes. Claude will parse it automatically.</p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste your full recipe here — ingredients, amounts, and instructions..."
              rows={12}
              className="w-full px-3.5 py-3 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none"
            />
            {parseError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{parseError}</p>}
            <button
              onClick={parsePasted}
              disabled={parsing}
              className="w-full bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-medium py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {parsing ? <><span className="animate-spin inline-block">⏳</span> Parsing recipe...</> : '✨ Parse with AI'}
            </button>
            <button onClick={() => setMode('manual')} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors">Or fill in manually →</button>
          </div>
        )}

        {mode === 'photo' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-stone-400">
              Screenshot a recipe from Instagram, TikTok, a photo, or anywhere — Claude will read it and fill in the fields.
            </p>

            {/* Image preview */}
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Recipe preview" className="w-full max-h-64 object-contain" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null) }}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 shadow text-sm"
                >✕</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-stone-200 rounded-xl p-8 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors">
                <span className="text-3xl">📷</span>
                <span className="text-sm font-medium text-stone-600">Upload screenshot or take photo</span>
                <span className="text-xs text-stone-400">JPEG, PNG, or WebP</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleImageFile}
                  className="sr-only"
                />
              </label>
            )}

            {imageError && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">{imageError}</p>}

            <button
              onClick={parseImage}
              disabled={!imageFile || imageLoading}
              className="w-full bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-medium py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {imageLoading ? <><span className="animate-spin inline-block">⏳</span> Reading recipe…</> : '✨ Extract Recipe'}
            </button>
            <button onClick={() => setMode('paste')} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors">Or paste the recipe text instead →</button>
          </div>
        )}

        {mode === 'manual' && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Recipe name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Healthy Orange Chicken" className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
                  <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Chicken, Salad..." className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                </div>
                <div className="w-28">
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Servings</label>
                  <input type="number" min={1} max={20} value={servings} onChange={e => setServings(Math.max(1, parseInt(e.target.value) || 4))} className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-100">
                <div>
                  <p className="text-sm font-medium text-stone-700">Healthy recipe 🌿</p>
                  <p className="text-xs text-stone-400 mt-0.5">Mark this as a healthy option</p>
                </div>
                <button onClick={() => setIsHealthy(h => !h)} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isHealthy ? 'bg-stone-800' : 'bg-stone-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isHealthy ? 'translate-x-5 left-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-stone-700">Ingredients *</label>
                  <button onClick={addIngredient} className="text-xs text-stone-700 hover:text-stone-700 font-medium">+ Add row</button>
                </div>
                <div className="space-y-2">
                  {ingredients.map((ing, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={ing.measure} onChange={e => updateIngredient(i, 'measure', e.target.value)} placeholder="Amount" className="w-24 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                      <input value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} placeholder="Ingredient name" className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                      {ingredients.length > 1 && <button onClick={() => removeIngredient(i)} className="text-stone-300 hover:text-red-400 transition-colors text-sm w-6 flex-shrink-0">✕</button>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Instructions</label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Steps to prepare the recipe..." rows={4} className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}
            </div>

            <div className="p-5 border-t border-stone-100 flex-shrink-0">
              <button onClick={save} disabled={saving} className="w-full bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-medium py-3 rounded-xl text-sm transition-colors">
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Recipe'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
