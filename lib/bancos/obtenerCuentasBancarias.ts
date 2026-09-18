// lib/bancos/obtenerCuentasBancarias.ts
// Bloque A del nuevo flujo de importacion de extractos bancarios: lista de
// solo lectura de las cuentas_bancarias de una empresa. La tabla y su
// politica RLS de SELECT por empresa ya existen (PR 9a) -- no se necesita
// ninguna RPC ni migracion nueva para este bloque. Solo trae cuentas
// activas: una cuenta desactivada no deberia ofrecerse para una
// importacion nueva.
//
// Esta funcion NUNCA escribe -- ni aqui ni en ningun llamador de este
// bloque hay ninguna llamada de escritura (insert, update, delete, upsert) ni ninguna RPC contra
// cuentas_bancarias. Completar alias/numero_cuenta sigue siendo otro PR
// (ya existe actualizar_cuenta_bancaria para eso, sin consumidor todavia).
import type { SupabaseClient } from '@supabase/supabase-js'
import { mensajeErrorControlado, registrarErrorSupabase } from './erroresBancos'

export type CuentaBancaria = {
  id: string
  banco: string
  alias: string | null
  numeroCuenta: string | null
  esLegacy: boolean
}

export type ResultadoObtenerCuentas =
  | { ok: true; cuentas: CuentaBancaria[] }
  | { ok: false; mensaje: string }

// Forma cruda de la fila tal como la devuelve Supabase (columnas en
// snake_case) -- evita `any` en el .map() de abajo.
type FilaCuentaBancariaSupabase = {
  id: string
  banco: string
  alias: string | null
  numero_cuenta: string | null
  es_legacy: boolean
}

export async function obtenerCuentasBancarias(
  cliente: SupabaseClient,
  empresaId: string
): Promise<ResultadoObtenerCuentas> {
  if (!empresaId) return { ok: true, cuentas: [] }

  const { data, error } = await cliente
    .from('cuentas_bancarias')
    .select('id,banco,alias,numero_cuenta,es_legacy,activa')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .order('banco', { ascending: true })

  if (error) {
    registrarErrorSupabase('cargar las cuentas bancarias', error)
    return { ok: false, mensaje: mensajeErrorControlado('cargar las cuentas bancarias') }
  }

  const cuentas: CuentaBancaria[] = ((data || []) as FilaCuentaBancariaSupabase[]).map((r) => ({
    id: r.id,
    banco: r.banco,
    alias: r.alias,
    numeroCuenta: r.numero_cuenta,
    esLegacy: r.es_legacy,
  }))

  return { ok: true, cuentas }
}
