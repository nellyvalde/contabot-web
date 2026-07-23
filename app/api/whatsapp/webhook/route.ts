// Trigger redeploy: recoger nuevas variables de entorno de WhatsApp (test)
// app/api/whatsapp/webhook/route.ts
// Recibe soportes (facturas, comprobantes de pago, gastos) enviados por WhatsApp,
// los clasifica con IA y, si es un comprobante de pago de nomina, lo vincula
// automaticamente al empleado correspondiente (igual que el Buzon IA en /documentos).
//
// GET: handshake de verificacion que exige Meta al configurar el webhook.
// POST: evento real de mensaje entrante.
//
// NOTA (fase de pruebas): la empresa se resuelve con la variable de entorno
// WHATSAPP_TEST_EMPRESA_ID, ya que la tabla de mapeo numero->empresa
// (whatsapp_numeros_autorizados) todavia no esta aplicada en la base de datos.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clasificarDocumento } from '@/lib/documentos/clasificarDocumento'
import { intentarMatchNomina, marcarNominaPagada } from '@/lib/nomina/matchSoporte'
import { obtenerUrlMedia, descargarMedia, enviarMensajeTexto } from '@/lib/whatsapp/graphApi'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Verificacion fallida', { status: 403 })
}

function extraerMensaje(body: any) {
  const entry = body?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  return value?.messages?.[0] ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mensaje = extraerMensaje(body)

    // Eventos de estado (delivered/read) u otros que no son mensajes: se ignoran.
    if (!mensaje) {
      return NextResponse.json({ ok: true })
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!accessToken || !phoneNumberId) {
      console.error('[WhatsApp webhook] Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID.')
      return NextResponse.json({ ok: true })
    }

    const remitente = mensaje.from as string
    const media = mensaje.image || mensaje.document

    if (!media) {
      await enviarMensajeTexto({
        phoneNumberId,
        accessToken,
        to: remitente,
        texto: 'Hola 👋 Soy ContaBot. Envíame una foto o PDF de la factura, comprobante de pago o gasto que quieras registrar.',
      })
      return NextResponse.json({ ok: true })
    }

    const empresaIdPrueba = process.env.WHATSAPP_TEST_EMPRESA_ID
    if (!empresaIdPrueba) {
      console.error('[WhatsApp webhook] Falta WHATSAPP_TEST_EMPRESA_ID en el entorno (modo prueba).')
      return NextResponse.json({ ok: true })
    }

    const supabase = createAdminClient()
    const { data: empresa } = await supabase
      .from('contabot_empresas')
      .select('id, razon_social, nit')
      .eq('id', empresaIdPrueba)
      .single()

    if (!empresa) {
      console.error('[WhatsApp webhook] Empresa de prueba no encontrada:', empresaIdPrueba)
      return NextResponse.json({ ok: true })
    }

    // Descargar el archivo desde la API de Meta
    const { url, mimeType } = await obtenerUrlMedia(media.id, accessToken)
    const buffer = await descargarMedia(url, accessToken)

    // Subir a Supabase Storage (mismo bucket que usa el Buzon IA)
    const extension = mimeType === 'application/pdf' ? 'pdf' : (mimeType.split('/')[1] || 'jpg')
    const nombreArchivo = `${empresa.id}/whatsapp_${Date.now()}.${extension}`
    const { error: storageError } = await supabase.storage
      .from('facturas')
      .upload(nombreArchivo, buffer, { contentType: mimeType })

    let archivoUrl: string | null = null
    if (!storageError) {
      const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(nombreArchivo)
      archivoUrl = urlData.publicUrl
    } else {
      console.error('[WhatsApp webhook] Error subiendo a Storage:', storageError.message)
    }

    // Clasificar con IA (misma logica que usa el Buzon IA en /documentos)
    const datos = await clasificarDocumento({
      buffer,
      mimeType,
      empresaNombre: empresa.razon_social,
      empresaNit: empresa.nit,
    })

    const esSoporteNomina = datos.categoria === 'Nomina' || datos.tipo_documento === 'Comprobante de Pago a Terceros'

    if (esSoporteNomina) {
      const resultado = await intentarMatchNomina(datos, empresa.id)

      if (resultado.match) {
        await marcarNominaPagada(resultado.empleadoId, archivoUrl, 'Conciliado desde WhatsApp')
        await enviarMensajeTexto({
          phoneNumberId,
          accessToken,
          to: remitente,
          texto: `✅ Recibido. Vinculé este soporte al pago de nómina de ${resultado.nombreEmpleado}.`,
        })
        return NextResponse.json({ ok: true })
      }

      // No hizo match: queda pendiente de revision manual en /documentos, no se pierde.
      await supabase.from('documentos').insert({
        empresa_id: empresa.id,
        tipo: 'soporte_nomina',
        proveedor_cliente: datos.proveedor || null,
        descripcion: datos.descripcion || 'Soporte de nómina recibido por WhatsApp',
        fecha_emision: datos.fecha_emision || datos.fecha || null,
        valor: datos.valor_total || datos.valor || 0,
        iva: datos.iva || 0,
        cuenta_puc: '510506',
        estado_conciliacion: 'pendiente',
        estado: 'Pendiente',
        archivo_url: archivoUrl,
      })

      await enviarMensajeTexto({
        phoneNumberId,
        accessToken,
        to: remitente,
        texto: `📥 Recibido, pero no pude identificar a qué pago de nómina corresponde. Lo dejé pendiente de revisión en ContaBot.`,
      })
      return NextResponse.json({ ok: true })
    }

    // Documento general (factura, gasto, etc.)
    const tipoDoc = datos.categoria === 'Factura de Venta' ? 'factura_venta' : 'factura_compra'
    await supabase.from('documentos').insert({
      empresa_id: empresa.id,
      tipo: tipoDoc,
      numero_documento: datos.numero_documento || null,
      proveedor_cliente: datos.proveedor || null,
      descripcion: datos.descripcion || null,
      fecha_emision: datos.fecha_emision || datos.fecha || null,
      valor: datos.valor_total || datos.valor || 0,
      iva: datos.iva || 0,
      cuenta_puc: datos.cuenta_puc || null,
      estado_conciliacion: datos.ya_pagado ? 'conciliado' : 'pendiente',
      estado: datos.ya_pagado ? 'Pagado' : 'Pendiente',
      archivo_url: archivoUrl,
    })

    await enviarMensajeTexto({
      phoneNumberId,
      accessToken,
      to: remitente,
      texto: `✅ Recibido. Registré "${datos.proveedor || 'el documento'}" por $${Number(datos.valor_total || datos.valor || 0).toLocaleString('es-CO')} en ContaBot.`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Devolvemos 200 igual: si respondemos error, Meta reintenta el mismo webhook
    // varias veces y podriamos duplicar el documento. El error queda en los logs.
    console.error('[WhatsApp webhook] Error procesando mensaje:', err)
    return NextResponse.json({ ok: true })
  }
}
