// lib/bancos/parsearExtractoAvVillas.ts
// Bloque B del nuevo flujo de importacion de extractos bancarios: parseo
// DETERMINISTICO (sin IA) de un extracto de AV Villas en formato .xlsx o
// .csv -- nunca .pdf ni .xls (fuera de alcance de este MVP). El PDF
// historico de AV Villas ya tiene su propia definicion, con columnas
// distintas, en lib/bancos/config.ts (BANCOS.av_villas, tipo 'pdf') --
// este archivo NO la reutiliza ni la modifica.
//
// IMPORTANTE -- todavia NO existe un archivo real de AV Villas en formato
// XLSX/CSV, ni sus encabezados exactos estan confirmados. Las 3 columnas
// de COLUMNAS_AV_VILLAS_XLSX_CSV de abajo son un SUPUESTO de partida
// (tomado del unico precedente documentado en este repo -- las mismas 3
// columnas que ya describe BANCOS.av_villas para el PDF), NO una
// confirmacion. Este parser esta probado UNICAMENTE contra fixtures
// SINTETICOS construidos en memoria (ver parsearExtractoAvVillas.test.ts)
// -- nunca contra un archivo real. No debe presentarse como validado
// hasta confirmar (o corregir) esta forma con un archivo real o una
// respuesta explicita de encabezados.
//
// Esta funcion NUNCA llama a Supabase ni a ningun servicio de red -- recibe
// bytes ya leidos en memoria por el llamador y devuelve un resultado puro.
import * as XLSX from 'xlsx'

export type MovimientoParseado = {
  fila: number // 1-based, posicion real en el archivo (incluye el encabezado como fila 1)
  fecha: string // 'YYYY-MM-DD'
  descripcion: string
  valor: number
}

export type FilaConError = {
  fila: number
  motivo: string
}

export type ResultadoParseoAvVillas =
  | { ok: true; movimientos: MovimientoParseado[]; filasConError: FilaConError[]; totalFilasLeidas: number }
  | { ok: false; error: string }

// Ver el aviso de cabecera: supuesto sin confirmar, pendiente de un
// archivo real o de encabezados exactos.
const COLUMNAS_AV_VILLAS_XLSX_CSV = {
  fecha: 'FECHA',
  descripcion: 'DESCRIPCIÓN TRANSACCIÓN',
  valor: 'VALOR',
}

const EXTENSIONES_PERMITIDAS = ['.xlsx', '.csv']
// Mismo limite que exige iniciar_o_reintentar_importacion (Bloque C, no
// implementado todavia) -- se valida aqui tambien, antes de gastar tiempo
// parseando un archivo que esa RPC rechazaria de todas formas.
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024

export function validarArchivoAntesDeLeer(
  nombreArchivo: string,
  tamanoBytes: number
): { ok: true } | { ok: false; error: string } {
  const nombre = (nombreArchivo || '').trim().toLowerCase()
  const tieneExtensionValida = EXTENSIONES_PERMITIDAS.some(ext => nombre.endsWith(ext))
  if (!tieneExtensionValida) {
    return { ok: false, error: 'Solo se admiten archivos .xlsx o .csv.' }
  }
  if (!tamanoBytes || tamanoBytes <= 0) {
    return { ok: false, error: 'El archivo está vacío.' }
  }
  if (tamanoBytes > TAMANO_MAXIMO_BYTES) {
    return { ok: false, error: 'El archivo supera el tamaño máximo permitido (10 MB).' }
  }
  return { ok: true }
}

// --- Fechas -----------------------------------------------------------
// No basta con que la fecha calce con una forma "\d{4}-\d{2}-\d{2}" --
// esa forma la cumple igual '2026-02-30' o '2026-13-01'. Se valida el
// calendario real: el mes debe estar en 1..12, y el dia no puede superar
// la cantidad real de dias de ESE mes en ESE año (respeta años bisiestos,
// vía la aritmetica de Date.UTC, que implementa la regla gregoriana
// completa: divisible entre 4, salvo divisible entre 100 y no entre 400).

// Date.UTC(anio, mes, 0) retrocede al ultimo dia del mes ANTERIOR al
// indice `mes` (0-indexado en Date) -- pasando el `mes` 1-indexado tal
// cual como si fuera "el mes siguiente" 0-indexado, dia 0 da exactamente
// el ultimo dia del mes 1-indexado que se quiere consultar.
function diasEnMes(anio: number, mes1Indexado: number): number {
  return new Date(Date.UTC(anio, mes1Indexado, 0)).getUTCDate()
}

function construirFechaSiValida(anio: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasEnMes(anio, mes)) return null
  const y = String(anio).padStart(4, '0')
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Excel puede entregar una fecha como objeto Date (si se lee con
// cellDates: true, como aqui) o como texto. Sin un archivo real de AV
// Villas no se puede reducir a un unico formato de texto -- se aceptan
// 'YYYY-MM-DD', 'YYYY/MM/DD' y 'DD/MM/YYYY' (los mismos formatos ya vistos
// en lib/bancos/config.ts para otros bancos), siempre validados contra el
// calendario real, nunca solo por forma.
function normalizarFecha(valor: unknown): string | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    // SheetJS (cellDates: true) construye estas fechas como medianoche UTC
    // -- leerlas con los getters LOCALES (getFullYear/getMonth/getDate)
    // desplaza la fecha un día en timezones negativos (ej. Colombia
    // UTC-5), exactamente el mismo bug ya documentado y corregido en
    // construirPeriodo (app/bancos/page.tsx). Se leen con los getters UTC.
    return construirFechaSiValida(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate())
  }
  if (typeof valor === 'string') {
    const texto = valor.trim()
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
    if (m) return construirFechaSiValida(Number(m[1]), Number(m[2]), Number(m[3]))
    m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(texto)
    if (m) return construirFechaSiValida(Number(m[1]), Number(m[2]), Number(m[3]))
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
    if (m) return construirFechaSiValida(Number(m[3]), Number(m[2]), Number(m[1]))
  }
  return null
}

// --- Valores monetarios -------------------------------------------------
// Parser DETERMINISTICO: reconoce EXACTAMENTE los formatos ya aprobados y
// nunca "adivina" un separador ambiguo. La version anterior hacia
// .replace(/\./g,'') incondicionalmente (asumiendo que '.' siempre es
// separador de miles) -- eso convertia '150000.50' (punto DECIMAL) en
// '15000050', una cantidad 100000 veces mayor, en silencio, sin ningun
// error. Cada formato de abajo tiene un patron propio y excluyente; un
// texto que no calce con NINGUNO se rechaza (retorna null) en vez de
// arriesgar una cantidad equivocada.
const PATRON_ENTERO = /^-?\d+$/ // 150000
const PATRON_DECIMAL_COMA = /^-?\d+,\d{2}$/ // 150000,50 (coma decimal, sin separador de miles)
const PATRON_DECIMAL_PUNTO = /^-?\d+\.\d{2}$/ // 150000.50 (punto decimal, sin separador de miles)
const PATRON_MILES_PUNTO_DECIMAL_COMA = /^-?\d{1,3}(\.\d{3})+,\d{2}$/ // 150.000,50 (punto miles, coma decimal)
const PATRON_MILES_COMA_DECIMAL_PUNTO = /^-?\d{1,3}(,\d{3})+\.\d{2}$/ // 150,000.50 (coma miles, punto decimal)

function normalizarValor(valor: unknown): number | null {
  if (typeof valor === 'number' && isFinite(valor)) return valor
  if (typeof valor !== 'string') return null

  const sinMoneda = valor.trim().replace(/^\$\s*/, '')
  if (sinMoneda === '') return null

  if (PATRON_ENTERO.test(sinMoneda)) return Number(sinMoneda)
  if (PATRON_DECIMAL_COMA.test(sinMoneda)) return Number(sinMoneda.replace(',', '.'))
  if (PATRON_DECIMAL_PUNTO.test(sinMoneda)) return Number(sinMoneda)
  if (PATRON_MILES_PUNTO_DECIMAL_COMA.test(sinMoneda)) return Number(sinMoneda.replace(/\./g, '').replace(',', '.'))
  if (PATRON_MILES_COMA_DECIMAL_PUNTO.test(sinMoneda)) return Number(sinMoneda.replace(/,/g, ''))

  // Cualquier otra forma (ej. '1.234' o '1,234', sin decimal explícito de
  // 2 dígitos ni agrupación de miles completa) es AMBIGUA -- se rechaza
  // en vez de adivinar.
  return null
}

function leerLibro(bytes: ArrayBuffer, esCsv: boolean): { ok: true; libro: XLSX.WorkBook } | { ok: false; error: string } {
  try {
    if (esCsv) {
      // CSV se decodifica explícitamente como texto UTF-8 y se lee con
      // `type: 'string'` -- pasar los bytes crudos de un CSV con
      // `type: 'array'` hace que SheetJS los interprete como datos
      // binarios (no como texto UTF-8), lo que corrompe cualquier
      // encabezado o valor con tildes/eñes sin lanzar ningún error.
      // `fatal: true` hace que una secuencia de bytes que NO sea UTF-8
      // válido lance en vez de sustituir en silencio por el caracter de
      // reemplazo U+FFFD -- una sustitución silenciosa podría corromper un
      // encabezado o una descripción de forma indetectable.
      const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return { ok: true, libro: XLSX.read(texto, { type: 'string', cellDates: true }) }
    }
    return { ok: true, libro: XLSX.read(bytes, { type: 'array', cellDates: true }) }
  } catch {
    return {
      ok: false,
      error: esCsv
        ? 'El archivo no está codificado en UTF-8. Vuelve a exportarlo con esa codificación.'
        : 'No se pudo leer el archivo. Verifica que sea un .xlsx válido.',
    }
  }
}

export function parsearExtractoAvVillas(bytes: ArrayBuffer, nombreArchivo: string): ResultadoParseoAvVillas {
  const esCsv = nombreArchivo.trim().toLowerCase().endsWith('.csv')

  const lectura = leerLibro(bytes, esCsv)
  if (!lectura.ok) return lectura

  const nombreHoja = lectura.libro.SheetNames[0]
  if (!nombreHoja) return { ok: false, error: 'El archivo no contiene ninguna hoja de datos.' }

  const hoja = lectura.libro.Sheets[nombreHoja]

  // Se valida la presencia de las 3 columnas obligatorias UNA SOLA VEZ,
  // leyendo primero solo la fila de encabezados (header: 1) -- si falta
  // alguna, se devuelve un único error general nombrándola, en vez de
  // dejar que cada fila del archivo genere su propio error repetido (ej.
  // "Descripción vacía" en cientos de filas cuando el problema real es
  // que la columna no existe en absoluto).
  const filasComoArreglo: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null })
  if (filasComoArreglo.length === 0) {
    return { ok: false, error: 'El archivo no contiene ninguna fila.' }
  }

  const encabezados = (filasComoArreglo[0] || []).map(h => (typeof h === 'string' ? h.trim() : h))
  const columnasRequeridas = [
    COLUMNAS_AV_VILLAS_XLSX_CSV.fecha,
    COLUMNAS_AV_VILLAS_XLSX_CSV.descripcion,
    COLUMNAS_AV_VILLAS_XLSX_CSV.valor,
  ]
  const columnasFaltantes = columnasRequeridas.filter(c => !encabezados.includes(c))
  if (columnasFaltantes.length > 0) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el archivo: ${columnasFaltantes.join(', ')}.`,
    }
  }

  const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { defval: null })
  if (filas.length === 0) {
    return { ok: false, error: 'El archivo no contiene movimientos.' }
  }

  const movimientos: MovimientoParseado[] = []
  const filasConError: FilaConError[] = []

  filas.forEach((fila, indice) => {
    const numeroFila = indice + 2 // +1 por ser 1-based, +1 por la fila de encabezado
    const fecha = normalizarFecha(fila[COLUMNAS_AV_VILLAS_XLSX_CSV.fecha])
    const descripcionCruda = fila[COLUMNAS_AV_VILLAS_XLSX_CSV.descripcion]
    const descripcion = typeof descripcionCruda === 'string' ? descripcionCruda.trim() : ''
    const valor = normalizarValor(fila[COLUMNAS_AV_VILLAS_XLSX_CSV.valor])

    if (!fecha) {
      filasConError.push({ fila: numeroFila, motivo: 'Fecha con formato no reconocido, columna vacía o fecha calendáricamente inválida.' })
      return
    }
    if (!descripcion) {
      filasConError.push({ fila: numeroFila, motivo: 'Descripción vacía.' })
      return
    }
    if (valor === null) {
      filasConError.push({ fila: numeroFila, motivo: 'Valor no numérico, vacío, o en un formato no reconocido (revisa separadores de miles/decimales).' })
      return
    }

    movimientos.push({ fila: numeroFila, fecha, descripcion, valor })
  })

  return { ok: true, movimientos, filasConError, totalFilasLeidas: filas.length }
}
