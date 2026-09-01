// lib/bancos/confirmarCruceFactura.ts
// Envuelve la llamada a la RPC confirmar_cruce_factura (ver
// supabase/migrations/20260824_1_confirmar_cruce_factura_rpc.sql). Reemplaza
// el UPDATE directo a facturas.estado que hacia el navegador desde
// app/bancos/page.tsx -- esa RPC hace las dos escrituras (facturas.estado y
// conciliaciones_bancarias.estado) en una sola transaccion atomica del lado
// del servidor, en vez de dos escrituras separadas sin protección RLS.
import type { SupabaseClient } from '@supabase/supabase-js'

type RespuestaRpc = {
  ok: boolean
  codigo?: string
  mensaje?: string
  conciliacion_id?: string
  factura_id?: string
}

export type ResultadoConfirmarCruceFactura =
  | { ok: true; conciliacionId: string; facturaId: string }
  | { ok: false; error: string }

// El cliente de Supabase de este proyecto no tiene un Database generic, asi
// que la respuesta de una RPC jsonb llega sin tipar. Se valida su forma en
// tiempo de ejecucion en vez de asumirla -- una respuesta nula o con una
// forma inesperada se trata como error, nunca como exito silencioso.
function esRespuestaRpcValida(data: unknown): data is RespuestaRpc {
  return typeof data === 'object' && data !== null && typeof (data as { ok?: unknown }).ok === 'boolean'
}

export async function confirmarCruceFactura(
  supabase: SupabaseClient,
  conciliacionId: string | undefined
): Promise<ResultadoConfirmarCruceFactura> {
  if (!conciliacionId) {
    return {
      ok: false,
      error: 'No se encontró el identificador de la conciliación. No se puede confirmar el cruce.',
    }
  }

  const { data, error } = await supabase.rpc('confirmar_cruce_factura', { p_conciliacion_id: conciliacionId })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!esRespuestaRpcValida(data)) {
    return { ok: false, error: 'Respuesta inesperada del servidor al confirmar el cruce.' }
  }

  if (!data.ok) {
    return { ok: false, error: data.mensaje || 'No se pudo confirmar el cruce.' }
  }

  if (typeof data.conciliacion_id !== 'string' || typeof data.factura_id !== 'string') {
    return { ok: false, error: 'Respuesta incompleta del servidor al confirmar el cruce.' }
  }

  return { ok: true, conciliacionId: data.conciliacion_id, facturaId: data.factura_id }
}
