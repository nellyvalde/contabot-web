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
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un auxiliar contable colombiano experto.
La empresa es SODEPORTC SAS NIT 901183507.
Analiza este documento y responde ÚNICAMENTE con JSON válido sin texto adicional ni backticks:
{
  "categoria": "uno de: Factura de Venta | Factura de Compra | Gasto | Nomina | Extracto Bancario",
  "proveedor": "nombre de la contraparte o banco",
  "fecha": "fecha en formato YYYY-MM-DD",
  "valor": numero entero sin puntos ni comas,
  "iva": numero entero del IVA o 0,
  "descripcion": "descripcion breve del documento",
  "tipo": "igual que categoria",
  "numero_factura": "numero del documento si aplica o null",
  "banco": "nombre del banco si es extracto o null",
  "periodo": "periodo del extracto ejemplo MAYO 2026 o null"
}

Reglas de clasificacion:
- Factura de Venta: SODEPORTC es el emisor/vendedor
- Factura de Compra: SODEPORTC recibe la factura/compra algo
- Gasto: recibo de caja, tiquete, recibo de servicio sin factura electronica
- Nomina: comprobante de pago de nomina, desprendible, soporte de pago a empleado
- Extracto Bancario: estado de cuenta bancario`
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

    let datos: any = {}
    try {
      datos = JSON.parse(texto.replace(/```json|```/g, '').trim())
    } catch {
      datos = { categoria: 'Factura de Compra', descripcion: nombre }
    }

    // Guardar en facturas (todos los tipos excepto Nomina)
    if (datos.categoria !== 'Nomina') {
      await supabaseAdmin.from('facturas').insert({
        user_id: userId,
        proveedor: datos.proveedor || remitente || 'Sin nombre',
        fecha: datos.fecha || fecha_correo?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        valor: datos.valor || 0,
        iva: datos.iva || 0,
        descripcion: datos.descripcion || nombre,
        tipo: datos.tipo || datos.categoria,
        categoria: datos.categoria || 'Factura de Compra',
        estado: 'Pendiente',
        numero_factura: datos.numero_factura || null,
      })
    }

    // Si es Nomina, guardar en NOMINA para conciliacion
    if (datos.categoria === 'Nomina') {
      await supabaseAdmin.from('NOMINA').insert({
        user_id: userId,
        nombre_empleado: datos.proveedor || 'Sin nombre',
        sueldo_pagado: datos.valor || 0,
        fecha_pago: datos.fecha || new Date().toISOString().slice(0, 10),
        tipo_documento: 'Comprobante Email',
      })
    }

    return NextResponse.json({ success: true, categoria: datos.categoria, datos })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
