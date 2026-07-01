import Anthropic from '@anthropic-ai/sdk'
import { PDFDocument } from 'pdf-lib'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const PROMPT_ANALISIS = (empresaNombre: string, empresaNit: string) => `Eres un auxiliar contable colombiano experto. La empresa es ${empresaNombre} NIT ${empresaNit}. Analiza este documento y responde SOLO con JSON valido sin texto adicional ni backticks. NUNCA uses null, usa "" para texto vacio y 0 para numeros vacios.
REGLAS EN ORDEN:
1. Si el documento contiene "Archivos Cargados" o "Pagos a Terceros": tipo_documento="Comprobante de Pago a Terceros", categoria="Gasto", tipo="Factura de Compra", proveedor=busca EN ESTE ORDEN: (a) valor exacto del campo "Nombre Beneficiario", (b) valor exacto del campo "Nombre del receptor", (c) valor exacto del campo "Cuenta destino", (d) nombre completo en "Nombre Archivo" quitando solo numeros. NUNCA uses ${empresaNombre} como proveedor. valor=numero del campo "Valor Total Archivo"
2. Si es tiquete de caja sin CUFE: tipo_documento="Tiquete POS", categoria="Gasto", tipo="Factura de Compra", alerta="⚠️ Este es un Tiquete POS. Solicita la Factura Electronica para descontar el IVA."
3. Si es recibo de peaje: tipo_documento="Recibo de Peaje", categoria="Gasto", tipo="Factura de Compra", cuenta_puc="519545 - Peajes"
4. Si ${empresaNombre} emite la factura: tipo_documento="Factura Electronica", categoria="Factura de Venta", tipo="Factura de Venta", proveedor=nombre del cliente
5. Si ${empresaNombre} recibe la factura: tipo_documento="Factura Electronica", categoria="Factura de Compra", tipo="Factura de Compra", proveedor=nombre de quien emite
6. Si es servicio publico o administrativo: categoria="Gasto", tipo="Factura de Compra"
7. Si es nomina: tipo_documento="Nomina", categoria="Nomina", tipo="Factura de Compra", cuenta_puc="510506 - Salarios"
DETECCION DE PAGO (MUY IMPORTANTE):
- Revisa TODAS las paginas del documento
- Si encuentras palabras como "Aprobado", "Transferencia exitosa", "Soporte de pago", "Pago exitoso", "Transaccion aprobada", "Comprobante de transferencia", "Recibo de pago" entonces ya_pagado=true
- Si NO encuentras ningun soporte de pago entonces ya_pagado=false
MAPEO PUC si no esta definido arriba:
- Gasolina o combustible: cuenta_puc="519535 - Combustibles y lubricantes", combustible="Gasolina" o "Diesel"
- Servicios publicos: cuenta_puc="528505 - Servicios publicos"
- Arriendo: cuenta_puc="529010 - Arrendamientos"
- Factura de Compra: cuenta_puc="143505 - Mercancias"
- Factura de Venta: cuenta_puc="130505 - Clientes"
- Otros gastos: cuenta_puc="519595 - Otros gastos"
{"proveedor":"","nit_proveedor":"","numero_documento":"","fecha":"YYYY-MM-DD","fecha_emision":"YYYY-MM-DD","valor_base":0,"iva":0,"valor":0,"valor_total":0,"descripcion":"","tipo":"","categoria":"","tipo_documento":"","combustible":"","cuenta_puc":"","alerta":"","ya_pagado":false}`

async function analizarPagina(base64: string, empresaNombre: string, empresaNit: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 }
        },
        { type: 'text', text: PROMPT_ANALISIS(empresaNombre, empresaNit) }
      ]
    }]
  })
  const texto = response.content?.[0]?.type === 'text' ? response.content[0].text : ''
  const clean = texto.replace(/```json|```/g, '').trim()
  const datos = JSON.parse(clean)
  if (!datos.valor_total && datos.valor) datos.valor_total = datos.valor
  if (!datos.fecha_emision && datos.fecha) datos.fecha_emision = datos.fecha
  return datos
}

function esComprobantePago(datos: any): boolean {
  return datos.ya_pagado === true ||
    ['Comprobante de Pago a Terceros', 'Comprobante de Pago'].includes(datos.tipo_documento)
}

function esFactura(datos: any): boolean {
  return ['Factura Electronica', 'Factura de Compra', 'Factura de Venta'].includes(datos.tipo_documento)
}

function coinciden(factura: any, comprobante: any): boolean {
  const mismoProveedor = factura.proveedor && comprobante.proveedor &&
    factura.proveedor.toLowerCase().includes(comprobante.proveedor.toLowerCase().split(' ')[0])
  const mismoValor = Math.abs((factura.valor_total || 0) - (comprobante.valor_total || 0)) < 5000
  return mismoProveedor || mismoValor
}

async function extraerPagina(pdfBytes: Uint8Array, indicePagina: number): Promise<string> {
  const pdfOriginal = await PDFDocument.load(pdfBytes)
  const pdfNuevo = await PDFDocument.create()
  const [pagina] = await pdfNuevo.copyPages(pdfOriginal, [indicePagina])
  pdfNuevo.addPage(pagina)
  const bytes = await pdfNuevo.save()
  return Buffer.from(bytes).toString('base64')
}

async function fusionarPaginas(pdfBytes: Uint8Array, indices: number[]): Promise<string> {
  const pdfOriginal = await PDFDocument.load(pdfBytes)
  const pdfNuevo = await PDFDocument.create()
  const paginas = await pdfNuevo.copyPages(pdfOriginal, indices)
  paginas.forEach(p => pdfNuevo.addPage(p))
  const bytes = await pdfNuevo.save()
  return Buffer.from(bytes).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const empresaNombre = (formData.get('empresa_nombre') as string) || 'LA EMPRESA'
    const empresaNit = (formData.get('empresa_nit') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const pdfBytes = new Uint8Array(bytes)
    const base64Total = Buffer.from(bytes).toString('base64')

    // Si es imagen, procesar directo como antes
    if (!file.type.includes('pdf')) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Total
              }
            },
            { type: 'text', text: PROMPT_ANALISIS(empresaNombre, empresaNit) }
          ]
        }]
      })
      const texto = response.content?.[0]?.type === 'text' ? response.content[0].text : ''
      const clean = texto.replace(/```json|```/g, '').trim()
      const datos = JSON.parse(clean)
      if (!datos.valor_total && datos.valor) datos.valor_total = datos.valor
      if (!datos.fecha_emision && datos.fecha) datos.fecha_emision = datos.fecha
      return NextResponse.json({ success: true, datos, modo: 'imagen' })
    }

    // Contar páginas del PDF
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const numPaginas = pdfDoc.getPageCount()

    // Si es 1 página procesar directo
    if (numPaginas === 1) {
      const datos = await analizarPagina(base64Total, empresaNombre, empresaNit)
      return NextResponse.json({ success: true, datos, modo: 'pagina_unica' })
    }

    // PDF multipágina — analizar página por página
    // PDFs de más de 2 páginas — procesar completo para evitar timeout
if (numPaginas > 2) {
  const datos = await analizarPagina(base64Total, empresaNombre, empresaNit)
  return NextResponse.json({ success: true, datos, modo: 'pdf_completo' })
}
    const analisisPorPagina: any[] = []
    for (let i = 0; i < numPaginas; i++) {
      const base64Pagina = await extraerPagina(pdfBytes, i)
      const datos = await analizarPagina(base64Pagina, empresaNombre, empresaNit)
      analisisPorPagina.push({ indice: i, datos })
    }

    // Agrupar parejas: factura + comprobante consecutivo
    const registros: any[] = []
    let i = 0
    while (i < analisisPorPagina.length) {
      const actual = analisisPorPagina[i]
      const siguiente = analisisPorPagina[i + 1]

      if (
        siguiente &&
        esFactura(actual.datos) &&
        esComprobantePago(siguiente.datos) &&
        coinciden(actual.datos, siguiente.datos)
      ) {
        // Fusionar las dos páginas
        const base64Fusionado = await fusionarPaginas(pdfBytes, [actual.indice, siguiente.indice])
        registros.push({
          ...actual.datos,
          ya_pagado: true,
          pdf_fusionado: base64Fusionado,
          paginas_fusionadas: [actual.indice + 1, siguiente.indice + 1],
          modo: 'pareja_fusionada'
        })
        i += 2 // saltar las dos páginas
      } else {
        registros.push({
          ...actual.datos,
          modo: 'individual'
        })
        i += 1
      }
    }

    // Si solo hay un registro devolver como antes para compatibilidad
    if (registros.length === 1) {
      return NextResponse.json({ success: true, datos: registros[0], modo: registros[0].modo })
    }

    // Múltiples registros
    return NextResponse.json({ success: true, registros, modo: 'multipagina' })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}