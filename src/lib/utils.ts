const TRANS_CACHE_KEY = 'ingredient_translation_cache'

export function getCachedTranslations(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TRANS_CACHE_KEY) ?? '{}') }
  catch { return {} }
}

export function saveCachedTranslations(cache: Record<string, string>) {
  localStorage.setItem(TRANS_CACHE_KEY, JSON.stringify(cache))
}

// Ingredients assumed to always be at home — excluded from shopping list
export function isBasicPantryStaple(name: string): boolean {
  const n = name.toLowerCase().trim().replace(/\s*\([^)]*\)/g, '').trim()
  if (/^(water|cold water|warm water|hot water|ice water|boiling water)$/.test(n)) return true
  if (/\boil$/.test(n)) return true // "olive oil", "vegetable oil", "sesame oil", etc.
  return false
}

export function normalizeIngKey(name: string): string {
  let k = name.toLowerCase().trim()
  k = k.replace(/\s*\([^)]*\)/g, '').trim() // remove (parenthetical notes)
  // Strip leading adjectives that describe quality/size but not what the ingredient IS
  k = k.replace(/^(large |small |medium |fresh |frozen |dried |organic |free-?range |extra-?virgin |grass-?fed |lean )+/i, '').trim()
  // Simple singular normalization: "eggs" → "egg", "tomatoes" → "tomato"
  if (k.endsWith('es') && k.length > 5) k = k.slice(0, -2)
  else if (k.endsWith('s') && k.length > 3 && !/(?:ss|us|is|ous)$/.test(k)) k = k.slice(0, -1)
  return k
}

// Words that describe prep method, not quantity — strip from measure strings
const PREP_RE = /\b(chopped|diced|sliced|minced|grated|shredded|julienned|cubed|crushed|peeled|pitted|roasted|toasted|thinly|thickly|finely|roughly|coarsely|halved|quartered|torn|strips|pieces|chunks|whole)\b/gi
const TASTE_RE = /^(to taste|al gusto|as needed|q\.?s\.?|to season|a pinch|pinch|season to taste)$/i

// Canonical unit names
const UNIT_NORM: Record<string, string> = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp',
  gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb',
  cup: 'cup', cups: 'cup',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
}

// Families of interconvertible units: [unit, how many base-units it equals]
// Sorted largest first so we prefer the largest unit that fits
const UNIT_FAMILIES: Array<{ base: string; members: Array<[string, number]> }> = [
  { base: 'tsp', members: [['tbsp', 3], ['tsp', 1]] },
  { base: 'ml',  members: [['l', 1000], ['ml', 1]] },
  { base: 'g',   members: [['kg', 1000], ['g', 1]] },
  { base: 'oz',  members: [['lb', 16], ['oz', 1]] },
]

function normUnit(u: string): string {
  return UNIT_NORM[u.trim().toLowerCase()] ?? u.trim().toLowerCase()
}

function formatNum(n: number): string {
  const r = Math.round(n * 4) / 4 // round to nearest quarter
  return r % 1 === 0 ? String(r) : r.toFixed(2).replace(/\.?0+$/, '')
}

function parseMeasure(raw: string): { num: number; unit: string } | null {
  const s = raw.trim().replace(PREP_RE, '').replace(/\s+/g, ' ').trim()
  if (!s || TASTE_RE.test(s)) return null
  // Match integer, decimal, or fraction at the start
  const m = s.match(/^(\d+(?:\/\d+)?(?:\.\d+)?)\s*(.*)$/)
  if (!m) return null
  let num: number
  if (m[1].includes('/')) {
    const [a, b] = m[1].split('/')
    num = parseFloat(a) / parseFloat(b)
  } else {
    num = parseFloat(m[1])
  }
  if (isNaN(num)) return null
  return { num, unit: normUnit(m[2]) }
}

export function sumQuantities(quantities: string[]): string {
  // Single entry — just clean it up
  if (quantities.length === 1) {
    const s = quantities[0].trim().replace(PREP_RE, '').replace(/\s+/g, ' ').trim()
    return TASTE_RE.test(s) ? 'to taste' : s
  }

  const parsed = quantities.map(parseMeasure)
  const valid = parsed.filter((p): p is { num: number; unit: string } => p !== null)

  if (valid.length === 0) return 'to taste'

  // All the same unit → plain sum
  const units = [...new Set(valid.map(p => p.unit))]
  if (units.length === 1) {
    const total = valid.reduce((s, p) => s + p.num, 0)
    return units[0] ? `${formatNum(total)} ${units[0]}` : formatNum(total)
  }

  // Try to convert everything to a shared base and sum
  for (const { base, members } of UNIT_FAMILIES) {
    const memberUnits = new Set(members.map(([u]) => u))
    if (units.every(u => memberUnits.has(u))) {
      const totalBase = valid.reduce((s, p) => {
        const factor = members.find(([u]) => u === p.unit)?.[1] ?? 1
        return s + p.num * factor
      }, 0)
      // Express in the largest unit that fits cleanly
      for (const [u, factor] of members) {
        if (totalBase >= factor) {
          return `${formatNum(totalBase / factor)} ${u}`
        }
      }
      return `${formatNum(totalBase)} ${base}`
    }
  }

  // Fallback: join the cleaned-up values
  return valid.map(p => p.unit ? `${formatNum(p.num)} ${p.unit}` : formatNum(p.num)).join(' + ')
}

export function scaleQuantity(measure: string, multiplier: number): string {
  if (multiplier === 1 || !measure.trim()) return measure
  const match = measure.match(/^(\d+(?:\/\d+)?)(.*)/)
  if (!match) return measure
  let val: number
  if (match[1].includes('/')) {
    const [n, d] = match[1].split('/')
    val = parseInt(n) / parseInt(d)
  } else {
    val = parseInt(match[1])
  }
  if (isNaN(val)) return measure
  const scaled = Math.round(val * multiplier * 4) / 4
  const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2).replace(/\.?0+$/, '')
  return formatted + match[2]
}
