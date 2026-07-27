// lib/nomina/abonos.ts
// Logica central de "abonos parciales": separa siempre valor causado, valor abonado
// y saldo pendiente. El saldo NUNCA se lee de una columna manual, se calcula.
import { createAdminClient } from '@/lib/supabase/admin'
import { supabase as supabaseNavegador } from '@/lib/supabase/client'
import { regenerarSoportesPdf } from '@/lib/nomina/soportesPdf'

export type EstadoAbono = 'Pendiente de Pago' | 'Pago parcial' | 'Pagado'

// --- Funciones puras (sin Supabase), facilmente probables ---

export function calcularEstadoAbono(
  valorCausado: number,
  saldoAnterior: number,
  totalAbonado: number
): { saldoPendiente: number; estado: EstadoAbono } {
  const totalDebido = (valorCausado || 0) + (saldoAnterior || 0)
  const abonado = totalAbonado || 0
  const saldoPendiente = Math.max(0, totalDebido - abonado)
  const estado: EstadoAbono = abonado <= 0 ? 'Pendiente de Pago' : saldoPendiente > 0 ? 'Pago parcial' : 'Pagado'
  return { saldoPendiente, estado }
}

export function sumarAbonos(abonos: Array<{ valorAbonado: number }>): number {
  return abonos.reduce((total, a) => total + Number(a.valorAbonado || 0), 0)
}

// true si ya existe un abono con esa referencia (evita contar el mismo comprobante dos veces).
export function esAbonoDuplicado(
  abonosExistentes: Array<{ referencia?: string | null }>,
  referenciaNueva?: string | null
): boolean {
  if (!referenciaNueva) return false
  return abonosExistentes.some((a) => a.referencia === referenciaNueva)
}

// Calcula el periodo contable (YYYY-MM) inmediatamente anterior a uno dado.
export function periodoAnteriorDe(periodo: string): string {
  const [anioStr, mesStr] = periodo.split('-')
  let anio = Number(anioStr)
  let mes = Number(mesStr) - 1
  if (mes < 1) {
    mes = 12
    anio -= 1
  }
  return `${anio}-${String(mes).padStart(2, '0')}`
}

// --- Funciones con Supabase (server-side con admin=true, o cliente de navegador) ---

export type ResultadoAbono =
  | { ok: true; duplicado: false; saldoPendiente: number; estado: EstadoAbono }
  | { ok: true; duplicado: true }
  | { ok: false; error: string }

type ParamsRegistrarAbono = {
  empresaId: string
  obligacionId: number
  valorAbonado: number
  fechaAbono?: string
  referencia?: string | null
  receptorPago?: string | null
  observaciones?: string | null
  origen?: 'excel' | 'whatsapp' | 'banco' | 'manual'
  archivoUrl?: string | null
  admin?: boolean
}

// Registra un abono contra una obligacion existente, evita duplicados por `referencia`,
// y recalcula (nunca asume) el nuevo estado de la obligacion sumando TODOS sus abonos.
export async function registrarAbono(params: ParamsRegistrarAbono): Promise<ResultadoAbono> {
  const {
    empresaId,
    obligacionId,
    valorAbonado,
    fechaAbono,
    referencia,
    receptorPago,
    observaciones,
    origen = 'manual',
    archivoUrl,
    admin = false,
  } = params

  if (!valorAbonado || valorAbonado <= 0) {
    return { ok: false, error: 'El valor abonado debe ser mayor a cero.' }
  }

  const db = admin ? createAdminClient() : supabaseNavegador

  if (referencia) {
    const { data: existente, error: errExistente } = await db
      .from('abonos_nomina')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('referencia', referencia)
      .maybeSingle()

    if (errExistente) return { ok: false, error: errExistente.message }
    if (existente) return { ok: true, duplicado: true }
  }

  const { data: obligacion, error: errObligacion } = await db
    .from('nomina_programada')
    .select('id, valor_causado, saldo_anterior, neto_pagar')
    .eq('id', obligacionId)
    .single()

  if (errObligacion || !obligacion) {
    return { ok: false, error: errObligacion?.message || 'Obligación de nómina no encontrada.' }
  }

  const { error: errInsert } = await db.from('abonos_nomina').insert({
    empresa_id: empresaId,
    obligacion_id: obligacionId,
    valor_abonado: valorAbonado,
    fecha_abono: fechaAbono || new Date().toISOString().slice(0, 10),
    referencia: referencia || null,
    receptor_pago: receptorPago || null,
    observaciones: observaciones || null,
    origen,
    archivo_url: archivoUrl || null,
  })

  if (errInsert) return { ok: false, error: errInsert.message }

  const { data: abonos, error: errAbonos } = await db
    .from('abonos_nomina')
    .select('valor_abonado')
    .eq('obligacion_id', obligacionId)

  if (errAbonos) return { ok: false, error: errAbonos.message }

  const totalAbonado = sumarAbonos((abonos ?? []).map((a: any) => ({ valorAbonado: Number(a.valor_abonado || 0) })))
  const valorCausado = obligacion.valor_causado != null ? Number(obligacion.valor_causado) : Number(obligacion.neto_pagar || 0)
  const { saldoPendiente, estado } = calcularEstadoAbono(valorCausado, Number(obligacion.saldo_anterior || 0), totalAbonado)

  const { error: errUpdate } = await db
    .from('nomina_programada')
    .update({
      estado,
      metodo_conciliacion: origen === 'manual' ? 'manual' : 'automatico_valor',
      referencia_conciliacion: referencia || null,
      ...(archivoUrl ? { archivo_url: archivoUrl } : {}),
    })
    .eq('id', obligacionId)

  if (errUpdate) return { ok: false, error: errUpdate.message }

  // Regenera el PDF combinado con todos los soportes de esta obligacion (no bloquea
  // el registro del abono si falla: solo queda logueado).
  await regenerarSoportesPdf(obligacionId, empresaId, admin)

  return { ok: true, duplicado: false, saldoPendiente, estado }
}

// Saldo pendiente (calculado) del periodo anterior de una persona, para arrastrarlo
// como saldo_anterior del periodo nuevo al importar el Excel del mes siguiente.
export async function obtenerSaldoPeriodoAnterior(
  empresaId: string,
  cedula: string,
  periodoAnterior: string,
  admin = false
): Promise<number> {
  const db = admin ? createAdminClient() : supabaseNavegador

  const { data: obligacionAnterior } = await db
    .from('nomina_programada')
    .select('id, valor_causado, saldo_anterior, neto_pagar')
    .eq('empresa_id', empresaId)
    .eq('cedula', cedula)
    .eq('periodo_contable', periodoAnterior)
    .maybeSingle()

  if (!obligacionAnterior) return 0

  const { data: abonos } = await db
    .from('abonos_nomina')
    .select('valor_abonado')
    .eq('obligacion_id', obligacionAnterior.id)

  const totalAbonado = sumarAbonos((abonos ?? []).map((a: any) => ({ valorAbonado: Number(a.valor_abonado || 0) })))
  const valorCausado =
    obligacionAnterior.valor_causado != null ? Number(obligacionAnterior.valor_causado) : Number(obligacionAnterior.neto_pagar || 0)
  const { saldoPendiente } = calcularEstadoAbono(valorCausado, Number(obligacionAnterior.saldo_anterior || 0), totalAbonado)
  return saldoPendiente
}

// Total abonado (calculado) de una obligacion — usado por la pantalla de Nomina.
export async function obtenerTotalAbonado(obligacionId: number, admin = false): Promise<number> {
  const db = admin ? createAdminClient() : supabaseNavegador
  const { data } = await db.from('abonos_nomina').select('valor_abonado').eq('obligacion_id', obligacionId)
  return sumarAbonos((data ?? []).map((a: any) => ({ valorAbonado: Number(a.valor_abonado || 0) })))
}
