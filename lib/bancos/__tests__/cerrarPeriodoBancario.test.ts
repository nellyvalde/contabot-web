import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cerrarPeriodoBancario, type ParametrosCerrarPeriodo } from '../cerrarPeriodoBancario'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const paramsA: ParametrosCerrarPeriodo = { empresaId: 'empresa-A', periodo: '2026-07', usuarioId: 'user-1' }

function fakeClienteUpsert(resultado: { error: { message: string } | null }) {
  const upsertSpy = vi.fn(() => Promise.resolve(resultado))
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }))
  return { client: { from: fromSpy } as unknown as SupabaseClient, upsertSpy }
}

describe('cerrarPeriodoBancario', () => {
  it('un cierre de periodo iniciado en A no se muestra como cerrado si la identidad vigente cambio (empresa/periodo B en pantalla) antes de que la respuesta llegue', async () => {
    let identidadVigente = true
    const upsertSpy = vi.fn(() =>
      esperar(5).then(() => {
        // El usuario navega a la empresa/periodo B mientras el upsert de A
        // sigue en curso.
        identidadVigente = false
        return { error: null }
      })
    )
    const client = { from: vi.fn(() => ({ upsert: upsertSpy })) } as unknown as SupabaseClient

    const resultado = await cerrarPeriodoBancario(client, paramsA, () => identidadVigente)

    expect(resultado.tipo).toBe('descartado')
  })

  it('sin errores y la identidad sigue vigente: se reporta como cerrado', async () => {
    const { client } = fakeClienteUpsert({ error: null })
    const resultado = await cerrarPeriodoBancario(client, paramsA, () => true)
    expect(resultado).toEqual({ tipo: 'cerrado' })
  })

  it('error de Supabase: mensaje controlado, nunca el texto crudo', async () => {
    const { client } = fakeClienteUpsert({ error: { message: 'duplicate key value violates unique constraint' } })
    const resultado = await cerrarPeriodoBancario(client, paramsA, () => true)

    expect(resultado.tipo).toBe('error')
    if (resultado.tipo === 'error') {
      expect(resultado.mensaje).not.toContain('duplicate key value')
    }
  })

  it('escribe exactamente empresa_id/periodo/cerrado/closed_by de los parametros recibidos, nunca de otra empresa', async () => {
    const { client, upsertSpy } = fakeClienteUpsert({ error: null })
    await cerrarPeriodoBancario(client, paramsA, () => true)

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ empresa_id: 'empresa-A', periodo: '2026-07', cerrado: true, closed_by: 'user-1' }),
      expect.objectContaining({ onConflict: 'empresa_id,periodo' })
    )
  })
})
