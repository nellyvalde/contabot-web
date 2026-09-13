import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Regresion del incidente de julio 2026: el flujo antiguo de carga de
// archivos en app/bancos/page.tsx hacia DELETE + INSERT directos sobre
// conciliaciones_bancarias sin proveer cuenta_id -- columna que PR 9a
// volvio NOT NULL. El INSERT fallaba despues de que el DELETE ya se
// habia aplicado, dejando el periodo vacio y la pantalla en blanco. Este
// hotfix no solo deshabilita visualmente la carga -- elimina el codigo
// por completo. Estas pruebas leen el codigo fuente real (no un mock)
// para demostrar que la ruta destructiva ya no existe, en vez de confiar
// unicamente en que un flag la desactive.
const rutaPagina = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../app/bancos/page.tsx'
)
const codigoFuente = readFileSync(rutaPagina, 'utf-8')

describe('app/bancos/page.tsx -- hotfix de seguridad de carga (post-incidente julio 2026)', () => {
  it('no contiene ninguna llamada .delete( -- el flujo de archivos ya no borra conciliaciones_bancarias', () => {
    expect(codigoFuente).not.toMatch(/\.delete\(/)
  })

  it('no contiene ninguna llamada .insert( -- el flujo de archivos ya no inserta resultados del parser antiguo', () => {
    expect(codigoFuente).not.toMatch(/\.insert\(/)
  })

  it('no existe ningun input de tipo archivo para subir extractos', () => {
    expect(codigoFuente).not.toMatch(/type="file"/)
  })

  it('los parsers y el cruce antiguos ya no son codigo activo (leerPDF/leerExcel/leerCSV/cruzarConDocumentos/handleArchivo)', () => {
    expect(codigoFuente).not.toMatch(/\bleerPDF\b/)
    expect(codigoFuente).not.toMatch(/\bleerExcel\b/)
    expect(codigoFuente).not.toMatch(/\bleerCSV\b/)
    expect(codigoFuente).not.toMatch(/\bcruzarConDocumentos\b/)
    expect(codigoFuente).not.toMatch(/\bhandleArchivo\b/)
  })

  it('muestra el mensaje de carga deshabilitada al usuario', () => {
    expect(codigoFuente).toMatch(/MENSAJE_CARGA_DESHABILITADA/)
  })

  it('nunca concatena el texto crudo de un error de Supabase en un mensaje mostrado al usuario', () => {
    expect(codigoFuente).not.toMatch(/\.message/)
  })

  it('maneja explicitamente los errores de Supabase en las funciones de carga -- no los silencia', () => {
    const ocurrencias = codigoFuente.match(/registrarErrorSupabase\(/g) || []
    expect(ocurrencias.length).toBeGreaterThanOrEqual(5)
  })

  it('conserva la carga y consulta de conciliaciones existentes (periodos y conciliaciones guardadas)', () => {
    expect(codigoFuente).toMatch(/cargarPeriodosDisponibles/)
    expect(codigoFuente).toMatch(/cargarConciliacionesGuardadas/)
  })

  it('el area principal decide su contenido con un unico booleano (ternario), no con dos condiciones && independientes que puedan ser ambas falsas', () => {
    expect(codigoFuente).toMatch(/hayResultadosParaMostrar\(resultados\.length\)\s*\?/)
  })
})
