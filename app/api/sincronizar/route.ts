import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const res = await fetch('https://hook.us2.make.com/bj7rbp0fsgfj19pqd3w3fpp61j767vo3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual', fecha: new Date().toISOString() }),
    })
    return NextResponse.json({ success: true, status: res.status })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'No se pudo conectar con Make' }, { status: 500 })
  }
}
