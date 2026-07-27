import { MealDBRecipe, RecipeData } from '@/types'

const BASE = 'https://www.themealdb.com/api/json/v1/1'

export async function searchRecipes(query: string): Promise<RecipeData[]> {
  const res = await fetch(`${BASE}/search.php?s=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!data.meals) return []
  return data.meals.map(parseRecipe)
}

export async function getRecipeById(id: string): Promise<RecipeData | null> {
  const res = await fetch(`${BASE}/lookup.php?i=${id}`)
  const data = await res.json()
  if (!data.meals?.[0]) return null
  return parseRecipe(data.meals[0])
}

export async function getCategories(): Promise<string[]> {
  const res = await fetch(`${BASE}/categories.php`)
  const data = await res.json()
  return data.categories?.map((c: { strCategory: string }) => c.strCategory) ?? []
}

export async function filterByCategory(category: string): Promise<RecipeData[]> {
  const res = await fetch(`${BASE}/filter.php?c=${encodeURIComponent(category)}`)
  const data = await res.json()
  if (!data.meals) return []
  return data.meals.map((m: MealDBRecipe) => ({
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb,
    category,
    area: '',
    instructions: '',
    ingredients: [],
  }))
}

export async function getFeaturedRecipes(): Promise<RecipeData[]> {
  const categories = ['Beef', 'Seafood', 'Pasta', 'Chicken', 'Vegetarian', 'Breakfast']
  const results = await Promise.all(categories.map(cat => filterByCategory(cat)))
  const mixed: RecipeData[] = []
  for (const r of results) mixed.push(...r.slice(0, 4))
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[mixed[i], mixed[j]] = [mixed[j], mixed[i]]
  }
  return mixed
}

function parseRecipe(m: MealDBRecipe): RecipeData {
  const ingredients: { name: string; measure: string }[] = []
  for (let i = 1; i <= 20; i++) {
    const name = m[`strIngredient${i}`]
    const measure = m[`strMeasure${i}`]
    if (name && name.trim()) {
      ingredients.push({ name: name.trim(), measure: measure?.trim() ?? '' })
    }
  }
  return {
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb,
    category: m.strCategory ?? '',
    area: m.strArea ?? '',
    instructions: m.strInstructions ?? '',
    ingredients,
  }
}
