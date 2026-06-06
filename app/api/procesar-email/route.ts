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

    let datosExtraidos: any = null

    if (tipo === 'xml') {
      datosExtraidos = extraerDatosXML(archivo)
    } else {
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
                text: `Eres un auxiliar contable colombiano. Extrae los datos de este documento y responde SOLO en JSON con estos campos exactos:
                {
                  "proveedor": "nombre del emisor",
                  "nit": "NIT del emisor sin digito verificacion",
                  "fecha": "YYYY-MM-DD",
                  "valor": numero sin puntos ni comas,
                  "iva": numero,
                  "descripcion": "descripcion breve",
                  "tipo": "Factura de Compra o Gasto",
                  "categoria": "Factura de Compra o Gasto",
                  "numero_factura": "numero de factura",
                  "cufe": "codigo CUFE si existe"
                }`
              },
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: tipo === 'pdf' ? 'application/pdf' : 'image/jpeg',
                  data: archivo
                }
              }
            ]
          }]
        })
      })

      const iaData = await iaRes.json()
      const texto = iaData.content?.[0]?.text || '{}'
      try {
        datosExtraidos = JSON.parse(texto.replace(/```json|```/g, '').trim())
      } catch {
        datosExtraidos = null
      }
    }

    if (!datosExtraidos) {
      return NextResponse.json({ error: 'No se pudieron extraer datos' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('facturas').insert({
      proveedor: datosExtraidos.proveedor || remitente,
      fecha: datosExtraidos.fecha || fecha_correo?.slice(0, 10),
      valor: datosExtraidos.valor || 0,
      iva: datosExtraidos.iva || 0,
      descripcion: datosExtraidos.descripcion || nombre,
      tipo: datosExtraidos.tipo || 'Factura de Compra',
      categoria: datosExtraidos.categoria || 'Factura de Compra',
      estado: 'Pendiente',
      numero_factura: datosExtraidos.numero_factura || null,
      user_id: await obtenerUserIdEmpresa(supabaseAdmin, 'asistenciasodeportc@gmail.com')
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

function extraerDatosXML(base64: string): any {
  try {
    const xml = Buffer.from(base64, 'base64').toString('utf-8')

    const extraer = (tag: string) => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'))
      return match?.[1]?.trim() || null
    }

    const nit = extraer('NIT') || extraer('NumeroDocumento')
    const razonSocial = extraer('RazonSocial') || extraer('Nombre')
    const cufe = extraer('CUFE') || extraer('UUID')
    const fechaEmision = extraer('FechaEmision') || extraer('IssueDate')
    const valorTotal = extraer('ValorTotal') || extraer('PayableAmount')
    const valorIva = extraer('ValorIVA') || extraer('TaxAmount')
    const numFactura = extraer('Numero') || extraer('ID')

    return {
      proveedor: razonSocial,
      nit,
      fecha: fechaEmision,
      valor: parseFloat(valorTotal?.replace(/[^0-9.]/g, '') || '0'),
      iva: parseFloat(valorIva?.replace(/[^0-9.]/g, '') || '0'),
      descripcion: `Factura electronica ${numFactura || ''} de ${razonSocial || ''}`,
      tipo: 'Factura de Compra',
      categoria: 'Factura de Compra',
      numero_factura: numFactura,
      cufe
    }
  } catch {
    return null
  }
}

async function obtenerUserIdEmpresa(supabase: any, correo: string): Promise<string | null> {
  const { data } = await supabase
    .from('empresas')
    .select('user_id')
    .eq('correo', correo)
    .single()
  return data?.user_id || null
}
