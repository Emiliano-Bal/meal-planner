export type MealType = 'breakfast' | 'lunch' | 'dinner'

export interface Profile {
  id: string
  display_name: string | null
  household_size: number
  created_at: string
}

export interface Menu {
  id: string
  user_id: string
  week_start: string
  created_at: string
}

export interface Meal {
  id: string
  menu_id: string
  day_of_week: number
  meal_type: MealType
  section: string
  meal_name: string | null
  recipe_id: string | null
  recipe_data: RecipeData | null
  created_at: string
}

export interface ShoppingItem {
  id: string
  menu_id: string
  ingredient: string
  quantity: string | null
  checked: boolean
}

export interface RecipeData {
  id: string
  name: string
  thumbnail: string
  category: string
  area: string
  instructions: string
  ingredients: { name: string; measure: string }[]
  is_healthy?: boolean
  servings?: number
  source?: 'mealdb' | 'custom'
  grams_per_person?: number
}

export interface CustomRecipe {
  id: string
  user_id: string
  name: string
  description: string | null
  servings: number
  is_healthy: boolean
  ingredients: { name: string; measure: string }[]
  instructions: string | null
  thumbnail: string | null
  category: string | null
  created_at: string
}

export interface RecipePrefill {
  name?: string
  category?: string
  servings?: number
  is_healthy?: boolean
  ingredients?: { name: string; measure: string }[]
  instructions?: string
}

export interface MealDBRecipe {
  idMeal: string
  strMeal: string
  strMealThumb: string
  strCategory: string
  strArea: string
  strInstructions: string
  [key: string]: string | null
}
