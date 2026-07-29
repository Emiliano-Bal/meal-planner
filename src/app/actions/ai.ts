'use server'

import Anthropic from '@anthropic-ai/sdk'
import { RecipePrefill } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJSON(text: string): string {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : text
}

export async function translateIngredients(names: string[]): Promise<string[]> {
  if (!names.length) return []
  // Fast path: skip AI call entirely if everything looks English
  const SPANISH = /\b(pollo|carne|cerdo|res|leche|huevo|tomate|cebolla|ajo|arroz|aceite|queso|mantequilla|harina|frijol|maiz|aguacate|zanahoria|papa|patata|pimiento|lechuga|espinaca|salsa|chorizo|jamon|atun|salmon|camarones)\b/i
  const needsTranslation = names.some(n => /[^\x00-\x7F]/.test(n) || SPANISH.test(n))
  if (!needsTranslation) return names

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Translate these ingredient names to English. Keep the same specificity ("huevo" → "egg", "leche entera" → "whole milk", "pollo a la plancha" → "grilled chicken"). If already English, keep as-is. No markdown, no explanation.

${names.map((n, i) => `${i}: ${n}`).join('\n')}

Return ONLY a JSON array in the exact same order: ["egg","whole milk","tomato"]`,
    }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const s = cleaned.indexOf('[')
  const e = cleaned.lastIndexOf(']')
  if (s === -1 || e === -1) return names
  try {
    const result = JSON.parse(cleaned.slice(s, e + 1)) as string[]
    return Array.isArray(result) && result.length === names.length ? result : names
  } catch { return names }
}

export async function parseRecipeImage(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<RecipePrefill> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `Extract the recipe from this image. If you see an ingredient list and/or instructions, parse them. Return ONLY valid JSON (no markdown, no explanation):
{"name":"string","category":"string","servings":4,"is_healthy":false,"ingredients":[{"name":"string","measure":"string"}],"instructions":"string"}` },
      ],
    }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(raw)) as RecipePrefill
}

export async function parseRecipeUrl(url: string): Promise<RecipePrefill> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Could not load page (HTTP ${res.status})`)

  const html = await res.text()

  // Try JSON-LD structured data first — most recipe sites have it
  let textToSend: string | null = null
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1])
      const items: { '@type'?: string | string[] }[] = Array.isArray(data) ? data : [data, ...((data['@graph'] as []) ?? [])]
      const recipe = items.find(d => d['@type'] === 'Recipe' || (Array.isArray(d['@type']) && d['@type'].includes('Recipe')))
      if (recipe) { textToSend = `JSON-LD recipe:\n${JSON.stringify(recipe)}`; break }
    } catch { /* skip malformed JSON */ }
  }

  // Instagram: caption lives in og:description (JSON-LD is never a Recipe schema there)
  if (!textToSend && /instagram\.com/i.test(url)) {
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1]
    if (ogMatch) {
      const decoded = ogMatch
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      textToSend = `Instagram caption:\n${decoded}`
    }
  }

  // Fallback: strip HTML — cap at 6000 chars to limit input tokens
  if (!textToSend) {
    textToSend = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
      .replace(/\s+/g, ' ').trim().slice(0, 6000)
  }

  return parseRecipeText(textToSend)
}

export async function generateHealthyVersion(recipe: {
  name: string
  category: string
  servings?: number
  ingredients: { name: string; measure: string }[]
  instructions?: string
}, dietary?: string[]): Promise<RecipePrefill> {
  const dietaryNote = dietary?.length
    ? `\nAlso respect these dietary restrictions: ${dietary.join(', ')}. Adjust ingredients accordingly.`
    : ''

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Create a healthier version of this recipe. Substitutions: bake/air-fry instead of deep-fry, Greek yogurt instead of heavy cream, reduce sugar 25-50%, lean protein, extra veg, whole wheat flour, olive oil instead of butter.${dietaryNote}

Name: ${recipe.name}
Category: ${recipe.category}
Servings: ${recipe.servings ?? 4}
Ingredients: ${JSON.stringify(recipe.ingredients)}
Instructions: ${recipe.instructions ?? ''}

Return ONLY valid JSON:
{"name":"Healthy ${recipe.name}","category":"${recipe.category}","servings":${recipe.servings ?? 4},"is_healthy":true,"ingredients":[{"name":"string","measure":"string"}],"instructions":"string"}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(text)) as RecipePrefill
}

export async function suggestLocalProducts(
  ingredients: string[],
  region: string,
  supermarkets?: string[],
  dietary?: string[]
): Promise<{ index: number; suggestion: string }[]> {
  const storeClause = supermarkets?.length
    ? `\nPreferred stores: ${supermarkets.join(', ')}. Prioritize products from these stores when possible.`
    : ''
  const dietaryClause = dietary?.length
    ? `\nDietary restrictions: ${dietary.join(', ')}. Suggest appropriate alternatives if an ingredient conflicts.`
    : ''

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `User is near "${region}" and needs to buy these ingredients at a local supermarket. For each one, suggest the most appropriate LOCAL product.${storeClause}${dietaryClause}

IMPORTANT rules:
- Match the EXACT TYPE of product described. "Cooked ham" or "smoked ham" = boiled/deli ham (jamón cocido, turkey ham) — NOT cured ham like serrano, prosciutto, or ibérico.
- "Fresh" means uncooked. "Smoked" means smoked, not cured/dried.
- Give a real local brand + store where available. Keep it short (one line).
- Use the local language name if it differs from English.
- Do NOT wrap the response in markdown code fences.

${ingredients.map((ing, i) => `${i}: ${ing}`).join('\n')}

Return ONLY a raw JSON array (no markdown, no explanation):
[{"index":0,"suggestion":"local product name (store)"},{"index":1,"suggestion":"..."}]`,
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  // Strip markdown code fences if present
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || start >= end) {
    throw new Error(`Could not parse AI response (truncated or unexpected format). Try again.`)
  }
  return JSON.parse(text.slice(start, end + 1)) as { index: number; suggestion: string }[]
}

export async function enrichRecipe(recipe: {
  name: string
  ingredients: { name: string; measure: string }[]
  instructions: string
  servings?: number
}): Promise<{ ingredients: { name: string; measure: string }[]; instructions: string }> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Make this recipe's ingredients specific and shopable (e.g. "Sausages"→"pork sausages", "Bacon"→"smoked back bacon", "Mushrooms"→"chestnut mushrooms"). Keep measures unchanged. Rewrite instructions as numbered steps with timing.

Recipe: ${recipe.name}
Ingredients: ${JSON.stringify(recipe.ingredients)}
Instructions: ${recipe.instructions}

Return ONLY valid JSON:
{"ingredients":[{"name":"string","measure":"string"}],"instructions":"1. Step one...\n2. Step two..."}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(text)) as { ingredients: { name: string; measure: string }[]; instructions: string }
}

export async function generateRecipe(
  name: string,
  servings: number,
  dietary?: string[]
): Promise<RecipePrefill & { category: string; is_healthy: boolean }> {
  const dietaryNote = dietary?.length
    ? `\nDietary requirements: ${dietary.join(', ')}. The recipe MUST comply with all of these restrictions.`
    : ''

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Write a complete home-cook recipe for "${name}" (serves ${servings}).${dietaryNote}
Use specific, shopable ingredient names (e.g. "large free-range eggs", "cooked smoked ham", "unsalted butter").
Instructions as clear numbered steps with timing.

Return ONLY valid JSON:
{"name":"string","category":"string","servings":${servings},"is_healthy":false,"ingredients":[{"name":"string","measure":"string"}],"instructions":"1. Step...\n2. Step..."}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(text))
}

export async function parseRecipeText(text: string): Promise<RecipePrefill> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Parse this recipe into JSON. Extract name, category (Chicken/Beef/Pasta/Salad/Seafood/Vegetarian/Dessert/etc), servings (default 4), is_healthy (true if baked/grilled/steamed with lean ingredients), ingredients as [{name,measure}], and instructions as a single string.

${text}

Return ONLY valid JSON:
{"name":"string","category":"string","servings":4,"is_healthy":false,"ingredients":[{"name":"string","measure":"string"}],"instructions":"string"}`,
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(raw)) as RecipePrefill
}
