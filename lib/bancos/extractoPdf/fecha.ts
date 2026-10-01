// lib/bancos/extractoPdf/fecha.ts
// Fase 1: fechas 'AAAA/MM/DD' (el único formato confirmado en el extracto
// PDF real de AV Villas -- distinto de los 3 formatos que acepta
// lib/bancos/parsearExtractoAvVillas.ts para XLSX/CSV, sin confirmar para
// PDF) con validación CALENDÁRICA real, no solo de forma: '2026/02/30' o
// '2026/13/01' tienen la forma correcta pero no son fechas válidas.
const PATRON_FECHA = /^(\d{4})\/(\d{2})\/(\d{2})$/

// Date.UTC(anio, mes, 0) retrocede al último día del mes ANTERIOR al
// índice `mes` (0-indexado en Date) -- pasando el `mes` 1-indexado tal
// cual como si fuera "el mes siguiente" 0-indexado, día 0 da exactamente
// el último día del mes 1-indexado que se quiere consultar. Implementa la
// regla gregoriana completa de años bisiestos (divisible entre 4, salvo
// divisible entre 100 y no entre 400) sin lógica propia.
function diasEnMes(anio: number, mes1Indexado: number): number {
  return new Date(Date.UTC(anio, mes1Indexado, 0)).getUTCDate()
}

export function parseFechaSiValida(texto: string): string | null {
  const m = PATRON_FECHA.exec(texto.trim())
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasEnMes(anio, mes)) return null
  return `${m[1]}/${m[2]}/${m[3]}`
}

// Comparación lexicográfica: válida porque 'AAAA/MM/DD' con ceros a la
// izquierda ordena igual que el orden cronológico real.
export function fechaMenorOIgual(a: string, b: string): boolean {
  return a <= b
}
