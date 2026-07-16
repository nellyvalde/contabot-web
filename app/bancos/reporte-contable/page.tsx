'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { obtenerMovimientosPorPeriodoContable, formatearPeriodo, type MovimientoConciliadoContable } from '@/app/bancos/page'

async function obtenerPeriodosContablesDisponibles(empresaId: string): Promise<string[]> {
  const { data } = await supabase
    .from('conciliaciones_bancarias')
    .select('periodo_contable')
    .eq('empresa_id', empresaId)

  return Array.from(new Set((data || []).map((item: any) => item.periodo_contable).filter(Boolean)))
    .sort((a: string, b: string) => b.localeCompare(a))
}

export default function ReporteContablePage() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<any>(null)
  const [periodos, setPeriodos] = useState<string[]>([])
  const [periodoContable, setPeriodoContable] = useState<string>('')
  const [movimientos, setMovimientos] = useState<MovimientoConciliadoContable[]>([])
  const [cargando, setCargando] = useState(false)
  const periodoConsultaRef = useRef<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    if (!empresaActiva?.id) return
    cargarPeriodosContables()
  }, [empresaActiva?.id])

  useEffect(() => {
    if (!empresaActiva?.id || !periodoContable) return
    cargarMovimientos(periodoContable)
  }, [empresaActiva?.id, periodoContable])

  const cargarPeriodosContables = async () => {
    if (!empresaActiva?.id) return
    const periodosDisponibles = await obtenerPeriodosContablesDisponibles(empresaActiva.id)
    setPeriodos(periodosDisponibles)
    setPeriodoContable(periodosDisponibles[0] || '')
  }

  const cargarMovimientos = async (periodo: string) => {
    if (!empresaActiva?.id || !periodo) return
    periodoConsultaRef.current = periodo
    setCargando(true)
    const data = await obtenerMovimientosPorPeriodoContable(empresaActiva.id, periodo)
    if (periodoConsultaRef.current !== periodo) return
    setMovimientos(data)
    setCargando(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  const totalMovimientos = movimientos.length
  const partidasEnTransito = movimientos.filter(m => m.periodoBancario !== periodoContable).length
  const sumaValores = movimientos.reduce((acc, m) => acc + (m.movimiento.valor || 0), 0)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-2xl font-bold text-slate-800">Reporte de Conciliación Contable</h2>
          <Link href="/bancos" className="text-sm text-emerald-600 hover:text-emerald-700 underline whitespace-nowrap mt-1">
            ← Volver a Bancos
          </Link>
        </div>
        <p className="text-slate-500 text-sm mb-6">Movimientos agrupados por periodo de causación contable (NIIF), no por el mes del extracto bancario</p>

        <div className="mb-6 max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-2">Periodo contable</label>
          <select value={periodoContable} onChange={e => setPeriodoContable(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white">
            <option value="" className="text-slate-900">Selecciona un periodo</option>
            {periodos.map(periodo => (
              <option key={periodo} value={periodo} className="text-slate-900">{formatearPeriodo(periodo)}</option>
            ))}
          </select>
        </div>

        {periodoContable && (
          <>
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-slate-500 mb-1">Total movimientos</p>
                <p className="text-3xl font-bold text-slate-900">{totalMovimientos}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <p className="text-sm text-slate-500">Partidas en tránsito</p>
                </div>
                <p className="text-3xl font-bold text-slate-900">{partidasEnTransito}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-slate-500 mb-1">Suma de valores</p>
                <p className="text-3xl font-bold text-slate-900">${Math.round(sumaValores).toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Descripción</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Partida en Tránsito</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, idx) => {
                    const esTransito = m.periodoBancario !== periodoContable
                    return (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-3 text-slate-600">{m.movimiento.fecha}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{m.movimiento.descripcion}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">${Math.round(m.movimiento.valor).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {esTransito ? (
                            <div>
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Extemporáneo</span>
                              <p className="text-xs text-slate-500 mt-1">reportado en extracto de {formatearPeriodo(m.periodoBancario)}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {movimientos.length === 0 && !cargando && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">No hay movimientos para este periodo contable.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
