// lib/bancos/extractoPdf/adaptadorPdfjs.ts
// Fase 4: adaptador angosto sobre pdfjs-dist (ya instalado, sin
// dependencia nueva) que produce Palabra[] con coordenadas a partir de la
// capa de TEXTO nativa del PDF. NUNCA renderiza páginas como imagen --
// solo usa getTextContent(), ninguna otra función de pdfjs relacionada
// con dibujar o rasterizar una página -- y NUNCA incluye reconocimiento
// óptico de caracteres: ninguna librería de ese tipo, ningún Worker ni
// WASM propio, ningún dato de idioma, ninguna llamada externa. Un PDF sin
// texto útil se rechaza aquí mismo,
// sin intentar leerlo de otra forma -- ver mensajes.ts para el mensaje
// exacto mostrado al usuario.
import type { Palabra, MotivoRechazo } from './tipos'
import { deduplicarPalabras } from './deduplicarPalabras'

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024
const PAGINAS_MAXIMAS = 10

export type ResultadoAdaptador =
  | { ok: true; palabras: Palabra[]; paginas: number }
  | { ok: false; motivo: MotivoRechazo }

type ItemTextoPdfjs = { str: string; transform: number[]; width?: number; height?: number }

function esItemTexto(it: unknown): it is ItemTextoPdfjs {
  return (
    typeof it === 'object' &&
    it !== null &&
    typeof (it as { str?: unknown }).str === 'string' &&
    Array.isArray((it as { transform?: unknown }).transform)
  )
}

type PalabraSinPagina = { texto: string; x0: number; y0: number; x1: number; y1: number }

// pdfjs no garantiza que cada ítem de getTextContent() sea una sola
// palabra -- según el motor de generación del PDF, puede fusionar varias
// palabras contiguas en un mismo ítem (confirmado empíricamente: un PDF
// sintético de prueba con dos palabras dibujadas por separado volvió como
// UN solo ítem "HOLA MUNDO"). Este módulo nunca asume una granularidad
// de palabra por ítem -- siempre divide por espacios y distribuye la
// posición x proporcionalmente a la posición del carácter dentro del
// ancho total del ítem. Es una aproximación (no usa métricas reales de
// fuente), suficiente para la tolerancia de columna de filas.ts/
// encabezados.ts (20 puntos).
function dividirEnPalabras(item: ItemTextoPdfjs): PalabraSinPagina[] {
  const texto = item.str
  const x0Item = item.transform[4]
  const y0 = item.transform[5]
  const anchoItem = item.width ?? 0
  const altoItem = item.height ?? (Math.abs(item.transform[3]) || 8)
  const longitudTotal = texto.length || 1

  const resultado: PalabraSinPagina[] = []
  const patron = /\S+/g
  let m: RegExpExecArray | null
  while ((m = patron.exec(texto)) !== null) {
    const x0 = x0Item + (anchoItem * m.index) / longitudTotal
    const x1 = x0Item + (anchoItem * (m.index + m[0].length)) / longitudTotal
    resultado.push({ texto: m[0], x0, y0, x1, y1: y0 + altoItem })
  }
  return resultado
}

export async function extraerPalabrasDePdf(bytes: ArrayBuffer): Promise<ResultadoAdaptador> {
  if (bytes.byteLength <= 0) return { ok: false, motivo: 'corrupto' }
  if (bytes.byteLength > TAMANO_MAXIMO_BYTES) return { ok: false, motivo: 'demasiado_grande' }

  // Import dinámico: esta rama (Fase 4) es la única de todo el módulo que
  // toca pdfjs -- el resto (Fases 1-3) es lógica pura sin dependencias.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise
  } catch (err) {
    const nombre = err instanceof Error ? err.name : ''
    if (nombre === 'PasswordException') return { ok: false, motivo: 'cifrado' }
    return { ok: false, motivo: 'corrupto' }
  }

  if (doc.numPages === 0) return { ok: false, motivo: 'corrupto' }
  if (doc.numPages > PAGINAS_MAXIMAS) return { ok: false, motivo: 'demasiadas_paginas' }

  const palabras: Palabra[] = []
  for (let pagina = 1; pagina <= doc.numPages; pagina++) {
    let items: unknown[]
    try {
      const p = await doc.getPage(pagina)
      const contenido = await p.getTextContent()
      items = contenido.items
    } catch {
      return { ok: false, motivo: 'corrupto' }
    }

    const itemsTexto = items.filter(esItemTexto)
    const tieneTextoUtil = itemsTexto.some(it => it.str.trim().length > 0)
    if (!tieneTextoUtil) return { ok: false, motivo: 'sin_texto_util' }

    let orden = 0
    for (const it of itemsTexto) {
      if (!it.str.trim()) continue
      for (const sub of dividirEnPalabras(it)) {
        palabras.push({ ...sub, pagina, orden: orden++ })
      }
    }
  }

  // Corrección: algunos motores de generación de PDF (confirmado en el
  // extracto real autorizado) repiten literalmente el mismo ítem de texto
  // dos o más veces en el content stream, en coordenadas prácticamente
  // idénticas. Se deduplica aquí, en la frontera de extracción, ANTES de
  // que cualquier otra etapa del pipeline (líneas, vigencia, filas) vea
  // una palabra contada de más -- ver deduplicarPalabras.ts.
  const deduplicacion = deduplicarPalabras(palabras)
  if (!deduplicacion.ok) return deduplicacion

  return { ok: true, palabras: deduplicacion.palabras, paginas: doc.numPages }
}
