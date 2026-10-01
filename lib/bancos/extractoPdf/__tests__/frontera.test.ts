// lib/bancos/extractoPdf/__tests__/frontera.test.ts
// Todas las coordenadas son inventadas.
import { describe, it, expect } from 'vitest'
import { inferirFronteraValorSaldo } from '../frontera'

describe('inferirFronteraValorSaldo', () => {
  it('hueco grande y dispersión interna pequeña: frontera correcta en el punto medio del hueco', () => {
    const r = inferirFronteraValorSaldo([
      { valorX1: 440, saldoX1: 520 },
      { valorX1: 441, saldoX1: 519 },
      { valorX1: 439, saldoX1: 521 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.frontera).toBeCloseTo(480, 5) // punto medio entre max(valor)=441 y min(saldo)=519
  })

  it('un solo par: válido (dispersión interna 0 en ambas columnas)', () => {
    const r = inferirFronteraValorSaldo([{ valorX1: 440, saldoX1: 520 }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.frontera).toBeCloseTo(480, 5)
  })

  it('sin pares: ok:false (defensivo)', () => {
    const r = inferirFronteraValorSaldo([])
    expect(r).toEqual({ ok: false, detalle: 'sin filas candidatas en el bloque' })
  })

  it('rangos de VALOR y SALDO solapados (saldo de una fila menor que valor de otra): ok:false', () => {
    const r = inferirFronteraValorSaldo([
      { valorX1: 500, saldoX1: 600 },
      { valorX1: 450, saldoX1: 490 },
    ])
    expect(r.ok).toBe(false)
  })

  it('hueco no dominante sobre la dispersión interna: ok:false', () => {
    // dispersión de VALOR = 480-440 = 40; hueco = 500-480 = 20 < 40*3
    const r = inferirFronteraValorSaldo([
      { valorX1: 440, saldoX1: 500 },
      { valorX1: 480, saldoX1: 505 },
    ])
    expect(r.ok).toBe(false)
  })

  it('valorX1 repetido exacto en todas las filas (dispersión 0) con hueco grande: ok:true, no se confunde con "sin hueco"', () => {
    // dispersión de SALDO = 505-500 = 5; hueco = 500-440 = 60 >= 5*3 -- domina con margen
    const r = inferirFronteraValorSaldo([
      { valorX1: 440, saldoX1: 500 },
      { valorX1: 440, saldoX1: 505 },
      { valorX1: 440, saldoX1: 502 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.frontera).toBeCloseTo(470, 5) // punto medio entre 440 y min(saldo)=500
  })
})
