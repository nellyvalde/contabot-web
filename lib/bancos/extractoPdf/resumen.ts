// lib/bancos/extractoPdf/resumen.ts
// Fase 2/3: extrae el resumen del período (saldo inicial, créditos,
// débitos, saldo final) declarado en el propio extracto -- es la fuente
// contra la que la Fase 3 ancla la primera fila y concilia los totales.
// Sin este resumen, la validación financiera no puede ejecutarse: ver
// validacionFinanciera.ts.
import type { Linea } from './lineas'
import { parseDineroACentavos } from './dinero'
import { normalizarTexto } from './texto'

export type Resumen = {
  saldoInicialCentavos: number
  totalCreditosCentavos: number
  totalDebitosCentavos: number
  saldoFinalCentavos: number
}

const ETIQUETAS: Array<{ clave: keyof Resumen; patron: RegExp }> = [
  { clave: 'saldoInicialCentavos', patron: /SALDO\s+INICIAL/ },
  { clave: 'totalCreditosCentavos', patron: /MOVIMIENTO\s+CR[EÉ]DITO|CR[EÉ]DITO/ },
  { clave: 'totalDebitosCentavos', patron: /MOVIMIENTO\s+D[EÉ]BITO|D[EÉ]BITO/ },
  { clave: 'saldoFinalCentavos', patron: /SALDO\s+FINAL/ },
]

// Cada etiqueta se busca UNA sola vez (la primera línea que la contenga),
// para no confundir "Saldo inicial" con una futura ocurrencia de "saldo"
// en otra parte del documento -- las etiquetas de crédito/débito se
// intentan con el patrón más específico primero.
export function extraerResumen(lineas: Linea[]): Resumen | null {
  const parcial: Partial<Resumen> = {}
  for (const linea of lineas) {
    const texto = normalizarTexto(linea.palabras.map(w => w.texto).join(' ')).toUpperCase()
    for (const { clave, patron } of ETIQUETAS) {
      if (parcial[clave] !== undefined) continue
      if (!patron.test(texto)) continue
      for (const w of linea.palabras) {
        const c = parseDineroACentavos(w.texto)
        if (c !== null) {
          parcial[clave] = c
          break
        }
      }
    }
  }
  if (
    parcial.saldoInicialCentavos === undefined ||
    parcial.totalCreditosCentavos === undefined ||
    parcial.totalDebitosCentavos === undefined ||
    parcial.saldoFinalCentavos === undefined
  ) {
    return null
  }
  return parcial as Resumen
}
