import { describe, it, expect } from 'vitest'
import { MENSAJE_CARGA_DESHABILITADA } from '../cargaDeshabilitada'

describe('mensaje de carga deshabilitada (hotfix de seguridad)', () => {
  it('explica que la carga esta deshabilitada', () => {
    expect(MENSAJE_CARGA_DESHABILITADA).toMatch(/deshabilitad/i)
  })

  it('no promete que ningun movimiento pueda modificarse -- solo que la CARGA DE ARCHIVOS no los modificara (confirmar cruces sigue siendo una operacion valida)', () => {
    expect(MENSAJE_CARGA_DESHABILITADA).toMatch(/la carga de archivos no modificar[aá]/i)
    expect(MENSAJE_CARGA_DESHABILITADA).not.toMatch(/ning[uú]n movimiento/i)
  })
})
