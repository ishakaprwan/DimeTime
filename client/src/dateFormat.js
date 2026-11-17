export function localISODate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function displayDate(value, style = 'short') {
  if (!value) return ''

  const raw = String(value).slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)

  if (!match) return String(value)

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return String(value)
  }

  if (style === 'numeric') {
    return `${day}/${month}/${year}`
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(style === 'long' ? { year: 'numeric' } : {}),
  })
}