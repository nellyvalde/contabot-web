import { describe, it, expect } from 'vitest'
import { hayResultadosParaMostrar } from '../estadoVista'

describe('hayResultadosParaMostrar', () => {
  it('con cero resultados, devuelve false -- debe mostrarse el estado vacio explicito, nunca nada', () => {
    expect(hayResultadosParaMostrar(0)).toBe(false)
  })

  it('con al menos un resultado, devuelve true -- debe mostrarse la tabla', () => {
    expect(hayResultadosParaMostrar(1)).toBe(true)
    expect(hayResultadosParaMostrar(37)).toBe(true)
  })

  it('nunca hay un tercer valor posible -- el resultado siempre es boolean, por eso el ternario en el JSX no puede dejar ambas ramas sin renderizar', () => {
    expect(typeof hayResultadosParaMostrar(0)).toBe('boolean')
    expect(typeof hayResultadosParaMostrar(5)).toBe('boolean')
  })
})
