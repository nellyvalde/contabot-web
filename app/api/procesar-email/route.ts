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
              text: `Eres un auxiliar contable colombiano experto en documentos financieros.
Esta empresa es SODEPORTC SAS NIT 901183507.
Analiza este documento (puede ser factura electronica, comprobante bancario, recibo de pago, transferencia, extracto, nomina u otro documento financiero).

REGLAS IMPORTANTES:
- Si el documento es un comprobante de pago bancario (AV Villas, Bancolombia, Davivienda, etc): tipo="Comprobante de Egreso", categoria="Gasto", proveedor=nombre del beneficiario
- Si SODEPORTC SAS es el EMISOR de la factura: tipo="Factura de Venta", categoria="Factura de Venta", proveedor=nombre del cliente que recibe
- Si SODEPORTC SAS es quien RECIBE la factura: tipo="Factura de Compra", categoria="Factura de Compra", proveedor=nombre de quien emite
- Si es nomina o pago a empleado: tipo="Nomina", categoria="Nomina"
- Si es extracto bancario: tipo="Extracto Bancario", categoria="Extracto Bancario"
- Si el documento es un "Resumen de Archivos Cargados" o "Archivos Cargados" de AV Villas, Bancolombia u otro banco: 
  tipo = "Comprobante de Egreso", 
  categoria = "Gasto",
  proveedor = valor del campo "Nombre Beneficiario" o "Nombre Archivo",
  valor = valor del campo "Valor Total Archivo"
- NUNCA respondas con null. Si no encuentras un dato usa "" para texto y 0 para numeros.
- El valor debe ser el monto total de la transaccion como numero entero sin puntos ni comas.

Responde UNICAMENTE con JSON valido sin texto adicional ni backticks:
{
  "proveedor": "nombre de la contraparte (cliente, proveedor o beneficiario)",
  "nit": "NIT o cedula de la contraparte sin digito verificacion",
  "fecha": "fecha en formato YYYY-MM-DD",
  "valor": numero entero del valor total,
  "iva": numero entero del IVA o 0,
  "descripcion": "descripcion breve del documento",
  "tipo": "tipo segun las reglas anteriores",
  "categoria": "categoria segun las reglas anteriores",
  "numero_factura": "numero o codigo del documento o vacio",
  "cufe": "CUFE si existe o vacio"
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
    console.log('Respuesta IA:', texto)

    let datosExtraidos: any = {}
    try {
      datosExtraidos = JSON.parse(texto.replace(/```json|```/g, '').trim())
    } catch {
      datosExtraidos = {}
    }

    // No guardar si no hay datos utiles
    const sinDatos = !datosExtraidos.proveedor && (!datosExtraidos.valor || datosExtraidos.valor === 0)
    if (sinDatos) {
      console.log('Documento sin datos utiles, no se guarda:', nombre)
      return NextResponse.json({ success: false, error: 'No se pudieron extraer datos del documento' })
    }
// Verificar duplicado por numero_factura
if (datosExtraidos.numero_factura) {
  const { data: dupNumero } = await supabaseAdmin
    .from('facturas')
    .select('id')
    .eq('user_id', userId)
    .eq('numero_factura', datosExtraidos.numero_factura)
    .maybeSingle()

  if (dupNumero) {
    console.log('Duplicado por numero_factura:', datosExtraidos.numero_factura)
    return NextResponse.json({ success: false, error: 'Factura duplicada: ' + datosExtraidos.numero_factura })
  }
}

// Verificar duplicado por proveedor + fecha + valor
const { data: duplicado } = await supabaseAdmin
  .from('facturas')
  .select('id')
  .eq('user_id', userId)
  .eq('proveedor', datosExtraidos.proveedor)
  .eq('valor', datosExtraidos.valor)
  .eq('fecha', datosExtraidos.fecha)
  .maybeSingle()

if (duplicado) {
  console.log('Duplicado por proveedor+fecha+valor')
  return NextResponse.json({ success: false, error: 'Documento duplicado, ya existe en ContaBot' })
}
    // Subir archivo a Supabase Storage
    let archivo_url = null
    if (archivo) {
      const buffer = Buffer.from(archivo, 'base64')
      const fileName = `${userId}/${Date.now()}.pdf`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('facturas')
        .upload(fileName, buffer, { contentType: 'application/pdf' })
      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage
          .from('facturas')
          .getPublicUrl(fileName)
        archivo_url = urlData.publicUrl
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
      archivo_url,
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
