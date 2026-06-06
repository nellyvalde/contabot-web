import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SECRET = 'sodeportc_secret_2026'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.secret !== SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { archivo, tipo, nombre, remitente, fecha_correo } = body

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const correoEmpresa = 'asistenciasodeportc@gmail.com'
    const { data: empresa } = await supabaseAdmin
      .from('empresas')
      .select('user_id, nombre')
      .eq('correo', correoEmpresa)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!empresa?.user_id) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    const userId = empresa.user_id

    const iaRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un auxiliar contable colombiano experto en facturas electronicas DIAN. Analiza esta factura y responde UNICAMENTE con JSON valido sin texto adicional ni backticks ni explicaciones:
{
  "proveedor": "razon social del EMISOR quien factura no quien recibe",
  "nit": "NIT del emisor sin digito verificacion ni guion",
  "fecha": "fecha expedicion en formato YYYY-MM-DD",
  "valor": numero entero del TOTAL NETO sin puntos ni comas,
  "iva": numero entero del IVA sin puntos ni comas,
  "descripcion": "descripcion del servicio o producto principal",
  "tipo": "Factura de Venta",
  "categoria": "Factura de Venta",
  "numero_factura": "prefijo y numero ejemplo VALN67",
  "cufe": "codigo CUFE completo"
}`
            },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: archivo
              }
            }
          ]
        }]
      })
    })

    const iaData = await iaRes.json()
    const texto = iaData.content?.[0]?.text || '{}'
    console.log('iaData completo:', JSON.stringify(iaData).substring(0, 500))
    console.log('Texto IA:', texto)

    let datosExtraidos: any = {}
    try {
      datosExtraidos = JSON.parse(texto.replace(/```json|```/g, '').trim())
    } catch {
      datosExtraidos = {
        descripcion: nombre,
        tipo: 'Factura de Compra',
        categoria: 'Factura de Compra'
      }
    }

    const { error } = await supabaseAdmin.from('facturas').insert({
      user_id: userId,
      proveedor: datosExtraidos.proveedor || 'Sin nombre',
      fecha: datosExtraidos.fecha || fecha_correo?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      valor: datosExtraidos.valor || 0,
      iva: datosExtraidos.iva || 0,
      descripcion: datosExtraidos.descripcion || nombre,
      tipo: datosExtraidos.tipo || 'Factura de Venta',
      categoria: datosExtraidos.categoria || 'Factura de Venta',
      estado: 'Pendiente',
      numero_factura: datosExtraidos.numero_factura || null,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, datos: datosExtraidos })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
