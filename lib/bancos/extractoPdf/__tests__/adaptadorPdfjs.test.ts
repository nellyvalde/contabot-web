import { describe, it, expect, vi, afterEach } from 'vitest'
import { extraerPalabrasDePdf } from '../adaptadorPdfjs'
import { construirPdfConTexto, construirPdfSinTexto, escribirTexto } from './pdfSintetico'

describe('extraerPalabrasDePdf -- PDF sintético con texto', () => {
  it('extrae palabras con coordenadas de un PDF con capa de texto real', async () => {
    const bytes = await construirPdfConTexto((page, font) => escribirTexto(page, font, 'HOLA MUNDO', 50, 700))
    const r = await extraerPalabrasDePdf(bytes)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.paginas).toBe(1)
      expect(r.palabras.map(p => p.texto)).toEqual(['HOLA', 'MUNDO'])
      expect(r.palabras.every(p => p.pagina === 1)).toBe(true)
      expect(r.palabras.every(p => typeof p.x0 === 'number' && typeof p.y0 === 'number')).toBe(true)
    }
  })

  it('divide correctamente un ítem de pdfjs que fusiona varias palabras (bug real encontrado y corregido: pdfjs puede unir palabras contiguas en un mismo ítem de texto)', async () => {
    const bytes = await construirPdfConTexto((page, font) => escribirTexto(page, font, 'PAGO PROVEEDOR EQUIS 20260601', 50, 700))
    const r = await extraerPalabrasDePdf(bytes)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.palabras.map(p => p.texto)).toEqual(['PAGO', 'PROVEEDOR', 'EQUIS', '20260601'])
      // Cada palabra debe tener una posición x creciente y no solapada --
      // si la división fallara, todas quedarían con la misma x0/x1.
      for (let i = 1; i < r.palabras.length; i++) {
        expect(r.palabras[i].x0).toBeGreaterThan(r.palabras[i - 1].x0)
      }
    }
  })

  it('varias páginas: cada palabra queda anotada con su propia página', async () => {
    const bytes = await construirPdfConTexto((page, font, i) => escribirTexto(page, font, `PAGINA ${i}`, 50, 700), 2)
    const r = await extraerPalabrasDePdf(bytes)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.paginas).toBe(2)
      expect(new Set(r.palabras.map(p => p.pagina))).toEqual(new Set([1, 2]))
    }
  })
})

describe('extraerPalabrasDePdf -- PDF sin texto útil (solo imagen)', () => {
  it('se rechaza con sin_texto_util, sin intentar OCR', async () => {
    const bytes = await construirPdfSinTexto()
    const r = await extraerPalabrasDePdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'sin_texto_util' })
  })
})

describe('extraerPalabrasDePdf -- límites y errores, sin necesitar pdfjs real', () => {
  it('bytes vacíos: corrupto', async () => {
    const r = await extraerPalabrasDePdf(new ArrayBuffer(0))
    expect(r).toEqual({ ok: false, motivo: 'corrupto' })
  })

  it('excede el tamaño máximo (10 MB): rechazado antes de intentar parsear', async () => {
    const r = await extraerPalabrasDePdf(new ArrayBuffer(10 * 1024 * 1024 + 1))
    expect(r).toEqual({ ok: false, motivo: 'demasiado_grande' })
  })

  it('bytes que no son un PDF válido: corrupto, nunca lanza una excepción sin capturar', async () => {
    const bytes = new TextEncoder().encode('esto no es un PDF valido \x00\x01\x02').buffer
    const r = await extraerPalabrasDePdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'corrupto' })
  })

  it('supera el máximo de páginas (10): demasiadas_paginas', async () => {
    const bytes = await construirPdfConTexto((page, font) => escribirTexto(page, font, 'X', 50, 700), 11)
    const r = await extraerPalabrasDePdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'demasiadas_paginas' })
  })
})

describe('extraerPalabrasDePdf -- PDF cifrado (mock de pdfjs, pdf-lib no genera cifrado real)', () => {
  afterEach(() => {
    vi.doUnmock('pdfjs-dist/legacy/build/pdf.mjs')
    vi.resetModules()
  })

  it('un error con name="PasswordException" se traduce a motivo "cifrado", nunca al texto crudo de pdfjs', async () => {
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' })) }),
    }))
    vi.resetModules()
    const { extraerPalabrasDePdf: extraerConMock } = await import('../adaptadorPdfjs')
    const r = await extraerConMock(new TextEncoder().encode('%PDF-1.4 relleno').buffer)
    expect(r).toEqual({ ok: false, motivo: 'cifrado' })
  })

  it('cualquier otro error de pdfjs.getDocument se traduce a "corrupto", nunca al texto crudo de la excepción', async () => {
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure: xref table missing')) }),
    }))
    vi.resetModules()
    const { extraerPalabrasDePdf: extraerConMock } = await import('../adaptadorPdfjs')
    const r = await extraerConMock(new TextEncoder().encode('%PDF-1.4 relleno').buffer)
    expect(r).toEqual({ ok: false, motivo: 'corrupto' })
  })
})
