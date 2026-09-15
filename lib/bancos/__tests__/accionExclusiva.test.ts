import { describe, it, expect, vi } from 'vitest'
import { crearAccionExclusiva } from '../accionExclusiva'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('crearAccionExclusiva', () => {
  it('una sola invocacion: llama a la accion subyacente exactamente una vez y reporta enCurso true y luego false', async () => {
    const accion = vi.fn(async () => 'ok')
    const estados: boolean[] = []
    const ejecutar = crearAccionExclusiva(accion, (enCurso) => estados.push(enCurso))

    const resultado = await ejecutar()

    expect(accion).toHaveBeenCalledTimes(1)
    expect(resultado).toBe('ok')
    expect(estados).toEqual([true, false])
  })

  it('doble clic -- dos invocaciones casi simultaneas, antes de que la primera resuelva: la accion subyacente se llama exactamente una vez', async () => {
    const accion = vi.fn(async () => {
      await esperar(10)
      return 'ok'
    })
    const ejecutar = crearAccionExclusiva(accion, () => {})

    const [primerClic, segundoClic] = await Promise.all([ejecutar(), ejecutar()])

    expect(accion).toHaveBeenCalledTimes(1)
    expect(primerClic).toBe('ok')
    // El segundo clic, disparado mientras el primero seguia en curso, se
    // descarta sin llegar a invocar la accion -- nunca dispara una
    // solicitud duplicada.
    expect(segundoClic).toBeUndefined()
  })

  it('tras completarse una ejecucion, una invocacion nueva SI dispara la accion de nuevo (permite reintentar)', async () => {
    const accion = vi.fn(async () => 'ok')
    const ejecutar = crearAccionExclusiva(accion, () => {})

    await ejecutar()
    await ejecutar()

    expect(accion).toHaveBeenCalledTimes(2)
  })

  it('si la accion subyacente lanza, enCurso igual vuelve a false (no se queda bloqueada para siempre)', async () => {
    const accion = vi.fn(async () => {
      throw new Error('boom')
    })
    const estados: boolean[] = []
    const ejecutar = crearAccionExclusiva(accion, (enCurso) => estados.push(enCurso))

    await expect(ejecutar()).rejects.toThrow('boom')
    expect(estados).toEqual([true, false])

    // Y una invocacion posterior vuelve a intentarlo con normalidad.
    const accionOk = vi.fn(async () => 'ok')
    const ejecutarOk = crearAccionExclusiva(accionOk, () => {})
    await expect(ejecutarOk()).resolves.toBe('ok')
  })

  it('pasa los argumentos exactos a la accion subyacente', async () => {
    const accion = vi.fn(async (a: string, b: number) => `${a}-${b}`)
    const ejecutar = crearAccionExclusiva(accion, () => {})

    const resultado = await ejecutar('empresa-A', 42)

    expect(accion).toHaveBeenCalledWith('empresa-A', 42)
    expect(resultado).toBe('empresa-A-42')
  })
})
