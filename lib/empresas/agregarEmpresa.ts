// lib/empresas/agregarEmpresa.ts
// Envuelve la llamada a la RPC crear_empresa_y_vincular_usuario (ver
// supabase/migrations/20260730_2_rpc_crear_empresa_y_vincular_usuario.sql).
// Antes esto eran dos INSERT separados desde el navegador (contabot_empresas
// y luego usuarios_empresas); ahora es una sola llamada atomica, para que
// un fallo a mitad de camino nunca deje una empresa sin usuario vinculado.
import type { SupabaseClient } from '@supabase/supabase-js'

export type EmpresaCreada = { id: string; nit: string; razon_social: string }

export type ResultadoAgregarEmpresa =
  | { ok: true; empresa: EmpresaCreada }
  | { ok: false; error: string }

export async function crearEmpresaYVincular(
  supabase: SupabaseClient,
  params: { nit: string; razonSocial: string }
): Promise<ResultadoAgregarEmpresa> {
  const { data, error } = await supabase
    .rpc('crear_empresa_y_vincular_usuario', {
      p_nit: params.nit.trim(),
      p_razon_social: params.razonSocial.trim(),
    })
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message || 'No se pudo crear la empresa.' }
  }

  return { ok: true, empresa: data as EmpresaCreada }
}
