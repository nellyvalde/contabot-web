'use client'
// app/nomina/page.tsx — UI refactorizada estilo Linear/Notion

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'
import { liquidarNomina, type RiesgoARL } from '@/lib/nomina/calculo'
import { parseExcelNomina, guardarNominaProgramada } from '@/lib/nomina/importarExcel'
import { conciliarExtractoPdf, type RegistroPendiente } from '@/lib/nomina/conciliacionBancaria'

type Empleado = {
  id: string; empresa_id: string; nombre: string; cedula: string
  puesto: string; salario_base: number; riesgo_arl: RiesgoARL; activo: boolean
}
type LiquidacionVista = { empleado_id: string; neto_a_pagar: number; pago_realizado: boolean }
type EstadoPago = 'Pendiente de Pago' | 'Pagado'
type FilaNominaProgramada = {
  id: number; nombreEmpleado: string; cedula: string; area: string | null
  sueldoBase: number; cuentaPucBasico: string; auxilioTransporte: number; cuentaPucTransporte: string
  bonificaciones: number; cuentaPucBonos: string; prima: number; cuentaPucPrima: string
  abonoPrima: number; cesantias: number; abonoCesantias: number; abonoLiquidacion: number
  netoPagar: number; excesoLey1393: number; alertaRiesgoUgpp: boolean
  estado: EstadoPago; metodoConciliacion: 'manual' | 'automatico_valor' | null
}

const NOMBRES_MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const construirPeriodoContable = (mes: number, anio: number) => `${anio}-${String(mes).padStart(2,'0')}`

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-slate-100">{children}</div>
}
function Badge({ label, color, dot, title }: { label: string; color: 'emerald'|'amber'|'red'|'slate'; dot?: boolean; title?: string }) {
  const s = { emerald:'bg-emerald-50 text-emerald-700 ring-emerald-200', amber:'bg-amber-50 text-amber-700 ring-amber-200', red:'bg-red-50 text-red-700 ring-red-200', slate:'bg-slate-100 text-slate-500 ring-slate-200' }
  const d = { emerald:'bg-emerald-500', amber:'bg-amber-400', red:'bg-red-500', slate:'bg-slate-400' }
  return <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s[color]}`}>{dot && <span className={`w-1.5 h-1.5 rounded-full ${d[color]}`}/>}{label}</span>
}
function AlertaBanner({ mensaje, tipo }: { mensaje: string; tipo: 'success'|'error'|'info' }) {
  const s = { success:'bg-emerald-50 text-emerald-700 border-emerald-200', error:'bg-red-50 text-red-700 border-red-200', info:'bg-slate-50 text-slate-600 border-slate-200' }
  return <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${s[tipo]}`}>{mensaje}</p>
}
function KpiCard({ label, valor, color }: { label: string; valor: string; color: 'slate'|'emerald'|'amber'|'red' }) {
  const s = { slate:'bg-slate-50 border-slate-100 text-slate-800', emerald:'bg-emerald-50 border-emerald-100 text-emerald-800', amber:'bg-amber-50 border-amber-100 text-amber-800', red:'bg-red-50 border-red-100 text-red-800' }
  return <div className={`rounded-xl border p-4 ${s[color]}`}><p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p><p className="text-xl font-bold">{valor}</p></div>
}
function CeldaMoneda({ valor, cuenta }: { valor: number; cuenta: string }) {
  return <td className="px-4 py-3.5 text-right"><span className="text-slate-800 font-medium">${valor.toLocaleString()}</span><span className="block text-[10px] text-slate-300 font-mono">{cuenta}</span></td>
}

export default function NominaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center"><span className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full inline-block"/></div>}>
      <NominaContenido />
    </Suspense>
  )
}

function NominaContenido() {
  const { user, handleLogout } = useUser()
  const hoy = new Date()
  const [empresaId, setEmpresaId] = useState<string|null>(null)
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionVista[]>([])
  const [cargando, setCargando] = useState(true)
  const [liquidando, setLiquidando] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [periodoMes, setPeriodoMes] = useState(hoy.getMonth()+1)
  const [periodoAnio, setPeriodoAnio] = useState(hoy.getFullYear())
  const [nominaProgramada, setNominaProgramada] = useState<FilaNominaProgramada[]>([])
  const [cargandoProgramada, setCargandoProgramada] = useState(false)
  const [importando, setImportando] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const [mensajeImportacion, setMensajeImportacion] = useState<string|null>(null)
  const [mensajeConciliacion, setMensajeConciliacion] = useState<string|null>(null)
  const [nombre, setNombre] = useState(''); const [cedula, setCedula] = useState('')
  const [puesto, setPuesto] = useState(''); const [salario, setSalario] = useState('')
  const [riesgo, setRiesgo] = useState<RiesgoARL>('I')
  const periodoContable = useMemo(() => construirPeriodoContable(periodoMes, periodoAnio), [periodoMes, periodoAnio])

  const { empresaActiva } = useEmpresa()
  useEffect(() => { if (empresaActiva?.id) cargarDatos() }, [empresaActiva?.id])
  useEffect(() => { if (user?.id && empresaActiva?.id) { setNominaProgramada([]); cargarNominaProgramada(periodoContable) } }, [user?.id, periodoContable, empresaActiva?.id])
  async function cargarDatos() {
    setCargando(true); setError(null)
    if (!empresaActiva?.id) { setCargando(false); return }
    setEmpresaId(empresaActiva.id)
    const { data, error: e2 } = await supabase.from('empleados').select('id,empresa_id,nombre,cedula,puesto,salario_base,riesgo_arl,activo').eq('empresa_id', empresaActiva.id).order('nombre')
    if (e2) setError(`Error: ${e2.message}`); else setEmpleados(data ?? [])
    setCargando(false)
  }

  async function cargarNominaProgramada(periodo: string) {
    if (!user?.id) return
    setCargandoProgramada(true)
    const { data, error: e } = await supabase.from('nomina_programada').select('id,nombre_empleado,cedula,area,sueldo_base,cuenta_puc_basico,auxilio_transporte,cuenta_puc_transporte,bonificaciones,cuenta_puc_bonos,prima,cuenta_puc_prima,abono_prima,cesantias,abono_cesantias,abono_liquidacion,neto_pagar,exceso_ley_1393,alerta_riesgo_ugpp,estado,metodo_conciliacion').eq('user_id', user.id).eq('empresa_id', empresaActiva!.id).eq('periodo_contable', periodo).order('nombre_empleado')
    if (e) { setError(`Error: ${e.message}`); setCargandoProgramada(false); return }
    setNominaProgramada((data ?? []).map((f: any) => ({ id:f.id, nombreEmpleado:f.nombre_empleado, cedula:f.cedula, area:f.area, sueldoBase:Number(f.sueldo_base??0), cuentaPucBasico:f.cuenta_puc_basico??'510506', auxilioTransporte:Number(f.auxilio_transporte??0), cuentaPucTransporte:f.cuenta_puc_transporte??'510527', bonificaciones:Number(f.bonificaciones??0), cuentaPucBonos:f.cuenta_puc_bonos??'510530', prima:Number(f.prima??0), cuentaPucPrima:f.cuenta_puc_prima??'514015', abonoPrima:Number(f.abono_prima??0), cesantias:Number(f.cesantias??0), abonoCesantias:Number(f.abono_cesantias??0), abonoLiquidacion:Number(f.abono_liquidacion??0), netoPagar:Number(f.neto_pagar??0), excesoLey1393:Number(f.exceso_ley_1393??0), alertaRiesgoUgpp:Boolean(f.alerta_riesgo_ugpp), estado:f.estado, metodoConciliacion:f.metodo_conciliacion })))
    setCargandoProgramada(false)
  }

  const totalNomina = useMemo(() => empleados.reduce((s,e) => s+e.salario_base,0), [empleados])
  const totalPendiente = useMemo(() => { const ids = new Set(liquidaciones.filter(l=>l.pago_realizado).map(l=>l.empleado_id)); return empleados.filter(e=>!ids.has(e.id)).reduce((s,e)=>s+e.salario_base,0) }, [empleados,liquidaciones])
  const res = useMemo(() => ({ totalNeto:nominaProgramada.reduce((s,f)=>s+f.netoPagar,0), pendientes:nominaProgramada.filter(f=>f.estado==='Pendiente de Pago').length, pagados:nominaProgramada.filter(f=>f.estado==='Pagado').length, enRiesgo:nominaProgramada.filter(f=>f.alertaRiesgoUgpp).length }), [nominaProgramada])

  async function agregarEmpleado() {
    if (!empresaId||!nombre.trim()||!cedula.trim()||!puesto.trim()||!salario.trim()) { setError('Todos los campos son obligatorios.'); return }
    const { data, error: e } = await supabase.from('empleados').insert({ empresa_id:empresaId, nombre:nombre.trim(), cedula:cedula.trim(), puesto:puesto.trim(), salario_base:Number(salario), riesgo_arl:riesgo, tipo_contrato:'indefinido', fecha_ingreso:new Date().toISOString().slice(0,10), activo:true }).select().single()
    if (e) { setError(`Error: ${e.message}`); return }
    setEmpleados(p=>[...p,data as Empleado]); setNombre(''); setCedula(''); setPuesto(''); setSalario(''); setRiesgo('I'); setError(null)
  }

  async function liquidarMesActual() {
    if (!empresaId) return; setLiquidando(true); setError(null)
    const { data: periodo, error: e } = await supabase.from('periodos_nomina').upsert({ empresa_id:empresaId, mes:periodoMes, anio:periodoAnio, estado:'liquidado' },{ onConflict:'empresa_id,mes,anio' }).select().single()
    if (e||!periodo) { setError(`Error: ${e?.message}`); setLiquidando(false); return }
    const filas = empleados.filter(e=>e.activo).map(e => { const prog=nominaProgramada.find(f=>f.cedula===e.cedula); const r=liquidarNomina({ salarioBase:e.salario_base, pagosNoSalariales:prog?.bonificaciones??0, riesgoARL:e.riesgo_arl, empresaExoneradaParafiscales:false }); return { empleado_id:e.id, periodo_id:periodo.id, salario_base:r.salarioBase, total_no_salarial:r.pagosNoSalariales, exceso_ley_1393:r.excesoLey1393, base_aportes:r.baseAportes, auxilio_transporte:r.auxilioTransporte, aporte_salud_empleado:r.aporteSaludEmpleado, aporte_pension_empleado:r.aportePensionEmpleado, aporte_salud_empleador:r.aporteSaludEmpleador, aporte_pension_empleador:r.aportePensionEmpleador, aporte_arl:r.aporteArl, sena:r.sena, icbf:r.icbf, caja_compensacion:r.cajaCompensacion, total_deducciones:r.totalDeducciones, neto_a_pagar:r.netoAPagar } })
    const { data: ld, error: e2 } = await supabase.from('liquidaciones_nomina').upsert(filas,{ onConflict:'empleado_id,periodo_id' }).select('empleado_id,neto_a_pagar,pago_realizado')
    if (e2) setError(`Error: ${e2.message}`); else setLiquidaciones(ld??[]); setLiquidando(false)
  }

  async function togglePago(id: string) {
    const l=liquidaciones.find(l=>l.empleado_id===id); if (!l) return
    const { error: e } = await supabase.from('liquidaciones_nomina').update({ pago_realizado:!l.pago_realizado }).eq('empleado_id',id)
    if (e) { setError(e.message); return }
    setLiquidaciones(p=>p.map(l=>l.empleado_id===id?{...l,pago_realizado:!l.pago_realizado}:l))
  }

  async function manejarImportacionExcel(ev: React.ChangeEvent<HTMLInputElement>) {
    const f=ev.target.files?.[0]; ev.target.value=''; if (!f||!user?.id) return
    setImportando(true); setError(null); setMensajeImportacion(null)
    try {
      const filas=await parseExcelNomina(f); const r=await guardarNominaProgramada(filas,user.id,periodoContable)
      const p=[`${r.filasInsertadas} nuevo(s), ${r.filasActualizadas} actualizado(s).`]
      if (r.filasOmitidas.length>0) p.push(`${r.filasOmitidas.length} omitida(s).`)
      if (r.alertasUgpp.length>0) p.push(`⚠️ Riesgo UGPP: ${r.alertasUgpp.map(a=>a.nombre).join(', ')}.`)
      setMensajeImportacion(p.join(' ')); await cargarNominaProgramada(periodoContable)
    } catch(err) { setError(err instanceof Error?err.message:'Error importando.') }
    finally { setImportando(false) }
  }

  async function manejarConciliacionPdf(ev: React.ChangeEvent<HTMLInputElement>) {
    const f=ev.target.files?.[0]; ev.target.value=''; if (!f) return
    setConciliando(true); setError(null); setMensajeConciliacion(null)
    try {
      const pend: RegistroPendiente[]=nominaProgramada.filter(f=>f.estado==='Pendiente de Pago').map(f=>({ id:f.id, nombreEmpleado:f.nombreEmpleado, netoPagar:f.netoPagar }))
      const r=await conciliarExtractoPdf(f,pend)
      setMensajeConciliacion(`${r.matches.length} conciliado(s). ${r.registrosSinMatch.length} sin coincidencia.`)
      await cargarNominaProgramada(periodoContable)
    } catch(err) { setError(err instanceof Error?err.message:'Error procesando PDF.') }
    finally { setConciliando(false) }
  }

  async function limpiarDatosDelMes() {
    if (!user?.id) return
    const confirmar = window.confirm(`¿Seguro que deseas eliminar todos los registros de nomina de ${NOMBRES_MES[periodoMes-1]} ${periodoAnio}? Esta accion no borra empleados y no se puede deshacer.`)
    if (!confirmar) return
    const { error: e } = await supabase
      .from('nomina_programada')
      .delete()
      .eq('user_id', user.id)
      .eq('periodo_contable', periodoContable)
    if (e) { setError(`Error al limpiar: ${e.message}`); return }
    setNominaProgramada([])
    setMensajeImportacion('Datos del mes eliminados correctamente.')
    setMensajeConciliacion(null)
  }

  async function togglePagoManual(id: number) {
    const f=nominaProgramada.find(f=>f.id===id); if (!f) return
    const nuevo: EstadoPago=f.estado==='Pagado'?'Pendiente de Pago':'Pagado'
    const { error: e }=await supabase.from('nomina_programada').update({ estado:nuevo, metodo_conciliacion:'manual' }).eq('id',id)
    if (e) { setError(e.message); return }
    setNominaProgramada(p=>p.map(f=>f.id===id?{...f,estado:nuevo,metodoConciliacion:'manual'}:f))
  }

  if (!user) return <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center"><span className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full"/></div>

  return (
    <div className="flex min-h-screen bg-[#f8f9fb] font-sans">
      <Sidebar user={user} onLogout={handleLogout}/>
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          <Card>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Gestión de Nómina</p>
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Nómina de empleados</h1>
              </div>
              <div className="flex gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3"><p className="text-xs text-slate-400">Total nómina</p><p className="text-lg font-bold text-emerald-800">${Math.round(res.totalNeto).toLocaleString()}</p></div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3"><p className="text-xs text-slate-400">Pendiente aportes</p><p className="text-lg font-bold text-amber-800">${totalPendiente.toLocaleString()}</p></div>
              </div>
            </div>
            <div className="mt-5">
              <button onClick={liquidarMesActual} disabled={liquidando||!empresaId} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40">
                {liquidando&&<span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"/>}
                {liquidando?'Liquidando...':`Liquidar aportes — ${NOMBRES_MES[periodoMes-1]} ${periodoAnio}`}
              </button>
            </div>
            {error&&<AlertaBanner mensaje={error} tipo="error"/>}
          </Card>

          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Conciliación de pagos</p>
                <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Nómina programada del periodo</h2>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Mes</label>
                  <select value={periodoMes} onChange={e=>setPeriodoMes(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 transition">
                    {NOMBRES_MES.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Año</label>
                  <input type="number" value={periodoAnio} onChange={e=>setPeriodoAnio(Number(e.target.value))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"/>
                </div>
                <button onClick={limpiarDatosDelMes} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 bg-white shadow-sm hover:bg-red-50 active:scale-[0.98] transition-all whitespace-nowrap">
                  ✕ Limpiar datos del mes
                </button>
                <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm cursor-pointer transition-all active:scale-[0.98] ${importando?'bg-emerald-400':'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {importando?<><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"/>Importando...</>:<>↑ Importar Excel</>}
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarImportacionExcel} disabled={importando||!user?.id} className="hidden"/>
                </label>
                <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm cursor-pointer transition-all active:scale-[0.98] ${conciliando?'bg-slate-500':'bg-slate-800 hover:bg-slate-700'}`}>
                  {conciliando?<><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"/>Conciliando...</>:<>⇄ Conciliar PDF</>}
                  <input type="file" accept="application/pdf" onChange={manejarConciliacionPdf} disabled={conciliando||nominaProgramada.length===0} className="hidden"/>
                </label>
              </div>
            </div>
            {mensajeImportacion&&<AlertaBanner mensaje={mensajeImportacion} tipo="success"/>}
            {mensajeConciliacion&&<AlertaBanner mensaje={mensajeConciliacion} tipo="info"/>}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Total neto del periodo" valor={`$${Math.round(res.totalNeto).toLocaleString()}`} color="slate"/>
              <KpiCard label="Pagados" valor={String(res.pagados)} color="emerald"/>
              <KpiCard label="Pendientes" valor={String(res.pendientes)} color="amber"/>
              <KpiCard label="Riesgo UGPP" valor={String(res.enRiesgo)} color="red"/>
            </div>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
              {cargandoProgramada?(
                <div className="flex items-center gap-2 p-8 text-slate-400 text-sm"><span className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full"/>Cargando...</div>
              ):nominaProgramada.length===0?(
                <div className="p-10 text-center"><p className="text-slate-500 font-medium">Sin registros para {NOMBRES_MES[periodoMes-1]} {periodoAnio}</p><p className="text-slate-400 text-sm mt-1">Importa el Excel del mes para comenzar.</p></div>
              ):(
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Empleado','Cédula','Básico','Transporte','Bonos','Prima','Cesantías','Neto','Ley 1393','Estado','Acción'].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {nominaProgramada.map(fila=>(
                      <tr key={fila.id} className="hover:bg-slate-50/70 transition-colors duration-100">
                        <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap">{fila.nombreEmpleado}</td>
                        <td className="px-4 py-3.5 text-slate-400 font-mono text-xs">{fila.cedula}</td>
                        <CeldaMoneda valor={fila.sueldoBase} cuenta={fila.cuentaPucBasico}/>
                        <CeldaMoneda valor={fila.auxilioTransporte} cuenta={fila.cuentaPucTransporte}/>
                        <CeldaMoneda valor={fila.bonificaciones} cuenta={fila.cuentaPucBonos}/>
                        <CeldaMoneda valor={fila.prima} cuenta={fila.cuentaPucPrima}/>
                        <td className="px-4 py-3.5 text-right text-slate-600">${fila.cesantias.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">${Math.round(fila.netoPagar).toLocaleString()}</td>
                        <td className="px-4 py-3.5">{fila.alertaRiesgoUgpp?<Badge color="red" dot label="Riesgo UGPP" title={`Exceso: $${fila.excesoLey1393.toLocaleString()}`}/>:<Badge color="slate" label="OK"/>}</td>
                        <td className="px-4 py-3.5"><Badge color={fila.estado==='Pagado'?'emerald':'amber'} dot label={fila.estado==='Pagado'?fila.metodoConciliacion==='automatico_valor'?'Pagado (auto)':'Pagado':'Pendiente'}/></td>
                        <td className="px-4 py-3.5">
                          <button onClick={()=>togglePagoManual(fila.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97] transition-all whitespace-nowrap">
                            {fila.estado==='Pagado'?'↩ Revertir':'✓ Marcar pagado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <h2 className="text-base font-semibold text-slate-900 mb-4">Empleados registrados</h2>
              {cargando?<div className="flex items-center gap-2 text-slate-400 text-sm p-4"><span className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full"/>Cargando...</div>:(
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-100">{['Nombre','Cédula','Puesto','Salario','Aportes','Acción'].map(h=><th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {empleados.map(emp=>{ const l=liquidaciones.find(l=>l.empleado_id===emp.id); const p=l?.pago_realizado??false; return (
                        <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors duration-100">
                          <td className="px-4 py-3.5 font-medium text-slate-800">{emp.nombre}</td>
                          <td className="px-4 py-3.5 text-slate-400 font-mono text-xs">{emp.cedula}</td>
                          <td className="px-4 py-3.5 text-slate-600">{emp.puesto}</td>
                          <td className="px-4 py-3.5 font-semibold text-slate-900 text-right">${emp.salario_base.toLocaleString()}</td>
                          <td className="px-4 py-3.5"><Badge color={p?'emerald':l?'amber':'slate'} dot={!!l} label={p?'Pagado':l?'Pendiente':'Sin liquidar'}/></td>
                          <td className="px-4 py-3.5"><button onClick={()=>togglePago(emp.id)} disabled={!l} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 active:scale-[0.97] transition-all disabled:opacity-30 whitespace-nowrap">{p?'↩ Revertir':'✓ Marcar pagado'}</button></td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card>
              <h2 className="text-base font-semibold text-slate-900 mb-4">Agregar empleado</h2>
              <div className="space-y-3">
                {[{l:'Nombre',v:nombre,s:setNombre,p:'Ej. Laura Torres',t:'text'},{l:'Cédula',v:cedula,s:setCedula,p:'Ej. 1020304050',t:'text'},{l:'Puesto',v:puesto,s:setPuesto,p:'Ej. Auxiliar contable',t:'text'},{l:'Salario mensual',v:salario,s:setSalario,p:'Ej. 2500000',t:'number'}].map(({l,v,s,p,t})=>(
                  <div key={l}><label className="block text-xs font-medium text-slate-500 mb-1.5">{l}</label><input value={v} onChange={e=>s(e.target.value)} placeholder={p} type={t} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"/></div>
                ))}
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Riesgo ARL</label><select value={riesgo} onChange={e=>setRiesgo(e.target.value as RiesgoARL)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 transition">{(['I','II','III','IV','V'] as RiesgoARL[]).map(r=><option key={r} value={r}>Clase {r}</option>)}</select></div>
                <button onClick={agregarEmpleado} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all">+ Añadir empleado</button>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4"><p className="text-xs text-slate-400 mb-1">Total salarios base</p><p className="text-xl font-semibold text-slate-900">${totalNomina.toLocaleString()}</p></div>
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  )
}






