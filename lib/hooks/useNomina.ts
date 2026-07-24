import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { useUser } from '@/lib/hooks/useUser'

export type EstadoPago = 'Pendiente de Pago' | 'Pago parcial' | 'Pagado'
export type MetodoConciliacion = 'manual' | 'automatico_valor' | 'automatico_nombre' | null

export type FilaNomina = {
  id: number
  nombreEmpleado: string
  cedula: string
  area: string | null
  sueldoBase: number
  cuentaPucBasico: string
  auxilioTransporte: number
  cuentaPucTransporte: string
  bonificaciones: number
  cuentaPucBonos: string
  prima: number
  cuentaPucPrima: string
  abonoPrima: number
  cesantias: number
  abonoCesantias: number
  abonoLiquidacion: number
  netoPagar: number
  excesoLey1393: number
  alertaRiesgoUgpp: boolean
  estado: EstadoPago
  metodoConciliacion: MetodoConciliacion
  archivoUrl: string | null
  // Flujo de "abonos parciales" (turnos/servicios). Si valorCausado es null, la fila
  // sigue el flujo tradicional de nomina de salario fijo (netoPagar de siempre).
  valorCausado: number | null
  saldoAnterior: number
  totalAbonado: number
  saldoPendiente: number
  observaciones: string | null
}

export function useNomina(periodoContable: string) {
  const { user } = useUser()
  const { empresaActiva } = useEmpresa()
  const [filas, setFilas] = useState<FilaNomina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!user?.id || !empresaActiva?.id || !periodoContable) {
      setFilas([])
      setCargando(false)
      return
    }

    setCargando(true)
    setError(null)

    const { data, error: e } = await supabase
      .from('nomina_programada')
      .select('id,nombre_empleado,cedula,area,sueldo_base,cuenta_puc_basico,auxilio_transporte,cuenta_puc_transporte,bonificaciones,cuenta_puc_bonos,prima,cuenta_puc_prima,abono_prima,cesantias,abono_cesantias,abono_liquidacion,neto_pagar,exceso_ley_1393,alerta_riesgo_ugpp,estado,metodo_conciliacion,archivo_url,valor_causado,saldo_anterior,observaciones')
      .eq('empresa_id', empresaActiva.id)
      .eq('periodo_contable', periodoContable)
      .order('id')

    if (e) {
      setError(`Error: ${e.message}`)
      setCargando(false)
      return
    }

    const filasBase = data ?? []
    const ids = filasBase.map((f: any) => f.id)

    // El total abonado NUNCA se guarda: se suma desde abonos_nomina para cada obligacion.
    const abonosPorObligacion: Record<number, number> = {}
    if (ids.length > 0) {
      const { data: abonos } = await supabase
        .from('abonos_nomina')
        .select('obligacion_id,valor_abonado')
        .in('obligacion_id', ids)
      for (const a of abonos ?? []) {
        abonosPorObligacion[a.obligacion_id] = (abonosPorObligacion[a.obligacion_id] ?? 0) + Number(a.valor_abonado ?? 0)
      }
    }

    setFilas(filasBase.map((f: any) => {
      const valorCausado = f.valor_causado != null ? Number(f.valor_causado) : null
      const saldoAnterior = Number(f.saldo_anterior ?? 0)
      const totalAbonado = abonosPorObligacion[f.id] ?? 0
      const totalDebido = (valorCausado ?? Number(f.neto_pagar ?? 0)) + saldoAnterior
      const saldoPendiente = Math.max(0, totalDebido - totalAbonado)

      return {
        id: f.id,
        nombreEmpleado: f.nombre_empleado,
        cedula: f.cedula,
        area: f.area,
        sueldoBase: Number(f.sueldo_base ?? 0),
        cuentaPucBasico: f.cuenta_puc_basico ?? '510506',
        auxilioTransporte: Number(f.auxilio_transporte ?? 0),
        cuentaPucTransporte: f.cuenta_puc_transporte ?? '510527',
        bonificaciones: Number(f.bonificaciones ?? 0),
        cuentaPucBonos: f.cuenta_puc_bonos ?? '510530',
        prima: Number(f.prima ?? 0),
        cuentaPucPrima: f.cuenta_puc_prima ?? '514015',
        abonoPrima: Number(f.abono_prima ?? 0),
        cesantias: Number(f.cesantias ?? 0),
        abonoCesantias: Number(f.abono_cesantias ?? 0),
        abonoLiquidacion: Number(f.abono_liquidacion ?? 0),
        netoPagar: Number(f.neto_pagar ?? 0),
        excesoLey1393: Number(f.exceso_ley_1393 ?? 0),
        alertaRiesgoUgpp: Boolean(f.alerta_riesgo_ugpp),
        estado: f.estado ?? 'Pendiente de Pago',
        metodoConciliacion: f.metodo_conciliacion ?? null,
        archivoUrl: f.archivo_url ?? null,
        valorCausado,
        saldoAnterior,
        totalAbonado,
        saldoPendiente,
        observaciones: f.observaciones ?? null,
      }
    }))
    setCargando(false)
  }, [empresaActiva?.id, periodoContable, user?.id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function limpiarPeriodo() {
    if (!empresaActiva?.id) return
    const { error: e } = await supabase
      .from('nomina_programada')
      .delete()
      .eq('empresa_id', empresaActiva.id)
      .eq('periodo_contable', periodoContable)

    if (e) throw new Error(e.message)
    setFilas([])
  }

  async function togglePago(id: number, overrides?: { estado?: EstadoPago; metodoConciliacion?: MetodoConciliacion; referenciaConciliacion?: string | null }) {
    const fila = filas.find((item) => item.id === id)
    if (!fila) return

    const nuevoEstado = overrides?.estado ?? (fila.estado === 'Pagado' ? 'Pendiente de Pago' : 'Pagado')
    const metodo = overrides?.metodoConciliacion ?? 'manual'

    const updates: Record<string, unknown> = {
      estado: nuevoEstado,
      metodo_conciliacion: metodo,
    }

    if (overrides?.referenciaConciliacion !== undefined) {
      updates.referencia_conciliacion = overrides.referenciaConciliacion
    }

    const { error: e } = await supabase
      .from('nomina_programada')
      .update(updates)
      .eq('id', id)

    if (e) throw new Error(e.message)

    setFilas((prev) => prev.map((item) => item.id === id ? { ...item, estado: nuevoEstado, metodoConciliacion: metodo } : item))
  }

  return { filas, cargando, error, cargar, limpiarPeriodo, togglePago }
}
