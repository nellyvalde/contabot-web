// lib/bancos/extractoPdf/encabezados.ts
// Fase 2: detección de encabezados mediante alias EXACTOS y limitados --
// sin ninguna coincidencia difusa general. Solo se admiten los 7 alias
// confirmados; ninguna variante, abreviatura ni traducción se acepta.
//
// Requiere las CUATRO columnas presentes, en orden, dentro de la MISMA
// línea -- así un banner suelto como "MOVIMIENTO DIARIO" (título de
// sección, visto en el extracto real separando el resumen de la tabla)
// nunca se confunde con una fila de encabezado real, sin necesidad de
// ninguna lista de palabras a ignorar.
import type { Linea } from './lineas'
import type { Palabra } from './tipos'
import { normalizarTexto } from './texto'

// Los alias más largos van primero -- decide qué alias se intenta
// primero en cada columna, para que "DESCRIPCIÓN TRANSACCIÓN" nunca
// quede cortado en solo "DESCRIPCIÓN" por probarse en el orden
// equivocado.
const ALIAS_FECHA = ['FECHA']
const ALIAS_DESCRIPCION = ['DESCRIPCIÓN TRANSACCIÓN', 'MOVIMIENTO DIARIO', 'DESCRIPCIÓN']
const ALIAS_VALOR = ['VALOR']
const ALIAS_SALDO = ['SALDO DIARIO', 'SALDO']

export type Columna = { x0: number; x1: number }
export type Encabezado = {
  fecha: Columna
  descripcion: Columna
  valor: Columna
  saldo: Columna
  yEncabezado: number
}

function normalizarAlias(s: string): string {
  return normalizarTexto(s).toUpperCase()
}

// Busca, empezando exactamente en `desde`, la secuencia de palabras
// contiguas cuyo texto unido con un espacio sea IGUAL (normalizado) a
// `alias`. Nunca es una coincidencia parcial ni por prefijo.
function coincideAliasEn(palabras: Palabra[], desde: number, alias: string): { caja: Columna; hasta: number } | null {
  const objetivo = normalizarAlias(alias)
  let acumulado = ''
  for (let fin = desde; fin < palabras.length; fin++) {
    const token = normalizarTexto(palabras[fin].texto).toUpperCase()
    acumulado = acumulado ? `${acumulado} ${token}` : token
    if (acumulado === objetivo) {
      const tramo = palabras.slice(desde, fin + 1)
      return { caja: { x0: Math.min(...tramo.map(p => p.x0)), x1: Math.max(...tramo.map(p => p.x1)) }, hasta: fin + 1 }
    }
    if (acumulado.length > objetivo.length) return null
  }
  return null
}

function buscarAliasDesde(palabras: Palabra[], desde: number, alias: string[]): { caja: Columna; hasta: number } | null {
  for (const a of alias) {
    const r = coincideAliasEn(palabras, desde, a)
    if (r) return r
  }
  return null
}

export function detectarEncabezado(linea: Linea): Encabezado | null {
  const ws = linea.palabras
  const fecha = buscarAliasDesde(ws, 0, ALIAS_FECHA)
  if (!fecha) return null
  const descripcion = buscarAliasDesde(ws, fecha.hasta, ALIAS_DESCRIPCION)
  if (!descripcion) return null
  const valor = buscarAliasDesde(ws, descripcion.hasta, ALIAS_VALOR)
  if (!valor) return null
  const saldo = buscarAliasDesde(ws, valor.hasta, ALIAS_SALDO)
  if (!saldo) return null

  return { fecha: fecha.caja, descripcion: descripcion.caja, valor: valor.caja, saldo: saldo.caja, yEncabezado: linea.y }
}
