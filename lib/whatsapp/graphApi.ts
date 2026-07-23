// lib/whatsapp/graphApi.ts
// Funciones minimas para hablar con la API de Meta (WhatsApp Cloud API).
// La version de la API se puede subir con el tiempo; se deja fija aqui para
// evitar sorpresas si Meta cambia el default.
const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export async function obtenerUrlMedia(mediaId: string, accessToken: string): Promise<{ url: string; mimeType: string }> {
  const res = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Error consultando media ${mediaId}: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return { url: json.url, mimeType: json.mime_type }
}

export async function descargarMedia(url: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    throw new Error(`Error descargando media: ${res.status}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function enviarMensajeTexto(params: {
  phoneNumberId: string
  accessToken: string
  to: string
  texto: string
}): Promise<void> {
  const { phoneNumberId, accessToken, to, texto } = params
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: texto },
    }),
  })
  if (!res.ok) {
    console.error('[WhatsApp] Error enviando mensaje:', res.status, await res.text())
  }
}
