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

  it('marca "Cuenta PUC dudosa" cuando la cuenta no tiene 6 dígitos o está vacía', () => {
    const docVacia = { ...docCompleto, id: 'doc-puc-vacia', cuenta_puc: null }
    expect(detectarNovedades(docVacia, [docVacia], [])).toContain('Cuenta PUC dudosa')

    const docMalFormada = { ...docCompleto, id: 'doc-puc-corta', cuenta_puc: '51' }
    expect(detectarNovedades(docMalFormada, [docMalFormada], [])).toContain('Cuenta PUC dudosa')
  })

  it('no marca novedades para un documento completo y correcto', () => {
    const doc = { ...docCompleto, id: 'doc-ok' }
    const novedades = detectarNovedades(doc, [doc], [])
    expect(novedades).toEqual([])
  })

  it('marca "Posible duplicado" cuando otro documento coincide en proveedor, valor y fecha', () => {
    const original = { ...docCompleto, id: 'doc-original' }
    const duplicado = { ...docCompleto, id: 'doc-duplicado' }
    const novedades = detectarNovedades(duplicado, [original, duplicado], [])
    expect(novedades).toContain('Posible duplicado')
  })

  it('marca "Diferencia con el banco" cuando el valor no coincide con la factura cruzada', () => {
    const doc = { ...docCompleto, id: 'doc-diferencia' }
    const facturasBanco = [{ proveedor: 'Empresa XYZ', fecha: '2026-07-01', valor: 900000 }]
    const novedades = detectarNovedades(doc, [doc], facturasBanco)
    expect(novedades).toContain('Diferencia con el banco')
  })

  it('no marca "Diferencia con el banco" cuando el valor coincide exactamente', () => {
    const doc = { ...docCompleto, id: 'doc-coincide' }
    const facturasBanco = [{ proveedor: 'Empresa XYZ', fecha: '2026-07-01', valor: 850000 }]
    const novedades = detectarNovedades(doc, [doc], facturasBanco)
    expect(novedades).not.toContain('Diferencia con el banco')
  })
})
