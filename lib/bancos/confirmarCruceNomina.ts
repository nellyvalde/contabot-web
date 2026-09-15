// lib/bancos/confirmarCruceNomina.ts
// Coordinador puro (sin React) para el lado "nomina" de confirmarCruce en
// app/bancos/page.tsx. Decide si el cruce debe marcarse como confirmado a
// partir de la respuesta REAL de registrarAbono -- nunca de forma
// optimista -- y nunca deja escapar resultadoAbono.error hacia el usuario.
import { registrarAbono, type ResultadoAbono } from '@/lib/nomina/abonos'
import { mensajeErrorControlado, registrarErrorSupabase } from '@/lib/bancos/erroresBancos'

export type ParametrosConfirmarCruceNomina = {
  empresaId: string
  obligacionId: number
  valorAbonado: number
  fechaAbono: string
  referencia: string
  observaciones: string
}

export type ResultadoConfirmarCruceNomina =
  | { confirmado: true }
  | { confirmado: false; mensaje: string }

type FuncionRegistrarAbono = (params: ParametrosConfirmarCruceNomina) => Promise<ResultadoAbono>

const registrarAbonoReal: FuncionRegistrarAbono = (p) =>
  registrarAbono({
    empresaId: p.empresaId,
    obligacionId: p.obligacionId,
    valorAbonado: p.valorAbonado,
    fechaAbono: p.fechaAbono,
    referencia: p.referencia,
    observaciones: p.observaciones,
    origen: 'banco',
  })

// `registrar` es inyectable (por defecto llama a la funcion real) para que
// las pruebas puedan simular ok:false, un rechazo inesperado, o
// duplicado:true sin necesitar un cliente de Supabase real.
export async function confirmarCruceNomina(
  params: ParametrosConfirmarCruceNomina,
  registrar: FuncionRegistrarAbono = registrarAbonoReal
): Promise<ResultadoConfirmarCruceNomina> {
  let resultado: ResultadoAbono
  try {
    resultado = await registrar(params)
  } catch (err) {
    console.error('[Bancos] Error inesperado registrando el abono:', err)
    return { confirmado: false, mensaje: mensajeErrorControlado('confirmar el cruce') }
  }

  if (!resultado.ok) {
    // resultado.error nunca se propaga al usuario -- solo al log tecnico.
    registrarErrorSupabase('confirmar el cruce (abono de nómina)', { message: resultado.error })
    return { confirmado: false, mensaje: mensajeErrorControlado('confirmar el cruce') }
  }

  // ok:true cubre dos casos, y AMBOS se tratan como confirmacion exitosa:
  //   - duplicado:false -- se registro un abono nuevo.
  //   - duplicado:true  -- ya existia un abono con esta misma referencia
  //     (mismo movimiento bancario ya procesado antes, ver la construccion
  //     de `referencia` en app/bancos/page.tsx). Es una confirmacion
  //     IDEMPOTENTE deliberada: el efecto deseado (el movimiento queda
  //     marcado como confirmado) ya se habia cumplido, asi que reintentar
  //     la confirmacion no debe registrar un segundo pago ni mostrarse
  //     como error -- simplemente confirma lo que ya era cierto.
  return { confirmado: true }
}
