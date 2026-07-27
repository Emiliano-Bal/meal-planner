'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { ShoppingItem, Menu } from '@/types'
import Link from 'next/link'

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export default function ShoppingPage() {
  const supabase = createClient()
  const [menus, setMenus] = useState<Menu[]>([])
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')

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

  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  const menuLabel = (m: Menu) => {
    const d = new Date(m.week_start + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' week'
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Shopping List</h1>
        {checked.length > 0 && (
          <button
            onClick={clearChecked}
            className="text-xs text-stone-400 hover:text-red-500 transition-colors"
          >
            Clear checked
          </button>
        )}
      </div>

      {/* Week selector */}
      {menus.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {menus.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMenuId(m.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                selectedMenuId === m.id
                  ? 'bg-green-600 text-white'
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
      ) : items.length === 0 && !loading ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🛒</div>
          <p className="text-stone-500 text-sm mb-4">No items yet.</p>
          <Link
            href="/dashboard"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Go plan your menu →
          </Link>
        </div>
      ) : (
        <>
          {/* Unchecked items */}
          <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-50 mb-4">
            {unchecked.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleItem(item)}
                  className="w-5 h-5 rounded-full border-2 border-stone-200 hover:border-green-500 flex-shrink-0 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-stone-700">{item.ingredient}</span>
                  {item.quantity && (
                    <span className="text-xs text-stone-400 ml-2">{item.quantity}</span>
                  )}
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-stone-300 hover:text-red-400 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Checked items */}
          {checked.length > 0 && (
            <div className="bg-stone-50 rounded-2xl border border-stone-100 divide-y divide-stone-100 mb-4 opacity-60">
              {checked.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleItem(item)}
                    className="w-5 h-5 rounded-full bg-green-500 border-2 border-green-500 flex-shrink-0 flex items-center justify-center"
                  >
                    <span className="text-white text-[10px]">✓</span>
                  </button>
                  <span className="text-sm text-stone-400 line-through flex-1">{item.ingredient}</span>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-stone-300 hover:text-red-400 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
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
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={addItem}
            disabled={!newItem.trim()}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-stone-200 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
