import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmarCruceFactura } from '../confirmarCruceFactura'

// Cliente falso: simula solo la forma que usa confirmarCruceFactura
// (supabase.rpc(...) directamente, sin .single()/.select()). fromSpy existe
// para probar que el helper NUNCA hace un .from('facturas').update() directo
// -- si lo hiciera, cualquier test que lo invoque debe fallar.
function fakeClient(rpcResultado: { data: unknown; error: { message: string } | null }) {
  const fromSpy = vi.fn(() => {
    throw new Error('No debería llamarse .from() -- confirmar el cruce de facturas debe ir solo por la RPC.')
  })
  const rpcSpy = vi.fn((_fn: string, _args: Record<string, unknown>) => Promise.resolve(rpcResultado))
  const client = { rpc: rpcSpy, from: fromSpy } as unknown as SupabaseClient
  return { client, rpcSpy, fromSpy }
}

describe('confirmarCruceFactura', () => {
  it('conciliación con factura encontrada: llama a la RPC con el id de la conciliación', async () => {
    const { client, rpcSpy } = fakeClient({
      data: { ok: true, codigo: 'ok', mensaje: 'Cruce confirmado.', conciliacion_id: 'conc-1', factura_id: 'fact-1' },
      error: null,
    })

    await confirmarCruceFactura(client, 'conc-1')

    expect(rpcSpy).toHaveBeenCalledTimes(1)
    expect(rpcSpy).toHaveBeenCalledWith('confirmar_cruce_factura', { p_conciliacion_id: 'conc-1' })
  })

  it('cruce confirmado exitosamente: una sola llamada a la RPC, nunca un UPDATE directo a facturas', async () => {
    const { client, rpcSpy, fromSpy } = fakeClient({
      data: { ok: true, codigo: 'ok', mensaje: 'Cruce confirmado.', conciliacion_id: 'conc-1', factura_id: 'fact-1' },
      error: null,
    })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.conciliacionId).toBe('conc-1')
      expect(resultado.facturaId).toBe('fact-1')
    }
    expect(rpcSpy).toHaveBeenCalledTimes(1)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('idempotencia (ya_confirmada): se trata igual que un éxito nuevo', async () => {
    const { client } = fakeClient({
      data: { ok: true, codigo: 'ya_confirmada', mensaje: 'Esta conciliación ya estaba confirmada.', conciliacion_id: 'conc-1', factura_id: 'fact-1' },
      error: null,
    })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(true)
  })

  it('la RPC devuelve ok:false (ej. periodo_cerrado): se propaga el mensaje sin marcar el cruce como confirmado', async () => {
    const { client } = fakeClient({
      data: { ok: false, codigo: 'periodo_cerrado', mensaje: 'El periodo de esta conciliación está cerrado.' },
      error: null,
    })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toBe('El periodo de esta conciliación está cerrado.')
    }
  })

  it('error de transporte de Supabase: se reporta sin lanzar excepción', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'Failed to fetch' },
    })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toBe('Failed to fetch')
    }
  })

  it('respuesta nula de la RPC: se trata como error, no como éxito silencioso', async () => {
    const { client } = fakeClient({ data: null, error: null })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(false)
  })

  it('respuesta con forma inesperada (sin campo ok booleano): se trata como error', async () => {
    const { client } = fakeClient({ data: { foo: 'bar' }, error: null })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(false)
  })

  it('respuesta ok:true pero incompleta (sin conciliacion_id/factura_id): se trata como error', async () => {
    const { client } = fakeClient({ data: { ok: true }, error: null })

    const resultado = await confirmarCruceFactura(client, 'conc-1')

    expect(resultado.ok).toBe(false)
  })

  it('conciliacionId faltante: no llama a la RPC y devuelve un error claro', async () => {
    const { client, rpcSpy } = fakeClient({ data: { ok: true }, error: null })

    const resultado = await confirmarCruceFactura(client, undefined)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toMatch(/identificador de la conciliación/)
    }
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
