import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock de @/lib/supabase (NO regex de codigo fuente): controla exactamente
// que {data, error} devuelve cada tabla, sin hacer ninguna llamada de red
// real. Se declara ANTES del import de page.tsx porque vi.mock se hoistea
// al tope del archivo por Vitest.
const porTabla: Record<string, { data: unknown; error: unknown }> = {}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      const resultado = porTabla[tabla] ?? { data: [], error: null }
      const encadenable: any = {
        select: () => encadenable,
        eq: () => encadenable,
        order: () => encadenable,
        then: (onFulfilled: any, onRejected: any) => Promise.resolve(resultado).then(onFulfilled, onRejected),
      }
      return encadenable
    },
  },
}))

const { obtenerMovimientosPorPeriodoContable } = await import('../../../app/bancos/page')

describe('obtenerMovimientosPorPeriodoContable -- un fallo de consulta nunca es un reporte vacio silencioso', () => {
  beforeEach(() => {
    for (const clave of Object.keys(porTabla)) delete porTabla[clave]
  })

  it('si falla la consulta de conciliaciones, lanza (nunca devuelve [])', async () => {
    porTabla['conciliaciones_bancarias'] = { data: null, error: { code: '42501', message: 'permission denied for table conciliaciones_bancarias' } }
    await expect(obtenerMovimientosPorPeriodoContable('empresa-1', '2026-07')).rejects.toThrow()
  })

  it('si falla la consulta de facturas (aunque conciliaciones responda bien), lanza (nunca devuelve [])', async () => {
    porTabla['conciliaciones_bancarias'] = { data: [], error: null }
    porTabla['facturas'] = { data: null, error: { message: 'timeout' } }
    await expect(obtenerMovimientosPorPeriodoContable('empresa-1', '2026-07')).rejects.toThrow()
  })

  it('si falla la consulta de nomina, lanza (nunca devuelve [])', async () => {
    porTabla['conciliaciones_bancarias'] = { data: [], error: null }
    porTabla['facturas'] = { data: [], error: null }
    porTabla['nomina_programada'] = { data: null, error: { message: 'timeout' } }
    await expect(obtenerMovimientosPorPeriodoContable('empresa-1', '2026-07')).rejects.toThrow()
  })

  it('el mensaje del error nunca incluye texto crudo de Supabase', async () => {
    porTabla['conciliaciones_bancarias'] = { data: null, error: { code: '42501', message: 'permission denied for table conciliaciones_bancarias' } }
    let mensajeCapturado = ''
    try {
      await obtenerMovimientosPorPeriodoContable('empresa-1', '2026-07')
    } catch (err: any) {
      mensajeCapturado = err.message
    }
    expect(mensajeCapturado).not.toBe('')
    expect(mensajeCapturado).not.toContain('permission denied')
  })

  it('sin errores y sin filas -- SI devuelve un arreglo vacio (esto es un reporte genuinamente vacio, no un fallo)', async () => {
    porTabla['conciliaciones_bancarias'] = { data: [], error: null }
    porTabla['facturas'] = { data: [], error: null }
    porTabla['nomina_programada'] = { data: [], error: null }
    await expect(obtenerMovimientosPorPeriodoContable('empresa-1', '2026-07')).resolves.toEqual([])
  })
})
