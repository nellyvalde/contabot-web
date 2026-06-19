// lib/nomina/conciliacionBancaria.ts
//
// Conciliación bancaria por "Match por Valor": el extracto de un banco
// (ej. AV Villas) casi nunca trae el nombre exacto del empleado tal como
// está en tu nómina (puede salir a nombre de un tercero, de la esposa,
// con el nombre truncado, etc.). Lo que SÍ es exacto y verificable es el
// valor depositado. Esta función extrae todos los valores numéricos del
// PDF y los cruza contra los registros de `nomina_programada` que sigan
// en "Pendiente de pago": si el valor coincide exactamente con `neto_pagar`,
// se marca como "Pagado" automáticamente.
//
// Requiere la librería 'pdfjs-dist':
//
//   npm install pdfjs-dist
//
// ⚠️ Esto funciona con PDFs que tienen texto seleccionable. Si el PDF es
// una imagen escaneada, esta función no encontrará texto y se debe pasar
// primero por OCR (pendiente del README).

import { supabase } from '@/lib/supabase/client'

export type RegistroPendiente = {
  id: number
  nombreEmpleado: string
  netoPagar: number
}

export type MatchConciliacion = {
  registroId: number
  nombreEmpleado: string
  valorConciliado: number
  fragmentoExtracto: string
}

export type ResultadoConciliacion = {
  matches: MatchConciliacion[]
  valoresSinMatch: number[]
  registrosSinMatch: RegistroPendiente[]
}

export async function extraerTextoPdf(archivo: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const buffer = await archivo.arrayBuffer()
  const documento = await pdfjsLib.getDocument({ data: buffer }).promise

  let textoCompleto = ''
  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina)
    const contenido = await pagina.getTextContent()
    const textoPagina = contenido.items.map((item: any) => item.str).join(' ')
    textoCompleto += `\n${textoPagina}`
  }

  return textoCompleto
}

export function extraerValoresMonetarios(texto: string): number[] {
  const patron = /\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d{2})?\b/g
  const valores = new Set<number>()

  let coincidencia: RegExpExecArray | null
  while ((coincidencia = patron.exec(texto)) !== null) {
    const crudo = coincidencia[1].replace(/[.,]/g, '')
    const numero = Number(crudo)
    if (Number.isFinite(numero) && numero >= 10000) {
      valores.add(numero)
    }
  }

  return Array.from(valores)
}

export function conciliarPorValor(
  valoresExtracto: number[],
  registrosPendientes: RegistroPendiente[]
): ResultadoConciliacion {
  const valoresSet = new Set(valoresExtracto)
  const matches: MatchConciliacion[] = []
  const registrosSinMatch: RegistroPendiente[] = []

  for (const registro of registrosPendientes) {
    if (valoresSet.has(registro.netoPagar)) {
      matches.push({
        registroId: registro.id,
        nombreEmpleado: registro.nombreEmpleado,
        valorConciliado: registro.netoPagar,
        fragmentoExtracto: `Valor exacto encontrado en el extracto: $${registro.netoPagar.toLocaleString()}`,
      })
    } else {
      registrosSinMatch.push(registro)
    }
  }

  const valoresUsados = new Set(matches.map((m) => m.valorConciliado))
  const valoresSinMatch = valoresExtracto.filter((v) => !valoresUsados.has(v))

  return { matches, valoresSinMatch, registrosSinMatch }
}

export async function conciliarExtractoPdf(
  archivo: File,
  registrosPendientes: RegistroPendiente[]
): Promise<ResultadoConciliacion> {
  const texto = await extraerTextoPdf(archivo)
  const valores = extraerValoresMonetarios(texto)
  const resultado = conciliarPorValor(valores, registrosPendientes)

  if (resultado.matches.length > 0) {
    await Promise.all(
      resultado.matches.map((match) =>
        supabase
          .from('nomina_programada')
          .update({
            estado: 'Pagado',
            metodo_conciliacion: 'automatico_valor',
            referencia_conciliacion: match.fragmentoExtracto,
            archivo_url: archivo.name,
          })
          .eq('id', match.registroId)
      )
    )
  }

  return resultado
}