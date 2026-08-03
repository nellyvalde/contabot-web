import { describe, it, expect, vi } from 'vitest'
import { crearEmpresaYVincular } from '../agregarEmpresa'

// Cliente falso: simula solo la forma que usa crearEmpresaYVincular
// (supabase.rpc(...).single()). fromSpy existe para probar que el
// helper NUNCA hace un .from(...).insert() directo -- si lo hiciera,
// cualquier test que lo invoque debe fallar.
function fakeClient(rpcResultado: { data: any; error: { message: string } | null }) {
  const fromSpy = vi.fn(() => {
    throw new Error('No debería llamarse .from() -- la creación de empresa debe ir solo por la RPC.')
  })
  const rpcSpy = vi.fn((_fn: string, _args: Record<string, unknown>) => ({
    single: () => Promise.resolve(rpcResultado),
  }))
  return { client: { rpc: rpcSpy, from: fromSpy } as any, rpcSpy, fromSpy }
}

describe('crearEmpresaYVincular', () => {
  it('usuario autenticado creando empresa: llama a la RPC con nit y razón social recortados', async () => {
    const { client, rpcSpy } = fakeClient({
      data: { id: 'emp-1', nit: '900123456', razon_social: 'MI EMPRESA SAS' },
      error: null,
    })

    await crearEmpresaYVincular(client, { nit: '  900123456  ', razonSocial: '  MI EMPRESA SAS  ' })

    expect(rpcSpy).toHaveBeenCalledTimes(1)
    expect(rpcSpy).toHaveBeenCalledWith('crear_empresa_y_vincular_usuario', {
      p_nit: '900123456',
      p_razon_social: 'MI EMPRESA SAS',
    })
  })

  it('empresa y vínculo creados juntos: una sola llamada a la RPC, nunca un INSERT directo por separado', async () => {
    const { client, rpcSpy, fromSpy } = fakeClient({
      data: { id: 'emp-1', nit: '900123456', razon_social: 'MI EMPRESA SAS' },
      error: null,
    })

    const resultado = await crearEmpresaYVincular(client, { nit: '900123456', razonSocial: 'MI EMPRESA SAS' })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.empresa).toEqual({ id: 'emp-1', nit: '900123456', razon_social: 'MI EMPRESA SAS' })
    }
    expect(rpcSpy).toHaveBeenCalledTimes(1)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('fallo sin dejar empresa huérfana: si la RPC devuelve error, no intenta ningún insert adicional', async () => {
    const { client, fromSpy } = fakeClient({
      data: null,
      error: { message: 'NIT y razón social son obligatorios.' },
    })

    const resultado = await crearEmpresaYVincular(client, { nit: '', razonSocial: '' })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toBe('NIT y razón social son obligatorios.')
    }
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('usuario sin sesión: propaga el error de la RPC ("No hay sesión activa.") sin lanzar excepción', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'No hay sesión activa.' },
    })

    const resultado = await crearEmpresaYVincular(client, { nit: '900123456', razonSocial: 'MI EMPRESA SAS' })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toBe('No hay sesión activa.')
    }
  })
})
