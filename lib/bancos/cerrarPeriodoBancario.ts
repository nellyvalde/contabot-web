// lib/bancos/cerrarPeriodoBancario.ts
// Coordinador puro (sin React) para "Cerrar periodo" en app/bancos/page.tsx.
// Igual que confirmarCruceConciliacion: la escritura en Supabase se
// completa siempre, pero el resultado solo se aplica a la UI si
// `esVigente()` sigue siendo true cuando la respuesta llega -- un cierre de
// periodo iniciado en la empresa/periodo A nunca debe mostrarse como
// "cerrado" en la pantalla de la empresa/periodo B.
import type { SupabaseClient } from '@supabase/supabase-js'
import { mensajeErrorControlado, registrarErrorSupabase } from './erroresBancos'

export type ParametrosCerrarPeriodo = {
  empresaId: string
  periodo: string
  usuarioId: string | null
}

export type ResultadoCerrarPeriodo =
  | { tipo: 'cerrado' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'descartado' }

export async function cerrarPeriodoBancario(
  cliente: SupabaseClient,
  params: ParametrosCerrarPeriodo,
  esVigente: () => boolean
): Promise<ResultadoCerrarPeriodo> {
  const { error } = await cliente.from('periodos_conciliacion_bancaria').upsert(
    {
      empresa_id: params.empresaId,
      periodo: params.periodo,
      cerrado: true,
      closed_at: new Date().toISOString(),
      closed_by: params.usuarioId,
    },
    { onConflict: 'empresa_id,periodo' }
  )

  if (!esVigente()) return { tipo: 'descartado' }

  if (error) {
    registrarErrorSupabase('cerrar el periodo', error)
    return { tipo: 'error', mensaje: mensajeErrorControlado('cerrar el periodo') }
  }

  return { tipo: 'cerrado' }
}
