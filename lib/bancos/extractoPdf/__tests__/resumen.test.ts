import { describe, it, expect } from 'vitest'
import { extraerResumen } from '../resumen'
import { lineaResumen, lineaTexto } from './fixtures'

describe('extraerResumen -- cajas sintéticas', () => {
  it('extrae los 4 valores del resumen del período', () => {
    const r = extraerResumen(lineaResumen(200))
    expect(r).toEqual({
      saldoInicialCentavos: 1000000,
      totalCreditosCentavos: 500000,
      totalDebitosCentavos: 200000,
      saldoFinalCentavos: 1300000,
    })
  })

  it('devuelve null si falta cualquiera de las 4 etiquetas', () => {
    const lineas = lineaResumen(200).slice(0, 3) // sin "Saldo final"
    expect(extraerResumen(lineas)).toBeNull()
  })

  it('devuelve null sin ningún texto de resumen', () => {
    expect(extraerResumen([lineaTexto('EXTRACTO BANCARIO', 50, 700)])).toBeNull()
  })
})
