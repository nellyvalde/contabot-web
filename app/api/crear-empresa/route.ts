import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { nombre, nit, correo, telefono, ciudad, password } = await request.json()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: correo,
      password: password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const { error: empresaError } = await supabaseAdmin
      .from('contabot_empresas')
      .insert({
        nombre,
        nit,
        correo,
        telefono,
        ciudad,
        user_id: authData.user.id,
        rol: 'empresa',
      })

    if (empresaError) {
      return NextResponse.json({ error: empresaError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

