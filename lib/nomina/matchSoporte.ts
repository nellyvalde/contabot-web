import { describe, it, expect, vi, beforeEach } from 'vitest'
import { intentarMatchNomina } from '../matchSoporte'
import type { DatosDocumentoIA } from '@/lib/documentos/clasificarDocumento'

// Mock del cliente admin de Supabase: simula las tablas nomina_programada y
// alias_terceros con datos controlados por cada test, para verificar la
// logica de desambiguacion multi-sede sin tocar una base de datos real.
const estadoMock = {
  nomina: [] as Array<{
    id: number
    nombre_empleado: string
    cedula: string
    area: string
    neto_pagar: number
    valor_causado: number | null
    saldo_anterior: number | null
    periodo_contable: string
  }>,
  alias: [] as Array<{ cedula: string; alias: string }>,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === 'nomina_programada') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: estadoMock.nomina, error: null }),
              }),
            }),
          }),
        }
      }
      if (tabla === 'alias_terceros') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: estadoMock.alias, error: null }),
          }),
        }
      }
      throw new Error(`Tabla no mockeada: ${tabla}`)
    },
  }),
}))

function datosDoc(proveedor: string, valorTotal: number): DatosDocumentoIA {
  return {
    proveedor,
    nit_proveedor: '',
    numero_documento: '',
    fecha: '2026-05-10',
    fecha_emision: '2026-05-10',
    valor_base: valorTotal,
    iva: 0,
    valor: valorTotal,
    valor_total: valorTotal,
    descripcion: '',
    tipo: 'nomina',
    categoria: '',
    tipo_documento: 'comprobante',
    cuenta_puc: '',
    alerta: '',
    ya_pagado: false,
  }
}

beforeEach(() => {
  estadoMock.nomina = []
  estadoMock.alias = []
})

describe('intentarMatchNomina - obligaciones en una sola sede', () => {
  it('toma la obligacion pendiente mas antigua cuando el empleado solo tiene una sede/area', async () => {
    estadoMock.nomina = [
      { id: 1, nombre_empleado: 'JUAN PEREZ', cedula: '111', area: 'EDIFICAR-DESCAN', neto_pagar: 500000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-04' },
      { id: 2, nombre_empleado: 'JUAN PEREZ', cedula: '111', area: 'EDIFICAR-DESCAN', neto_pagar: 500000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-05' },
    ]

    // El valor del comprobante no coincide con ninguna obligacion (podria ser un abono
    // parcial): el match por nombre no exige coincidencia de valor.
    const resultado = await intentarMatchNomina(datosDoc('JUAN PEREZ', 200000), 'empresa-1')

    expect(resultado.match).toBe(true)
    if (resultado.match) {
      expect(resultado.empleadoId).toBe(1) // la mas antigua (periodo_contable 2026-04)
    }
  })
})

describe('intentarMatchNomina - obligaciones en mas de una sede', () => {
  it('desambigua por valor exacto cuando el valor solo calza con una de las sedes del empleado', async () => {
    estadoMock.nomina = [
      { id: 10, nombre_empleado: 'OLIVERIO TRUJILLO', cedula: '19314401', area: 'EDIFICAR-DESCAN', neto_pagar: 408400, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-04' },
      { id: 20, nombre_empleado: 'OLIVERIO TRUJILLO', cedula: '19314401', area: 'PONTETRE-DESCAN', neto_pagar: 880000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-05' },
    ]

    // Aunque la obligacion de EDIFICAR es mas antigua, el valor del comprobante
    // (880.000) solo calza con la obligacion de PONTETRESA: debe ganar el valor,
    // no la antiguedad, para no mezclar sedes.
    const resultado = await intentarMatchNomina(datosDoc('OLIVERIO TRUJILLO', 880000), 'empresa-1')

    expect(resultado.match).toBe(true)
    if (resultado.match) {
      expect(resultado.empleadoId).toBe(20)
    }
  })

  it('devuelve match:false pidiendo asignacion manual cuando el valor no permite desambiguar la sede', async () => {
    estadoMock.nomina = [
      { id: 10, nombre_empleado: 'OLIVERIO TRUJILLO', cedula: '19314401', area: 'EDIFICAR-DESCAN', neto_pagar: 408400, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-04' },
      { id: 20, nombre_empleado: 'OLIVERIO TRUJILLO', cedula: '19314401', area: 'PONTETRE-DESCAN', neto_pagar: 880000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-05' },
    ]

    // El valor del comprobante no coincide exactamente con ninguna de las dos
    // obligaciones: no hay forma segura de saber a que sede corresponde.
    const resultado = await intentarMatchNomina(datosDoc('OLIVERIO TRUJILLO', 150000), 'empresa-1')

    expect(resultado.match).toBe(false)
    if (!resultado.match) {
      expect(resultado.razon).toContain('mas de una sede')
      expect(resultado.razon).toContain('EDIFICAR-DESCAN')
      expect(resultado.razon).toContain('PONTETRE-DESCAN')
      expect(resultado.razon).toContain('asignacion manual')
    }
  })
})

describe('intentarMatchNomina - sin coincidencia por nombre (regresion del match por valor)', () => {
  it('cuando no hay match por nombre/alias, sigue funcionando el match por valor unico', async () => {
    estadoMock.nomina = [
      { id: 30, nombre_empleado: 'MARIA GOMEZ', cedula: '222', area: 'EDIFICAR-DESCAN', neto_pagar: 300000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-05' },
      { id: 31, nombre_empleado: 'PEDRO LOPEZ', cedula: '333', area: 'PONTETRE-DESCAN', neto_pagar: 700000, valor_causado: null, saldo_anterior: null, periodo_contable: '2026-05' },
    ]

    const resultado = await intentarMatchNomina(datosDoc('PROVEEDOR DESCONOCIDO SAS', 700000), 'empresa-1')

    expect(resultado.match).toBe(true)
    if (resultado.match) {
      expect(resultado.empleadoId).toBe(31)
    }
  })
})
