function getCategoryEmoji(category?: string | null): string {
  const c = (category ?? '').toLowerCase()
  if (/chicken|pollo/.test(c)) return '🍗'
  if (/beef|steak|carne|meat/.test(c)) return '🥩'
  if (/pasta|noodle/.test(c)) return '🍝'
  if (/salad|ensalad/.test(c)) return '🥗'
  if (/fish|seafood|salmon|tuna|shrimp|mariscos/.test(c)) return '🐟'
  if (/veggie|vegetar|vegan/.test(c)) return '🥦'
  if (/dessert|cake|sweet|postre/.test(c)) return '🍰'
  if (/breakfast|desayuno/.test(c)) return '🍳'
  if (/soup|caldo|stew/.test(c)) return '🍲'
  if (/curry|indian/.test(c)) return '🍛'
  if (/taco|mexican|burrito/.test(c)) return '🌮'
  if (/pizza|italian/.test(c)) return '🍕'
  if (/pork|cerdo|bacon|ham/.test(c)) return '🥓'
  if (/rice|risotto|arroz/.test(c)) return '🍚'
  return '🍽️'
}

function getCategoryGradient(category?: string | null): string {
  const c = (category ?? '').toLowerCase()
  if (/chicken|pollo/.test(c)) return 'from-amber-50 to-orange-100'
  if (/beef|steak|carne/.test(c)) return 'from-red-50 to-rose-100'
  if (/pasta|noodle/.test(c)) return 'from-yellow-50 to-amber-100'
  if (/salad|ensalad/.test(c)) return 'from-green-50 to-emerald-100'
  if (/fish|seafood|salmon|mariscos/.test(c)) return 'from-blue-50 to-cyan-100'
  if (/veggie|vegetar|vegan/.test(c)) return 'from-green-50 to-teal-100'
  if (/dessert|cake|sweet|postre/.test(c)) return 'from-pink-50 to-purple-100'
  if (/breakfast|desayuno/.test(c)) return 'from-amber-50 to-yellow-100'
  if (/soup|caldo|stew/.test(c)) return 'from-orange-50 to-amber-100'
  if (/curry|indian/.test(c)) return 'from-yellow-50 to-orange-100'
  if (/taco|mexican|burrito/.test(c)) return 'from-red-50 to-yellow-100'
  if (/pizza|italian/.test(c)) return 'from-red-50 to-orange-100'
  if (/pork|cerdo|bacon|ham/.test(c)) return 'from-rose-50 to-red-100'
  if (/rice|risotto|arroz/.test(c)) return 'from-stone-50 to-amber-50'
  return 'from-stone-50 to-stone-100'
}

interface Props {
  thumbnail?: string | null
  category?: string | null
  name: string
  height?: string
  className?: string
  emojiSize?: string
}

export default function RecipeThumb({
  thumbnail,
  category,
  name,
  height = 'h-36',
  className = '',
  emojiSize = 'text-4xl',
}: Props) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={name}
        className={`w-full ${height} object-cover ${className}`}
      />
    )
  }
  return (
    <div
      className={`w-full ${height} bg-gradient-to-br ${getCategoryGradient(category)} flex items-center justify-center ${className}`}
    >
      <span className={emojiSize}>{getCategoryEmoji(category)}</span>
    </div>
  )
}
