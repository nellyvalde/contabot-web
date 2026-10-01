import { describe, it, expect } from 'vitest'
import { parseVigencia, dentroDeVigencia } from '../vigencia'

describe('parseVigencia -- banner VIGENCIA con tabla explícita de meses en español', () => {
  it('reconoce el banner confirmado en el extracto real (estructura, con fechas sintéticas)', () => {
    expect(parseVigencia('VIGENCIA 01 DE JUNIO AL 30 DE JUNIO DE 2026')).toEqual({ inicio: '2026/06/01', fin: '2026/06/30' })
  })

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(parseVigencia('vigencia 01 de junio al 30 de junio de 2026')).toEqual({ inicio: '2026/06/01', fin: '2026/06/30' })
  })

  it('acepta espacios extra entre tokens (reconstrucción de línea con más de un espacio)', () => {
    expect(parseVigencia('VIGENCIA  01  DE  JUNIO  AL  30  DE  JUNIO  DE  2026')).toEqual({ inicio: '2026/06/01', fin: '2026/06/30' })
  })

  it('rechaza un mes no reconocido (ninguna tolerancia a abreviaturas ni errores)', () => {
    expect(parseVigencia('VIGENCIA 01 DE JUN AL 30 DE JUNIO DE 2026')).toBeNull()
  })

  it('rechaza si el inicio es calendáricamente inválido', () => {
    expect(parseVigencia('VIGENCIA 31 DE ABRIL AL 30 DE ABRIL DE 2026')).toBeNull()
  })

  it('rechaza si el inicio es posterior al fin', () => {
    expect(parseVigencia('VIGENCIA 30 DE JUNIO AL 01 DE JUNIO DE 2026')).toBeNull()
  })

  it('rechaza vigencia cruzando meses distintos con el mismo criterio calendárico', () => {
    expect(parseVigencia('VIGENCIA 01 DE ENERO AL 31 DE ENERO DE 2026')).toEqual({ inicio: '2026/01/01', fin: '2026/01/31' })
  })

  it('rechaza texto sin el banner', () => {
    expect(parseVigencia('TOTALES DEL PERÍODO')).toBeNull()
    expect(parseVigencia('')).toBeNull()
  })
})

describe('dentroDeVigencia', () => {
  const v = { inicio: '2026/06/01', fin: '2026/06/30' }
  it('una fecha dentro del rango da true', () => {
    expect(dentroDeVigencia('2026/06/15', v)).toBe(true)
    expect(dentroDeVigencia('2026/06/01', v)).toBe(true)
    expect(dentroDeVigencia('2026/06/30', v)).toBe(true)
  })
  it('una fecha del mes anterior (fila puente) da false', () => {
    expect(dentroDeVigencia('2026/05/30', v)).toBe(false)
  })
  it('una fecha posterior al fin da false', () => {
    expect(dentroDeVigencia('2026/07/01', v)).toBe(false)
  })
})
