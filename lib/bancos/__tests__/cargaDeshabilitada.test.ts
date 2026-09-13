import { describe, it, expect } from 'vitest'
import { CARGA_EXTRACTOS_HABILITADA, MENSAJE_CARGA_DESHABILITADA } from '../cargaDeshabilitada'

describe('carga de extractos (hotfix de seguridad post-incidente de julio 2026)', () => {
  it('la carga antigua esta deshabilitada', () => {
    expect(CARGA_EXTRACTOS_HABILITADA).toBe(false)
  })

  it('el mensaje explica la razon y confirma explicitamente que los datos existentes no se modifican', () => {
    expect(MENSAJE_CARGA_DESHABILITADA).toMatch(/deshabilitad/i)
    expect(MENSAJE_CARGA_DESHABILITADA).toMatch(/no ser[aá]n modificados/i)
  })
})
