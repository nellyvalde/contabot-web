// lib/bancos/extractoPdf/dinero.ts
// Fase 1: importes SIEMPRE en centavos enteros -- nunca en punto flotante,
// para que una cadena de decenas de filas no acumule error de redondeo.
//
// Formato reconocido: EXACTAMENTE el confirmado por inspección directa del
// extracto real de AV Villas en la Fase 0 (símbolo '$' opcional, coma como
// separador de miles en grupos de 3 dígitos, punto como separador decimal
// con exactamente 2 dígitos) -- signo negativo opcional por robustez,
// nunca observado en la columna VALOR del documento real. Cualquier otro
// formato (coma decimal, sin separador de miles, etc.) se rechaza: este
// módulo no reutiliza ni depende del parser de dinero de
// lib/bancos/parsearExtractoAvVillas.ts (XLSX/CSV), que reconoce un
// conjunto de formatos distinto y no confirmado para PDF.
const PATRON_DINERO = /^(-)?\$?(\d{1,3}(?:,\d{3})*)\.(\d{2})$/

export function parseDineroACentavos(texto: string): number | null {
  const m = PATRON_DINERO.exec(texto.trim())
  if (!m) return null
  const signo = m[1] ? -1 : 1
  const enteros = m[2].replace(/,/g, '')
  const centavos = m[3]
  return signo * (parseInt(enteros, 10) * 100 + parseInt(centavos, 10))
}

// Inverso puro, usado solo internamente por pruebas/depuración -- nunca
// para construir un mensaje mostrado al usuario con un monto real.
export function formatearCentavos(centavos: number): string {
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  const enteros = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  const conMiles = enteros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negativo ? '-' : ''}$${conMiles}.${dec}`
}
