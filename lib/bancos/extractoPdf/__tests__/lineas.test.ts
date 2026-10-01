import { describe, it, expect } from 'vitest'
import { agruparEnLineas } from '../lineas'
import { palabraIzquierda } from './fixtures'

describe('agruparEnLineas -- cajas sintéticas', () => {
  it('agrupa palabras con la misma altura vertical en una sola línea, ordenadas por x', () => {
    const palabras = [
      palabraIzquierda('MUNDO', 100, 700, 1, 1),
      palabraIzquierda('HOLA', 50, 700, 1, 0),
    ]
    const lineas = agruparEnLineas(palabras)
    expect(lineas).toHaveLength(1)
    expect(lineas[0].palabras.map(p => p.texto)).toEqual(['HOLA', 'MUNDO'])
  })

  it('separa en líneas distintas cuando la diferencia vertical supera la tolerancia', () => {
    const palabras = [palabraIzquierda('ARRIBA', 50, 700), palabraIzquierda('ABAJO', 50, 650)]
    const lineas = agruparEnLineas(palabras)
    expect(lineas).toHaveLength(2)
  })

  it('respeta el orden de lectura de arriba hacia abajo (mayor y primero, espacio PDF)', () => {
    const palabras = [palabraIzquierda('ABAJO', 50, 650), palabraIzquierda('ARRIBA', 50, 700)]
    const lineas = agruparEnLineas(palabras)
    expect(lineas.map(l => l.palabras[0].texto)).toEqual(['ARRIBA', 'ABAJO'])
  })

  it('mantiene páginas separadas y en orden ascendente', () => {
    const palabras = [palabraIzquierda('PAG2', 50, 700, 2, 0), palabraIzquierda('PAG1', 50, 700, 1, 0)]
    const lineas = agruparEnLineas(palabras)
    expect(lineas.map(l => l.pagina)).toEqual([1, 2])
  })

  it('ignora palabras vacías o solo espacio', () => {
    const palabras = [palabraIzquierda('  ', 50, 700), palabraIzquierda('TEXTO', 100, 700, 1, 1)]
    const lineas = agruparEnLineas(palabras)
    expect(lineas).toHaveLength(1)
    expect(lineas[0].palabras).toHaveLength(1)
  })

  it('sin palabras da un arreglo vacío', () => {
    expect(agruparEnLineas([])).toEqual([])
  })
})
