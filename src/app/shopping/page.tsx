'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { suggestLocalProducts, translateIngredients } from '@/app/actions/ai'
import { ShoppingItem, Menu } from '@/types'
import { scaleQuantity, normalizeIngKey, sumQuantities } from '@/lib/utils'
import Link from 'next/link'

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

const CATEGORIES: { key: string; label: string; icon: string; pattern: RegExp }[] = [
  {
    key: 'meat',
    label: 'Meat & Fish',
    icon: '🥩',
    pattern: /beef|pork|chicken|lamb|sausage|bacon|ham|turkey|mince|steak|veal|duck|venison|fish|salmon|tuna|cod|prawn|shrimp|anchov|sardine|mackerel|haddock|lard|chorizo|pancetta|prosciutto|salami/i,
  },
  {
    key: 'produce',
    label: 'Produce',
    icon: '🥬',
    pattern: /tomato|onion|garlic|pepper|carrot|potato|broccoli|spinach|lettuce|mushroom|cucumber|celery|leek|courgette|zucchini|aubergine|eggplant|avocado|lemon|lime|orange|apple|banana|grape|mango|herb|parsley|coriander|cilantro|basil|thyme|rosemary|sage|mint|chive|ginger|chilli|chili|spring onion|scallion|beetroot|asparagus|artichoke|fennel|radish|pea|bean|corn|sweetcorn|cabbage|kale|rocket|arugula|watercress|endive/i,
  },
  {
    key: 'dairy',
    label: 'Dairy & Eggs',
    icon: '🥚',
    pattern: /milk|cream|butter|cheese|yogurt|yoghurt|egg|parmesan|mozzarella|cheddar|feta|brie|ricotta|mascarpone|gouda|halloumi|sour cream|crème fraîche|creme fraiche|ghee/i,
  },
  {
    key: 'grains',
    label: 'Bakery & Grains',
    icon: '🍞',
    pattern: /bread|flour|pasta|rice|oat|cereal|noodle|tortilla|wrap|pita|pitta|cracker|biscuit|pastry|dough|couscous|quinoa|barley|bulgur|polenta|semolina|lasagne|spaghetti|penne|fettuccine/i,
  },
  {
    key: 'pantry',
    label: 'Pantry & Sauces',
    icon: '🫙',
    pattern: /oil|vinegar|sauce|soy|ketchup|mustard|mayo|mayonnaise|spice|salt|pepper|sugar|honey|maple|stock|broth|can|tin|jar|tomato paste|puree|curry paste|tahini|miso|worcestershire|tabasco|hot sauce|balsamic|olive|capers|pickle|jam|marmalade|peanut butter|coconut milk|coconut cream|lentil|chickpea|bean|kidney bean|black bean|dried/i,
  },
]

function categorize(ingredientName: string): string {
  for (const cat of CATEGORIES) {
    if (cat.pattern.test(ingredientName)) return cat.key
  }
  return 'other'
}

export default function ShoppingPage() {
  const supabase = createClient()
  const [menus, setMenus] = useState<Menu[]>([])
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [grouping, setGrouping] = useState(true)
  const [region, setRegion] = useState('')
  const [supermarkets, setSupermarkets] = useState<string[]>([])
  const [dietary, setDietary] = useState<string[]>([])
  const [householdSize, setHouseholdSize] = useState(4)
  const [regenerating, setRegenerating] = useState(false)
  const [localSuggestions, setLocalSuggestions] = useState<Map<string, string>>(new Map())
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const loadMenus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('menus')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(8)

    setMenus(data ?? [])

    const thisWeek = getMonday(new Date())
    const current = data?.find(m => m.week_start === thisWeek) ?? data?.[0]
    if (current) setSelectedMenuId(current.id)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadMenus() }, [loadMenus])

  useEffect(() => {
    const hs = localStorage.getItem('household_size')
    if (hs) setHouseholdSize(parseInt(hs))
    const onHs = (e: Event) => setHouseholdSize((e as CustomEvent<number>).detail)
    window.addEventListener('household-size-changed', onHs)
    return () => window.removeEventListener('household-size-changed', onHs)
  }, [])

  useEffect(() => {
    const cached = localStorage.getItem('user_region')
    if (cached) setRegion(cached)
    try {
      const s = localStorage.getItem('user_supermarkets')
      if (s) setSupermarkets(JSON.parse(s))
      const d = localStorage.getItem('user_dietary')
      if (d) setDietary(JSON.parse(d))
    } catch {}

    const onRegion = (e: Event) => setRegion((e as CustomEvent<string>).detail)
    const onStores = (e: Event) => setSupermarkets((e as CustomEvent<string[]>).detail)
    const onDietary = (e: Event) => setDietary((e as CustomEvent<string[]>).detail)
    window.addEventListener('region-changed', onRegion)
    window.addEventListener('supermarkets-changed', onStores)
    window.addEventListener('dietary-changed', onDietary)
    return () => {
      window.removeEventListener('region-changed', onRegion)
      window.removeEventListener('supermarkets-changed', onStores)
      window.removeEventListener('dietary-changed', onDietary)
    }
  }, [])

  const loadItems = useCallback(async (menuId: string) => {
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('menu_id', menuId)
      .order('checked', { ascending: true })
    setItems(data ?? [])
  }, [supabase])

  useEffect(() => {
    if (selectedMenuId) loadItems(selectedMenuId)
  }, [selectedMenuId, loadItems])

  async function toggleItem(item: ShoppingItem) {
    await supabase.from('shopping_items').update({ checked: !item.checked }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))
  }

  async function addItem() {
    if (!newItem.trim() || !selectedMenuId) return
    const { data } = await supabase
      .from('shopping_items')
      .insert({ menu_id: selectedMenuId, ingredient: newItem.trim(), quantity: '' })
      .select()
      .single()
    if (data) setItems(prev => [data, ...prev])
    setNewItem('')
  }

  async function deleteItem(id: string) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function clearChecked() {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    if (checkedIds.length === 0) return
    await supabase.from('shopping_items').delete().in('id', checkedIds)
    setItems(prev => prev.filter(i => !i.checked))
  }

  async function regenerateShoppingList() {
    if (!selectedMenuId || regenerating) return
    setRegenerating(true)
    try {
      const { data: meals } = await supabase.from('meals').select('*').eq('menu_id', selectedMenuId)
      if (!meals?.length) return

      await supabase.from('shopping_items').delete().eq('menu_id', selectedMenuId)

      const raw: { name: string; quantity: string }[] = []
      for (const meal of meals) {
        if (meal.recipe_data?.ingredients) {
          const servings = meal.recipe_data.servings ?? 4
          const scale = householdSize / servings
          for (const ing of meal.recipe_data.ingredients) {
            raw.push({ name: ing.name, quantity: scale !== 1 ? scaleQuantity(ing.measure, scale) : ing.measure })
          }
        }
      }
      if (!raw.length) return

      const translated = await translateIngredients(raw.map(r => r.name))
      const map = new Map<string, { name: string; quantities: string[] }>()
      for (let i = 0; i < raw.length; i++) {
        const name = translated[i] ?? raw[i].name
        const key = normalizeIngKey(name)
        if (map.has(key)) map.get(key)!.quantities.push(raw[i].quantity)
        else map.set(key, { name, quantities: [raw[i].quantity] })
      }

      const newItems = Array.from(map.values()).map(({ name, quantities }) => ({
        menu_id: selectedMenuId!, ingredient: name, quantity: sumQuantities(quantities),
      }))
      if (newItems.length) await supabase.from('shopping_items').insert(newItems)
      await loadItems(selectedMenuId)
      setLocalSuggestions(new Map())
    } catch (e) {
      console.error('Regenerate failed:', e)
    } finally {
      setRegenerating(false)
    }
  }

  async function fetchLocalSuggestions(forceRefresh = false) {
    if (!region || loadingLocal) return
    setLocalError(null)

    const ingredientNames = items.filter(i => !i.checked).map(i => i.ingredient)
    if (ingredientNames.length === 0) return

    const fingerprint = ingredientNames.slice().sort().join('|')
    const cacheKey = `local_sugg_${region}`

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const { fp, indexed } = JSON.parse(cached)
          if (fp === fingerprint) {
            const map = new Map<string, string>()
            for (const r of indexed) map.set((ingredientNames[r.index] ?? '').toLowerCase(), r.suggestion)
            setLocalSuggestions(map)
            return
          }
        }
      } catch { /* ignore stale cache */ }
    }

    setLoadingLocal(true)
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — please try again')), 30000)
      )
      const indexed = await Promise.race([
        suggestLocalProducts(ingredientNames, region, supermarkets, dietary),
        timeout,
      ])
      const map = new Map<string, string>()
      for (const r of indexed) {
        const name = ingredientNames[r.index]
        if (name) map.set(name.toLowerCase(), r.suggestion)
      }
      setLocalSuggestions(map)
      localStorage.setItem(cacheKey, JSON.stringify({ fp: fingerprint, indexed }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('suggestLocalProducts failed:', msg)
      setLocalError(`Failed: ${msg}`)
    } finally {
      setLoadingLocal(false)
    }
  }

  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  const menuLabel = (m: Menu) => {
    const d = new Date(m.week_start + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' week'
  }

  // Build grouped structure for unchecked items
  const grouped = (() => {
    if (!grouping) return null
    const map = new Map<string, ShoppingItem[]>()
    for (const item of unchecked) {
      const key = categorize(item.ingredient)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const result: { key: string; label: string; icon: string; items: ShoppingItem[] }[] = []
    for (const cat of CATEGORIES) {
      const catItems = map.get(cat.key)
      if (catItems?.length) result.push({ ...cat, items: catItems })
    }
    const other = map.get('other')
    if (other?.length) result.push({ key: 'other', label: 'Other', icon: '🛒', items: other })
    return result
  })()

  const ShoppingItemRow = ({ item }: { item: ShoppingItem }) => {
    const suggestion = localSuggestions.get(item.ingredient.toLowerCase())
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={() => toggleItem(item)}
          className="w-5 h-5 rounded-full border-2 border-stone-200 hover:border-stone-500 flex-shrink-0 mt-0.5 transition-colors"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-stone-700">{item.ingredient}</span>
            {item.quantity && (
              <span className="text-xs text-stone-400">{item.quantity}</span>
            )}
          </div>
          {suggestion && (
            <p className="text-xs text-stone-600 mt-0.5 leading-snug">📍 {suggestion}</p>
          )}
        </div>
        <button onClick={() => deleteItem(item.id)} className="text-stone-300 hover:text-red-400 text-xs transition-colors mt-0.5">✕</button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-stone-800">Shopping List</h1>
        <div className="flex items-center gap-2">
          {unchecked.length > 0 && (
            <button
              onClick={() => setGrouping(g => !g)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${grouping ? 'bg-stone-200 text-stone-700' : 'bg-stone-100 text-stone-500'}`}
            >
              {grouping ? '⊞ Grouped' : '≡ List'}
            </button>
          )}
          {checked.length > 0 && (
            <button onClick={clearChecked} className="text-xs text-stone-400 hover:text-red-500 transition-colors">
              Clear checked
            </button>
          )}
          {selectedMenuId && (
            <button
              onClick={regenerateShoppingList}
              disabled={regenerating}
              className="text-xs px-2.5 py-1 rounded-full font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-50 transition-colors"
              title="Rebuild list from this week's menu"
            >
              {regenerating ? 'Rebuilding…' : '↺ Rebuild'}
            </button>
          )}
        </div>
      </div>

      {/* Local suggestions bar */}
      {unchecked.length > 0 && (
        <>
          <div className="flex items-center justify-between bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 mb-1">
            <div className="flex-1 min-w-0">
              {region ? (
                <p className="text-xs text-stone-700">
                  <span className="font-medium">📍 {region}</span>
                  {localSuggestions.size > 0 && <span className="text-stone-500 ml-1">· {localSuggestions.size} suggestions loaded</span>}
                </p>
              ) : (
                <p className="text-xs text-stone-600">Set your city in the nav bar to get local brand suggestions</p>
              )}
            </div>
            {region && (
              <button
                onClick={() => fetchLocalSuggestions(localSuggestions.size > 0)}
                disabled={loadingLocal}
                className="flex-shrink-0 ml-3 text-xs font-medium px-3 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white rounded-lg transition-colors"
              >
                {loadingLocal ? '⏳ Loading...' : localSuggestions.size > 0 ? '↻ Refresh' : '🌍 Get local suggestions'}
              </button>
            )}
          </div>
          {localError && <p className="text-xs text-red-500 px-1 mb-4">{localError}</p>}
          {!localError && <div className="mb-4" />}
        </>
      )}

      {/* Week selector */}
      {menus.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {menus.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMenuId(m.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                selectedMenuId === m.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {menuLabel(m)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🛒</div>
          <p className="text-stone-500 text-sm mb-4">No items yet.</p>
          <Link href="/dashboard" className="text-sm text-stone-600 hover:text-stone-700 font-medium">
            Go plan your menu →
          </Link>
        </div>
      ) : (
        <>
          {grouping && grouped ? (
            <div className="space-y-4 mb-4">
              {grouped.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-base">{group.icon}</span>
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{group.label}</h3>
                    <span className="text-xs text-stone-300">({group.items.length})</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-50">
                    {group.items.map(item => <ShoppingItemRow key={item.id} item={item} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-50 mb-4">
              {unchecked.map(item => <ShoppingItemRow key={item.id} item={item} />)}
            </div>
          )}

          {checked.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-stone-400 px-1 mb-1.5 font-medium">✓ Done ({checked.length})</p>
              <div className="bg-stone-50 rounded-2xl border border-stone-100 divide-y divide-stone-100 opacity-60">
                {checked.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => toggleItem(item)}
                      className="w-5 h-5 rounded-full bg-stone-800 border-2 border-stone-800 flex-shrink-0 flex items-center justify-center"
                    >
                      <span className="text-white text-[10px]">✓</span>
                    </button>
                    <span className="text-sm text-stone-400 line-through flex-1">{item.ingredient}</span>
                    <button onClick={() => deleteItem(item.id)} className="text-stone-300 hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add item */}
      {selectedMenuId && (
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Add an item..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
          />
          <button
            onClick={addItem}
            disabled={!newItem.trim()}
            className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
