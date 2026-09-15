// lib/bancos/erroresBancos.ts
// Mensajes de error controlados para /bancos -- nunca se expone el texto
// crudo de un error de Supabase al usuario (puede incluir nombres de
// columnas, tablas o detalles de constraint). El detalle tecnico se
// registra aparte via registrarErrorSupabase (console.error), pensado
// para observabilidad/soporte, nunca para mostrarse en pantalla.

export type ErrorSupabaseMinimo =
  | { code?: string | null; message?: string | null }
  | null
  | undefined

export function mensajeErrorControlado(contexto: string): string {
  return `No se pudo ${contexto}. Intenta de nuevo en unos minutos.`
}

export function registrarErrorSupabase(contexto: string, error: ErrorSupabaseMinimo): void {
  if (!error) return
  console.error(`[Bancos] ${contexto}:`, error.code, error.message)
}
