import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const PROMPT = (empresaNombre: string, empresaNit: string) => `Eres un auxiliar contable colombiano experto. La empresa es ${empresaNombre} NIT ${empresaNit}. Analiza este documento y responde SOLO con JSON valido sin texto adicional ni backticks. NUNCA uses null, usa "" para texto vacio y 0 para numeros vacios.
REGLAS EN ORDEN:
1. Si el documento contiene "Archivos Cargados" o "Pagos a Terceros": tipo_documento="Comprobante de Pago a Terceros", categoria="Gasto", tipo="Factura de Compra", proveedor=busca EN ESTE ORDEN: (a) valor exacto del campo "Nombre Beneficiario", (b) valor exacto del campo "Nombre del receptor", (c) valor exacto del campo "Cuenta destino", (d) nombre completo en "Nombre Archivo" quitando solo numeros. NUNCA uses ${empresaNombre} como proveedor. valor=numero del campo "Valor Total Archivo"
2. Si es tiquete de caja sin CUFE: tipo_documento="Tiquete POS", categoria="Gasto", tipo="Factura de Compra", alerta="⚠️ Este es un Tiquete POS. Solicita la Factura Electronica para descontar el IVA."
3. Si es recibo de peaje: tipo_documento="Recibo de Peaje", categoria="Gasto", tipo="Factura de Compra", cuenta_puc="519545 - Peajes"
4. Si ${empresaNombre} emite la factura: tipo_documento="Factura Electronica", categoria="Factura de Venta", tipo="Factura de Venta", proveedor=nombre del cliente
5. Si ${empresaNombre} recibe la factura: tipo_documento="Factura Electronica", categoria="Factura de Compra", tipo="Factura de Compra", proveedor=nombre de quien emite
6. Si es servicio publico o administrativo: categoria="Gasto", tipo="Factura de Compra"
7. Si es nomina: tipo_documento="Nomina", categoria="Nomina", tipo="Factura de Compra", cuenta_puc="510506 - Salarios"
DETECCION DE PAGO:
- Si encuentras "Aprobado", "Transferencia exitosa", "Soporte de pago", "Pago exitoso", "Transaccion aprobada", "Comprobante de transferencia", "Recibo de pago" entonces ya_pagado=true
- Si NO encuentras soporte de pago entonces ya_pagado=false
MAPEO PUC:
- Gasolina o combustible: cuenta_puc="519535 - Combustibles y lubricantes"
- Servicios publicos: cuenta_puc="528505 - Servicios publicos"
- Arriendo: cuenta_puc="529010 - Arrendamientos"
- Factura de Compra: cuenta_puc="143505 - Mercancias"
- Factura de Venta: cuenta_puc="130505 - Clientes"
- Otros gastos: cuenta_puc="519595 - Otros gastos"
{"proveedor":"","nit_proveedor":"","numero_documento":"","fecha":"YYYY-MM-DD","fecha_emision":"YYYY-MM-DD","valor_base":0,"iva":0,"valor":0,"valor_total":0,"descripcion":"","tipo":"","categoria":"","tipo_documento":"","combustible":"","cuenta_puc":"","alerta":"","ya_pagado":false}`

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const empresaNombre = (formData.get('empresa_nombre') as string) || 'LA EMPRESA'
    const empresaNit = (formData.get('empresa_nit') as string) || ''

    if (!file) return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isPdf = file.type === 'application/pdf'

    const contentBlock = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: file.type as any, data: base64 } }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: [contentBlock as any, { type: 'text', text: PROMPT(empresaNombre, empresaNit) }] }]
    })

    const texto = response.content?.[0]?.type === 'text' ? response.content[0].text : ''
    const datos = JSON.parse(texto.replace(/```json|```/g, '').trim())
    if (!datos.valor_total && datos.valor) datos.valor_total = datos.valor
    if (!datos.fecha_emision && datos.fecha) datos.fecha_emision = datos.fecha

    return NextResponse.json({ success: true, datos })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}