import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { detectarTipo } from '../soportesPdf'

describe('detectarTipo', () => {
  it('reconoce un PDF por su firma %PDF', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    expect(detectarTipo(bytes)).toBe('pdf')
  })

  it('reconoce un JPG por su firma FF D8 FF', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(detectarTipo(bytes)).toBe('jpg')
  })

  it('reconoce un PNG por su firma 89 50 4E 47', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(detectarTipo(bytes)).toBe('png')
  })

  it('devuelve desconocido para bytes que no calzan con ningun formato soportado', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    expect(detectarTipo(bytes)).toBe('desconocido')
  })

  it('no revienta con un arreglo vacio o muy corto', () => {
    expect(detectarTipo(new Uint8Array([]))).toBe('desconocido')
    expect(detectarTipo(new Uint8Array([0x25, 0x50]))).toBe('desconocido')
  })
})

// Mocks del cliente admin de Supabase: registramos las llamadas para verificar
// que regenerarSoportesPdf junta los comprobantes en el orden correcto, sube
// UN solo PDF y actualiza nomina_programada con su URL publica.
const estadoMock = {
  abonos: [] as Array<{ archivo_url: string | null; fecha_abono: string; created_at: string }>,
  uploads: [] as Array<{ path: string; bytes: Uint8Array }>,
  updates: [] as Array<{ id: number; soportes_pdf_url: string }>,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === 'abonos_nomina') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  order: () => Promise.resolve({ data: estadoMock.abonos, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (tabla === 'nomina_programada') {
        return {
          update: (valores: { soportes_pdf_url: string }) => ({
            eq: (_col: string, id: number) => {
              estadoMock.updates.push({ id, soportes_pdf_url: valores.soportes_pdf_url })
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`Tabla inesperada en el mock: ${tabla}`)
    },
    storage: {
      from: () => ({
        upload: (path: string, bytes: Uint8Array) => {
          estadoMock.uploads.push({ path, bytes })
          return Promise.resolve({ error: null })
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://dummy-local-test.supabase.co/storage/v1/object/public/facturas/${path}` },
        }),
      }),
    },
  }),
}))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))

describe('regenerarSoportesPdf', () => {
  beforeEach(() => {
    estadoMock.abonos = []
    estadoMock.uploads = []
    estadoMock.updates = []
    vi.restoreAllMocks()
  })

  it('combina dos comprobantes (una imagen y un PDF) en un solo PDF y actualiza la obligacion', async () => {
    const pdfIndividual = await PDFDocument.create()
    pdfIndividual.addPage([100, 100])
    const pdfBytes = await pdfIndividual.save()

    // 1x1 PNG minimo valido (para que pdf-lib pueda embeberlo de verdad).
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const pngBytes = Uint8Array.from(Buffer.from(pngBase64, 'base64'))

    estadoMock.abonos = [
      { archivo_url: 'https://dummy/soporte1.png', fecha_abono: '2026-05-05', created_at: '2026-05-05T10:00:00Z' },
      { archivo_url: 'https://dummy/soporte2.pdf', fecha_abono: '2026-06-06', created_at: '2026-06-06T10:00:00Z' },
    ]

    const fetchMock = vi.fn(async (url: string) => {
      const bytes = url.endsWith('.png') ? pngBytes : pdfBytes
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { regenerarSoportesPdf } = await import('../soportesPdf')
    const url = await regenerarSoportesPdf(482, 'empresa-1', true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(estadoMock.uploads).toHaveLength(1)
    expect(estadoMock.uploads[0].path).toBe('empresa-1/soportes_nomina_482.pdf')
    // El resultado debe ser un PDF valido con las paginas de ambos comprobantes.
    const combinado = await PDFDocument.load(estadoMock.uploads[0].bytes)
    expect(combinado.getPageCount()).toBe(2)

    expect(estadoMock.updates).toEqual([{ id: 482, soportes_pdf_url: url }])
    expect(url).toContain('soportes_nomina_482.pdf')
  })

  it('devuelve null y no sube nada si la obligacion no tiene comprobantes', async () => {
    estadoMock.abonos = []
    const { regenerarSoportesPdf } = await import('../soportesPdf')
    const url = await regenerarSoportesPdf(999, 'empresa-1', true)
    expect(url).toBeNull()
    expect(estadoMock.uploads).toHaveLength(0)
  })

  it('si un comprobante no se puede descargar, sigue con los demas en vez de fallar todo', async () => {
    const pdfIndividual = await PDFDocument.create()
    pdfIndividual.addPage([50, 50])
    const pdfBytes = await pdfIndividual.save()

    estadoMock.abonos = [
      { archivo_url: 'https://dummy/roto.png', fecha_abono: '2026-05-01', created_at: '2026-05-01T10:00:00Z' },
      { archivo_url: 'https://dummy/ok.pdf', fecha_abono: '2026-05-02', created_at: '2026-05-02T10:00:00Z' },
    ]

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('roto')) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) }
      return { ok: true, arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { regenerarSoportesPdf } = await import('../soportesPdf')
    const url = await regenerarSoportesPdf(700, 'empresa-1', true)

    expect(url).not.toBeNull()
    const combinado = await PDFDocument.load(estadoMock.uploads[0].bytes)
    expect(combinado.getPageCount()).toBe(1)
  })
})
