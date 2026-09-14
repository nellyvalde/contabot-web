import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmarCruceConciliacion, type FilaAConfirmar } from '../confirmarCruceConciliacion'
import type { ResultadoAbono } from '@/lib/nomina/abonos'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function fakeClienteRpc(rpcResultado: { data: unknown; error: { message: string } | null }) {
  const rpcSpy = vi.fn(() => Promise.resolve(rpcResultado))
  return { rpc: rpcSpy, from: vi.fn() } as unknown as SupabaseClient
}

const parametrosNomina = {
  empresaId: 'empresa-A',
  obligacionId: 7,
  valorAbonado: 50000,
  fechaAbono: '2026-07-10',
  referencia: 'banco:empresa-A:2026-07-10:PAGO:50000',
  observaciones: 'PAGO',
}

describe('confirmarCruceConciliacion', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { spy.mockRestore() })

  it('fila sin id estable: nunca confirma, nunca llama al backend -- mensaje controlado', async () => {
    const cliente = fakeClienteRpc({ data: null, error: null })
    const fila: FilaAConfirmar = { tipo: 'factura', id: undefined }

    const resultado = await confirmarCruceConciliacion(fila, () => true, cliente)

    expect(resultado.tipo).toBe('error')
    expect((cliente.rpc as any)).not.toHaveBeenCalled()
  })

  it('FACTURA -- confirmacion iniciada en A no se aplica si, cuando la respuesta llega, la identidad vigente ya cambio (simula que A ya no es la empresa/periodo en pantalla)', async () => {
    let identidadVigente = true
    const cliente = {
      rpc: vi.fn(() =>
        esperar(5).then(() => {
          // Mientras la RPC esta en curso, el usuario cambia de empresa --
          // la identidad deja de ser vigente ANTES de que la respuesta
          // resuelva.
          identidadVigente = false
          return { data: { ok: true, codigo: 'ok', mensaje: 'ok', conciliacion_id: 'conc-A', factura_id: 'fact-A' }, error: null }
        })
      ),
      from: vi.fn(),
    } as unknown as SupabaseClient

    const fila: FilaAConfirmar = { tipo: 'factura', id: 'conc-A' }
    const resultado = await confirmarCruceConciliacion(fila, () => identidadVigente, cliente)

    expect(resultado.tipo).toBe('descartado')
  })

  it('FACTURA -- ok:true y la identidad sigue vigente: SI confirma', async () => {
    const cliente = fakeClienteRpc({ data: { ok: true, codigo: 'ok', mensaje: 'ok', conciliacion_id: 'conc-A', factura_id: 'fact-A' }, error: null })
    const fila: FilaAConfirmar = { tipo: 'factura', id: 'conc-A' }

    const resultado = await confirmarCruceConciliacion(fila, () => true, cliente)

    expect(resultado).toEqual({ tipo: 'confirmado', id: 'conc-A' })
  })

  it('NOMINA -- confirmacion iniciada en A no se aplica si la identidad vigente cambio antes de que registrarAbono resuelva', async () => {
    let identidadVigente = true
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => {
      await esperar(5)
      identidadVigente = false
      return { ok: true, duplicado: false, saldoPendiente: 0, estado: 'Pagado' }
    })

    const fila: FilaAConfirmar = { tipo: 'nomina', id: 'conc-A', parametros: parametrosNomina }
    const resultado = await confirmarCruceConciliacion(fila, () => identidadVigente, fakeClienteRpc({ data: null, error: null }), registrar)

    expect(resultado.tipo).toBe('descartado')
  })

  it('NOMINA -- ok:true y la identidad sigue vigente: SI confirma', async () => {
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => ({ ok: true, duplicado: false, saldoPendiente: 0, estado: 'Pagado' }))
    const fila: FilaAConfirmar = { tipo: 'nomina', id: 'conc-A', parametros: parametrosNomina }

    const resultado = await confirmarCruceConciliacion(fila, () => true, fakeClienteRpc({ data: null, error: null }), registrar)

    expect(resultado).toEqual({ tipo: 'confirmado', id: 'conc-A' })
  })

  // --- Aplicacion del resultado por `id` (nunca por `idx`), igual que en
  // app/bancos/page.tsx. El coordinador ya devuelve `id`, no una posicion --
  // estas pruebas verifican que el patron de aplicacion "prev.map(r => r.id
  // === resultado.id ? ... : r)" es seguro incluso cuando el arreglo cambio
  // de forma o de orden mientras la confirmacion estaba en curso.

  it('la fila en el indice original cambia/desaparece mientras la confirmacion esta en curso: aplicar por id nunca marca la fila equivocada que ahora ocupa ese indice', async () => {
    type FilaUI = { id: string; estadoCruce: string }
    let filas: FilaUI[] = [
      { id: 'conc-A', estadoCruce: 'encontrado' },
      { id: 'conc-B', estadoCruce: 'encontrado' },
    ]
    const idx = 0
    const idCapturado = filas[idx].id

    const cliente = {
      rpc: vi.fn(() =>
        esperar(5).then(() => {
          // Mientras la RPC esta en curso se recarga la lista: la fila que
          // estaba en idx=0 (conc-A) desaparece y una fila nueva y distinta
          // (conc-C) ocupa esa misma posicion del arreglo.
          filas = [
            { id: 'conc-C', estadoCruce: 'encontrado' },
            { id: 'conc-B', estadoCruce: 'encontrado' },
          ]
          return { data: { ok: true, codigo: 'ok', mensaje: 'ok', conciliacion_id: idCapturado, factura_id: 'fact-A' }, error: null }
        })
      ),
      from: vi.fn(),
    } as unknown as SupabaseClient

    const fila: FilaAConfirmar = { tipo: 'factura', id: idCapturado }
    const resultado = await confirmarCruceConciliacion(fila, () => true, cliente)

    expect(resultado).toEqual({ tipo: 'confirmado', id: 'conc-A' })

    // Mismo patron de aplicacion que confirmarCruce en app/bancos/page.tsx:
    // nunca usa `idx`, solo `resultado.id`.
    filas = filas.map(f => (resultado.tipo === 'confirmado' && f.id === resultado.id) ? { ...f, estadoCruce: 'confirmado' } : f)

    // Si el codigo hubiera aplicado el resultado por `idx` en lugar de por
    // `id`, conc-C (una fila totalmente distinta que ahora ocupa esa
    // posicion) quedaria marcada como confirmada incorrectamente.
    expect(filas[0]).toEqual({ id: 'conc-C', estadoCruce: 'encontrado' })
    expect(filas[1]).toEqual({ id: 'conc-B', estadoCruce: 'encontrado' })
  })

  it('la fila confirmada desaparece por completo del arreglo (ya no esta en ninguna posicion): aplicar por id no crea ni modifica ninguna fila', async () => {
    let filas = [{ id: 'conc-B', estadoCruce: 'encontrado' }]
    const cliente = fakeClienteRpc({ data: { ok: true, codigo: 'ok', mensaje: 'ok', conciliacion_id: 'conc-A', factura_id: 'fact-A' }, error: null })
    const fila: FilaAConfirmar = { tipo: 'factura', id: 'conc-A' }

    const resultado = await confirmarCruceConciliacion(fila, () => true, cliente)
    expect(resultado).toEqual({ tipo: 'confirmado', id: 'conc-A' })

    filas = filas.map(f => (resultado.tipo === 'confirmado' && f.id === resultado.id) ? { ...f, estadoCruce: 'confirmado' } : f)
    expect(filas).toEqual([{ id: 'conc-B', estadoCruce: 'encontrado' }])
  })
})
