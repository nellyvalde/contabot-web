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

    // Buscar empresa por correo del remitente o usar correo fijo
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

    // Procesar con IA
    const iaRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un auxiliar contable colombiano experto. Extrae los datos de este documento contable y responde UNICAMENTE con un JSON valido sin texto adicional ni backticks:
{
  "proveedor": "razon social del emisor o vendedor",
  "nit": "NIT del emisor sin digito verificacion",
  "fecha": "fecha en formato YYYY-MM-DD",
  "valor": numero entero sin puntos ni comas,
  "iva": numero entero del IVA,
  "descripcion": "descripcion breve del concepto",
  "tipo": "Factura de Compra",
  "categoria": "Factura de Compra",
  "numero_factura": "numero de factura"
}`
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: archivo
              }
            }
          ]
        }]
      })
    })

    const iaData = await iaRes.json()
    const texto = iaData.content?.[0]?.text || '{}'
    
    let datosExtraidos: any = {}
    try {
      datosExtraidos = JSON.parse(texto.replace(/```json|```/g, '').trim())
    } catch {
      datosExtraidos = { descripcion: nombre, tipo: 'Factura de Compra', categoria: 'Factura de Compra' }
    }

    const { error } = await supabaseAdmin.from('facturas').insert({
      user_id: userId,
      proveedor: datosExtraidos.proveedor || 'Sin nombre',
      fecha: datosExtraidos.fecha || fecha_correo?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      valor: datosExtraidos.valor || 0,
      iva: datosExtraidos.iva || 0,
      descripcion: datosExtraidos.descripcion || nombre,
      tipo: datosExtraidos.tipo || 'Factura de Compra',
      categoria: datosExtraidos.categoria || 'Factura de Compra',
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
