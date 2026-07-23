import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { clasificarDocumento } from '@/lib/documentos/clasificarDocumento'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const CONSULTA_PROMPT = (empresaNombre: string, empresaNit: string, pregunta: string, contexto: Record<string, any>) => `Eres un asistente contable y financiero colombiano. Responde la pregunta de forma clara, breve y orientada a decisiones, considerando estos datos de la empresa ${empresaNombre} NIT ${empresaNit}:
${Object.entries(contexto).map(([key, value]) => `${key}: ${value}`).join('\n')}
Pregunta: ${pregunta}
Responde en español y sin texto innecesario.`

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body?.tipo === 'consulta') {
        const empresaNombre = body.contexto?.empresa || 'LA EMPRESA'
        const empresaNit = body.contexto?.nit || ''
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{ role: 'user', content: [{ type: 'text', text: CONSULTA_PROMPT(empresaNombre, empresaNit, body.pregunta || '', body.contexto || {}) }] }]
        })
        const texto = response.content?.[0]?.type === 'text' ? response.content[0].text : ''
        return NextResponse.json({ success: true, respuesta: texto || 'No pude procesar tu consulta.' })
      }
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const empresaNombre = (formData.get('empresa_nombre') as string) || 'LA EMPRESA'
    const empresaNit = (formData.get('empresa_nit') as string) || ''

    if (!file) return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const datos = await clasificarDocumento({ buffer, mimeType: file.type, empresaNombre, empresaNit })

    return NextResponse.json({ success: true, datos })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
