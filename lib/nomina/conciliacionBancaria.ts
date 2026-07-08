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
  cedula: string
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
  const patron = /\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d{1,})(?:[.,]\d{2})?\b/g
  const valores = new Set<number>()

  let coincidencia: RegExpExecArray | null
  while ((coincidencia = patron.exec(texto)) !== null) {
    const crudo = coincidencia[1].replace(/[.,]/g, '')
    const numero = Number(crudo)
    if (Number.isFinite(numero) && numero >= 1000) {
      valores.add(Math.round(numero))
    }
  }

  return Array.from(valores).sort((a, b) => a - b)
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extraerAliasDeLinea(linea: string, valorObjetivo: number): string {
  // Remover valores numéricos que representen dinero/número
  let limpia = linea.replace(/\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d{2})?\b/g, '')
  
  // Remover formatos de fecha (DD/MM/YYYY, YYYY/MM/DD, etc.)
  limpia = limpia.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, '')
  
  // Remover palabras comunes de transacciones bancarias
  const palabrasComunes = [
    'transf', 'transferencia', 'consignacion', 'abono', 'pago', 'nomina', 'ach', 
    'banco', 'av villas', 'davivienda', 'bancolombia', 'efectivo', 'egreso', 
    'debito', 'credito', 'nro', 'ref', 'cuenta', 'cte', 'ahos', 'ahorro',
    'a', 'de', 'para', 'por', 'en', 'con'
  ]
  
  let palabras = limpia.split(/\s+/)
  palabras = palabras.filter(p => {
    const pNorm = normalizar(p)
    if (!pNorm) return false
    if (palabrasComunes.includes(pNorm)) return false
    if (/^\d+$/.test(pNorm)) return false
    return true
  })
  
  const aliasDetectado = palabras.join(' ').trim()
  return aliasDetectado
    .replace(/[()\[\]\-,.:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

  const valoresUsados = new Set(matches.map((match) => match.valorConciliado))
  const valoresSinMatch = valoresExtracto.filter((valor) => !valoresUsados.has(valor))

  return { matches, valoresSinMatch, registrosSinMatch }
}

export async function conciliarExtractoPdf(
  archivo: File,
  registrosPendientes: RegistroPendiente[],
  userId?: string,
  empresaId?: string
): Promise<ResultadoConciliacion> {
  const texto = await extraerTextoPdf(archivo)
  const valores = extraerValoresMonetarios(texto)
  const textoNormalizado = normalizar(texto)
  const lineas = texto.split('\n')

  const aliasesMap: Record<string, string[]> = {}
  if (userId && empresaId) {
    try {
      const { data: aliasesData } = await supabase
        .from('alias_terceros')
        .select('cedula, alias')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)

      if (aliasesData) {
        for (const row of aliasesData) {
          if (!aliasesMap[row.cedula]) {
            aliasesMap[row.cedula] = []
          }
          aliasesMap[row.cedula].push(row.alias)
        }
      }
    } catch (error) {
      console.error('[ContaBot] Error cargando alias de terceros:', error)
    }
  }

  const matches: MatchConciliacion[] = []
  const registrosSinMatch: RegistroPendiente[] = []
  const valoresUsadosEnPdf = new Set<number>()
  const idsMarcados = new Set<number>()
  const pendientesOrdenados = [...registrosPendientes].sort((a, b) => a.netoPagar - b.netoPagar)

  for (const registro of pendientesOrdenados) {
    const nombreNormalizado = normalizar(registro.nombreEmpleado)
    const aliases = aliasesMap[registro.cedula] ?? []
    const tieneTextoCoincidente = Boolean(nombreNormalizado && textoNormalizado.includes(nombreNormalizado))
    const aliasCoincidente = aliases.find((alias) => {
      const aliasNormalizado = normalizar(alias)
      return Boolean(aliasNormalizado && textoNormalizado.includes(aliasNormalizado))
    })

    const candidatos = valores.filter((valor) => !valoresUsadosEnPdf.has(valor) && Math.abs(valor - registro.netoPagar) <= 10)
    const valorExacto = candidatos.find((valor) => valor === registro.netoPagar)
    const valorSeleccionado = valorExacto ?? (candidatos.length === 1 ? candidatos[0] : undefined)
    const esUnicoParaRegistro = Boolean(valorSeleccionado) && pendientesOrdenados.filter((item) => !idsMarcados.has(item.id) && Math.abs(item.netoPagar - valorSeleccionado!) <= 10).length === 1

    if (valorSeleccionado && (tieneTextoCoincidente || aliasCoincidente || esUnicoParaRegistro)) {
      valoresUsadosEnPdf.add(valorSeleccionado)
      idsMarcados.add(registro.id)

      let aliasExtraido = ''
      for (const linea of lineas) {
        const valoresLinea = extraerValoresMonetarios(linea)
        if (valoresLinea.some((valor) => Math.abs(valor - valorSeleccionado) <= 10)) {
          aliasExtraido = extraerAliasDeLinea(linea, valorSeleccionado)
          if (aliasExtraido) break
        }
      }

      const detalle = aliasCoincidente
        ? `Coincidencia por alias "${aliasCoincidente}" y valor: $${valorSeleccionado.toLocaleString()}`
        : `Coincidencia por valor único: $${valorSeleccionado.toLocaleString()}${aliasExtraido ? ` (Alias detectado: ${aliasExtraido})` : ''}`

      matches.push({
        registroId: registro.id,
        nombreEmpleado: registro.nombreEmpleado,
        valorConciliado: valorSeleccionado,
        fragmentoExtracto: detalle,
      })
      continue
    }

    registrosSinMatch.push(registro)
  }

  const valoresSinMatch = valores.filter((valor) => !valoresUsadosEnPdf.has(valor))
  const resultado: ResultadoConciliacion = { matches, valoresSinMatch, registrosSinMatch }

  if (resultado.matches.length > 0) {
    await Promise.all(
      resultado.matches.map((match) => {
        const metodo = match.fragmentoExtracto.includes('alias') ? 'automatico_nombre' : 'automatico_valor'
        let query = supabase
          .from('nomina_programada')
          .update({
            estado: 'Pagado',
            metodo_conciliacion: metodo,
            referencia_conciliacion: match.fragmentoExtracto,
            archivo_url: archivo.name,
          })
          .eq('id', match.registroId)

        if (empresaId) {
          query = query.eq('empresa_id', empresaId)
        }

        return query
      })
    )
  }

  return resultado
}