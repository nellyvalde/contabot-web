import { describe, it, expect } from 'vitest'
import { normalizarTexto } from '../texto'

describe('normalizarTexto -- espacios y Unicode, nunca reinterpreta contenido', () => {
  it('colapsa espacios repetidos y de distinta clase a uno solo', () => {
    expect(normalizarTexto('PAGO   PROVEEDOR\tX')).toBe('PAGO PROVEEDOR X')
  })

  it('recorta espacios al inicio y al final', () => {
    expect(normalizarTexto('  PAGO PROVEEDOR X  ')).toBe('PAGO PROVEEDOR X')
  })

  it('normaliza a NFC -- una é compuesta con acento combinante y una é precompuesta comparan igual', () => {
    const combinante = 'DESCRIPCIÓN' // O + acento combinante
    const precompuesta = 'DESCRIPCIÓN'
    expect(normalizarTexto(combinante)).toBe(normalizarTexto(precompuesta))
  })

  it('no altera el contenido de una descripción real más allá de espacios/unicode', () => {
    expect(normalizarTexto('CRE TRANSF ACH 009006563718 DAVIVIENDA')).toBe('CRE TRANSF ACH 009006563718 DAVIVIENDA')
  })

  it('cadena vacía o solo espacios da cadena vacía', () => {
    expect(normalizarTexto('   ')).toBe('')
    expect(normalizarTexto('')).toBe('')
  })
})
