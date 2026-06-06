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
              text: `Eres un auxiliar contable colombiano experto. La empresa es SODEPORTC SAS NIT 901183507.
Analiza este documento y extrae los datos.

PASO 1 - Identifica el tipo de documento (tipo_documento):
- Si contiene "Archivos Cargados", "Pagos a Terceros" o "Tipo Archivo: Pagos a Terceros": tipo_documento="Comprobante de Pago a Terceros"
- Si es recibo de caja registradora sin CUFE ni QR DIAN: tipo_documento="Tiquete POS"
- Si tiene CUFE y QR DIAN: tipo_documento="Factura Electronica"
- Si es recibo de peaje: tipo_documento="Recibo de Peaje"
- Si es transferencia o consignacion bancaria: tipo_documento="Comprobante Bancario"
- Si es extracto con movimientos debito y credito: tipo_documento="Extracto Bancario"
- Si es nomina o pago de salario: tipo_documento="Nomina"
- Otros: tipo_documento="Otro"

PASO 2 - Clasifica categoria y proveedor:
- Si tipo_documento es "Comprobante de Pago a Terceros": categoria="Gasto", tipo="Factura de Compra", proveedor=valor del campo "Nombre Beneficiario" (NUNCA uses SODEPORTC como proveedor)
- Si tipo_documento es "Tiquete POS": categoria="Gasto", tipo="Factura de Compra", proveedor=nombre del establecimiento
- Si tipo_documento es "Recibo de Peaje": categoria="Gasto", tipo="Factura de Compra", proveedor=nombre del peaje
- Si tipo_documento es "Comprobante Bancario": categoria="Gasto", tipo="Factura de Compra", proveedor=nombre del beneficiario
- Si SODEPORTC SAS EMITE la factura: categoria="Factura de Venta", tipo="Factura de Venta", proveedor=nombre del cliente
- Si SODEPORTC SAS RECIBE la factura: categoria="Factura de Compra", tipo="Factura de Compra", proveedor=nombre de quien emite
- Si es servicio publico, arriendo, telefonia, internet, seguro: categoria="Gasto", tipo="Factura de Compra"
- Si es nomina: categoria="Nomina", tipo="Factura de Compra"

PASO 3 - Mapeo PUC:
- Gasolina o combustible: cuenta_puc="519535 - Combustibles y lubricantes"
- Peaje: cuenta_puc="519545 - Peajes"
- Nomina o salario: cuenta_puc="510506 - Salarios"
- Servicios publicos: cuenta_puc="528505 - Servicios publicos"
- Arriendo: cuenta_puc="529010 - Arrendamientos"
- Factura de Compra general: cuenta_puc="143505 - Mercancias"
- Factura de Venta: cuenta_puc="130505 - Clientes"
- Otros gastos: cuenta_puc="519595 - Otros gastos"

PASO 4 - Alerta:
- Si tipo_documento es "Tiquete POS": alerta="⚠️ Este es un Tiquete POS. Solicita la Factura Electronica al proveedor para que el contador pueda descontar el IVA."
- Otros: alerta=""

PASO 5 - Combustible:
- Si el documento es de gasolina o ACPM: combustible="Gasolina" o combustible="Diesel"
- Otros: combustible=""

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
  "combustible": "Diesel o Gasolina o vacio",
  "cuenta_puc": "codigo y nombre segun mapeo",
  "alerta": "mensaje o vacio"
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
