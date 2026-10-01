// lib/bancos/extractoPdf/lineas.ts
// Fase 2: agrupa palabras de una misma página en líneas usando su
// coordenada vertical, con tolerancia proporcional a la altura mediana de
// palabra de esa página -- mismo principio ya validado en la Fase 0 sobre
// el extracto real (82/82 filas reconstruidas correctamente). Dentro de
// cada línea, las palabras quedan ordenadas por x0 (izquierda a derecha);
// el orden de lectura original (`orden`) solo se usa para desempatar
// palabras que comparten exactamente la misma altura.
import type { Palabra } from './tipos'

export type Linea = {
  pagina: number
  y: number // centroide vertical de la línea, espacio de coordenadas del PDF
  palabras: Palabra[]
}

export function agruparEnLineas(palabras: Palabra[]): Linea[] {
  const porPagina = new Map<number, Palabra[]>()
  for (const p of palabras) {
    if (!p.texto.trim()) continue
    const lista = porPagina.get(p.pagina) ?? []
    lista.push(p)
    porPagina.set(p.pagina, lista)
  }

  const resultado: Linea[] = []
  const paginasOrdenadas = [...porPagina.entries()].sort((a, b) => a[0] - b[0])

  for (const [pagina, palabrasPagina] of paginasOrdenadas) {
    const alturas = palabrasPagina.map(w => w.y1 - w.y0).sort((a, b) => a - b)
    const alturaMediana = alturas[Math.floor(alturas.length / 2)] || 1
    // PDF: origen abajo-izquierda -- "arriba" de la página es y0 mayor.
    const ordenadas = [...palabrasPagina].sort((a, b) => b.y0 - a.y0 || a.orden - b.orden)

    const grupos: { y: number; palabras: Palabra[] }[] = []
    for (const w of ordenadas) {
      const yc = (w.y0 + w.y1) / 2
      const ultimo = grupos.at(-1)
      if (ultimo && Math.abs(yc - ultimo.y) <= 0.55 * alturaMediana) {
        ultimo.palabras.push(w)
        ultimo.y = (ultimo.y * (ultimo.palabras.length - 1) + yc) / ultimo.palabras.length
      } else {
        grupos.push({ y: yc, palabras: [w] })
      }
    }
    for (const g of grupos) {
      resultado.push({ pagina, y: g.y, palabras: [...g.palabras].sort((a, b) => a.x0 - b.x0) })
    }
  }
  return resultado
}
