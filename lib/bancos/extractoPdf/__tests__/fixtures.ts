// lib/bancos/extractoPdf/__tests__/fixtures.ts
// Constructores de cajas de palabras SINTÉTICAS (coordenadas inventadas,
// nunca tomadas de un PDF real) para las pruebas de reconstrucción
// estructural. Todos los nombres, descripciones y montos de estos
// fixtures son inventados.
import type { Palabra } from '../tipos'
import type { Linea } from '../lineas'

const ANCHO_POR_CARACTER = 6
const ALTO_LINEA = 10

function anchoEstimado(texto: string): number {
  return Math.max(texto.length * ANCHO_POR_CARACTER, 4)
}

export function palabraIzquierda(texto: string, x0: number, y: number, pagina = 1, orden = 0): Palabra {
  const ancho = anchoEstimado(texto)
  return { texto, x0, y0: y, x1: x0 + ancho, y1: y + ALTO_LINEA, pagina, orden }
}

export function palabraDerecha(texto: string, x1: number, y: number, pagina = 1, orden = 0): Palabra {
  const ancho = anchoEstimado(texto)
  return { texto, x0: x1 - ancho, y0: y, x1, y1: y + ALTO_LINEA, pagina, orden }
}

// Columnas por defecto -- las mismas para todos los fixtures de este
// archivo, salvo que un test pase las suyas explícitamente.
export const COL = { fecha: 50, descInicio: 110, valorFin: 440, saldoFin: 520 }

export function lineaEncabezado(
  y: number,
  pagina = 1,
  aliasDescripcion: string[] = ['DESCRIPCIÓN', 'TRANSACCIÓN'],
  aliasSaldo: string[] = ['SALDO', 'DIARIO']
): Palabra[] {
  let orden = 0
  const out: Palabra[] = [palabraIzquierda('FECHA', COL.fecha, y, pagina, orden++)]
  let x = COL.descInicio
  for (const w of aliasDescripcion) {
    const p = palabraIzquierda(w, x, y, pagina, orden++)
    out.push(p)
    x = p.x1 + 10
  }
  out.push(palabraDerecha('VALOR', COL.valorFin, y, pagina, orden++))
  let xs = COL.saldoFin - anchoEstimado(aliasSaldo.join(' '))
  for (const w of aliasSaldo) {
    const p = palabraIzquierda(w, xs, y, pagina, orden++)
    out.push(p)
    xs = p.x1 + 6
  }
  return out
}

export function lineaFila(fecha: string, descripcion: string, valor: string, saldo: string, y: number, pagina = 1): Palabra[] {
  return lineaFilaColumnas(fecha, descripcion, valor, COL.valorFin, saldo, COL.saldoFin, y, pagina)
}

// Como lineaFila, pero con posiciones de VALOR/SALDO elegidas por el test
// (en vez de las columnas por defecto) -- para probar la frontera
// derivada de los datos con distintos layouts de columna dentro de un
// mismo bloque o entre bloques distintos.
export function lineaFilaColumnas(
  fecha: string,
  descripcion: string,
  valor: string,
  valorX1: number,
  saldo: string,
  saldoX1: number,
  y: number,
  pagina = 1
): Palabra[] {
  let orden = 0
  const out: Palabra[] = [palabraIzquierda(fecha, COL.fecha, y, pagina, orden++)]
  let x = COL.descInicio
  for (const w of descripcion.split(' ')) {
    const p = palabraIzquierda(w, x, y, pagina, orden++)
    out.push(p)
    x = p.x1 + 6
  }
  out.push(palabraDerecha(valor, valorX1, y, pagina, orden++))
  out.push(palabraDerecha(saldo, saldoX1, y, pagina, orden++))
  return out
}

export function linea(pagina: number, y: number, palabras: Palabra[]): Linea {
  return { pagina, y, palabras: [...palabras].sort((a, b) => a.x0 - b.x0) }
}

export function lineaTexto(texto: string, x0: number, y: number, pagina = 1): Linea {
  return linea(pagina, y, [palabraIzquierda(texto, x0, y, pagina, 0)])
}

export function lineaResumen(y: number, pagina = 1): Linea[] {
  return [
    linea(pagina, y, [palabraIzquierda('Saldo', 60, y, pagina, 0), palabraIzquierda('inicial:', 95, y, pagina, 1), palabraDerecha('$10,000.00', 260, y, pagina, 2)]),
    linea(pagina, y - 12, [palabraIzquierda('+', 60, y - 12, pagina, 0), palabraIzquierda('Movimiento', 70, y - 12, pagina, 1), palabraIzquierda('crédito:', 150, y - 12, pagina, 2), palabraDerecha('$5,000.00', 260, y - 12, pagina, 3)]),
    linea(pagina, y - 24, [palabraIzquierda('-', 60, y - 24, pagina, 0), palabraIzquierda('Movimiento', 70, y - 24, pagina, 1), palabraIzquierda('débito:', 150, y - 24, pagina, 2), palabraDerecha('$2,000.00', 260, y - 24, pagina, 3)]),
    linea(pagina, y - 36, [palabraIzquierda('Saldo', 60, y - 36, pagina, 0), palabraIzquierda('final', 95, y - 36, pagina, 1), palabraIzquierda('período:', 125, y - 36, pagina, 2), palabraDerecha('$13,000.00', 260, y - 36, pagina, 3)]),
  ]
}

export function lineaVigencia(texto: string, y: number, pagina = 1): Linea {
  return lineaTexto(texto, 55, y, pagina)
}
