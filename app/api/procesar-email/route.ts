import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SECRET = 'sodeportc_secret_2026'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (body.secret !== SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { archivo, nombre, remitente, fecha_correo } = body

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Buscar empresa
    const { data: empresa } = await supabase
      .from('contabot_empresas')
      .select('user_id')
      .eq('correo', 'asistenciasodeportc@gmail.com')
      .single()

    if (!empresa?.user_id) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }
    const userId = empresa.user_id

    // Si no hay archivo adjunto, guardar en docs_por_clasificar
    if (!archivo) {
      await supabase.from('docs_por_clasificar').insert({
        user_id: userId,
        nombre_archivo: nombre || 'Sin nombre',
        remitente: remitente || 'Desconocido',
        fecha_correo: fecha_correo || new Date().toISOString().slice(0, 10),
        razon: 'Email sin adjunto PDF',
        categoria_sugerida: 'Sin adjunto',
        archivo_data: archivo || null,
      })
      return NextResponse.json({ success: true, ruta: 'docs_por_clasificar', razon: 'sin adjunto' })
    }

    // Clasificar con IA
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
Analiza este documento y responde ÃšNICAMENTE con JSON vÃ¡lido sin texto adicional ni backticks:
{
  "categoria": "uno de: Factura de Venta | Factura de Compra | Gasto | Comprobante de Nomina | Extracto Bancario | Desconocido",
  "proveedor": "nombre completo de la contraparte, banco o beneficiario. Si no se puede identificar escribe null",
  "fecha": "fecha en formato YYYY-MM-DD o null",
  "valor": numero entero sin puntos ni comas o 0,
  "iva": numero entero del IVA o 0,
  "descripcion": "descripcion breve del documento",
  "numero_factura": "numero del documento si aplica o null",
  "confianza": "alta | media | baja"
}

Reglas ESTRICTAS:
- Factura de Venta: SODEPORTC es el emisor/vendedor, tiene CUFE DIAN
- Factura de Compra: SODEPORTC recibe la factura, tiene CUFE DIAN  
- Gasto: recibo de caja, tiquete, recibo de servicio SIN factura electronica DIAN
- Comprobante de Nomina: comprobante de pago bancario a empleado, transferencia de nomina, desprendible de pago, soporte de consignacion a persona natural
- Extracto Bancario: estado de cuenta bancario mensual
- Desconocido: no se puede determinar con claridad`
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
      datos = { categoria: 'Desconocido', confianza: 'baja' }
    }

    // VALIDACIÃ“N: si no tiene proveedor ni valor, va a docs_por_clasificar
    if (!datos.proveedor && (!datos.valor || datos.valor === 0)) {
      await supabase.from('docs_por_clasificar').insert({
        user_id: userId,
        nombre_archivo: nombre || 'Sin nombre',
        remitente: remitente || 'Desconocido',
        fecha_correo: fecha_correo || new Date().toISOString().slice(0, 10),
        razon: 'No se pudo identificar proveedor ni valor',
        categoria_sugerida: datos.categoria || 'Desconocido',
        archivo_data: archivo || null,
      })
      return NextResponse.json({ success: true, ruta: 'docs_por_clasificar', razon: 'sin datos' })
    }

    // VALIDACIÃ“N: confianza baja va a docs_por_clasificar
    if (datos.confianza === 'baja' || datos.categoria === 'Desconocido') {
      await supabase.from('docs_por_clasificar').insert({
        user_id: userId,
        nombre_archivo: nombre || datos.proveedor || 'Sin nombre',
        remitente: remitente || 'Desconocido',
        fecha_correo: fecha_correo || new Date().toISOString().slice(0, 10),
        razon: `ClasificaciÃ³n incierta: ${datos.categoria}`,
        categoria_sugerida: datos.categoria || 'Desconocido',
        archivo_data: archivo || null,
      })
      return NextResponse.json({ success: true, ruta: 'docs_por_clasificar', razon: 'confianza baja' })
    }

    // RUTA NÃ“MINA: Comprobante de pago bancario a empleado
    if (datos.categoria === 'Comprobante de Nomina') {
      const valorBuscado = datos.valor || 0
      const nombreBeneficiario = datos.proveedor?.toUpperCase() || ''

      // Buscar empleado por nombre o nombre alterno
      let empleadoMatch = null

      // Buscar por nombre alterno primero
      const { data: alterno } = await supabase
        .from('nombres_alternos')
        .select('nombre_empleado')
        .ilike('nombre_alterno', nombreBeneficiario)
        .maybeSingle()

      if (alterno) {
        const { data: empData } = await supabase
          .from('nomina_programada')
          .select('*')
          .eq('user_id', userId)
          .ilike('nombre_empleado', `%${alterno.nombre_empleado}%`)
          .maybeSingle()
        empleadoMatch = empData
      }

      // Si no encontrÃ³ por alterno, buscar por nombre directo
      if (!empleadoMatch) {
        const { data: empDirect } = await supabase
          .from('nomina_programada')
          .select('*')
          .eq('user_id', userId)
          .ilike('nombre_empleado', `%${nombreBeneficiario}%`)
          .maybeSingle()
        empleadoMatch = empDirect
      }

      // Si no encontrÃ³ por nombre, buscar por valor
      if (!empleadoMatch && valorBuscado > 0) {
        const { data: empValor } = await supabase
          .from('nomina_programada')
          .select('*')
          .eq('user_id', userId)
          .eq('neto_pagar', valorBuscado)
          .maybeSingle()
        empleadoMatch = empValor
      }

      if (empleadoMatch) {
        await supabase
          .from('nomina_programada')
          .update({
            estado: 'Pagado',
            archivo_url: nombre || 'email'
          })
          .eq('id', empleadoMatch.id)

        return NextResponse.json({ 
          success: true, 
          ruta: 'nomina_programada', 
          empleado: empleadoMatch.nombre_empleado 
        })
      } else {
        // No encontrÃ³ empleado â€” va a docs_por_clasificar
        await supabase.from('docs_por_clasificar').insert({
          user_id: userId,
          nombre_archivo: nombre || datos.proveedor,
          remitente: remitente || datos.proveedor,
          fecha_correo: fecha_correo || new Date().toISOString().slice(0, 10),
          razon: `Comprobante de nÃ³mina â€” empleado no encontrado: ${datos.proveedor}`,
          categoria_sugerida: 'Comprobante de Nomina',
          archivo_data: archivo || null,
        })
        return NextResponse.json({ success: true, ruta: 'docs_por_clasificar', razon: 'empleado no encontrado' })
      }
    }

    // RUTA DOCUMENTOS: Facturas y gastos vÃ¡lidos
    await supabase.from('facturas').insert({
      user_id: userId,
      proveedor: datos.proveedor || remitente || 'Sin nombre',
      fecha: datos.fecha || fecha_correo || new Date().toISOString().slice(0, 10),
      valor: datos.valor || 0,
      iva: datos.iva || 0,
      descripcion: datos.descripcion || nombre,
      tipo: datos.categoria,
      categoria: datos.categoria,
      estado: 'Pendiente',
      numero_factura: datos.numero_factura || null,
    })

    return NextResponse.json({ success: true, ruta: 'facturas', categoria: datos.categoria })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

