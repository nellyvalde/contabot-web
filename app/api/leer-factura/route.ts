import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 })
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
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Eres un auxiliar contable colombiano experto. Analiza este documento y extrae los datos.

PASO 1 - Identifica el tipo de documento:
- "Factura Electronica": tiene CUFE, prefijo DIAN, codigo QR oficial
- "Tiquete POS": recibo de caja registradora, sin CUFE, sin QR DIAN
- "Recibo de Peaje": cobro de peaje en carretera
- "Comprobante Bancario": transferencia, pago a terceros, extracto bancario
- "Comprobante de Egreso": recibo de pago interno
- "Nomina": liquidacion de nomina o pago de salario
- "Otro": cualquier otro documento

PASO 2 - Clasifica la categoria:
- "Factura de Venta": tu empresa emite y cobra a un cliente
- "Factura de Compra": tu empresa compra bienes a un proveedor
- "Gasto": servicios (gasolina, peajes, servicios publicos, arriendo, telefonia, internet, seguros, mantenimiento, papeleria, honorarios)
- "Nomina": pagos de salario
- "Extracto Bancario": movimientos bancarios

PASO 3 - Mapeo PUC automatico:
- Si el documento es de gasolina o combustible: cuenta_puc = "519535 - Combustibles y lubricantes"
- Si el documento es de peaje: cuenta_puc = "519545 - Peajes"
- Si es nomina: cuenta_puc = "510506 - Salarios"
- Si es servicios publicos: cuenta_puc = "528505 - Servicios publicos"
- Si es arriendo: cuenta_puc = "529010 - Arrendamientos"
- Otros gastos: cuenta_puc = "519595 - Otros gastos"
- Factura de Compra: cuenta_puc = "143505 - Mercancias"
- Factura de Venta: cuenta_puc = "130505 - Clientes"

PASO 4 - Alerta si es Tiquete POS:
- Si tipo_documento es "Tiquete POS": alerta = "⚠️ Este es un Tiquete POS. Solicita la Factura Electronica al proveedor para que el contador pueda descontar el IVA y los impuestos."
- Si no: alerta = ""

REGLAS PARA proveedor:
- Si es Factura de Venta: proveedor = nombre del cliente (quien recibe)
- Si es Factura de Compra o Gasto: proveedor = nombre de quien emite

REGLAS PARA tipo:
- Factura de Venta -> tipo = "Factura de Venta"
- Factura de Compra -> tipo = "Factura de Compra"  
- Gasto -> tipo = "Factura de Compra"

Responde SOLO con este JSON sin texto adicional ni backticks:
{
  "proveedor": "nombre de la contraparte",
  "fecha": "YYYY-MM-DD",
  "valor": 0,
  "iva": 0,
  "descripcion": "descripcion breve",
  "tipo": "Factura de Venta o Factura de Compra",
  "categoria": "categoria segun reglas",
  "tipo_documento": "tipo segun paso 1",
  "combustible": "Diesel o Gasolina o vacio si no aplica",
  "cuenta_puc": "codigo y nombre segun mapeo",
  "alerta": "mensaje de alerta o vacio"
}`
            }
          ]
        }]
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
