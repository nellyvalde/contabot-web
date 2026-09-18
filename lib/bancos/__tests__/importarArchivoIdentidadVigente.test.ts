// lib/bancos/__tests__/importarArchivoIdentidadVigente.test.ts
// Prueba CONDUCTUAL (no solo inspección de código fuente) de la guardia
// de identidad vigente que protege la lectura/parseo de archivo en
// app/bancos/importar/page.tsx (handleArchivoSeleccionado): la misma
// composición exacta -- ejecutarSiVigente envolviendo
// (file.arrayBuffer() + parsearExtractoAvVillas), con `esVigente`
// comparando empresaId/cuentaId capturados contra los "renderizados" --
// se ejercita aquí con un objeto `archivo` falso cuyo `arrayBuffer()`
// tiene un retraso controlable, exactamente como en los demás
// coordinadores de este repo (ver confirmarCierrePeriodoFlujo.test.ts).
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { ejecutarSiVigente, claveConsulta, type EstadoConsultaVigente } from '../consultaVigente'
import { parsearExtractoAvVillas, type ResultadoParseoAvVillas } from '../parsearExtractoAvVillas'

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function construirXlsxBytes(): ArrayBuffer {
  const hoja = XLSX.utils.json_to_sheet([{ FECHA: '2026-07-15', 'DESCRIPCIÓN TRANSACCIÓN': 'PAGO X', VALOR: 1000 }])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

// Simula un `File` del navegador cuyo `.arrayBuffer()` tarda `retrasoMs`
// en resolver -- el mismo tiempo en que la empresa/cuenta activas pueden
// cambiar antes de que la lectura termine.
function archivoFalso(retrasoMs: number, nombre = 'extracto.xlsx') {
  return {
    name: nombre,
    arrayBuffer: () => esperar(retrasoMs).then(() => construirXlsxBytes()),
  }
}

function crearEstado(): EstadoConsultaVigente {
  let clave = ''
  return {
    obtenerClaveVigente: () => clave,
    establecerClaveVigente: (c: string) => { clave = c },
  }
}

// Reproduce exactamente el cuerpo de la tarea de handleArchivoSeleccionado:
// lee el archivo y lo parsea, sin dejar escapar una excepción.
async function tareaLeerYParsear(archivo: { name: string; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ResultadoParseoAvVillas> {
  try {
    const bytes = await archivo.arrayBuffer()
    return parsearExtractoAvVillas(bytes, archivo.name)
  } catch {
    return { ok: false, error: 'No se pudo leer el archivo.' }
  }
}

describe('identidad vigente al seleccionar un archivo (app/bancos/importar/page.tsx, handleArchivoSeleccionado)', () => {
  it('caso normal -- nada cambia mientras se lee el archivo: el resultado SÍ se aplica', async () => {
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    const empresaRenderizada = 'empresa-A'
    const cuentaRenderizada = 'cuenta-1'

    const empresaId = 'empresa-A'
    const cuentaId = 'cuenta-1'
    const clave = claveConsulta(empresaId, cuentaId, 'token-1')
    const esVigente = () => empresaRenderizada === empresaId && cuentaRenderizada === cuentaId

    await ejecutarSiVigente(estado, clave, () => tareaLeerYParsear(archivoFalso(5)), (r) => aplicados.push(r), esVigente)

    expect(aplicados).toHaveLength(1)
    expect(aplicados[0].ok).toBe(true)
  })

  it('la empresa activa cambia MIENTRAS el archivo se está leyendo: el resultado se descarta, nunca se aplica', async () => {
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    let empresaRenderizada: string | undefined = 'empresa-A'
    const cuentaRenderizada = 'cuenta-1'

    const empresaId = 'empresa-A'
    const cuentaId = 'cuenta-1'
    const clave = claveConsulta(empresaId, cuentaId, 'token-1')
    const esVigente = () => empresaRenderizada === empresaId && cuentaRenderizada === cuentaId

    const promesa = ejecutarSiVigente(estado, clave, () => tareaLeerYParsear(archivoFalso(20)), (r) => aplicados.push(r), esVigente)

    // El usuario cambia de empresa ANTES de que termine de leerse el
    // archivo -- sin seleccionar un archivo nuevo (por eso la clave nunca
    // cambia; solo el chequeo de identidad puede detectar esto).
    await esperar(5)
    empresaRenderizada = 'empresa-B'

    await promesa

    expect(aplicados).toEqual([])
  })

  it('la cuenta seleccionada cambia MIENTRAS el archivo se está leyendo: el resultado se descarta, nunca se aplica', async () => {
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    const empresaRenderizada = 'empresa-A'
    let cuentaRenderizada = 'cuenta-1'

    const empresaId = 'empresa-A'
    const cuentaId = 'cuenta-1'
    const clave = claveConsulta(empresaId, cuentaId, 'token-1')
    const esVigente = () => empresaRenderizada === empresaId && cuentaRenderizada === cuentaId

    const promesa = ejecutarSiVigente(estado, clave, () => tareaLeerYParsear(archivoFalso(20)), (r) => aplicados.push(r), esVigente)

    await esperar(5)
    cuentaRenderizada = 'cuenta-2' // el usuario elige otra cuenta antes de terminar de leer

    await promesa

    expect(aplicados).toEqual([])
  })

  it('un segundo archivo se selecciona ANTES de que el primero termine de leerse: solo se aplica el resultado del segundo', async () => {
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    const empresaRenderizada = 'empresa-A'
    const cuentaRenderizada = 'cuenta-1'
    const esVigente = () => empresaRenderizada === 'empresa-A' && cuentaRenderizada === 'cuenta-1'

    const claveArchivo1 = claveConsulta('empresa-A', 'cuenta-1', 'token-1')
    const claveArchivo2 = claveConsulta('empresa-A', 'cuenta-1', 'token-2')

    const promesa1 = ejecutarSiVigente(estado, claveArchivo1, () => tareaLeerYParsear(archivoFalso(30, 'archivo-1.xlsx')), (r) => aplicados.push(r), esVigente)
    // El segundo archivo se selecciona casi de inmediato -- su lectura es
    // más rápida y su clave reemplaza a la del primero.
    const promesa2 = ejecutarSiVigente(estado, claveArchivo2, () => tareaLeerYParsear(archivoFalso(5, 'archivo-2.xlsx')), (r) => aplicados.push(r), esVigente)

    await Promise.all([promesa1, promesa2])

    // Solo UN resultado se aplicó -- el del archivo más reciente. El
    // primero, aunque su propia identidad (empresa/cuenta) seguía vigente,
    // fue superado por una operación de archivo más nueva.
    expect(aplicados).toHaveLength(1)
  })

  it('empresa activa pasa a undefined (se quita la empresa) mientras se lee el archivo: se descarta', async () => {
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    let empresaRenderizada: string | undefined = 'empresa-A'
    const cuentaRenderizada = 'cuenta-1'

    const empresaId = 'empresa-A'
    const cuentaId = 'cuenta-1'
    const clave = claveConsulta(empresaId, cuentaId, 'token-1')
    const esVigente = () => empresaRenderizada === empresaId && cuentaRenderizada === cuentaId

    const promesa = ejecutarSiVigente(estado, clave, () => tareaLeerYParsear(archivoFalso(20)), (r) => aplicados.push(r), esVigente)

    await esperar(5)
    empresaRenderizada = undefined

    await promesa

    expect(aplicados).toEqual([])
  })

  it('primer archivo lento y válido en curso; se selecciona un segundo archivo que falla la validación (nunca llega a llamar ejecutarSiVigente): el primero nunca aplica movimientos', async () => {
    // Reproduce el bug corregido: antes, la clave vigente solo se
    // reemplazaba DENTRO de ejecutarSiVigente. Un archivo nuevo que falla
    // validarArchivoAntesDeLeer retorna ANTES de llegar a llamar
    // ejecutarSiVigente, asi que nunca reemplazaba la clave -- un primer
    // archivo lento y valido, todavia en curso, conservaba su clave
    // vigente y podia aplicar sus movimientos igual. El fix invalida la
    // clave de forma sincronica al INICIO de handleArchivoSeleccionado,
    // antes de la validacion -- se reproduce aqui llamando
    // estado.establecerClaveVigente(...) directamente, sin pasar por
    // ejecutarSiVigente, exactamente como hace ahora el componente.
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    const empresaRenderizada = 'empresa-A'
    const cuentaRenderizada = 'cuenta-1'
    const esVigente = () => empresaRenderizada === 'empresa-A' && cuentaRenderizada === 'cuenta-1'

    const claveArchivo1 = claveConsulta('empresa-A', 'cuenta-1', 'token-1')
    const promesa1 = ejecutarSiVigente(
      estado,
      claveArchivo1,
      () => tareaLeerYParsear(archivoFalso(30, 'archivo-1.xlsx')),
      (r) => aplicados.push(r),
      esVigente
    )

    // El usuario selecciona un segundo archivo casi de inmediato, pero
    // este falla la validación de tipo/tamaño -- en el componente real,
    // handleArchivoSeleccionado invalida la clave ANTES de validar,
    // independientemente de si la validación falla después.
    await esperar(5)
    const claveArchivo2 = claveConsulta('empresa-A', 'cuenta-1', 'token-2')
    estado.establecerClaveVigente(claveArchivo2) // invalidación sincrónica, sin pasar por ejecutarSiVigente
    // (la validación del segundo archivo falla aquí en el componente real
    // -- no se llega a invocar ejecutarSiVigente para él, así que nunca se
    // agrega nada nuevo a `aplicados` por su parte)

    await promesa1

    // El primer archivo -- aunque válido y con su propia identidad
    // empresa/cuenta todavía vigente -- nunca debe aplicar resultados: su
    // clave ya no es la vigente.
    expect(aplicados).toEqual([])
  })

  it('cambiar de cuenta invalida sincrónicamente la clave vigente, incluso si esVigente() (basado en el ref renderizado) todavía no reflejó el cambio', async () => {
    // Reproduce la corrección de "cerrar la ventana entre el evento y el
    // siguiente commit de React": handleCuentaSeleccionada ahora escribe
    // consultaArchivoRef.current = '' de forma SINCRONICA, en el mismo
    // evento, sin esperar a que el useLayoutEffect actualice
    // cuentaSeleccionadaRenderizadaRef. Aquí se simula el caso extremo en
    // que esVigente() (el chequeo por ref renderizado) todavía diría "sí,
    // sigue vigente" -- la protección por CLAVE, invalidada de inmediato,
    // debe bastar por sí sola para descartar el resultado.
    const estado = crearEstado()
    const aplicados: ResultadoParseoAvVillas[] = []
    // esVigente() nunca cambia en esta prueba -- deliberadamente, para
    // aislar que la protección por clave funciona incluso sin ayuda del
    // chequeo de identidad.
    const esVigente = () => true

    const clave = claveConsulta('empresa-A', 'cuenta-1', 'token-1')
    const promesa = ejecutarSiVigente(estado, clave, () => tareaLeerYParsear(archivoFalso(20)), (r) => aplicados.push(r), esVigente)

    await esperar(5)
    // Simula handleCuentaSeleccionada: invalidación sincrónica de la
    // clave, disparada por el cambio de cuenta, independiente del ref.
    estado.establecerClaveVigente('')

    await promesa

    expect(aplicados).toEqual([])
  })
})
