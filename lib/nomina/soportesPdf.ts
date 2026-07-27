// lib/nomina/soportesPdf.ts
// Combina TODOS los comprobantes (abonos_nomina.archivo_url) de una obligacion
// de nomina_programada en un unico PDF, en orden cronologico, para que la
// contadora tenga un solo link donde revisar todos los soportes de los abonos
// parciales de esa persona/periodo. Se regenera cada vez que se registra un
// abono nuevo (ver registrarAbono en lib/nomina/abonos.ts).
import { PDFDocument } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'
import { supabase as supabaseNavegador } from '@/lib/supabase/client'

const BUCKET = 'facturas'

export function detectarTipo(bytes: Uint8Array): 'pdf' | 'jpg' | 'png' | 'desconocido' {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf' // %PDF
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  return 'desconocido'
}

async function agregarArchivoAlPdf(pdfCombinado: PDFDocument, bytes: Uint8Array): Promise<boolean> {
  const tipo = detectarTipo(bytes)

  if (tipo === 'pdf') {
    const origen = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const paginas = await pdfCombinado.copyPages(origen, origen.getPageIndices())
    paginas.forEach((pagina) => pdfCombinado.addPage(pagina))
    return true
  }

  if (tipo === 'jpg' || tipo === 'png') {
    const imagen = tipo === 'jpg' ? await pdfCombinado.embedJpg(bytes) : await pdfCombinado.embedPng(bytes)
    const pagina = pdfCombinado.addPage([imagen.width, imagen.height])
    pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height })
    return true
  }

  return false
}

// Descarga un archivo publico de Supabase Storage a partir de su URL publica.
async function descargarDesdeUrlPublica(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch {
    return null
  }
}

/**
 * Reconstruye el PDF combinado de todos los soportes (abonos_nomina.archivo_url,
 * en orden cronologico) de una obligacion, lo sube a Storage y actualiza
 * nomina_programada.soportes_pdf_url. No lanza si algo falla: falla en silencio
 * (logueando) para no romper el registro del abono que la disparo.
 */
export async function regenerarSoportesPdf(obligacionId: number, empresaId: string, admin = false): Promise<string | null> {
  const db = admin ? createAdminClient() : supabaseNavegador

  try {
    const { data: abonos, error: errAbonos } = await db
      .from('abonos_nomina')
      .select('archivo_url, fecha_abono, created_at')
      .eq('obligacion_id', obligacionId)
      .not('archivo_url', 'is', null)
      .order('fecha_abono', { ascending: true })
      .order('created_at', { ascending: true })

    if (errAbonos) {
      console.error('[soportesPdf] Error consultando abonos:', errAbonos.message)
      return null
    }

    if (!abonos || abonos.length === 0) {
      return null
    }

    const pdfCombinado = await PDFDocument.create()
    let paginasAgregadas = 0

    for (const abono of abonos) {
      const url = (abono as { archivo_url: string | null }).archivo_url
      if (!url) continue
      const bytes = await descargarDesdeUrlPublica(url)
      if (!bytes) {
        console.error('[soportesPdf] No se pudo descargar el soporte:', url)
        continue
      }
      const agregado = await agregarArchivoAlPdf(pdfCombinado, bytes)
      if (agregado) paginasAgregadas += 1
    }

    if (paginasAgregadas === 0) {
      return null
    }

    const pdfBytes = await pdfCombinado.save()
    const nombreArchivo = `${empresaId}/soportes_nomina_${obligacionId}.pdf`

    const { error: errUpload } = await db.storage
      .from(BUCKET)
      .upload(nombreArchivo, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (errUpload) {
      console.error('[soportesPdf] Error subiendo PDF combinado:', errUpload.message)
      return null
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(nombreArchivo)
    const soportesPdfUrl = urlData.publicUrl

    const { error: errUpdate } = await db
      .from('nomina_programada')
      .update({ soportes_pdf_url: soportesPdfUrl })
      .eq('id', obligacionId)

    if (errUpdate) {
      console.error('[soportesPdf] Error actualizando nomina_programada:', errUpdate.message)
      return null
    }

    return soportesPdfUrl
  } catch (err) {
    console.error('[soportesPdf] Error inesperado combinando soportes:', err)
    return null
  }
}
