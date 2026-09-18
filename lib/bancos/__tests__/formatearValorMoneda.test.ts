import { describe, it, expect } from 'vitest'
import { formatearValorMoneda } from '../formatearValorMoneda'

describe('formatearValorMoneda', () => {
  it('150000.50 se presenta como $150.000,50 -- nunca redondeado a $150.001', () => {
    expect(formatearValorMoneda(150000.5)).toBe('$150.000,50')
  })

  it('un valor entero muestra ",00" -- siempre exactamente dos decimales', () => {
    expect(formatearValorMoneda(150000)).toBe('$150.000,00')
  })

  it('un valor negativo antepone el signo antes del símbolo de moneda', () => {
    expect(formatearValorMoneda(-150000.5)).toBe('-$150.000,50')
  })

  it('cero se formatea como $0,00', () => {
    expect(formatearValorMoneda(0)).toBe('$0,00')
  })

  it('valores grandes agrupan de a 3 dígitos en cada separador de miles', () => {
    expect(formatearValorMoneda(1234567.89)).toBe('$1.234.567,89')
  })

  it('un solo decimal se completa a dos (100.5 -> 100,50)', () => {
    expect(formatearValorMoneda(100.5)).toBe('$100,50')
  })

  it('más de dos decimales se redondean a dos, nunca se truncan en silencio más allá de eso', () => {
    expect(formatearValorMoneda(100.505)).toBe('$100,51')
  })
})
