// lib/bancos/confirmarCruceConciliacion.ts
// Coordinador puro (sin React) para el boton "Confirmar cruce" de una fila
// de conciliaciones_bancarias. Envuelve confirmarCruceFactura (RPC) o
// confirmarCruceNomina (abono) segun el tipo de fila, y NUNCA deja que el
// llamador aplique el resultado si `esVigente()` ya es false cuando la
// respuesta llega -- evita que una confirmacion iniciada en una empresa o
// periodo termine marcando como confirmada (o mostrando un mensaje sobre)
// una fila que en pantalla ya pertenece a otra empresa/periodo.
import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmarCruceFactura } from './confirmarCruceFactura'
import { confirmarCruceNomina, type ParametrosConfirmarCruceNomina } from './confirmarCruceNomina'
import { mensajeErrorControlado } from './erroresBancos'

export type FilaAConfirmar =
  | { tipo: 'factura'; id: string | undefined }
  | { tipo: 'nomina'; id: string | undefined; parametros: ParametrosConfirmarCruceNomina }

export type ResultadoConfirmarCruceConciliacion =
  | { tipo: 'confirmado'; id: string }
  | { tipo: 'error'; mensaje: string }
  // La operacion en si pudo completarse (o no) en el backend, pero la
  // identidad (empresa/periodo) capturada al iniciar ya no es la vigente
  // cuando la respuesta llega -- no se aplica NADA a la UI, ni exito ni
  // error, para no confundir al usuario con el resultado de una accion que
  // ya no corresponde a lo que esta viendo.
  | { tipo: 'descartado' }

type FuncionRegistrarAbono = NonNullable<Parameters<typeof confirmarCruceNomina>[1]>

export async function confirmarCruceConciliacion(
  fila: FilaAConfirmar,
  esVigente: () => boolean,
  cliente: SupabaseClient,
  registrarAbonoInyectado?: FuncionRegistrarAbono
): Promise<ResultadoConfirmarCruceConciliacion> {
  // Sin id estable, no hay fila que confirmar de forma segura -- nunca se
  // reutiliza un indice de arreglo como sustituto. Esto se resuelve en el
  // mismo tick (sin await), asi que no necesita el chequeo de vigencia.
  if (!fila.id) {
    return { tipo: 'error', mensaje: mensajeErrorControlado('confirmar el cruce') }
  }

  if (fila.tipo === 'factura') {
    const resultadoRpc = await confirmarCruceFactura(cliente, fila.id)
    if (!esVigente()) return { tipo: 'descartado' }
    if (!resultadoRpc.ok) {
      console.error('[Bancos] Error confirmando el cruce:', resultadoRpc.error)
      return { tipo: 'error', mensaje: mensajeErrorControlado('confirmar el cruce') }
    }
    return { tipo: 'confirmado', id: fila.id }
  }

  const resultadoNomina = await confirmarCruceNomina(fila.parametros, registrarAbonoInyectado)
  if (!esVigente()) return { tipo: 'descartado' }
  if (!resultadoNomina.confirmado) {
    return { tipo: 'error', mensaje: resultadoNomina.mensaje }
  }
  return { tipo: 'confirmado', id: fila.id }
}
