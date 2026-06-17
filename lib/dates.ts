// lib/dates.ts
// Helpers de fechas usados por Dashboard (cartera, alertas) y reutilizables a futuro.

export function diasDesde(fecha: string | null) {
  if (!fecha) return 0
  const hoy = new Date()
  const f = new Date(fecha)
  return Math.floor((hoy.getTime() - f.getTime()) / (1000 * 60 * 60 * 24))
}

export function diasVencidos(fechaVencimiento: string | null, estado: string) {
  if (!fechaVencimiento || estado === 'Pagado') return 0
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  const diff = Math.floor((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

export function diasParaVencer(fechaVencimiento: string | null) {
  if (!fechaVencimiento) return null
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  const diff = Math.floor((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}