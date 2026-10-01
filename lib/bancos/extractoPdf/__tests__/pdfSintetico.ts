// lib/bancos/extractoPdf/__tests__/pdfSintetico.ts
// Construye PDFs SINTÉTICOS con pdf-lib (ya instalado, sin dependencia
// nueva) para las pruebas de extremo a extremo del adaptador y del
// orquestador. Cada palabra se dibuja con su propia llamada a drawText,
// en una posición calculada con las métricas reales de la fuente -- así
// cada palabra queda como un ítem de texto propio al leerla de vuelta con
// pdfjs, igual que se observó en el extracto PDF real (Fase 0). Todos los
// nombres, descripciones y montos usados en las pruebas son inventados.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

export const COL = { fecha: 50, descInicio: 110, valorFin: 440, saldoFin: 520 }
const TAMANO_FUENTE = 9

function escribirIzquierda(page: PDFPage, font: PDFFont, texto: string, x0: number, y: number): number {
  page.drawText(texto, { x: x0, y, size: TAMANO_FUENTE, font })
  return x0 + font.widthOfTextAtSize(texto, TAMANO_FUENTE)
}

function escribirDerecha(page: PDFPage, font: PDFFont, texto: string, x1: number, y: number): void {
  const ancho = font.widthOfTextAtSize(texto, TAMANO_FUENTE)
  page.drawText(texto, { x: x1 - ancho, y, size: TAMANO_FUENTE, font })
}

export function escribirEncabezado(
  page: PDFPage,
  font: PDFFont,
  y: number,
  aliasDescripcion: string[] = ['DESCRIPCIÓN', 'TRANSACCIÓN'],
  aliasSaldo: string[] = ['SALDO', 'DIARIO']
): void {
  let x = escribirIzquierda(page, font, 'FECHA', COL.fecha, y) + 10
  for (const w of aliasDescripcion) x = escribirIzquierda(page, font, w, x, y) + 10
  escribirDerecha(page, font, 'VALOR', COL.valorFin, y)
  let xs = COL.saldoFin - font.widthOfTextAtSize(aliasSaldo.join(' '), TAMANO_FUENTE) - (aliasSaldo.length - 1) * 6
  for (const w of aliasSaldo) xs = escribirIzquierda(page, font, w, xs, y) + 6
}

export function escribirFila(page: PDFPage, font: PDFFont, fecha: string, descripcion: string, valor: string, saldo: string, y: number): void {
  let x = escribirIzquierda(page, font, fecha, COL.fecha, y) + 10
  for (const w of descripcion.split(' ')) x = escribirIzquierda(page, font, w, x, y) + 6
  escribirDerecha(page, font, valor, COL.valorFin, y)
  escribirDerecha(page, font, saldo, COL.saldoFin, y)
}

export function escribirTexto(page: PDFPage, font: PDFFont, texto: string, x: number, y: number): void {
  let xa = x
  for (const w of texto.split(' ')) xa = escribirIzquierda(page, font, w, xa, y) + 4
}

export function escribirResumen(
  page: PDFPage,
  font: PDFFont,
  y: number,
  valores: { inicial: string; credito: string; debito: string; final: string }
): void {
  escribirTexto(page, font, `Saldo inicial: ${valores.inicial}`, 60, y)
  escribirTexto(page, font, `+ Movimiento credito: ${valores.credito}`, 60, y - 14)
  escribirTexto(page, font, `- Movimiento debito: ${valores.debito}`, 60, y - 28)
  escribirTexto(page, font, `Saldo final periodo: ${valores.final}`, 60, y - 42)
}

function comoArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function construirPdfConTexto(dibujarPagina: (page: PDFPage, font: PDFFont, indicePagina: number) => void, paginas = 1): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < paginas; i++) {
    const page = doc.addPage([612, 792])
    dibujarPagina(page, font, i + 1)
  }
  return comoArrayBuffer(await doc.save())
}

// Página con contenido visual (un rectángulo) pero SIN ningún texto --
// simula un PDF de solo imagen: pdfjs no extrae ningún ítem de texto.
export async function construirPdfSinTexto(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  page.drawRectangle({ x: 50, y: 50, width: 200, height: 100, borderWidth: 1 })
  return comoArrayBuffer(await doc.save())
}
