import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { obtenerCuentasBancarias } from '../obtenerCuentasBancarias'

function fakeCliente(resultado: { data: unknown; error: { message: string } | null }) {
  const orderSpy = vi.fn(() => Promise.resolve(resultado))
  const eqSegundo = vi.fn(() => ({ order: orderSpy }))
  const eqPrimero = vi.fn(() => ({ eq: eqSegundo }))
  const selectSpy = vi.fn(() => ({ eq: eqPrimero }))
  const fromSpy = vi.fn(() => ({ select: selectSpy }))
  const cliente = { from: fromSpy } as unknown as SupabaseClient
  return { cliente, fromSpy, selectSpy, eqPrimero, eqSegundo, orderSpy }
}

describe('obtenerCuentasBancarias', () => {
  it('empresaId vacío: devuelve lista vacía sin llamar a Supabase', async () => {
    const { cliente, fromSpy } = fakeCliente({ data: [], error: null })
    const resultado = await obtenerCuentasBancarias(cliente, '')
    expect(resultado).toEqual({ ok: true, cuentas: [] })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('éxito: mapea banco/alias/numero_cuenta/es_legacy a camelCase', async () => {
    const { cliente } = fakeCliente({
      data: [{ id: 'c1', banco: 'bancolombia', alias: 'Principal', numero_cuenta: '123', es_legacy: false, activa: true }],
      error: null,
    })
    const resultado = await obtenerCuentasBancarias(cliente, 'empresa-A')
    expect(resultado).toEqual({
      ok: true,
      cuentas: [{ id: 'c1', banco: 'bancolombia', alias: 'Principal', numeroCuenta: '123', esLegacy: false }],
    })
  })

  it('lista vacía: ok:true con arreglo vacío -- nunca se trata como error', async () => {
    const { cliente } = fakeCliente({ data: [], error: null })
    const resultado = await obtenerCuentasBancarias(cliente, 'empresa-A')
    expect(resultado).toEqual({ ok: true, cuentas: [] })
  })

  it('data null (posible con Supabase): se trata como lista vacía, no lanza', async () => {
    const { cliente } = fakeCliente({ data: null, error: null })
    const resultado = await obtenerCuentasBancarias(cliente, 'empresa-A')
    expect(resultado).toEqual({ ok: true, cuentas: [] })
  })

  it('error de Supabase: mensaje controlado, nunca el texto crudo', async () => {
    const { cliente } = fakeCliente({ data: null, error: { message: 'permission denied for table cuentas_bancarias' } })
    const resultado = await obtenerCuentasBancarias(cliente, 'empresa-A')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.mensaje).not.toContain('permission denied')
  })

  it('filtra por empresa_id y activa=true, ordena por banco -- nunca trae cuentas de otra empresa ni inactivas', async () => {
    const { cliente, eqPrimero, eqSegundo, orderSpy } = fakeCliente({ data: [], error: null })
    await obtenerCuentasBancarias(cliente, 'empresa-A')
    expect(eqPrimero).toHaveBeenCalledWith('empresa_id', 'empresa-A')
    expect(eqSegundo).toHaveBeenCalledWith('activa', true)
    expect(orderSpy).toHaveBeenCalledWith('banco', { ascending: true })
  })

})
