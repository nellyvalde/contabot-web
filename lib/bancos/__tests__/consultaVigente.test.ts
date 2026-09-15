import { describe, it, expect } from 'vitest'
import { claveConsulta, ejecutarSiVigente, type EstadoConsultaVigente } from '../consultaVigente'

function crearEstado(): EstadoConsultaVigente & { valor: () => string } {
  let clave = ''
  return {
    obtenerClaveVigente: () => clave,
    establecerClaveVigente: (c: string) => { clave = c },
    valor: () => clave,
  }
}

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('claveConsulta', () => {
  it('distingue por empresaId aunque el periodo sea el mismo', () => {
    expect(claveConsulta('empresa-A', '2026-07')).not.toBe(claveConsulta('empresa-B', '2026-07'))
  })

  it('distingue por periodo aunque la empresa sea la misma', () => {
    expect(claveConsulta('empresa-A', '2026-07')).not.toBe(claveConsulta('empresa-A', '2026-08'))
  })

  it('es igual para los mismos valores', () => {
    expect(claveConsulta('empresa-A', '2026-07')).toBe(claveConsulta('empresa-A', '2026-07'))
  })
})

describe('ejecutarSiVigente', () => {
  it('aplica el resultado cuando ninguna consulta mas nueva la reemplazo', async () => {
    const estado = crearEstado()
    const aplicados: string[] = []
    await ejecutarSiVigente(estado, 'clave-unica', async () => 'dato', (r) => aplicados.push(r))
    expect(aplicados).toEqual(['dato'])
  })

  it('una respuesta tardia de la EMPRESA anterior no modifica la vista de la empresa nueva', async () => {
    const estado = crearEstado()
    const aplicados: string[] = []

    // La empresa A empieza a cargar (lenta)...
    const promesaA = ejecutarSiVigente(
      estado,
      claveConsulta('empresa-A', '2026-07'),
      () => esperar(40).then(() => 'datos-de-A'),
      (r) => aplicados.push(r)
    )
    // ...pero el usuario cambia a la empresa B antes de que A resuelva.
    const promesaB = ejecutarSiVigente(
      estado,
      claveConsulta('empresa-B', '2026-07'),
      () => esperar(5).then(() => 'datos-de-B'),
      (r) => aplicados.push(r)
    )

    await Promise.all([promesaA, promesaB])

    expect(aplicados).toEqual(['datos-de-B'])
  })

  it('una respuesta tardia de OTRO PERIODO (misma empresa) no modifica el periodo vigente', async () => {
    const estado = crearEstado()
    const aplicados: string[] = []

    const promesaJulio = ejecutarSiVigente(
      estado,
      claveConsulta('empresa-A', '2026-07'),
      () => esperar(40).then(() => 'datos-julio'),
      (r) => aplicados.push(r)
    )
    const promesaAgosto = ejecutarSiVigente(
      estado,
      claveConsulta('empresa-A', '2026-08'),
      () => esperar(5).then(() => 'datos-agosto'),
      (r) => aplicados.push(r)
    )

    await Promise.all([promesaJulio, promesaAgosto])

    expect(aplicados).toEqual(['datos-agosto'])
  })

  // --- El parametro `siguesSiendoVigente` cubre el HUECO que (1) solo no
  // puede cubrir: cuando nadie todavia disparo una consulta nueva del mismo
  // tipo (la clave-por-tipo no cambio), pero la identidad real en pantalla
  // (empresaId renderizado) ya no es la que inicio esta consulta.

  it('empresa A inicia una consulta y la empresa activa pasa a "ninguna" (undefined) antes de resolver: la respuesta de A no aplica ningun estado', async () => {
    const estado = crearEstado()
    const aplicados: string[] = []
    let empresaRenderizada: string | undefined = 'empresa-A'

    await ejecutarSiVigente(
      estado,
      claveConsulta('empresa-A'),
      () =>
        esperar(5).then(() => {
          // Mientras la consulta esta en curso, deja de haber empresa activa.
          empresaRenderizada = undefined
          return 'datos-A'
        }),
      (r) => aplicados.push(r),
      () => empresaRenderizada === 'empresa-A'
    )

    expect(aplicados).toEqual([])
  })

  it('empresa A inicia una consulta y el usuario cambia a B ANTES de que el efecto de B dispare su propia consulta -- la clave-por-tipo sigue siendo la de A (nada la reemplazo), pero la identidad ya no: A no debe aplicar nada', async () => {
    const estado = crearEstado()
    const aplicados: string[] = []
    let empresaRenderizada: string | undefined = 'empresa-A'

    const promesaA = ejecutarSiVigente(
      estado,
      claveConsulta('empresa-A'),
      () => esperar(20).then(() => 'datos-A'),
      (r) => aplicados.push(r),
      () => empresaRenderizada === 'empresa-A'
    )

    // El usuario cambia a B, pero deliberadamente NINGUNA consulta nueva se
    // dispara todavia -- simula el hueco entre el cambio de render y el
    // efecto que arrancaria la consulta de B. Si el codigo dependiera
    // UNICAMENTE de que una consulta nueva reemplace la clave anterior (como
    // antes de agregar este parametro), esta prueba fallaria: la clave
    // vigente para "empresa" seguiria siendo la de A.
    await esperar(5)
    empresaRenderizada = 'empresa-B'

    await promesaA

    expect(aplicados).toEqual([])
  })
})
