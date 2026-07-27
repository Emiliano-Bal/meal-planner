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
