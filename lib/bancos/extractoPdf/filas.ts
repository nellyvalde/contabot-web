// lib/bancos/extractoPdf/filas.ts
// Fase 2: reconstrucción de movimientos a partir de líneas ya agrupadas.
// Una "línea de encabezado" (detectarEncabezado) abre un BLOQUE nuevo;
// las líneas siguientes se interpretan como filas de ESE bloque hasta que
// aparece el siguiente encabezado o se acaban las líneas del documento.
//
// Una línea se acepta como candidata a fila si (a) su primera palabra cae
// dentro de la columna FECHA del bloque y es una fecha calendáricamente
// válida, y (b) tiene al menos 2 palabras con forma de dinero. Esto ignora
// por ESTRUCTURA (nunca por palabras clave) cualquier línea que no empiece
// con una fecha en la columna correcta -- p. ej. la tabla de tasas de
// interés del extracto real, que nunca satisface esa condición, sin
// necesitar una lista de palabras como "INTERESES" o "TASA" a evitar.
//
// Corrección: cuál de esos dos últimos tokens de dinero es VALOR y cuál es
// SALDO ya NO se decide comparando contra la posición del ENCABEZADO (ver
// frontera.ts para la razón) -- se decide con una frontera derivada de los
// propios datos de CADA bloque. Por eso un bloque se procesa en varias
// sub-pasadas: primero se recolectan todas sus líneas candidatas
// (estructura pura, sin tocar la frontera), luego se infiere la frontera
// a partir de esas candidatas, y recién entonces se clasifica cada una.
import type { Linea } from './lineas'
import type { Encabezado } from './encabezados'
import { detectarEncabezado } from './encabezados'
import { parseFechaSiValida } from './fecha'
import { parseDineroACentavos } from './dinero'
import { normalizarTexto } from './texto'
import { inferirFronteraValorSaldo } from './frontera'

export type FilaCruda = {
  pagina: number
  fecha: string
  descripcion: string
  valorCentavos: number
  saldoCentavos: number
  bloqueIndice: number
  filaIndiceEnBloque: number
}

export type Bloque = {
  indice: number
  pagina: number
  encabezado: Encabezado
  filas: FilaCruda[]
}

export type ResultadoReconstruccion =
  | { ok: true; bloques: Bloque[] }
  | { ok: false; motivo: 'encabezado_no_reconocido' | 'fila_incompleta' | 'bloque_duplicado'; detalle: string }

// Margen de tolerancia, en puntos PDF, para el cruce entre la posición de
// la primera palabra de una línea y la columna FECHA del encabezado de su
// bloque -- cubre pequeñas diferencias de ancho de fuente entre el
// encabezado (negrita) y los datos. FECHA sí es estable entre páginas
// (medido contra el extracto real: offset de encabezado de apenas 3-5
// puntos), a diferencia de VALOR/SALDO -- por eso FECHA conserva este
// criterio y no usa una frontera derivada de los datos.
const TOLERANCIA_X = 20

function dentroDeTolerancia(x: number, referencia: number): boolean {
  return Math.abs(x - referencia) <= TOLERANCIA_X
}

type CandidataFila = {
  linea: Linea
  fecha: string
  descripcion: string
  valorTok: { i: number; centavos: number; x1: number }
  saldoTok: { i: number; centavos: number; x1: number }
}

function prepararCandidata(linea: Linea, encabezado: Encabezado): CandidataFila | 'incompleta' | null {
  const ws = linea.palabras
  if (ws.length === 0) return null

  const primera = ws[0]
  if (!dentroDeTolerancia(primera.x0, encabezado.fecha.x0)) return null
  const fecha = parseFechaSiValida(primera.texto)
  if (!fecha) return null

  const candidatosDinero: { i: number; centavos: number }[] = []
  for (let i = 1; i < ws.length; i++) {
    const c = parseDineroACentavos(ws[i].texto)
    if (c !== null) candidatosDinero.push({ i, centavos: c })
  }
  if (candidatosDinero.length < 2) return 'incompleta'

  const saldoTok = candidatosDinero[candidatosDinero.length - 1]
  const valorTok = candidatosDinero[candidatosDinero.length - 2]

  const descripcion = normalizarTexto(ws.slice(1, valorTok.i).map(w => w.texto).join(' '))
  if (!descripcion) return 'incompleta'

  return {
    linea,
    fecha,
    descripcion,
    valorTok: { i: valorTok.i, centavos: valorTok.centavos, x1: ws[valorTok.i].x1 },
    saldoTok: { i: saldoTok.i, centavos: saldoTok.centavos, x1: ws[saldoTok.i].x1 },
  }
}

type BloqueCrudo = { indice: number; pagina: number; encabezado: Encabezado; lineasCrudas: Linea[] }

function delimitarBloques(lineas: Linea[]): BloqueCrudo[] {
  const bloques: BloqueCrudo[] = []
  let actual: BloqueCrudo | null = null

  for (const linea of lineas) {
    const encabezado = detectarEncabezado(linea)
    if (encabezado) {
      actual = { indice: bloques.length, pagina: linea.pagina, encabezado, lineasCrudas: [] }
      bloques.push(actual)
      continue
    }
    if (!actual) continue // texto antes de cualquier encabezado (logo, dirección, etc.) -- se ignora
    actual.lineasCrudas.push(linea)
  }

  return bloques
}

export function reconstruirBloques(lineas: Linea[]): ResultadoReconstruccion {
  const bloquesCrudos = delimitarBloques(lineas)
  const bloques: Bloque[] = []

  for (const bc of bloquesCrudos) {
    const bloque: Bloque = { indice: bc.indice, pagina: bc.pagina, encabezado: bc.encabezado, filas: [] }
    bloques.push(bloque)

    // Sub-pasada 1: estructura pura (fecha en columna correcta + al menos
    // 2 tokens de dinero + descripción no vacía). Nada de esto depende de
    // dónde cae VALOR o SALDO.
    const candidatas: CandidataFila[] = []
    for (const linea of bc.lineasCrudas) {
      const r = prepararCandidata(linea, bc.encabezado)
      if (r === null) continue // línea que no empieza como fila de ESTE bloque -- ruido estructural, se ignora
      if (r === 'incompleta') {
        return { ok: false, motivo: 'fila_incompleta', detalle: `página ${linea.pagina}, bloque ${bc.indice}` }
      }
      candidatas.push(r)
    }
    if (candidatas.length === 0) continue // bloque sin filas de movimiento -- válido, p.ej. un encabezado sin datos debajo

    // Sub-pasada 2: la frontera entre VALOR y SALDO se infiere de los
    // propios datos de ESTE bloque -- nunca se reutiliza de otro bloque ni
    // de coordenadas fijas de página.
    const pares = candidatas.map(c => ({ valorX1: c.valorTok.x1, saldoX1: c.saldoTok.x1 }))
    const resultadoFrontera = inferirFronteraValorSaldo(pares)
    if (!resultadoFrontera.ok) {
      return {
        ok: false,
        motivo: 'fila_incompleta',
        detalle: `página ${bc.pagina}, bloque ${bc.indice}: frontera VALOR/SALDO ambigua (${resultadoFrontera.detalle})`,
      }
    }
    const { frontera } = resultadoFrontera

    // Sub-pasada 3: clasificación contra la frontera ya calculada. Dado
    // que `frontera` es exactamente el punto medio entre el máximo
    // valorX1 y el mínimo saldoX1 de estas mismas candidatas, ninguna de
    // ellas puede fallar esta comprobación -- se mantiene como chequeo
    // defensivo ante un futuro refactor, no como una rama alcanzable hoy.
    for (const c of candidatas) {
      if (!(c.valorTok.x1 < frontera && c.saldoTok.x1 > frontera)) {
        return { ok: false, motivo: 'fila_incompleta', detalle: `página ${c.linea.pagina}, bloque ${bc.indice}` }
      }
      bloque.filas.push({
        pagina: c.linea.pagina,
        fecha: c.fecha,
        descripcion: c.descripcion,
        valorCentavos: c.valorTok.centavos,
        saldoCentavos: c.saldoTok.centavos,
        bloqueIndice: bc.indice,
        filaIndiceEnBloque: bloque.filas.length,
      })
    }
  }

  if (bloques.every(b => b.filas.length === 0)) {
    return { ok: false, motivo: 'encabezado_no_reconocido', detalle: 'ningún bloque con filas de movimiento' }
  }

  // Bloques duplicados: misma secuencia EXACTA de (fecha, valor, saldo)
  // entre dos bloques distintos -- nunca se deduplica automáticamente, se
  // rechaza el documento completo. Movimientos legítimamente idénticos
  // DENTRO de un mismo bloque (ej. varias comisiones iguales seguidas) se
  // conservan tal cual: esta comparación es por BLOQUE completo, no por
  // fila individual.
  const firma = (b: Bloque) => b.filas.map(f => `${f.fecha}|${f.valorCentavos}|${f.saldoCentavos}`).join(';')
  const vistos = new Map<string, number>()
  for (const b of bloques) {
    if (b.filas.length === 0) continue
    const f = firma(b)
    const previo = vistos.get(f)
    if (previo !== undefined) {
      return { ok: false, motivo: 'bloque_duplicado', detalle: `bloque ${b.indice} duplica al bloque ${previo}` }
    }
    vistos.set(f, b.indice)
  }

  return { ok: true, bloques }
}
