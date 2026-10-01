// lib/bancos/extractoPdf/leerExtractoPdf.ts
// Orquestador: adaptador pdfjs -> líneas -> vigencia -> bloques/filas ->
// resumen -> validación financiera. Devuelve o bien los movimientos ya
// validados, o un rechazo controlado del DOCUMENTO COMPLETO -- nunca un
// resultado parcial. Este archivo no llama a Supabase, no hace ninguna
// escritura, y no usa IA en ningún punto.
import type { Movimiento, MotivoRechazo } from './tipos'
import { extraerPalabrasDePdf } from './adaptadorPdfjs'
import { agruparEnLineas } from './lineas'
import { parseVigencia } from './vigencia'
import { reconstruirBloques } from './filas'
import { extraerResumen } from './resumen'
import { validarYClasificar } from './validacionFinanciera'
import { normalizarTexto } from './texto'

export type ResultadoLecturaPdf =
  | { ok: true; movimientos: Movimiento[] }
  | { ok: false; motivo: MotivoRechazo; detalle?: string }

export async function leerExtractoPdf(bytes: ArrayBuffer): Promise<ResultadoLecturaPdf> {
  const extraccion = await extraerPalabrasDePdf(bytes)
  if (!extraccion.ok) return extraccion

  const lineas = agruparEnLineas(extraccion.palabras)

  const vigencia = buscarVigencia(lineas)
  if (!vigencia) return { ok: false, motivo: 'vigencia_no_determinada' }

  const reconstruccion = reconstruirBloques(lineas)
  if (!reconstruccion.ok) return reconstruccion

  const resumen = extraerResumen(lineas)
  if (!resumen) return { ok: false, motivo: 'resumen_no_encontrado' }

  const todasLasFilas = reconstruccion.bloques.flatMap(b => b.filas)
  const validacion = validarYClasificar(todasLasFilas, resumen, vigencia)
  if (!validacion.ok) return validacion

  return { ok: true, movimientos: validacion.movimientos }
}

function buscarVigencia(lineas: ReturnType<typeof agruparEnLineas>) {
  for (const linea of lineas) {
    const texto = normalizarTexto(linea.palabras.map(w => w.texto).join(' '))
    const v = parseVigencia(texto)
    if (v) return v
  }
  return null
}
