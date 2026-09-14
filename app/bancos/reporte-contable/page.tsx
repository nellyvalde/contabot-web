'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { obtenerMovimientosPorPeriodoContable, formatearPeriodo, type MovimientoConciliadoContable } from '@/app/bancos/page'
import { mensajeErrorControlado, registrarErrorSupabase } from '@/lib/bancos/erroresBancos'
import { claveConsulta, ejecutarSiVigente, type EstadoConsultaVigente } from '@/lib/bancos/consultaVigente'

async function obtenerPeriodosContablesDisponibles(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('conciliaciones_bancarias')
    .select('periodo_contable')
    .eq('empresa_id', empresaId)

  if (error) {
    registrarErrorSupabase('cargar los periodos contables disponibles', error)
    throw new Error(mensajeErrorControlado('cargar los periodos contables disponibles'))
  }

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
  const [mensaje, setMensaje] = useState('')

  // Ajuste durante el render (no en un useEffect) al cambiar de empresa --
  // mismo patron y misma razon que en app/bancos/page.tsx: evita el pase de
  // render extra de un efecto y react-hooks/set-state-in-effect, con el
  // mismo objetivo de seguridad (nunca mostrar datos de otra empresa).
  const [empresaReflejada, setEmpresaReflejada] = useState(empresaActiva?.id)
  if (empresaActiva?.id !== empresaReflejada) {
    setEmpresaReflejada(empresaActiva?.id)
    setPeriodos([])
    setPeriodoContable('')
    setMovimientos([])
    setMensaje('')
  }

  // Identidad vigente independiente del ciclo de vida de cada consulta,
  // igual que en app/bancos/page.tsx -- ver el comentario alli (y en
  // ejecutarSiVigente, lib/bancos/consultaVigente.ts) sobre por que la
  // actualizacion va en un useEffect sin dependencias (nunca escrita
  // durante el render: el compilador de React lo prohibe) y por que igual
  // cierra el hueco de vigencia antes de que cualquier promesa de red real
  // pueda resolver.
  const empresaIdRenderizadoRef = useRef<string | undefined>(empresaActiva?.id)
  const periodoContableRenderizadoRef = useRef<string>(periodoContable)
  useEffect(() => {
    empresaIdRenderizadoRef.current = empresaActiva?.id
    periodoContableRenderizadoRef.current = periodoContable
  })

  const consultaPeriodosRef = useRef<string>('')
  const estadoConsultaPeriodos: EstadoConsultaVigente = {
    obtenerClaveVigente: () => consultaPeriodosRef.current,
    establecerClaveVigente: (c) => { consultaPeriodosRef.current = c },
  }

  const consultaMovimientosRef = useRef<string>('')
  const estadoConsultaMovimientos: EstadoConsultaVigente = {
    obtenerClaveVigente: () => consultaMovimientosRef.current,
    establecerClaveVigente: (c) => { consultaMovimientosRef.current = c },
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        registrarErrorSupabase('verificar la sesión', error)
        window.location.href = '/'
        return
      }
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    if (!empresaActiva?.id) return
    cargarPeriodosContables(empresaActiva.id)
  }, [empresaActiva?.id])

  useEffect(() => {
    if (!empresaActiva?.id || !periodoContable) return
    cargarMovimientos(empresaActiva.id, periodoContable)
  }, [empresaActiva?.id, periodoContable])

  const cargarPeriodosContables = async (empresaId: string) => {
    if (!empresaId) return
    const clave = claveConsulta(empresaId)
    const esVigente = () => empresaIdRenderizadoRef.current === empresaId

    await ejecutarSiVigente(
      estadoConsultaPeriodos,
      clave,
      async () => {
        try {
          const periodosDisponibles = await obtenerPeriodosContablesDisponibles(empresaId)
          return { tipo: 'ok' as const, periodosDisponibles }
        } catch (err) {
          console.error('[ReporteContable] Error cargando periodos contables:', err)
          return { tipo: 'error' as const }
        }
      },
      (resultado) => {
        if (resultado.tipo === 'error') {
          setMensaje(mensajeErrorControlado('cargar los periodos disponibles'))
          return
        }
        setPeriodos(resultado.periodosDisponibles)
        setPeriodoContable(resultado.periodosDisponibles[0] || '')
      },
      esVigente
    )
  }

  const cargarMovimientos = async (empresaId: string, periodo: string) => {
    if (!empresaId || !periodo) return
    const clave = claveConsulta(empresaId, periodo)
    const esVigente = () =>
      empresaIdRenderizadoRef.current === empresaId && periodoContableRenderizadoRef.current === periodo
    setCargando(true)

    await ejecutarSiVigente(
      estadoConsultaMovimientos,
      clave,
      async () => {
        try {
          const data = await obtenerMovimientosPorPeriodoContable(empresaId, periodo)
          return { tipo: 'ok' as const, data }
        } catch (err) {
          console.error('[ReporteContable] Error cargando movimientos:', err)
          return { tipo: 'error' as const }
        }
      },
      (resultado) => {
        // setCargando(false) vive DENTRO de este callback (que solo corre si
        // `clave` sigue vigente) para que una respuesta tardia de otro
        // periodo/empresa nunca apague el indicador de carga de la consulta
        // realmente activa.
        if (resultado.tipo === 'error') {
          // Un fallo de consulta NUNCA se presenta como "cero movimientos":
          // se limpia la lista pero se deja un mensaje de error explicito,
          // y la tabla evita mostrar "No hay movimientos" mientras `mensaje`
          // este activo (ver JSX mas abajo).
          setMovimientos([])
          setMensaje(mensajeErrorControlado('cargar el reporte de conciliación contable'))
          setCargando(false)
          return
        }
        setMensaje('')
        setMovimientos(resultado.data)
        setCargando(false)
      },
      esVigente
    )
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

        {mensaje && <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 p-4 rounded-xl">{mensaje}</p>}

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
                  {movimientos.length === 0 && !cargando && !mensaje && (
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
