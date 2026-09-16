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

// Excel puede entregar una fecha como objeto Date (si se lee con
// cellDates: true, como aqui) o como texto. Sin un archivo real de AV
// Villas no se puede reducir a un unico formato de texto -- se aceptan
// 'YYYY-MM-DD', 'YYYY/MM/DD' y 'DD/MM/YYYY' (los mismos formatos ya vistos
// en lib/bancos/config.ts para otros bancos).
function normalizarFecha(valor: unknown): string | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    // SheetJS (cellDates: true) construye estas fechas como medianoche UTC
    // -- leerlas con los getters LOCALES (getFullYear/getMonth/getDate)
    // desplaza la fecha un día en timezones negativos (ej. Colombia
    // UTC-5), exactamente el mismo bug ya documentado y corregido en
    // construirPeriodo (app/bancos/page.tsx). Se leen con los getters UTC.
    const y = valor.getUTCFullYear()
    const m = String(valor.getUTCMonth() + 1).padStart(2, '0')
    const d = String(valor.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof valor === 'string') {
    const texto = valor.trim()
    let m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(texto)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return null
}

// Quita simbolo de moneda y separador de miles ('.', segun config.ts para
// AV Villas), conserva el signo y trata ',' como separador decimal.
function normalizarValor(valor: unknown): number | null {
  if (typeof valor === 'number' && isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const limpio = valor.trim().replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.')
    if (limpio === '') return null
    const n = Number(limpio)
    if (isFinite(n)) return n
  }
  return null
}

export function parsearExtractoAvVillas(bytes: ArrayBuffer, nombreArchivo: string): ResultadoParseoAvVillas {
  const esCsv = nombreArchivo.trim().toLowerCase().endsWith('.csv')

  let libro: XLSX.WorkBook
  try {
    // CSV se decodifica explícitamente como texto UTF-8 y se lee con
    // `type: 'string'` -- pasar los bytes crudos de un CSV con
    // `type: 'array'` hace que SheetJS los interprete como datos binarios
    // (no como texto UTF-8), lo que corrompe cualquier encabezado o valor
    // con tildes/eñes (ej. "DESCRIPCIÓN TRANSACCIÓN" -> "DESCRIPCIÃN
    // TRANSACCIÃN") sin lanzar ningún error -- el archivo se "leía" pero
    // ninguna fila coincidía con las columnas esperadas. Confirmado
    // empíricamente antes de este cambio (ver el commit). XLSX (binario)
    // sigue leyéndose con `type: 'array'`, que es la forma correcta para
    // ese formato.
    libro = esCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', cellDates: true })
      : XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch {
    return { ok: false, error: 'No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.' }
  }

  const nombreHoja = libro.SheetNames[0]
  if (!nombreHoja) return { ok: false, error: 'El archivo no contiene ninguna hoja de datos.' }

  const hoja = libro.Sheets[nombreHoja]
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
      filasConError.push({ fila: numeroFila, motivo: 'Fecha con formato no reconocido o columna vacía.' })
      return
    }
    if (!descripcion) {
      filasConError.push({ fila: numeroFila, motivo: 'Descripción vacía.' })
      return
    }
    if (valor === null) {
      filasConError.push({ fila: numeroFila, motivo: 'Valor no numérico o vacío.' })
      return
    }

    movimientos.push({ fila: numeroFila, fecha, descripcion, valor })
  })

  return { ok: true, movimientos, filasConError, totalFilasLeidas: filas.length }
}
