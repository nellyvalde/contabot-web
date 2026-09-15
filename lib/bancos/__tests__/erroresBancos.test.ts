import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mensajeErrorControlado, registrarErrorSupabase } from '../erroresBancos'

describe('mensajeErrorControlado', () => {
  it('nunca incluye texto crudo tipico de un error de Postgres/Supabase', () => {
    const mensaje = mensajeErrorControlado('cargar los periodos disponibles')
    expect(mensaje).not.toMatch(/relation|column|syntax error|PGRST|permission denied|constraint/i)
  })

  it('siempre menciona el contexto de forma legible para el usuario', () => {
    expect(mensajeErrorControlado('cerrar el periodo')).toContain('cerrar el periodo')
  })
})

describe('registrarErrorSupabase', () => {
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    spy.mockRestore()
  })

  it('registra el detalle tecnico via console.error cuando hay un error real', () => {
    registrarErrorSupabase('cargar las conciliaciones guardadas', { code: '42501', message: 'permission denied for table conciliaciones_bancarias' })
    expect(spy).toHaveBeenCalledTimes(1)
    const argumentos = spy.mock.calls[0].join(' ')
    expect(argumentos).toContain('42501')
    expect(argumentos).toContain('cargar las conciliaciones guardadas')
  })

  it('no registra nada si el error es null o undefined -- no genera ruido cuando no hay fallo', () => {
    registrarErrorSupabase('cargar X', null)
    registrarErrorSupabase('cargar X', undefined)
    expect(spy).not.toHaveBeenCalled()
  })
})
