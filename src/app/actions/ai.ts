'use server'

import Anthropic from '@anthropic-ai/sdk'
import { RecipePrefill } from '@/types'

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
      if (recipe) { textToSend = `Structured JSON-LD recipe:\n${JSON.stringify(recipe)}`; break }
    } catch { /* skip malformed JSON */ }
  }

  // Fallback: strip HTML to readable text
  if (!textToSend) {
    textToSend = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
      .replace(/\s+/g, ' ').trim().slice(0, 10000)
  }

  return parseRecipeText(textToSend)
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJSON(text: string): string {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : text
}

export async function generateHealthyVersion(recipe: {
  name: string
  category: string
  servings?: number
  ingredients: { name: string; measure: string }[]
  instructions?: string
}): Promise<RecipePrefill> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Create a genuinely healthier version of this recipe by applying smart substitutions:
- Replace deep frying with baking (400°F/200°C), air frying, or pan frying with 1 tsp olive oil
- Replace heavy cream with Greek yogurt or light coconut milk
- Reduce sugar by 25–50%, or replace with honey/maple syrup
- Use lean protein (chicken breast, lean beef, tofu) instead of fatty cuts
- Add extra vegetables naturally
- Use whole wheat or almond flour instead of refined white flour
- Use olive oil or avocado oil instead of butter/vegetable oil

Original recipe:
Name: ${recipe.name}
Category: ${recipe.category}
Servings: ${recipe.servings ?? 4}
Ingredients: ${JSON.stringify(recipe.ingredients)}
Instructions: ${recipe.instructions ?? ''}

Return ONLY valid JSON, no markdown, no explanation:
{
  "name": "Healthy ${recipe.name}",
  "category": "${recipe.category}",
  "servings": ${recipe.servings ?? 4},
  "is_healthy": true,
  "ingredients": [{"name": "string", "measure": "string"}],
  "instructions": "string"
}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(text)) as RecipePrefill
}

export async function parseRecipeText(text: string): Promise<RecipePrefill> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Parse this recipe text into structured JSON. Extract:
- name: the recipe name
- category: best category guess (Chicken, Beef, Pasta, Salad, Seafood, Vegetarian, Dessert, etc.)
- servings: number of servings (look for "serves X" or "makes X", default 4 if missing)
- is_healthy: true if method uses baking/grilling/steaming and uses lean ingredients, false otherwise
- ingredients: array of {name, measure} where measure is the amount (e.g. "2 cups", "1 tbsp", "3")
- instructions: complete cooking steps as one string

Recipe text:
${text}

Return ONLY valid JSON, no markdown, no explanation:
{
  "name": "string",
  "category": "string",
  "servings": 4,
  "is_healthy": false,
  "ingredients": [{"name": "string", "measure": "string"}],
  "instructions": "string"
}`,
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  return JSON.parse(extractJSON(raw)) as RecipePrefill
}
