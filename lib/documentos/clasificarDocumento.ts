// lib/documentos/clasificarDocumento.ts
// Logica compartida de clasificacion de documentos con IA (Claude).
// Usada por /api/leer-factura (subida manual desde el navegador) y por
// /api/whatsapp/webhook (soportes recibidos por WhatsApp), para no duplicar el prompt.
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

export type DatosDocumentoIA = {
  proveedor: string
  nit_proveedor: string
  numero_documento: string
  fecha: string
  fecha_emision: string
  valor_base: number
  iva: number
  valor: number
  valor_total: number
  descripcion: string
  tipo: string
  categoria: string
  tipo_documento: string
  combustible?: string
  cuenta_puc: string
  alerta: string
  ya_pagado: boolean
  turno?: string
  no_deducible?: boolean
}

export const PROMPT_CLASIFICACION = (empresaNombre: string, empresaNit: string) => `Eres un auxiliar contable colombiano experto. La empresa es ${empresaNombre} NIT ${empresaNit}. Analiza este documento y responde SOLO con JSON valido sin texto adicional ni backticks. NUNCA uses null, usa "" para texto vacio y 0 para numeros vacios.
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
8. Si detectas palabras de turno como "turno", "nocturno", "diurno", "rotativo" o "horas extras", completa el campo turno con el texto mas relevante.
9. Si aparece "no deducible", "no es deducible", "no aplica deduccion" o similar, devuelve no_deducible=true y agrega alerta de no deducible.
{"proveedor":"","nit_proveedor":"","numero_documento":"","fecha":"YYYY-MM-DD","fecha_emision":"YYYY-MM-DD","valor_base":0,"iva":0,"valor":0,"valor_total":0,"descripcion":"","tipo":"","categoria":"","tipo_documento":"","combustible":"","cuenta_puc":"","alerta":"","ya_pagado":false,"turno":"","no_deducible":false}`

export async function clasificarDocumento(params: {
  buffer: Buffer
  mimeType: string
  empresaNombre: string
  empresaNit: string
}): Promise<DatosDocumentoIA> {
  const { buffer, mimeType, empresaNombre, empresaNit } = params
  const base64 = buffer.toString('base64')
  const isPdf = mimeType === 'application/pdf'

  const contentBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as any, data: base64 } }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: [contentBlock as any, { type: 'text', text: PROMPT_CLASIFICACION(empresaNombre, empresaNit) }] }],
  })

  const texto = response.content?.[0]?.type === 'text' ? response.content[0].text : ''
  const datos = JSON.parse(texto.replace(/```json|```/g, '').trim()) as DatosDocumentoIA

  if (!datos.valor_total && datos.valor) datos.valor_total = datos.valor
  if (!datos.fecha_emision && datos.fecha) datos.fecha_emision = datos.fecha
  if (!datos.turno) datos.turno = ''
  if (datos.no_deducible === undefined) datos.no_deducible = false

  return datos
}
