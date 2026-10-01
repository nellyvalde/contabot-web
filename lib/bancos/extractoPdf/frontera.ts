// lib/bancos/extractoPdf/frontera.ts
// Corrección: se descartó, por medición contra el extracto real autorizado
// (solo agregados, nunca texto), un diseño que anclaba la frontera entre
// las columnas VALOR y SALDO en la geometría del ENCABEZADO (punto medio
// entre las cajas de texto de los encabezados adyacentes). Esa medición
// mostró que la caja del encabezado "SALDO" cambia de ancho entre páginas
// según qué alias coincidió (comportamiento ya esperado de
// detectarEncabezado), mientras que la posición real de los datos
// (montos) es prácticamente constante -- por lo tanto ningún diseño
// anclado en el encabezado puede ser general y preciso a la vez.
//
// Esta función deriva la frontera de los propios DATOS de cada bloque, no
// del encabezado. Recibe pares {valorX1, saldoX1} ya identificados por
// POSICIÓN estructural (penúltimo/último token con forma de dinero de
// cada línea candidata -- ver filas.ts), y encuentra el punto medio del
// hueco entre el extremo derecho de los datos de VALOR y el extremo
// izquierdo... (en realidad ambos son x1, bordes derechos, ya que ambas
// columnas están alineadas a la derecha) de los datos de SALDO. Nunca
// infiere ni corrige ningún dígito, fecha, descripción o cantidad: solo
// decide a qué columna pertenece un token ya parseado.
export type ParCandidato = { valorX1: number; saldoX1: number }
export type ResultadoFrontera = { ok: true; frontera: number } | { ok: false; detalle: string }

// Genéricos, de seguridad -- NO derivados de ninguna medición del PDF
// real (medido contra el extracto real: hueco ~92.6, dispersión interna
// ~0.03 -- muy por encima de este umbral, confirmando que es conservador).
const FACTOR_DOMINANCIA = 3
const HUECO_MINIMO = 0.01

export function inferirFronteraValorSaldo(pares: ParCandidato[]): ResultadoFrontera {
  if (pares.length === 0) return { ok: false, detalle: 'sin filas candidatas en el bloque' }

  const valoresX1 = pares.map(p => p.valorX1)
  const saldosX1 = pares.map(p => p.saldoX1)
  const maxValor = Math.max(...valoresX1)
  const minSaldo = Math.min(...saldosX1)

  const hueco = minSaldo - maxValor
  if (hueco <= HUECO_MINIMO) {
    return { ok: false, detalle: `VALOR (hasta ${maxValor.toFixed(2)}) y SALDO (desde ${minSaldo.toFixed(2)}) sin separación clara` }
  }

  const dispersionMaxima = Math.max(Math.max(...valoresX1) - Math.min(...valoresX1), Math.max(...saldosX1) - Math.min(...saldosX1))
  if (hueco < dispersionMaxima * FACTOR_DOMINANCIA) {
    return { ok: false, detalle: `hueco (${hueco.toFixed(2)}) no domina la dispersión interna (${dispersionMaxima.toFixed(2)})` }
  }

  return { ok: true, frontera: (maxValor + minSaldo) / 2 }
}
