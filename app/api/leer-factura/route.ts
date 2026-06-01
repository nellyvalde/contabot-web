import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isPDF = file.type === 'application/pdf'

    const contentBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              {
                type: 'text',
                text: `Analiza este documento contable colombiano y extrae los datos en formato JSON.

REGLAS PARA "proveedor":
- Si es Factura de Venta: proveedor = quien RECIBE la factura (cliente, aparece como "Facturado a")
- Si es Factura de Compra: proveedor = quien EMITE la factura (el vendedor)

REGLAS PARA "categoria" - elige UNA de estas opciones:
- "Factura de Venta": si tu empresa emite la factura y cobra a un cliente
- "Factura de Compra": si tu empresa recibe una factura de un proveedor por bienes o servicios
- "Gasto": servicios publicos, arriendo, internet, telefono, seguros, mantenimiento
- "Nomina": pagos de salarios, prestaciones, seguridad social
- "Extracto Bancario": documentos de banco, movimientos de cuenta
- "Documento Tributario": declaraciones de impuestos, retenciones, ICA, IVA

REGLAS PARA "tipo":
- "Factura de Venta" o "Factura de Compra" segun corresponda

Responde SOLO con este JSON sin texto adicional:
{"proveedor": "nombre", "fecha": "YYYY-MM-DD", "valor": 0, "descripcion": "texto", "tipo": "Factura de Compra o Factura de Venta", "iva": 0, "categoria": "categoria elegida"}`
              }
            ]
          }
        ]
      })
    })

    const data = await response.json()
    const texto = data.content?.[0]?.text ?? ''
    const clean = texto.replace(/```json|```/g, '').trim()
    const datos = JSON.parse(clean)

    return NextResponse.json({ success: true, datos })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
