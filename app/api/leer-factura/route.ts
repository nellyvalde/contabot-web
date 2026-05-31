import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `Analiza esta factura y extrae los datos en formato JSON exactamente así:
{
  "proveedor": "nombre del proveedor o empresa",
  "fecha": "fecha en formato YYYY-MM-DD",
  "valor": 0,
  "descripcion": "descripción del producto o servicio",
  "tipo": "Factura de Compra o Factura de Venta",
  "iva": 0
}
Solo responde con el JSON, sin texto adicional.`
            }
          ]
        }
      ]
    })

    const texto = response.content[0].type === 'text' ? response.content[0].text : ''
    const datos = JSON.parse(texto)
    
    return NextResponse.json({ success: true, datos })
  } catch (error) {
    return NextResponse.json({ error: 'Error procesando la factura' }, { status: 500 })
  }
}