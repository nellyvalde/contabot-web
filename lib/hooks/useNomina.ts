import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { useUser } from '@/lib/hooks/useUser'

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
  estado: 'Pendiente de Pago' | 'Pagado'
  metodoConciliacion: 'manual' | 'automatico_valor' | null
}

export function useNomina(periodoContable: string) {
  const { user } = useUser()
  const { empresaActiva } = useEmpresa()
  const [filas, setFilas] = useState<FilaNomina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id || !empresaActiva?.id || !periodoContable) return
    cargar()
  }, [user?.id, empresaActiva?.id, periodoContable])

  async function cargar() {
    setCargando(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('nomina_programada')
      .select('id,nombre_empleado,cedula,area,sueldo_base,cuenta_puc_basico,auxilio_transporte,cuenta_puc_transporte,bonificaciones,cuenta_puc_bonos,prima,cuenta_puc_prima,abono_prima,cesantias,abono_cesantias,abono_liquidacion,neto_pagar,exceso_ley_1393,alerta_riesgo_ugpp,estado,metodo_conciliacion')
      .eq('empresa_id', empresaActiva!.id)
      .eq('periodo_contable', periodoContable)
      .order('nombre_empleado')

    if (e) { setError(`Error: ${e.message}`); setCargando(false); return }

    setFilas((data ?? []).map((f: any) => ({
      id: f.id, nombreEmpleado: f.nombre_empleado, cedula: f.cedula, area: f.area,
      sueldoBase: Number(f.sueldo_base ?? 0), cuentaPucBasico: f.cuenta_puc_basico ?? '510506',
      auxilioTransporte: Number(f.auxilio_transporte ?? 0), cuentaPucTransporte: f.cuenta_puc_transporte ?? '510527',
      bonificaciones: Number(f.bonificaciones ?? 0), cuentaPucBonos: f.cuenta_puc_bonos ?? '510530',
      prima: Number(f.prima ?? 0), cuentaPucPrima: f.cuenta_puc_prima ?? '514015',
      abonoPrima: Number(f.abono_prima ?? 0), cesantias: Number(f.cesantias ?? 0),
      abonoCesantias: Number(f.abono_cesantias ?? 0), abonoLiquidacion: Number(f.abono_liquidacion ?? 0),
      netoPagar: Number(f.neto_pagar ?? 0), excesoLey1393: Number(f.exceso_ley_1393 ?? 0),
      alertaRiesgoUgpp: Boolean(f.alerta_riesgo_ugpp), estado: f.estado,
      metodoConciliacion: f.metodo_conciliacion,
    })))
    setCargando(false)
  }

  async function limpiarPeriodo() {
    if (!empresaActiva?.id) return
    const { error: e } = await supabase.from('nomina_programada').delete()
      .eq('empresa_id', empresaActiva.id).eq('periodo_contable', periodoContable)
    if (e) throw new Error(e.message)
    setFilas([])
  }

  async function togglePago(id: number) {
    const fila = filas.find(f => f.id === id)
    if (!fila) return
    const nuevo = fila.estado === 'Pagado' ? 'Pendiente de Pago' : 'Pagado'
    const { error: e } = await supabase.from('nomina_programada')
      .update({ estado: nuevo, metodo_conciliacion: 'manual' }).eq('id', id)
    if (e) throw new Error(e.message)
    setFilas(prev => prev.map(f => f.id === id ? { ...f, estado: nuevo as any, metodoConciliacion: 'manual' } : f))
  }

  return { filas, cargando, error, cargar, limpiarPeriodo, togglePago }
}
