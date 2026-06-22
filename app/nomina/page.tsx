'use client'
// app/nomina/page.tsx
//
// Módulo de Nómina — versión de producción.
//
// Esta página maneja DOS cosas relacionadas pero distintas:
//
// 1) `liquidaciones_nomina` (ya existía): el cálculo legal de aportes a
//    salud/pensión/ARL/parafiscales para UGPP, usando lib/nomina/calculo.ts.
//    Sigue organizada por empresa (empresa_id), igual que antes.
//
// 2) `nomina_programada` (tu tabla real, ya con datos): el seguimiento de
//    qué se le debe depositar a cada empleado este mes — sueldo, transporte,
//    bonos, prima, vacaciones, préstamo, descuento — más la conciliación
//    contra el extracto bancario. Esta tabla está organizada por user_id
//    (el auxiliar/usuario logueado), no por empresa_id.
//
// Flujo pensado para eliminar el trabajo manual del auxiliar contable:
//   a) Sube el Excel del mes  -> se guarda (o actualiza) en nomina_programada.
//   b) Sube el PDF del banco  -> se concilia por VALOR exacto, no por nombre
//      (porque el extracto puede salir a nombre de un tercero).
//   c) Si los bonos superan el 40% de (sueldo_base + bonos), Ley 1393 de
//      2010, se marca la alerta roja de riesgo UGPP automáticamente.

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'
import { liquidarNomina, type RiesgoARL } from '@/lib/nomina/calculo'
import { parseExcelNomina, guardarNominaProgramada } from '@/lib/nomina/importarExcel'
import { conciliarExtractoPdf, type RegistroPendiente } from '@/lib/nomina/conciliacionBancaria'

type Empleado = {
  id: string
  empresa_id: string
  nombre: string
  cedula: string
  puesto: string
  salario_base: number
  riesgo_arl: RiesgoARL
  activo: boolean
}

type LiquidacionVista = {
  empleado_id: string
  neto_a_pagar: number
  pago_realizado: boolean
}

type EstadoPago = 'Pendiente de Pago' | 'Pagado'

type FilaNominaProgramada = {
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
  metodoConciliacion: 'manual' | 'automatico_valor' | null
}

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function construirPeriodoContable(mes: number, anio: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`
}

export default function NominaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <NominaContenido />
    </Suspense>
  )
}

function NominaContenido() {
  const { user, handleLogout } = useUser()

  const hoy = new Date()

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionVista[]>([])
  const [cargando, setCargando] = useState(true)
  const [liquidando, setLiquidando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Nómina programada (tu tabla real) ---
  const [periodoMes, setPeriodoMes] = useState(hoy.getMonth() + 1)
  const [periodoAnio, setPeriodoAnio] = useState(hoy.getFullYear())
  const [nominaProgramada, setNominaProgramada] = useState<FilaNominaProgramada[]>([])
  const [cargandoProgramada, setCargandoProgramada] = useState(false)
  const [importando, setImportando] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const [mensajeImportacion, setMensajeImportacion] = useState<string | null>(null)
  const [mensajeConciliacion, setMensajeConciliacion] = useState<string | null>(null)

  // --- Formulario de alta de empleado (tabla `empleados`, por empresa) ---
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [puesto, setPuesto] = useState('')
  const [salario, setSalario] = useState('')
  const [riesgo, setRiesgo] = useState<RiesgoARL>('I')

  const periodoContable = useMemo(() => construirPeriodoContable(periodoMes, periodoAnio), [periodoMes, periodoAnio])

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    if (user?.id) {
      cargarNominaProgramada(periodoContable)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, periodoContable])

  async function cargarDatos() {
    setCargando(true)
    setError(null)

    const { data: empresa, error: errEmpresa } = await supabase
      .from('contabot_empresas')
      .select('id')
      .limit(1)
      .single()

    if (errEmpresa || !empresa) {
      setError('No se encontró ninguna empresa registrada en Supabase. Crea una fila en la tabla "empresas" para continuar.')
      setCargando(false)
      return
    }

    setEmpresaId(empresa.id)

    const { data: empleadosData, error: errEmpleados } = await supabase
      .from('empleados')
      .select('id, empresa_id, nombre, cedula, puesto, salario_base, riesgo_arl, activo')
      .eq('empresa_id', empresa.id)
      .order('nombre')

    if (errEmpleados) {
      setError(`Error cargando empleados: ${errEmpleados.message}`)
    } else {
      setEmpleados(empleadosData ?? [])
    }

    setCargando(false)
  }

  async function cargarNominaProgramada(periodo: string) {
    if (!user?.id) return
    setCargandoProgramada(true)
    setError(null)

    const { data, error: errProgramada } = await supabase
      .from('nomina_programada')
      .select(`
        id, nombre_empleado, cedula, area,
        sueldo_base, cuenta_puc_basico,
        auxilio_transporte, cuenta_puc_transporte,
        bonificaciones, cuenta_puc_bonos,
        prima, cuenta_puc_prima,
        abono_prima, cesantias, abono_cesantias, abono_liquidacion, neto_pagar,
        exceso_ley_1393, alerta_riesgo_ugpp,
        estado, metodo_conciliacion
      `)
      .eq('user_id', user.id)
      .eq('periodo_contable', periodo)
      .order('nombre_empleado')

    if (errProgramada) {
      setError(`Error cargando nómina programada: ${errProgramada.message}`)
      setCargandoProgramada(false)
      return
    }

    const filas: FilaNominaProgramada[] = (data ?? []).map((fila: any) => ({
      id: fila.id,
      nombreEmpleado: fila.nombre_empleado,
      cedula: fila.cedula,
      area: fila.area,
      sueldoBase: Number(fila.sueldo_base ?? 0),
      cuentaPucBasico: fila.cuenta_puc_basico ?? '510506',
      auxilioTransporte: Number(fila.auxilio_transporte ?? 0),
      cuentaPucTransporte: fila.cuenta_puc_transporte ?? '510527',
      bonificaciones: Number(fila.bonificaciones ?? 0),
      cuentaPucBonos: fila.cuenta_puc_bonos ?? '510530',
      prima: Number(fila.prima ?? 0),
      cuentaPucPrima: fila.cuenta_puc_prima ?? '514015',
      abonoPrima: Number(fila.abono_prima ?? 0),
      cesantias: Number(fila.cesantias ?? 0),
      abonoCesantias: Number(fila.abono_cesantias ?? 0),
      abonoLiquidacion: Number(fila.abono_liquidacion ?? 0),
      netoPagar: Number(fila.neto_pagar ?? 0),
      excesoLey1393: Number(fila.exceso_ley_1393 ?? 0),
      alertaRiesgoUgpp: Boolean(fila.alerta_riesgo_ugpp),
      estado: fila.estado,
      metodoConciliacion: fila.metodo_conciliacion,
    }))

    setNominaProgramada(filas)
    setCargandoProgramada(false)
  }

  const totalNomina = useMemo(
    () => empleados.reduce((sum, e) => sum + e.salario_base, 0),
    [empleados]
  )

  const totalPendiente = useMemo(() => {
    const idsPagados = new Set(
      liquidaciones.filter((l) => l.pago_realizado).map((l) => l.empleado_id)
    )
    return empleados
      .filter((e) => !idsPagados.has(e.id))
      .reduce((sum, e) => sum + e.salario_base, 0)
  }, [empleados, liquidaciones])

  const resumenProgramada = useMemo(() => {
    const pendientes = nominaProgramada.filter((f) => f.estado === 'Pendiente de Pago')
    const pagados = nominaProgramada.filter((f) => f.estado === 'Pagado')
    const enRiesgo = nominaProgramada.filter((f) => f.alertaRiesgoUgpp)
    return {
      totalNeto: nominaProgramada.reduce((sum, f) => sum + f.netoPagar, 0),
      pendientes: pendientes.length,
      pagados: pagados.length,
      enRiesgo: enRiesgo.length,
    }
  }, [nominaProgramada])

  async function agregarEmpleado() {
    if (!empresaId || !nombre.trim() || !cedula.trim() || !puesto.trim() || !salario.trim()) {
      setError('Nombre, cédula, puesto y salario son obligatorios para agregar un empleado.')
      return
    }

    const { data, error: errInsert } = await supabase
      .from('empleados')
      .insert({
        empresa_id: empresaId,
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        puesto: puesto.trim(),
        salario_base: Number(salario),
        riesgo_arl: riesgo,
        tipo_contrato: 'indefinido',
        fecha_ingreso: new Date().toISOString().slice(0, 10),
        activo: true,
      })
      .select()
      .single()

    if (errInsert) {
      setError(`No se pudo guardar el empleado: ${errInsert.message}`)
      return
    }

    setEmpleados((prev) => [...prev, data as Empleado])
    setNombre('')
    setCedula('')
    setPuesto('')
    setSalario('')
    setRiesgo('I')
    setError(null)
  }

  async function liquidarMesActual() {
    if (!empresaId) return
    setLiquidando(true)
    setError(null)

    const { data: periodo, error: errPeriodo } = await supabase
      .from('periodos_nomina')
      .upsert(
        { empresa_id: empresaId, mes: periodoMes, anio: periodoAnio, estado: 'liquidado' },
        { onConflict: 'empresa_id,mes,anio' }
      )
      .select()
      .single()

    if (errPeriodo || !periodo) {
      setError(`No se pudo crear el periodo: ${errPeriodo?.message ?? 'desconocido'}`)
      setLiquidando(false)
      return
    }

    const filas = empleados
      .filter((e) => e.activo)
      .map((e) => {
        const programada = nominaProgramada.find((f) => f.cedula === e.cedula)

        const resultado = liquidarNomina({
          salarioBase: e.salario_base,
          pagosNoSalariales: programada?.bonificaciones ?? 0,
          riesgoARL: e.riesgo_arl,
          empresaExoneradaParafiscales: false,
        })

        return {
          empleado_id: e.id,
          periodo_id: periodo.id,
          salario_base: resultado.salarioBase,
          total_no_salarial: resultado.pagosNoSalariales,
          exceso_ley_1393: resultado.excesoLey1393,
          base_aportes: resultado.baseAportes,
          auxilio_transporte: resultado.auxilioTransporte,
          aporte_salud_empleado: resultado.aporteSaludEmpleado,
          aporte_pension_empleado: resultado.aportePensionEmpleado,
          aporte_salud_empleador: resultado.aporteSaludEmpleador,
          aporte_pension_empleador: resultado.aportePensionEmpleador,
          aporte_arl: resultado.aporteArl,
          sena: resultado.sena,
          icbf: resultado.icbf,
          caja_compensacion: resultado.cajaCompensacion,
          total_deducciones: resultado.totalDeducciones,
          neto_a_pagar: resultado.netoAPagar,
        }
      })

    const { data: liquidacionesData, error: errLiquidar } = await supabase
      .from('liquidaciones_nomina')
      .upsert(filas, { onConflict: 'empleado_id,periodo_id' })
      .select('empleado_id, neto_a_pagar, pago_realizado')

    if (errLiquidar) {
      setError(`Error liquidando nómina: ${errLiquidar.message}`)
    } else {
      setLiquidaciones(liquidacionesData ?? [])
    }

    setLiquidando(false)
  }

  async function togglePago(empleadoId: string) {
    const liquidacion = liquidaciones.find((l) => l.empleado_id === empleadoId)
    if (!liquidacion) return

    const { error: errUpdate } = await supabase
      .from('liquidaciones_nomina')
      .update({ pago_realizado: !liquidacion.pago_realizado })
      .eq('empleado_id', empleadoId)

    if (errUpdate) {
      setError(`No se pudo actualizar el pago: ${errUpdate.message}`)
      return
    }

    setLiquidaciones((prev) =>
      prev.map((l) =>
        l.empleado_id === empleadoId ? { ...l, pago_realizado: !l.pago_realizado } : l
      )
    )
  }

  async function manejarImportacionExcel(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo || !user?.id) return

    setImportando(true)
    setError(null)
    setMensajeImportacion(null)

    try {
      const filas = await parseExcelNomina(archivo)
      const resultado = await guardarNominaProgramada(filas, user.id, periodoContable)

      const partes = [
        `${resultado.filasInsertadas} registro(s) nuevo(s), ${resultado.filasActualizadas} actualizado(s).`,
      ]
      if (resultado.filasOmitidas.length > 0) {
        partes.push(`${resultado.filasOmitidas.length} fila(s) omitida(s) (ver detalle abajo).`)
      }
      if (resultado.alertasUgpp.length > 0) {
        partes.push(
          `⚠️ Riesgo UGPP (Ley 1393, >40% no salarial) en: ${resultado.alertasUgpp
            .map((a) => a.nombre)
            .join(', ')}.`
        )
      }
      setMensajeImportacion(partes.join(' '))

      await cargarNominaProgramada(periodoContable)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error importando el archivo de Excel.')
    } finally {
      setImportando(false)
    }
  }

  async function manejarConciliacionPdf(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return

    setConciliando(true)
    setError(null)
    setMensajeConciliacion(null)

    try {
      const registrosPendientes: RegistroPendiente[] = nominaProgramada
        .filter((f) => f.estado === 'Pendiente de Pago')
        .map((f) => ({ id: f.id, nombreEmpleado: f.nombreEmpleado, netoPagar: f.netoPagar }))

      const resultado = await conciliarExtractoPdf(archivo, registrosPendientes)

      const partes = [`${resultado.matches.length} pago(s) conciliado(s) automáticamente por valor.`]
      if (resultado.registrosSinMatch.length > 0) {
        partes.push(`${resultado.registrosSinMatch.length} empleado(s) pendiente(s) sin valor coincidente en este extracto.`)
      }
      setMensajeConciliacion(partes.join(' '))

      await cargarNominaProgramada(periodoContable)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando el PDF del extracto bancario.')
    } finally {
      setConciliando(false)
    }
  }

  async function togglePagoManual(filaId: number) {
    const fila = nominaProgramada.find((f) => f.id === filaId)
    if (!fila) return

    const nuevoEstado: EstadoPago = fila.estado === 'Pagado' ? 'Pendiente de Pago' : 'Pagado'

    const { error: errUpdate } = await supabase
      .from('nomina_programada')
      .update({ estado: nuevoEstado, metodo_conciliacion: 'manual' })
      .eq('id', filaId)

    if (errUpdate) {
      setError(`No se pudo actualizar el estado de pago: ${errUpdate.message}`)
      return
    }

    setNominaProgramada((prev) =>
      prev.map((f) => (f.id === filaId ? { ...f, estado: nuevoEstado, metodoConciliacion: 'manual' } : f))
    )
  }

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <section className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-500">Gestión de Nómina</p>
                <h1 className="text-3xl font-semibold text-slate-900">Nómina de empleados</h1>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="rounded-3xl bg-emerald-50 p-5">
                  <p className="text-sm text-slate-500">Total nómina</p>
                 <p className="text-2xl font-bold text-emerald-700">${Math.round(resumenProgramada.totalNeto).toLocaleString()}</p>
                </div>
                <div className="rounded-3xl bg-yellow-50 p-5">
                  <p className="text-sm text-slate-500">Pago pendiente (aportes)</p>
                  <p className="text-2xl font-bold text-yellow-700">${totalPendiente.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <button
              onClick={liquidarMesActual}
              disabled={liquidando || !empresaId}
              className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {liquidando ? 'Liquidando...' : `Liquidar aportes a seguridad social — ${NOMBRES_MES[periodoMes - 1]} ${periodoAnio}`}
            </button>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}
          </section>

          <section className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm text-slate-500">Conciliación de pagos</p>
                <h2 className="text-2xl font-semibold text-slate-900">Nómina programada del periodo</h2>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Mes</label>
                  <select
                    value={periodoMes}
                    onChange={(e) => setPeriodoMes(Number(e.target.value))}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  >
                    {NOMBRES_MES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Año</label>
                  <input
                    type="number"
                    value={periodoAnio}
                    onChange={(e) => setPeriodoAnio(Number(e.target.value))}
                    className="w-24 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>

                <label className="cursor-pointer rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
                  {importando ? 'Importando...' : 'Importar Excel'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={manejarImportacionExcel}
                    disabled={importando || !user?.id}
                    className="hidden"
                  />
                </label>

                <label className="cursor-pointer rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                  {conciliando ? 'Conciliando...' : 'Conciliar extracto (PDF)'}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={manejarConciliacionPdf}
                    disabled={conciliando || nominaProgramada.length === 0}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {mensajeImportacion && (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{mensajeImportacion}</p>
            )}
            {mensajeConciliacion && (
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{mensajeConciliacion}</p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Total neto del periodo</p>
                <p className="text-lg font-bold text-slate-900">${Math.round(resumenProgramada.totalNeto).toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs text-slate-500">Pagados</p>
                <p className="text-lg font-bold text-emerald-700">{resumenProgramada.pagados}</p>
              </div>
              <div className="rounded-2xl bg-yellow-50 p-4">
                <p className="text-xs text-slate-500">Pendientes</p>
                <p className="text-lg font-bold text-yellow-700">{resumenProgramada.pendientes}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs text-slate-500">Riesgo UGPP (Ley 1393)</p>
                <p className="text-lg font-bold text-red-700">{resumenProgramada.enRiesgo}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              {cargandoProgramada ? (
                <p className="text-slate-500">Cargando nómina programada...</p>
              ) : nominaProgramada.length === 0 ? (
                <p className="text-slate-500">
                  No hay registros para {NOMBRES_MES[periodoMes - 1]} {periodoAnio}. Importa el Excel del mes para empezar.
                </p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Empleado</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cédula</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Básico</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Transporte</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Bonos</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Prima</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Cesantías</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Neto</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Ley 1393</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {nominaProgramada.map((fila) => (
                      <tr key={fila.id}>
                        <td className="px-4 py-4 text-slate-700">{fila.nombreEmpleado}</td>
                        <td className="px-4 py-4 text-slate-500">{fila.cedula}</td>
                        <CeldaConcepto valor={fila.sueldoBase} cuenta={fila.cuentaPucBasico} />
                        <CeldaConcepto valor={fila.auxilioTransporte} cuenta={fila.cuentaPucTransporte} />
                        <CeldaConcepto valor={fila.bonificaciones} cuenta={fila.cuentaPucBonos} />
                        <CeldaConcepto valor={fila.prima} cuenta={fila.cuentaPucPrima} />
                        <td className="px-4 py-4 text-right text-slate-700">${fila.cesantias.toLocaleString()}</td>
                        <td
                          className="px-4 py-4 text-right font-semibold text-slate-900"
                          title={
                            fila.abonoPrima || fila.abonoCesantias || fila.abonoLiquidacion
                              ? `Incluye abonos: prima $${fila.abonoPrima.toLocaleString()}, cesantías $${fila.abonoCesantias.toLocaleString()}, liquidación $${fila.abonoLiquidacion.toLocaleString()}`
                              : undefined
                          }
                        >
                          ${Math.round(fila.netoPagar).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {fila.alertaRiesgoUgpp ? (
                            <span
                              title={`Exceso sobre el 40%: $${fila.excesoLey1393.toLocaleString()}`}
                              className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
                            >
                              Riesgo UGPP
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              fila.estado === 'Pagado'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {fila.estado}
                            {fila.metodoConciliacion === 'automatico_valor' && ' (auto)'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => togglePagoManual(fila.id)}
                            className="rounded-2xl bg-slate-800 px-3 py-2 text-xs text-white transition hover:bg-slate-700"
                          >
                            {fila.estado === 'Pagado' ? 'Marcar pendiente' : 'Marcar pagado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Empleados registrados</h2>
              {cargando ? (
                <p className="text-slate-500">Cargando empleados...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cédula</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Puesto</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Salario</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Aportes</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {empleados.map((empleado) => {
                        const liquidacion = liquidaciones.find((l) => l.empleado_id === empleado.id)
                        const pagado = liquidacion?.pago_realizado ?? false
                        return (
                          <tr key={empleado.id}>
                            <td className="px-4 py-4 text-slate-700">{empleado.nombre}</td>
                            <td className="px-4 py-4 text-slate-500">{empleado.cedula}</td>
                            <td className="px-4 py-4 text-slate-700">{empleado.puesto}</td>
                            <td className="px-4 py-4 text-right text-slate-900 font-semibold">
                              ${empleado.salario_base.toLocaleString()}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                                  pagado ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {pagado ? 'Pagado' : liquidacion ? 'Pendiente' : 'Sin liquidar'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={() => togglePago(empleado.id)}
                                disabled={!liquidacion}
                                className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-40"
                              >
                                {pagado ? 'Marcar pendiente' : 'Marcar pagado'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-5">Agregar nuevo empleado</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nombre</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Laura Torres"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Cédula</label>
                  <input
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    placeholder="Ej. 1020304050"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-400">Debe coincidir exactamente con la columna "Cédula" del Excel de novedades.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Puesto</label>
                  <input
                    value={puesto}
                    onChange={(e) => setPuesto(e.target.value)}
                    placeholder="Ej. Auxiliar contable"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Salario mensual</label>
                  <input
                    value={salario}
                    onChange={(e) => setSalario(e.target.value)}
                    placeholder="Ej. 2500000"
                    type="number"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Riesgo ARL</label>
                  <select
                    value={riesgo}
                    onChange={(e) => setRiesgo(e.target.value as RiesgoARL)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {(['I', 'II', 'III', 'IV', 'V'] as RiesgoARL[]).map((r) => (
                      <option key={r} value={r}>Clase {r}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={agregarEmpleado}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-white font-semibold transition hover:bg-emerald-700"
                >
                  Añadir empleado
                </button>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Resumen rápido</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">${totalNomina.toLocaleString()}</p>
                  <p className="text-sm text-slate-500">Total de nómina (salarios base)</p>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  )
}

function CeldaConcepto({ valor, cuenta }: { valor: number; cuenta: string }) {
  return (
    <td className="px-4 py-4 text-right text-slate-700">
      <div>${valor.toLocaleString()}</div>
      <div className="text-[11px] text-slate-400">{cuenta}</div>
    </td>
  )
}