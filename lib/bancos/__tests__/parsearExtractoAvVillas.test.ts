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

// Escapa un campo segun RFC4180 -- necesario para que un valor con comas
// o comillas (ej. una descripcion "PAGO A \"PROVEEDOR, S.A.\"") no rompa
// las columnas del CSV.
function escaparCampoCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

function construirCsv(encabezados: string[], filas: string[][]): ArrayBuffer {
  const lineas = [encabezados, ...filas].map(fila => fila.map(escaparCampoCsv).join(','))
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
    expect(validarArchivoAntesDeLeer('extracto.xls', 1000).ok).toBe(false)
  })

  it('rechaza .pdf -- fuera de alcance de este MVP', () => {
    expect(validarArchivoAntesDeLeer('extracto.pdf', 1000).ok).toBe(false)
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

describe('parsearExtractoAvVillas -- encabezados (validados UNA SOLA VEZ, no por fila)', () => {
  it('falta la columna VALOR: un único error general nombrando la columna, no un error por fila', () => {
    const bytes = construirXlsx([
      { FECHA: '2026-07-15', 'DESCRIPCIÓN TRANSACCIÓN': 'A' },
      { FECHA: '2026-07-16', 'DESCRIPCIÓN TRANSACCIÓN': 'B' },
      { FECHA: '2026-07-17', 'DESCRIPCIÓN TRANSACCIÓN': 'C' },
    ])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    // ok:false (un único error general) en vez de ok:true con un
    // filasConError por cada una de las 3 filas -- eso es precisamente lo
    // que confirma que la columna ausente no se convierte en "cientos de
    // errores repetidos por fila".
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toContain('VALOR')
    }
  })

  it('faltan dos columnas: el error las nombra a ambas', () => {
    const bytes = construirXlsx([{ FECHA: '2026-07-15' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toContain('DESCRIPCIÓN TRANSACCIÓN')
      expect(resultado.error).toContain('VALOR')
    }
  })

  it('las 3 columnas presentes: no hay error de encabezados, se procede a validar filas', () => {
    const bytes = construirXlsx([FILA_VALIDA])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
  })
})

describe('parsearExtractoAvVillas -- fechas (validación calendárica real, no solo forma)', () => {
  it('parsea una fecha válida', () => {
    const bytes = construirXlsx([FILA_VALIDA])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.movimientos[0].fecha).toBe('2026-07-15')
  })

  it('rechaza 2026-02-30 (30 de febrero no existe)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: '2026-02-30' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('rechaza 2026-13-01 (mes 13 no existe)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: '2026-13-01' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('rechaza 31/04/2026 (abril tiene 30 días, formato DD/MM/YYYY)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: '31/04/2026' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('año bisiesto: acepta 2028-02-29 (2028 es bisiesto)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: '2028-02-29' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.filasConError).toEqual([])
      expect(resultado.movimientos[0].fecha).toBe('2028-02-29')
    }
  })

  it('año bisiesto: rechaza 2027-02-29 (2027 no es bisiesto)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: '2027-02-29' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('fecha con formato de texto no reconocido: fila con error, no rompe el resto del archivo', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, FECHA: 'no es una fecha' }, FILA_VALIDA])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toHaveLength(1)
      expect(resultado.filasConError).toEqual([{ fila: 2, motivo: expect.stringContaining('Fecha') }])
    }
  })
})

describe('parsearExtractoAvVillas -- valores monetarios (parser determinístico, nunca adivina)', () => {
  const casosValidos: Array<[string, number]> = [
    ['150000', 150000],
    ['150000,50', 150000.5],
    ['150.000,50', 150000.5],
    ['$150.000,50', 150000.5],
    ['150000.50', 150000.5],
    ['150,000.50', 150000.5],
    ['-150000', -150000],
    ['-150.000,50', -150000.5],
  ]

  for (const [texto, esperado] of casosValidos) {
    it(`"${texto}" se interpreta como ${esperado}`, () => {
      const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: texto }])
      const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
      expect(resultado.ok).toBe(true)
      if (resultado.ok) {
        expect(resultado.filasConError).toEqual([])
        expect(resultado.movimientos[0].valor).toBeCloseTo(esperado)
      }
    })
  }

  it('"150000.50" NUNCA se interpreta como 15000050 (bug real corregido: el punto no siempre es separador de miles)', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: '150000.50' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.movimientos[0].valor).toBe(150000.5)
  })

  it('texto inválido ("no numerico"): fila con error, nunca una cantidad inventada', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: 'no numerico' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toEqual([])
      expect(resultado.filasConError[0].motivo).toContain('Valor')
    }
  })

  it('formato ambiguo "1.234" (podría ser miles o decimal, ninguno de los formatos aprobados): se rechaza, nunca se adivina', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: '1.234' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('formato ambiguo "1,234" (agrupación de miles incompleta): se rechaza', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: '1,234' }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.filasConError).toHaveLength(1)
  })

  it('un número (no texto) proveniente de una celda numérica de Excel se acepta directo', () => {
    const bytes = construirXlsx([{ ...FILA_VALIDA, VALOR: 150000.5 }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.movimientos[0].valor).toBe(150000.5)
  })
})

describe('parsearExtractoAvVillas -- otros casos (columnas extra, archivo vacío, corrupto)', () => {
  it('columna faltante SOLO en una fila especifica (las demas la tienen): fila con error, no un error general', () => {
    // Nota: esto simula una fila con la celda de descripcion vacia/ausente
    // -- distinto del caso "columna ausente del archivo entero" (ya
    // cubierto arriba), que sí produce el error general de encabezados.
    const bytes = construirXlsx([FILA_VALIDA, { FECHA: '2026-07-16', VALOR: 1000 }])
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.xlsx')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toHaveLength(1)
      expect(resultado.filasConError).toHaveLength(1)
    }
  })

  it('archivo sin ninguna fila (ni encabezado): ok:false con mensaje claro', () => {
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

  it('archivo XLSX no reconocible: nunca lanza una excepción sin capturar', () => {
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

  it('CSV con una descripción que contiene una coma y comillas (correctamente escapada con RFC4180) se parsea como un solo campo', () => {
    const bytes = construirCsv(
      ['FECHA', 'DESCRIPCIÓN TRANSACCIÓN', 'VALOR'],
      [['2026-07-15', 'PAGO A "PROVEEDOR, S.A."', '150000']]
    )
    const resultado = parsearExtractoAvVillas(bytes, 'extracto.csv')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.movimientos).toHaveLength(1)
      expect(resultado.movimientos[0].descripcion).toBe('PAGO A "PROVEEDOR, S.A."')
    }
  })

  it('CSV con bytes que no son UTF-8 válido: mensaje controlado, nunca corrompe el archivo en silencio', () => {
    // 0xFF y 0xFE nunca son bytes de inicio validos en UTF-8.
    const bytesInvalidos = new Uint8Array([0x46, 0x45, 0x43, 0x48, 0x41, 0xff, 0xfe]).buffer
    const resultado = parsearExtractoAvVillas(bytesInvalidos, 'extracto.csv')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toMatch(/UTF-8/)
    }
  })
})
