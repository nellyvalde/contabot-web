// lib/bancos/cerrarPeriodoBancario.ts
// Coordinador puro (sin React) para "Cerrar periodo" en app/bancos/page.tsx.
// Posee TODA la secuencia de awaits de la accion -- incluida la resolucion
// del usuario actual cuando el llamador todavia no la conoce -- y revisa
// `esVigente()` despues de CADA UNO de ellos, sin excepcion (incluida la
// rama de error de auth.getUser()). Un cierre de periodo iniciado en la
// empresa/periodo A nunca debe mostrarse como "cerrado" -- ni como un
// mensaje de error -- en la pantalla de la empresa/periodo B, sin importar
// en cual de los dos awaits haya cambiado la identidad vigente.
import type { SupabaseClient } from '@supabase/supabase-js'
import { mensajeErrorControlado, registrarErrorSupabase } from './erroresBancos'

export type ParametrosCerrarPeriodo = {
  empresaId: string
  periodo: string
  // Si el llamador ya conoce el usuario autenticado (ej. estado `user` ya
  // cargado en el componente), se pasa aqui y se evita la llamada a
  // auth.getUser(). Si es null, este coordinador la resuelve.
  usuarioConocido: { id: string } | null
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
  let usuarioId: string | null = params.usuarioConocido?.id ?? null

  if (!params.usuarioConocido) {
    const { data, error: errorUsuario } = await cliente.auth.getUser()

    // Vigencia se revisa INMEDIATAMENTE despues de este await, incluso en
    // la rama de error -- un error de auth.getUser() resuelto despues de
    // que el usuario ya cambio de empresa o de periodo no debe mostrar
    // ningun mensaje sobre la pantalla nueva.
    if (!esVigente()) return { tipo: 'descartado' }

    if (errorUsuario) {
      registrarErrorSupabase('verificar tu sesión', errorUsuario)
      return { tipo: 'error', mensaje: mensajeErrorControlado('cerrar el periodo') }
    }
    usuarioId = data.user?.id || null
  }

  const { error } = await cliente.from('periodos_conciliacion_bancaria').upsert(
    {
      empresa_id: params.empresaId,
      periodo: params.periodo,
      cerrado: true,
      closed_at: new Date().toISOString(),
      closed_by: usuarioId,
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
