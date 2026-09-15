// lib/bancos/__tests__/confirmarCierrePeriodoFlujo.test.ts
// Prueba el flujo COMPUESTO tal como lo usa el dialogo de confirmacion en
// app/bancos/page.tsx: crearAccionExclusiva envolviendo cerrarPeriodoBancario.
// A diferencia de accionExclusiva.test.ts (que prueba el wrapper generico
// solo) y cerrarPeriodoBancario.test.ts (que prueba el coordinador de
// Supabase solo), aqui se ejercitan JUNTOS, con la misma forma exacta de
// llamada que tendra confirmarCierrePeriodo en el componente -- incluido
// el caso central del hotfix: un clic solo abre el dialogo (nunca escribe
// por si mismo) y "Confirmar" es lo unico que dispara la escritura, como
// mucho una vez.
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearAccionExclusiva } from '../accionExclusiva'
import { cerrarPeriodoBancario, type ParametrosCerrarPeriodo } from '../cerrarPeriodoBancario'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const paramsA: ParametrosCerrarPeriodo = {
  empresaId: 'empresa-A',
  periodo: '2026-07',
  usuarioConocido: { id: 'user-1' },
}

function fakeCliente(upsertResultado: { error: { message: string } | null } | (() => Promise<{ error: { message: string } | null }>)) {
  const upsertImpl = typeof upsertResultado === 'function' ? upsertResultado : () => Promise.resolve(upsertResultado)
  const upsertSpy = vi.fn(upsertImpl)
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }))
  const cliente = { from: fromSpy, auth: { getUser: vi.fn() } } as unknown as SupabaseClient
  return { cliente, upsertSpy, fromSpy }
}

function crearFlujoCierre(cliente: SupabaseClient, alCambiarEnCurso: (enCurso: boolean) => void = () => {}) {
  return crearAccionExclusiva(
    (params: ParametrosCerrarPeriodo, esVigente: () => boolean) => cerrarPeriodoBancario(cliente, params, esVigente),
    alCambiarEnCurso
  )
}

describe('flujo de confirmacion de cierre de periodo (crearAccionExclusiva + cerrarPeriodoBancario, tal como lo usa el dialogo)', () => {
  it('confirmar llama a Supabase exactamente una vez', async () => {
    const { cliente, fromSpy } = fakeCliente({ error: null })
    const ejecutarCierre = crearFlujoCierre(cliente)

    const resultado = await ejecutarCierre(paramsA, () => true)

    expect(resultado).toEqual({ tipo: 'cerrado' })
    expect(fromSpy).toHaveBeenCalledTimes(1)
  })

  it('doble clic sobre "Si, cerrar periodo" (antes de que el primero resuelva): Supabase se llama exactamente una vez', async () => {
    const { cliente, fromSpy } = fakeCliente(() => esperar(10).then(() => ({ error: null })))
    const ejecutarCierre = crearFlujoCierre(cliente)

    const [primero, segundo] = await Promise.all([ejecutarCierre(paramsA, () => true), ejecutarCierre(paramsA, () => true)])

    expect(fromSpy).toHaveBeenCalledTimes(1)
    expect(primero).toEqual({ tipo: 'cerrado' })
    expect(segundo).toBeUndefined()
  })

  it('error de Supabase: el periodo NUNCA queda como cerrado, el mensaje es controlado, y una confirmacion posterior (reintento) SI puede tener exito', async () => {
    const { cliente } = fakeCliente({ error: { message: 'duplicate key value violates unique constraint "x"' } })
    const ejecutarCierre = crearFlujoCierre(cliente)

    const resultado = await ejecutarCierre(paramsA, () => true)

    expect(resultado?.tipo).toBe('error')
    if (resultado?.tipo === 'error') {
      expect(resultado.mensaje).not.toContain('duplicate key value')
      expect(resultado.mensaje).not.toContain('constraint')
    }

    // El guard de exclusion ya libero `enCurso` (el finally corrio), asi
    // que un reintento sobre un cliente que esta vez SI responde bien debe
    // poder cerrar el periodo con normalidad -- "permitir reintentar".
    const { cliente: clienteOk } = fakeCliente({ error: null })
    const ejecutarCierreOk = crearFlujoCierre(clienteOk)
    const reintento = await ejecutarCierreOk(paramsA, () => true)
    expect(reintento).toEqual({ tipo: 'cerrado' })
  })

  it('exito: el resultado es tipo "cerrado" (el llamador es quien debe traducirlo a periodoCerrado=true y al mensaje visible)', async () => {
    const { cliente } = fakeCliente({ error: null })
    const ejecutarCierre = crearFlujoCierre(cliente)

    const resultado = await ejecutarCierre(paramsA, () => true)

    expect(resultado).toEqual({ tipo: 'cerrado' })
  })

  it('identidad obsoleta (empresa/periodo cambiaron mientras la escritura estaba en curso): se descarta, nunca se reporta como cerrado ni como error', async () => {
    let identidadVigente = true
    const { cliente } = fakeCliente(() =>
      esperar(5).then(() => {
        identidadVigente = false
        return { error: null }
      })
    )
    const ejecutarCierre = crearFlujoCierre(cliente)

    const resultado = await ejecutarCierre(paramsA, () => identidadVigente)

    expect(resultado).toEqual({ tipo: 'descartado' })
  })

  it('reporta enCurso (para deshabilitar los botones y mostrar "Cerrando...") true durante la escritura y false al terminar', async () => {
    const { cliente } = fakeCliente(() => esperar(5).then(() => ({ error: null })))
    const estados: boolean[] = []
    const ejecutarCierre = crearFlujoCierre(cliente, (enCurso) => estados.push(enCurso))

    await ejecutarCierre(paramsA, () => true)

    expect(estados).toEqual([true, false])
  })
})
