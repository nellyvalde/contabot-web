import { describe, it, expect } from 'vitest'
import { detectarEncabezado } from '../encabezados'
import { linea, lineaEncabezado, lineaTexto, palabraIzquierda } from './fixtures'

describe('detectarEncabezado -- alias exactos y limitados, sin coincidencia difusa', () => {
  it('reconoce el encabezado con "DESCRIPCIÓN TRANSACCIÓN" y "SALDO DIARIO"', () => {
    const l = linea(1, 700, lineaEncabezado(700, 1, ['DESCRIPCIÓN', 'TRANSACCIÓN'], ['SALDO', 'DIARIO']))
    const enc = detectarEncabezado(l)
    expect(enc).not.toBeNull()
    expect(enc!.fecha).toBeDefined()
    expect(enc!.descripcion).toBeDefined()
    expect(enc!.valor).toBeDefined()
    expect(enc!.saldo).toBeDefined()
  })

  it('reconoce el alias alterno "MOVIMIENTO DIARIO" / "SALDO" (visto en el extracto real)', () => {
    const l = linea(1, 700, lineaEncabezado(700, 1, ['MOVIMIENTO', 'DIARIO'], ['SALDO']))
    expect(detectarEncabezado(l)).not.toBeNull()
  })

  it('reconoce "DESCRIPCIÓN" sola (sin "TRANSACCIÓN")', () => {
    const l = linea(1, 700, lineaEncabezado(700, 1, ['DESCRIPCIÓN'], ['SALDO']))
    expect(detectarEncabezado(l)).not.toBeNull()
  })

  it('NO reconoce un banner suelto "MOVIMIENTO DIARIO" sin FECHA/VALOR/SALDO en la misma línea', () => {
    const l = lineaTexto('MOVIMIENTO DIARIO', 300, 700)
    expect(detectarEncabezado(l)).toBeNull()
  })

  it('NO reconoce un banner suelto "SALDO" (ej. dentro de "TOTALES DEL PERÍODO") sin el resto de columnas', () => {
    const l = lineaTexto('SALDO PROMEDIO Y CUPO SOBREGIRO', 300, 700)
    expect(detectarEncabezado(l)).toBeNull()
  })

  it('NO acepta una variante no confirmada del alias (ninguna coincidencia difusa)', () => {
    const l = linea(1, 700, [
      palabraIzquierda('FECHA', 50, 700, 1, 0),
      palabraIzquierda('DESCRIPCION', 110, 700, 1, 1), // sin tilde -- no es uno de los 7 alias exactos
      ...(() => {
        const v = palabraIzquierda('VALOR', 400, 700, 1, 2)
        const s = palabraIzquierda('SALDO', 480, 700, 1, 3)
        return [v, s]
      })(),
    ])
    expect(detectarEncabezado(l)).toBeNull()
  })

  it('exige el orden fecha < descripción < valor < saldo', () => {
    const l = linea(1, 700, [
      palabraIzquierda('SALDO', 50, 700, 1, 0),
      palabraIzquierda('VALOR', 150, 700, 1, 1),
      palabraIzquierda('FECHA', 250, 700, 1, 2),
      palabraIzquierda('DESCRIPCIÓN', 350, 700, 1, 3),
    ])
    expect(detectarEncabezado(l)).toBeNull()
  })

  it('una línea vacía nunca es un encabezado', () => {
    expect(detectarEncabezado({ pagina: 1, y: 700, palabras: [] })).toBeNull()
  })
})
