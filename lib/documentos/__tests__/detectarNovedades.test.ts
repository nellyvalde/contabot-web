import { describe, it, expect } from 'vitest'
import { detectarNovedades } from '../detectarNovedades'

const docCompleto = {
  id: 'doc-1',
  numero_documento: 'FV-1024',
  proveedor_cliente: 'Empresa XYZ',
  valor: 850000,
  fecha_emision: '2026-07-01',
  cuenta_puc: '513500',
  archivo_url: 'https://storage.example.com/facturas/doc-1.pdf',
}

describe('detectarNovedades', () => {
  it('marca "Falta de soporte" cuando el documento no tiene archivo_url', () => {
    const doc = { ...docCompleto, id: 'doc-sin-soporte', archivo_url: null }
    const novedades = detectarNovedades(doc, [doc], [])
    expect(novedades).toContain('Falta de soporte')
  })

  it('marca "Datos incompletos" cuando faltan campos obligatorios', () => {
    const doc = { ...docCompleto, id: 'doc-incompleto', proveedor_cliente: null, numero_documento: null }
    const novedades = detectarNovedades(doc, [doc], [])
    expect(novedades).toContain('Datos incompletos')
  })

  it('acepta "143505 - Mercancías" como cuenta PUC válida (código de 6 dígitos + nombre)', () => {
    const doc = { ...docCompleto, id: 'doc-puc-mercancias', cuenta_puc: '143505 - Mercancías' }
    expect(detectarNovedades(doc, [doc], [])).not.toContain('Cuenta PUC dudosa')
  })

  it('acepta "519595 - Otros gastos" como cuenta PUC válida (código de 6 dígitos + nombre)', () => {
    const doc = { ...docCompleto, id: 'doc-puc-otros-gastos', cuenta_puc: '519595 - Otros gastos' }
    expect(detectarNovedades(doc, [doc], [])).not.toContain('Cuenta PUC dudosa')
  })

  it('marca "Cuenta PUC dudosa" cuando la cuenta está vacía', () => {
    const docVacia = { ...docCompleto, id: 'doc-puc-vacia', cuenta_puc: null }
    expect(detectarNovedades(docVacia, [docVacia], [])).toContain('Cuenta PUC dudosa')
  })

  it('marca "Cuenta PUC dudosa" cuando la cuenta no empieza con 6 dígitos', () => {
    const docMalFormada = { ...docCompleto, id: 'doc-puc-corta', cuenta_puc: '51' }
    expect(detectarNovedades(docMalFormada, [docMalFormada], [])).toContain('Cuenta PUC dudosa')

    const docConLetras = { ...docCompleto, id: 'doc-puc-letras', cuenta_puc: 'ABC123 - Cuenta rara' }
    expect(detectarNovedades(docConLetras, [docConLetras], [])).toContain('Cuenta PUC dudosa')
  })

  it('no marca novedades para un documento completo y correcto', () => {
    const doc = { ...docCompleto, id: 'doc-ok' }
    const novedades = detectarNovedades(doc, [doc], [])
    expect(novedades).toEqual([])
  })

  it('marca "Posible duplicado" cuando dos documentos comparten el mismo número de documento', () => {
    const original = { ...docCompleto, id: 'doc-original' }
    const duplicado = { ...docCompleto, id: 'doc-duplicado' }
    const novedades = detectarNovedades(duplicado, [original, duplicado], [])
    expect(novedades).toContain('Posible duplicado')
  })

  it('no marca "Posible duplicado" cuando proveedor y valor coinciden pero el número de documento es diferente', () => {
    const docA = { ...docCompleto, id: 'doc-a', numero_documento: '10130002944443' }
    const docB = { ...docCompleto, id: 'doc-b', numero_documento: '2005300010195' }
    expect(detectarNovedades(docA, [docA, docB], [])).not.toContain('Posible duplicado')
    expect(detectarNovedades(docB, [docA, docB], [])).not.toContain('Posible duplicado')
  })

  it('marca "Posible duplicado" por proveedor, valor y fecha solo cuando el documento no tiene número', () => {
    const sinNumero = { ...docCompleto, id: 'doc-sin-numero', numero_documento: null }
    const otro = { ...docCompleto, id: 'doc-otro' }
    expect(detectarNovedades(sinNumero, [sinNumero, otro], [])).toContain('Posible duplicado')
  })

  it('no marca "Posible duplicado" cuando el documento no tiene número y no hay coincidencia de proveedor, valor y fecha', () => {
    const sinNumero = { ...docCompleto, id: 'doc-sin-numero-unico', numero_documento: null, proveedor_cliente: 'Proveedor único' }
    expect(detectarNovedades(sinNumero, [sinNumero], [])).not.toContain('Posible duplicado')
  })

  it('marca "Diferencia con el banco" cuando el número de documento coincide con la factura cruzada pero el valor no', () => {
    const doc = { ...docCompleto, id: 'doc-diferencia', numero_documento: 'FV-1024' }
    const facturasBanco = [{ proveedor: 'Empresa XYZ', fecha: '2026-07-01', valor: 900000, numero_factura: 'FV-1024' }]
    const novedades = detectarNovedades(doc, [doc], facturasBanco)
    expect(novedades).toContain('Diferencia con el banco')
  })

  it('no marca "Diferencia con el banco" cuando el número de documento coincide y el valor también', () => {
    const doc = { ...docCompleto, id: 'doc-coincide', numero_documento: 'FV-1024' }
    const facturasBanco = [{ proveedor: 'Empresa XYZ', fecha: '2026-07-01', valor: 850000, numero_factura: 'FV-1024' }]
    const novedades = detectarNovedades(doc, [doc], facturasBanco)
    expect(novedades).not.toContain('Diferencia con el banco')
  })

  it('no marca "Diferencia con el banco" cuando solo coinciden proveedor y fecha pero el número de documento no cruza', () => {
    const doc = { ...docCompleto, id: 'doc-sin-cruce-real', numero_documento: 'FV-1024' }
    const facturasBanco = [{ proveedor: 'Empresa XYZ', fecha: '2026-07-01', valor: 1200, numero_factura: 'OTRO-NUMERO' }]
    const novedades = detectarNovedades(doc, [doc], facturasBanco)
    expect(novedades).not.toContain('Diferencia con el banco')
  })
})
