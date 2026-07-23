// lib/supabase/admin.ts
// Cliente de Supabase para uso EXCLUSIVO en el servidor (rutas API, webhooks).
// Usa la Service Role Key, que bypassa RLS - nunca debe llegar al navegador.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cliente) return cliente

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.'
    )
  }

  cliente = createClient(url, serviceKey, { auth: { persistSession: false } })
  return cliente
}
