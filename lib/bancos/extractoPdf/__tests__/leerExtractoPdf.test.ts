// lib/bancos/extractoPdf/__tests__/leerExtractoPdf.test.ts
// Pruebas de EXTREMO A EXTREMO (PDF sintético real, vía pdf-lib -> pdfjs
// -> todo el pipeline) del orquestador. La matriz exhaustiva de
// escenarios financieros ya está cubierta a nivel unitario en
// validacionFinanciera.test.ts y filas.test.ts -- aquí solo se prueba que
// el cableado completo funciona, con un caso de éxito y una muestra de
// rechazos representativos de cada etapa del pipeline.
import { describe, it, expect } from 'vitest'
import { leerExtractoPdf } from '../leerExtractoPdf'
import { construirPdfConTexto, construirPdfSinTexto, escribirEncabezado, escribirFila, escribirResumen, escribirTexto } from './pdfSintetico'

function dibujarDocumentoValido(page: Parameters<typeof escribirEncabezado>[0], font: Parameters<typeof escribirEncabezado>[1]): void {
  escribirTexto(page, font, 'BANCO AV VILLAS S.A. NIT 000.000.000-0', 50, 760)
  escribirTexto(page, font, 'VIGENCIA 01 DE JUNIO AL 30 DE JUNIO DE 2026', 50, 700)
  escribirResumen(page, font, 650, { inicial: '$10,000.00', credito: '$500.00', debito: '$200.00', final: '$10,300.00' })
  escribirEncabezado(page, font, 580)
  escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 565)
  escribirFila(page, font, '2026/06/02', 'PAGO PROVEEDOR DOS', '$200.00', '$10,300.00', 550)
}

describe('leerExtractoPdf -- extremo a extremo, PDF sintético con texto', () => {
  it('documento válido: cadena de saldos, resumen y vigencia conciliando -- devuelve los movimientos clasificados', async () => {
    const bytes = await construirPdfConTexto(dibujarDocumentoValido)
    const r = await leerExtractoPdf(bytes)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.movimientos).toHaveLength(2)
      expect(r.movimientos[0]).toMatchObject({ fecha: '2026/06/01', descripcion: 'PAGO PROVEEDOR UNO', valorCentavos: 50000, saldoCentavos: 1050000, tipo: 'credito', dentroDeVigencia: true })
      expect(r.movimientos[1]).toMatchObject({ fecha: '2026/06/02', descripcion: 'PAGO PROVEEDOR DOS', valorCentavos: 20000, saldoCentavos: 1030000, tipo: 'debito', dentroDeVigencia: true })
      expect(r.movimientos.every(m => m.referenciaOrigen.startsWith('p1:bloque0:fila'))).toBe(true)
    }
  })

  it('PDF sin texto útil (solo imagen): se rechaza sin intentar OCR, con el motivo correcto', async () => {
    const bytes = await construirPdfSinTexto()
    const r = await leerExtractoPdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'sin_texto_util' })
  })

  it('sin banner de vigencia: se rechaza, nunca se infiere del nombre de archivo ni de las fechas de las filas', async () => {
    const bytes = await construirPdfConTexto((page, font) => {
      escribirResumen(page, font, 650, { inicial: '$10,000.00', credito: '$500.00', debito: '$200.00', final: '$10,300.00' })
      escribirEncabezado(page, font, 580)
      escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 565)
      escribirFila(page, font, '2026/06/02', 'PAGO PROVEEDOR DOS', '$200.00', '$10,300.00', 550)
    })
    const r = await leerExtractoPdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'vigencia_no_determinada' })
  })

  it('sin resumen del período: se rechaza aunque la cadena de la tabla sea internamente consistente', async () => {
    const bytes = await construirPdfConTexto((page, font) => {
      escribirTexto(page, font, 'VIGENCIA 01 DE JUNIO AL 30 DE JUNIO DE 2026', 50, 700)
      escribirEncabezado(page, font, 580)
      escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 565)
    })
    const r = await leerExtractoPdf(bytes)
    expect(r).toEqual({ ok: false, motivo: 'resumen_no_encontrado' })
  })

  it('bloque duplicado detectado de extremo a extremo: el documento completo se rechaza', async () => {
    const bytes = await construirPdfConTexto((page, font) => {
      escribirTexto(page, font, 'VIGENCIA 01 DE JUNIO AL 30 DE JUNIO DE 2026', 50, 700)
      escribirResumen(page, font, 650, { inicial: '$10,000.00', credito: '$1,000.00', debito: '$400.00', final: '$10,600.00' })
      escribirEncabezado(page, font, 580)
      escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 565)
      escribirFila(page, font, '2026/06/02', 'PAGO PROVEEDOR DOS', '$200.00', '$10,300.00', 550)
      escribirEncabezado(page, font, 520)
      escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 505)
      escribirFila(page, font, '2026/06/02', 'PAGO PROVEEDOR DOS', '$200.00', '$10,300.00', 490)
    })
    const r = await leerExtractoPdf(bytes)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('bloque_duplicado')
  })

  it('resumen que no concilia detectado de extremo a extremo: el documento completo se rechaza', async () => {
    const bytes = await construirPdfConTexto((page, font) => {
      escribirTexto(page, font, 'VIGENCIA 01 DE JUNIO AL 30 DE JUNIO DE 2026', 50, 700)
      escribirResumen(page, font, 650, { inicial: '$10,000.00', credito: '$999,999.00', debito: '$200.00', final: '$10,300.00' })
      escribirEncabezado(page, font, 580)
      escribirFila(page, font, '2026/06/01', 'PAGO PROVEEDOR UNO', '$500.00', '$10,500.00', 565)
      escribirFila(page, font, '2026/06/02', 'PAGO PROVEEDOR DOS', '$200.00', '$10,300.00', 550)
    })
    const r = await leerExtractoPdf(bytes)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('resumen_no_concilia')
  })
})
