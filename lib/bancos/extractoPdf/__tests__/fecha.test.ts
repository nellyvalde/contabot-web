import { describe, it, expect } from 'vitest'
import { parseFechaSiValida, fechaMenorOIgual } from '../fecha'

describe('parseFechaSiValida -- validación calendárica real, no solo forma', () => {
  it('acepta una fecha válida en formato AAAA/MM/DD', () => {
    expect(parseFechaSiValida('2026/06/01')).toBe('2026/06/01')
  })

  it('rechaza formatos distintos a AAAA/MM/DD (ej. DD/MM/AAAA, no confirmado para PDF)', () => {
    expect(parseFechaSiValida('01/06/2026')).toBeNull()
  })

  it('rechaza 2026/02/30 -- 30 de febrero no existe', () => {
    expect(parseFechaSiValida('2026/02/30')).toBeNull()
  })

  it('rechaza 2026/13/01 -- mes 13 no existe', () => {
    expect(parseFechaSiValida('2026/13/01')).toBeNull()
  })

  it('rechaza 2026/04/31 -- abril tiene 30 días', () => {
    expect(parseFechaSiValida('2026/04/31')).toBeNull()
  })

  it('año bisiesto: acepta 2028/02/29 (2028 es bisiesto)', () => {
    expect(parseFechaSiValida('2028/02/29')).toBe('2028/02/29')
  })

  it('año bisiesto: rechaza 2027/02/29 (2027 no es bisiesto)', () => {
    expect(parseFechaSiValida('2027/02/29')).toBeNull()
  })

  it('regla centenaria de bisiestos: rechaza 2100/02/29 (divisible entre 100, no entre 400)', () => {
    expect(parseFechaSiValida('2100/02/29')).toBeNull()
  })

  it('regla centenaria de bisiestos: acepta 2000/02/29 (divisible entre 400)', () => {
    expect(parseFechaSiValida('2000/02/29')).toBe('2000/02/29')
  })

  it('rechaza texto sin forma de fecha', () => {
    expect(parseFechaSiValida('no es una fecha')).toBeNull()
    expect(parseFechaSiValida('')).toBeNull()
  })
})

describe('fechaMenorOIgual -- comparación lexicográfica válida para AAAA/MM/DD', () => {
  it('compara correctamente cruzando meses y años', () => {
    expect(fechaMenorOIgual('2026/05/30', '2026/06/01')).toBe(true)
    expect(fechaMenorOIgual('2026/06/01', '2025/12/31')).toBe(false)
    expect(fechaMenorOIgual('2026/06/01', '2026/06/01')).toBe(true)
  })
})
