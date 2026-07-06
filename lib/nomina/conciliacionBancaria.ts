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
  // Mantenemos esta función por compatibilidad, realizando coincidencia exacta de valor.
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
  registrosPendientes: RegistroPendiente[],
  userId?: string,
  empresaId?: string
): Promise<ResultadoConciliacion> {
  const texto = await extraerTextoPdf(archivo)
  const valores = extraerValoresMonetarios(texto)

  // 1. Cargar alias registrados desde Supabase
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
    } catch (e) {
      console.error('[ContaBot] Error cargando alias de terceros:', e)
    }
  }

  const matches: MatchConciliacion[] = []
  const registrosSinMatch: RegistroPendiente[] = []
  const textoNormalizado = normalizar(texto)
  const lineas = texto.split('\n')

  // Controlar qué importes del PDF ya se asignaron
  const valoresUsadosEnPdf = new Set<number>()

  // --- PRIMERA PASADA: Búsqueda por Nombre o Alias + Valor con margen +/- $10 pesos ---
  for (const registro of registrosPendientes) {
    const nombreNorm = normalizar(registro.nombreEmpleado)
    const aliases = aliasesMap[registro.cedula] || []
    
    let coincidenciaPorNombre = false
    let aliasCoincidente = ''

    if (textoNormalizado.includes(nombreNorm)) {
      coincidenciaPorNombre = true
    } else {
      for (const alias of aliases) {
        const aliasNorm = normalizar(alias)
        if (aliasNorm && textoNormalizado.includes(aliasNorm)) {
          coincidenciaPorNombre = true
          aliasCoincidente = alias
          break
        }
      }
    }

    if (coincidenciaPorNombre) {
      // Buscar un valor en el PDF que coincida con el neto a pagar (+/- 10) y no haya sido usado
      const valorCoincidente = valores.find(v => !valoresUsadosEnPdf.has(v) && Math.abs(v - registro.netoPagar) <= 10)
      
      if (valorCoincidente !== undefined) {
        valoresUsadosEnPdf.add(valorCoincidente)
        const detalleMatch = aliasCoincidente
          ? `Coincidencia por alias "${aliasCoincidente}" y valor: $${valorCoincidente.toLocaleString()}`
          : `Coincidencia por nombre exacto y valor: $${valorCoincidente.toLocaleString()}`

        matches.push({
          registroId: registro.id,
          nombreEmpleado: registro.nombreEmpleado,
          valorConciliado: valorCoincidente,
          fragmentoExtracto: detalleMatch
        })
        continue
      }
    }

    registrosSinMatch.push(registro)
  }

  // --- SEGUNDA PASADA: Detección por Valor Único con margen +/- $10 pesos ---
  const valoresDisponibles = valores.filter(v => !valoresUsadosEnPdf.has(v))
  const finalRegistrosSinMatch: RegistroPendiente[] = []

  for (const registro of registrosSinMatch) {
    const neto = registro.netoPagar
    const valoresCercanos = valoresDisponibles.filter(v => Math.abs(v - neto) <= 10)

    if (valoresCercanos.length > 0) {
      // Tomamos el primer valor candidato disponible
      const valorCandidato = valoresCercanos[0]
      
      // Validar si existe un único empleado en este mes con este valor neto coincidente (+/- 10)
      const empleadosConMismoNeto = registrosPendientes.filter(r => Math.abs(r.netoPagar - valorCandidato) <= 10)

      if (empleadosConMismoNeto.length === 1) {
        valoresUsadosEnPdf.add(valorCandidato)
        
        // Buscar la línea correspondiente en el PDF para extraer el alias
        let aliasExtraido = ''
        for (const linea of lineas) {
          const vals = extraerValoresMonetarios(linea)
          if (vals.some(v => Math.abs(v - valorCandidato) <= 10)) {
            aliasExtraido = extraerAliasDeLinea(linea, valorCandidato)
            if (aliasExtraido) break
          }
        }

        // Guardar alias en Supabase si es válido
        if (userId && empresaId && aliasExtraido && aliasExtraido.length >= 3) {
          try {
            const { data: aliasExistente } = await supabase
              .from('alias_terceros')
              .select('id')
              .eq('user_id', userId)
              .eq('empresa_id', empresaId)
              .eq('cedula', registro.cedula)
              .eq('alias', aliasExtraido)
              .maybeSingle()

            if (!aliasExistente) {
              await supabase.from('alias_terceros').insert({
                user_id: userId,
                empresa_id: empresaId,
                cedula: registro.cedula,
                alias: aliasExtraido
              })
              console.log(`[ContaBot] Guardado alias "${aliasExtraido}" para el empleado con cédula ${registro.cedula}`)
            }
          } catch (aliasErr) {
            console.error('[ContaBot] Error guardando alias en la base de datos:', aliasErr)
          }
        }

        matches.push({
          registroId: registro.id,
          nombreEmpleado: registro.nombreEmpleado,
          valorConciliado: valorCandidato,
          fragmentoExtracto: `Coincidencia por valor único: $${valorCandidato.toLocaleString()}${aliasExtraido ? ` (Alias detectado: ${aliasExtraido})` : ''}`
        })
        continue
      }
    }

    finalRegistrosSinMatch.push(registro)
  }

  const valoresSinMatch = valores.filter(v => !valoresUsadosEnPdf.has(v))

  const resultado: ResultadoConciliacion = {
    matches,
    valoresSinMatch,
    registrosSinMatch: finalRegistrosSinMatch
  }

  // --- AUTOMATIZACIÓN: Guardar y marcar como Pagado en Supabase ---
  if (resultado.matches.length > 0) {
    await Promise.all(
      resultado.matches.map((match) => {
        const metodo = match.fragmentoExtracto.includes('único') ? 'automatico_valor' : 'automatico_nombre'
        return supabase
          .from('nomina_programada')
          .update({
            estado: 'Pagado',
            metodo_conciliacion: metodo,
            referencia_conciliacion: match.fragmentoExtracto,
            archivo_url: archivo.name, // Vincular soporte
          })
          .eq('id', match.registroId)
      })
    )
  }

  return resultado
}