// lib/bancos/extractoPdf/deduplicarPalabras.ts
// Corrección: se confirmó, midiendo únicamente estadísticas agregadas
// (nunca texto) sobre el extracto real autorizado, que algunos motores de
// generación de PDF repiten literalmente el mismo item de texto dos o más
// veces en el content stream, en coordenadas PRACTICAMENTE identicas
// (en la muestra medida: 371 pares con diferencia EXACTA de 0.0 puntos en
// las 4 coordenadas -- ningun caso intermedio entre 0 y la tolerancia).
// Esta funcion pura elimina esos duplicados en la frontera de extraccion,
// ANTES de agruparEnLineas, para que el resto del pipeline (vigencia,
// encabezados, filas) nunca vea una palabra contada dos veces.
//
// Deliberadamente estricta: solo colapsa dos palabras cuando coinciden en
// pagina, texto normalizado EXACTO (sin coincidencia difusa -- reutiliza
// normalizarTexto, la misma funcion que usa el resto del modulo) y caja
// practicamente identica -- diferencia por eje <= TOLERANCIA_COORDENADAS
// PUNTOS, el criterio principal y suficiente por si solo, ya que la
// muestra real solo mostro diferencias de 0.0 puntos. El solapamiento
// (IoU) se exige ademas como confirmacion redundante, con un umbral mas
// bajo que el de conflicto para no rechazar por IoU un caso que ya paso
// la tolerancia por eje en cajas de palabra pequenas (una caja de pocos
// puntos de alto pierde proporcionalmente mas IoU ante el mismo
// desplazamiento absoluto que una caja grande). Palabras con el mismo
// texto en una posicion distinta, en otra pagina, o repeticiones
// legitimas de una fila a otra NUNCA se tocan.
import type { Palabra, MotivoRechazo } from './tipos'
import { normalizarTexto } from './texto'

// Nunca superior a 0.5 puntos (ver instrucciones de corrección). La
// medición sobre el extracto real autorizado no encontró NINGÚN caso
// intermedio entre una diferencia de 0.0 y una diferencia mayor a 200
// puntos (palabras repetidas legítimamente en otra posición) -- por lo
// tanto una tolerancia de 0.5 puntos es estricta y, a la vez, absorbe
// cualquier redondeo de punto flotante entre distintos generadores de PDF.
export const TOLERANCIA_COORDENADAS_PUNTOS = 0.5
// Umbral bajo deliberadamente: para una caja típica de palabra (alto de
// pocos puntos), un desplazamiento absoluto en el límite de la tolerancia
// por eje ya reduce el IoU por debajo de 0.9 sin dejar de ser, en
// términos absolutos, "practicamente identica". El criterio que realmente
// decide es la tolerancia por eje; este umbral solo descarta solapamientos
// bajos que la tolerancia por eje, por sí sola, no alcanzaría a filtrar.
const UMBRAL_IOU_DUPLICADO = 0.7
const UMBRAL_IOU_CONFLICTO = 0.9

export type ResultadoDeduplicacion = { ok: true; palabras: Palabra[] } | { ok: false; motivo: MotivoRechazo }

function dentroDeTolerancia(a: Palabra, b: Palabra): boolean {
  return (
    Math.abs(a.x0 - b.x0) <= TOLERANCIA_COORDENADAS_PUNTOS &&
    Math.abs(a.x1 - b.x1) <= TOLERANCIA_COORDENADAS_PUNTOS &&
    Math.abs(a.y0 - b.y0) <= TOLERANCIA_COORDENADAS_PUNTOS &&
    Math.abs(a.y1 - b.y1) <= TOLERANCIA_COORDENADAS_PUNTOS
  )
}

// Intersección sobre unión de dos cajas. Si alguna caja tiene área cero
// (ancho o alto degenerado a 0), se define el solapamiento como 1 cuando
// las cajas coinciden dentro de tolerancia y 0 en caso contrario -- para
// no dividir entre cero ni producir NaN.
function iou(a: Palabra, b: Palabra): number {
  const x0 = Math.max(a.x0, b.x0)
  const y0 = Math.max(a.y0, b.y0)
  const x1 = Math.min(a.x1, b.x1)
  const y1 = Math.min(a.y1, b.y1)
  const anchoInterseccion = Math.max(0, x1 - x0)
  const altoInterseccion = Math.max(0, y1 - y0)
  const areaInterseccion = anchoInterseccion * altoInterseccion

  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0)
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
  const areaUnion = areaA + areaB - areaInterseccion

  if (areaUnion <= 0) return dentroDeTolerancia(a, b) ? 1 : 0
  return areaInterseccion / areaUnion
}

export function deduplicarPalabras(palabras: Palabra[]): ResultadoDeduplicacion {
  // Una palabra "conservada" por página, en el orden estable de aparición
  // (primera ocurrencia gana). Comparar solo contra las ya conservadas de
  // la MISMA página evita colapsar texto repetido legítimamente en otra
  // página.
  const conservadasPorPagina = new Map<number, Palabra[]>()
  const resultado: Palabra[] = []

  for (const palabra of palabras) {
    const conservadas = conservadasPorPagina.get(palabra.pagina) ?? []

    let esDuplicado = false
    let hayConflicto = false
    for (const previa of conservadas) {
      const superposicion = iou(palabra, previa)
      const mismoTexto = normalizarTexto(palabra.texto) === normalizarTexto(previa.texto)

      if (mismoTexto && dentroDeTolerancia(palabra, previa) && superposicion >= UMBRAL_IOU_DUPLICADO) {
        esDuplicado = true
        break
      }
      if (!mismoTexto && superposicion >= UMBRAL_IOU_CONFLICTO) {
        hayConflicto = true
        break
      }
    }

    if (hayConflicto) return { ok: false, motivo: 'texto_superpuesto_conflictivo' }
    if (esDuplicado) continue

    conservadas.push(palabra)
    conservadasPorPagina.set(palabra.pagina, conservadas)
    resultado.push(palabra)
  }

  return { ok: true, palabras: resultado }
}
