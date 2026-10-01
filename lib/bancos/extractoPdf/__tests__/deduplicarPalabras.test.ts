// lib/bancos/extractoPdf/__tests__/deduplicarPalabras.test.ts
// Todos los textos, coordenadas y posiciones son inventados -- ninguno
// proviene del extracto real.
import { describe, it, expect } from 'vitest'
import { deduplicarPalabras, TOLERANCIA_COORDENADAS_PUNTOS } from '../deduplicarPalabras'
import type { Palabra } from '../tipos'

function palabra(p: Partial<Palabra> & { texto: string; orden: number }): Palabra {
  return { x0: 0, y0: 0, x1: 10, y1: 8, pagina: 1, ...p }
}

describe('deduplicarPalabras', () => {
  it('duplicado exacto (misma página, mismo texto, misma caja): se colapsa a una sola palabra', () => {
    const a = palabra({ texto: 'ALFA', orden: 0, x0: 50, x1: 80, y0: 100, y1: 108 })
    const b = palabra({ texto: 'ALFA', orden: 40, x0: 50, x1: 80, y0: 100, y1: 108 })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.palabras).toHaveLength(1)
      expect(r.palabras[0].orden).toBe(0) // se conserva la primera aparición
    }
  })

  it('duplicado casi idéntico dentro de la tolerancia (diferencia menor al límite en las 4 coordenadas): se colapsa', () => {
    const a = palabra({ texto: 'BETA', orden: 0, x0: 50, x1: 80, y0: 100, y1: 108 })
    const desplazamiento = TOLERANCIA_COORDENADAS_PUNTOS / 2
    const b = palabra({
      texto: 'BETA',
      orden: 12,
      x0: 50 + desplazamiento,
      x1: 80 + desplazamiento,
      y0: 100 + desplazamiento,
      y1: 108 + desplazamiento,
    })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras).toHaveLength(1)
  })

  it('una diferencia MAYOR a la tolerancia en cualquier eje no se considera duplicado (se conservan ambas)', () => {
    const a = palabra({ texto: 'GAMA', orden: 0, x0: 50, x1: 80, y0: 100, y1: 108 })
    const masAllaDeLaTolerancia = TOLERANCIA_COORDENADAS_PUNTOS + 0.3
    const b = palabra({ texto: 'GAMA', orden: 1, x0: 50 + masAllaDeLaTolerancia, x1: 80 + masAllaDeLaTolerancia, y0: 100, y1: 108 })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras).toHaveLength(2)
  })

  it('tres o más copias en la misma caja se reducen a una sola, conservando la primera', () => {
    const copias = [0, 1, 2, 3, 4].map(orden => palabra({ texto: 'DELTA', orden, x0: 200, x1: 240, y0: 300, y1: 308 }))
    const r = deduplicarPalabras(copias)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.palabras).toHaveLength(1)
      expect(r.palabras[0].orden).toBe(0)
    }
  })

  it('mismo texto en OTRA posición de la misma página: nunca se colapsa (repetición legítima)', () => {
    const a = palabra({ texto: 'DE', orden: 0, x0: 50, x1: 65, y0: 700, y1: 708 })
    const b = palabra({ texto: 'DE', orden: 55, x0: 300, x1: 315, y0: 500, y1: 508 })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras).toHaveLength(2)
  })

  it('mismo texto y misma caja pero en OTRA página: nunca se colapsa', () => {
    const a = palabra({ texto: 'SALDO', orden: 0, pagina: 1, x0: 50, x1: 80, y0: 100, y1: 108 })
    const b = palabra({ texto: 'SALDO', orden: 0, pagina: 2, x0: 50, x1: 80, y0: 100, y1: 108 })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras).toHaveLength(2)
  })

  it('textos DIFERENTES ocupando prácticamente la misma caja: rechazo estructural controlado, nunca se elige uno en silencio', () => {
    const a = palabra({ texto: 'UNO', orden: 0, x0: 50, x1: 80, y0: 100, y1: 108 })
    const b = palabra({ texto: 'DOS', orden: 1, x0: 50, x1: 80, y0: 100, y1: 108 })
    const r = deduplicarPalabras([a, b])
    expect(r).toEqual({ ok: false, motivo: 'texto_superpuesto_conflictivo' })
  })

  it('preserva el orden relativo de aparición de las palabras que sobreviven', () => {
    const a = palabra({ texto: 'UNO', orden: 0, x0: 10, x1: 20 })
    const b = palabra({ texto: 'DOS', orden: 1, x0: 30, x1: 40 })
    const bDup = palabra({ texto: 'DOS', orden: 2, x0: 30, x1: 40 })
    const c = palabra({ texto: 'TRES', orden: 3, x0: 50, x1: 60 })
    const r = deduplicarPalabras([a, b, bDup, c])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras.map(p => p.texto)).toEqual(['UNO', 'DOS', 'TRES'])
  })

  it('lista vacía: no falla, devuelve lista vacía', () => {
    const r = deduplicarPalabras([])
    expect(r).toEqual({ ok: true, palabras: [] })
  })

  it('sin ningún duplicado: devuelve exactamente las mismas palabras, sin alterar nada', () => {
    const a = palabra({ texto: 'UNO', orden: 0, x0: 10, x1: 20 })
    const b = palabra({ texto: 'DOS', orden: 1, x0: 100, x1: 120 })
    const r = deduplicarPalabras([a, b])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.palabras).toEqual([a, b])
  })
})
