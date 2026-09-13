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
})
