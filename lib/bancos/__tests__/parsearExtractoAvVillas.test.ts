// lib/bancos/__tests__/parsearExtractoAvVillas.test.ts
// Todos los fixtures de este archivo son SINTETICOS, construidos en
// memoria -- nunca datos de un archivo real de AV Villas (todavia no
// existe uno confirmado, ver el aviso de cabecera de
// parsearExtractoAvVillas.ts). Estas pruebas verifican la LOGICA de
// parseo/validacion contra la forma de columnas asumida hoy
// (COLUMNAS_AV_VILLAS_XLSX_CSV) -- no son, y no deben presentarse como,
// una validacion contra un extracto real.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parsearExtractoAvVillas, validarArchivoAntesDeLeer } from '../parsearExtractoAvVillas'

function construirXlsx(filas: Record<string, unknown>[]): ArrayBuffer {
  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function construirCsv(encabezados: string[], filas: string[][]): ArrayBuffer {
  const lineas = [encabezados.join(','), ...filas.map(f => f.join(','))]
  return new TextEncoder().encode(lineas.join('\n')).buffer
}

const FILA_VALIDA = { FECHA: '2026-07-15', 'DESCRIPCIÓN TRANSACCIÓN': 'PAGO PROVEEDOR X', VALOR: 150000 }

describe('validarArchivoAntesDeLeer', () => {
  it('acepta .xlsx', () => {
    expect(validarArchivoAntesDeLeer('extracto.xlsx', 1000)).toEqual({ ok: true })
  })

  it('acepta .csv', () => {
    expect(validarArchivoAntesDeLeer('extracto.csv', 1000)).toEqual({ ok: true })
  })

  it('rechaza .xls -- retirado de este MVP', () => {
    const r = validarArchivoAntesDeLeer('extracto.xls', 1000)
    expect(r.ok).toBe(false)
  })

  it('rechaza .pdf -- fuera de alcance de este MVP', () => {
    const r = validarArchivoAntesDeLeer('extracto.pdf', 1000)
    expect(r.ok).toBe(false)
  })

  it('rechaza tamaño 0 o negativo', () => {
    expect(validarArchivoAntesDeLeer('extracto.xlsx', 0).ok).toBe(false)
  })

  it('rechaza más de 10 MB', () => {
    expect(validarArchivoAntesDeLeer('extracto.xlsx', 10 * 1024 * 1024 + 1).ok).toBe(false)
  })

  it('es insensible a mayúsculas en la extensión', () => {
    expect(validarArchivoAntesDeLeer('EXTRACTO.XLSX', 1000)).toEqual({ ok: true })
  })
})

describe('parsearExtractoAvVillas -- XLSX (fixtures sintéticos, sin archivo real)', () => {
  it('parsea una fila válida', () => {
    const bytes = construirXlsx([FILA_VALIDA])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toEqual([{ fila: 2, fecha: '2026-07-15', descripcion: 'PAGO PROVEEDOR X', valor: 150000 }])
      expect(resultado.filasConError).toEqual([])
      expect(resultado.totalFilasLeidas).toBe(1)
    }
  })

  it('fecha con formato no reconocido: la fila se reporta con error, no rompe el resto del archivo', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: 'no es una fecha' }, FILA_VALIDA])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toHaveLength(1)
      expect(resultado.filasConError).toEqual([{ fila: 2, motivo: expect.stringContaining('Fecha') }])
    }
  })

  it('valor no numérico: fila con error, no se cuenta como movimiento válido', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: 'no numerico' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toEqual([])
      expect(resultado.filasConError[0].motivo).toContain('Valor')
    }
  })

  it('descripción vacía: fila con error', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, 'DESCRIPCIÓN TRANSACCIÓN': '' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError[0].motivo).toContain('Descripción')
  })

  it('columna faltante por completo (sin descripción): se trata como fila con error, nunca como excepción', () => {
    const bytes = construirXlsx([{ FECHA: '2026-07-15', VALOR: 1000 }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('archivo sin filas de datos: ok:false con mensaje claro', () => {
    const bytes = construirXlsx([])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(false)
  })

  it('columnas adicionales no reconocidas se ignoran, no rompen el parseo', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, COLUMNA_EXTRA: 'algo' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.movimientos).toHaveLength(1)
  })

  it('valor con símbolo de moneda y separador de miles se normaliza a number', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: '$150.000,50' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.movimientos[0].valor).toBeCloseTo(150000.5)
  })

  it('varias filas mezclando válidas e inválidas: cada una se clasifica de forma independiente', () => {
    const bytes = construirXlsx([
      FILA_VALIDA,
      { ...FILA_VALIDA, VALOR: 'x' },
      { ...FILA_VALIDA, 'DESCRIPCIÓN TRANSACCIÓN': '' },
      FILA_VALIDA,
    ])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.totalFilasLeidas).toBe(4)
      expect(resultado.movimientos).toHaveLength(2)
      expect(resultado.filasConError).toHaveLength(2)
    }
  })

  it('archivo no reconocible como XLSX/CSV: nunca lanza una excepción sin capturar', () => {
    const bytes = new TextEncoder().encode('esto no es un xlsx valido \x00\x01\x02').buffer
    expect(() => parsearExtractoAvVillas(bytes, 'extracto.xlsx')).not.toThrow()
  })
})

describe('parsearExtractoAvVillas -- CSV (fixtures sintéticos, sin archivo real)', () => {
  it('parsea un CSV válido con las mismas 3 columnas', () => {
    const bytes = construirCsv(
      ['FECHA', 'DESCRIPCIÓN TRANSACCIÓN', 'VALOR'],
      [['2026-07-15', 'PAGO PROVEEDOR X', '150000']]
    )
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.csv')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toEqual([{ fila: 2, fecha: '2026-07-15', descripcion: 'PAGO PROVEEDOR X', valor: 150000 }])
    }
  })

  it('CSV con una fila inválida no rompe el parseo de las demás', () => {
    const bytes = construirCsv(
      ['FECHA', 'DESCRIPCIÓN TRANSACCIÓN', 'VALOR'],
      [
        ['2026-07-15', 'PAGO PROVEEDOR X', '150000'],
        ['fecha-mala', 'PAGO PROVEEDOR Y', '2000'],
      ]
    )
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.csv')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toHaveLength(1)
      expect(resultado.filasConError).toHaveLength(1)
    }
  })
})
