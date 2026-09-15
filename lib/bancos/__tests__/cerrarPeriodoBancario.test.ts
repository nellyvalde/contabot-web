import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cerrarPeriodoBancario, type ParametrosCerrarPeriodo } from '../cerrarPeriodoBancario'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const paramsConUsuarioConocido: ParametrosCerrarPeriodo = {
  empresaId: 'empresa-A',
  periodo: '2026-07',
  usuarioConocido: { id: 'user-1' },
}

const paramsSinUsuarioConocido: ParametrosCerrarPeriodo = {
  empresaId: 'empresa-A',
  periodo: '2026-07',
  usuarioConocido: null,
}

type ResultadoUpsert = { error: { message: string } | null }
type ResultadoGetUser = { data: { user: { id: string } | null }; error: { message: string } | null }

function fakeCliente(opts: {
  upsertResultado?: ResultadoUpsert | (() => Promise<ResultadoUpsert>)
  getUserResultado?: ResultadoGetUser | (() => Promise<ResultadoGetUser>)
}) {
  const upsertImpl =
    typeof opts.upsertResultado === 'function'
      ? opts.upsertResultado
      : () => Promise.resolve(opts.upsertResultado ?? { error: null })
  const upsertSpy = vi.fn(upsertImpl)
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }))
  const getUserImpl =
    typeof opts.getUserResultado === 'function'
      ? opts.getUserResultado
      : () => Promise.resolve(opts.getUserResultado ?? { data: { user: null }, error: null })
  const getUserSpy = vi.fn(getUserImpl)
  const cliente = { from: fromSpy, auth: { getUser: getUserSpy } } as unknown as SupabaseClient
  return { cliente, upsertSpy, fromSpy, getUserSpy }
}

describe('cerrarPeriodoBancario', () => {
  it('un cierre de periodo iniciado en A no se muestra como cerrado si la identidad vigente cambio (empresa/periodo B en pantalla) antes de que la respuesta del upsert llegue', async () => {
    let identidadVigente = true
    const { cliente } = fakeCliente({
      upsertResultado: () =>
        esperar(5).then(() => {
          // El usuario navega a la empresa/periodo B mientras el upsert de
          // A sigue en curso.
          identidadVigente = false
          return { error: null }
        }),
    })

    const resultado = await cerrarPeriodoBancario(cliente, paramsConUsuarioConocido, () => identidadVigente)

    expect(resultado.tipo).toBe('descartado')
  })

  it('sin errores y la identidad sigue vigente: se reporta como cerrado', async () => {
    const { cliente } = fakeCliente({ upsertResultado: { error: null } })
    const resultado = await cerrarPeriodoBancario(cliente, paramsConUsuarioConocido, () => true)
    expect(resultado).toEqual({ tipo: 'cerrado' })
  })

  it('error de Supabase en el upsert: mensaje controlado, nunca el texto crudo', async () => {
    const { cliente } = fakeCliente({ upsertResultado: { error: { message: 'duplicate key value violates unique constraint' } } })
    const resultado = await cerrarPeriodoBancario(cliente, paramsConUsuarioConocido, () => true)

    expect(resultado.tipo).toBe('error')
    if (resultado.tipo === 'error') {
      expect(resultado.mensaje).not.toContain('duplicate key value')
    }
  })

  it('escribe exactamente empresa_id/periodo/cerrado/closed_by de los parametros recibidos, nunca de otra empresa', async () => {
    const { cliente, upsertSpy } = fakeCliente({ upsertResultado: { error: null } })
    await cerrarPeriodoBancario(cliente, paramsConUsuarioConocido, () => true)

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ empresa_id: 'empresa-A', periodo: '2026-07', cerrado: true, closed_by: 'user-1' }),
      expect.objectContaining({ onConflict: 'empresa_id,periodo' })
    )
  })

  it('usuarioConocido presente: nunca llama a auth.getUser()', async () => {
    const { cliente, getUserSpy } = fakeCliente({ upsertResultado: { error: null } })
    await cerrarPeriodoBancario(cliente, paramsConUsuarioConocido, () => true)
    expect(getUserSpy).not.toHaveBeenCalled()
  })

  it('usuarioConocido ausente: resuelve auth.getUser() y usa ese id como closed_by', async () => {
    const { cliente, upsertSpy, getUserSpy } = fakeCliente({
      upsertResultado: { error: null },
      getUserResultado: { data: { user: { id: 'user-resuelto' } }, error: null },
    })

    const resultado = await cerrarPeriodoBancario(cliente, paramsSinUsuarioConocido, () => true)

    expect(getUserSpy).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ tipo: 'cerrado' })
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ closed_by: 'user-resuelto' }),
      expect.anything()
    )
  })

  // --- El requisito central de este bloque: la vigencia se revisa
  // INMEDIATAMENTE despues de CADA await, incluido auth.getUser() -- no
  // solo despues del upsert final. Un error (o un exito) de auth.getUser()
  // que resuelve despues de que el usuario ya cambio de empresa o de
  // periodo nunca debe traducirse en un mensaje sobre la pantalla nueva.

  it('auth.getUser() resuelve con ERROR despues de que la identidad vigente ya cambio: se descarta, nunca se aplica un mensaje de error', async () => {
    let identidadVigente = true
    const { cliente, upsertSpy } = fakeCliente({
      upsertResultado: { error: null },
      getUserResultado: () =>
        esperar(5).then(() => {
          // El usuario cambia de empresa/periodo mientras auth.getUser()
          // todavia esta en curso.
          identidadVigente = false
          return { data: { user: null }, error: { message: 'Failed to fetch' } }
        }),
    })

    const resultado = await cerrarPeriodoBancario(cliente, paramsSinUsuarioConocido, () => identidadVigente)

    expect(resultado.tipo).toBe('descartado')
    // Al descartarse por el error de auth.getUser(), nunca debe llegar a
    // intentar el upsert.
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('auth.getUser() resuelve con EXITO despues de que la identidad vigente ya cambio: se descarta antes de intentar el upsert', async () => {
    let identidadVigente = true
    const { cliente, upsertSpy } = fakeCliente({
      upsertResultado: { error: null },
      getUserResultado: () =>
        esperar(5).then(() => {
          identidadVigente = false
          return { data: { user: { id: 'user-1' } }, error: null }
        }),
    })

    const resultado = await cerrarPeriodoBancario(cliente, paramsSinUsuarioConocido, () => identidadVigente)

    expect(resultado.tipo).toBe('descartado')
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('auth.getUser() falla mientras la identidad SIGUE vigente: SI se reporta como error controlado', async () => {
    const { cliente } = fakeCliente({
      getUserResultado: { data: { user: null }, error: { message: 'Failed to fetch' } },
    })

    const resultado = await cerrarPeriodoBancario(cliente, paramsSinUsuarioConocido, () => true)

    expect(resultado.tipo).toBe('error')
    if (resultado.tipo === 'error') {
      expect(resultado.mensaje).not.toContain('Failed to fetch')
    }
  })
})
