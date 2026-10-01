import { describe, it, expect } from 'vitest'
import { parseDineroACentavos, formatearCentavos } from '../dinero'

describe('parseDineroACentavos -- formato confirmado del extracto PDF real ($#,###.##)', () => {
  it('valores enteros con separador de miles', () => {
    expect(parseDineroACentavos('$1,200.00')).toBe(120000)
    expect(parseDineroACentavos('$9,674,838.92')).toBe(967483892)
  })

  it('símbolo de moneda opcional', () => {
    expect(parseDineroACentavos('1,200.00')).toBe(120000)
  })

  it('negativo opcional (robustez, no observado en el documento real)', () => {
    expect(parseDineroACentavos('-$1,200.00')).toBe(-120000)
  })

  it('rechaza coma decimal (formato distinto, no confirmado en PDF)', () => {
    expect(parseDineroACentavos('$1.200,00')).toBeNull()
  })

  it('rechaza sin separador de miles pero con formato de agrupación incompleto', () => {
    expect(parseDineroACentavos('$1234.00')).toBeNull() // grupo de 4 dígitos antes del punto, no 1-3
  })

  it('rechaza texto sin forma de dinero', () => {
    expect(parseDineroACentavos('no numerico')).toBeNull()
    expect(parseDineroACentavos('')).toBeNull()
  })

  it('rechaza menos o más de 2 decimales', () => {
    expect(parseDineroACentavos('$1,200.0')).toBeNull()
    expect(parseDineroACentavos('$1,200.000')).toBeNull()
  })

  it('nunca adivina: un valor ambiguo se rechaza en vez de producir una cantidad equivocada', () => {
    expect(parseDineroACentavos('$1.234')).toBeNull()
  })
})

describe('formatearCentavos (inverso, solo para depuración interna)', () => {
  it('reconstruye el formato original', () => {
    expect(formatearCentavos(967483892)).toBe('$9,674,838.92')
    expect(formatearCentavos(-120000)).toBe('-$1,200.00')
    expect(formatearCentavos(0)).toBe('$0.00')
  })
})
