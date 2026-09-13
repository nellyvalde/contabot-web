'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { confirmarCruceFactura } from '@/lib/bancos/confirmarCruceFactura'
import { confirmarCruceNomina } from '@/lib/bancos/confirmarCruceNomina'
import { type CandidatoAmbiguo } from '@/lib/bancos/emparejarMovimientos'
import { MENSAJE_CARGA_DESHABILITADA } from '@/lib/bancos/cargaDeshabilitada'
import { mensajeErrorControlado, registrarErrorSupabase } from '@/lib/bancos/erroresBancos'
import { hayResultadosParaMostrar } from '@/lib/bancos/estadoVista'
import { claveConsulta, ejecutarSiVigente, type EstadoConsultaVigente } from '@/lib/bancos/consultaVigente'

type MovimientoBanco = { fecha: string; descripcion: string; valor: number }
type ResultadoCruce = {
  id?: string
  movimiento: MovimientoBanco
  documentoEncontrado: any | null
  nominaEncontrada: any | null
  estadoCruce: 'encontrado' | 'no_encontrado' | 'confirmado' | 'extemporaneo_pendiente' | 'requiere_revision'
  candidatosAmbiguos?: CandidatoAmbiguo[]
  periodoDestino?: string
  fechaRealOrigen?: string | null
}

export const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function construirPeriodo(fecha: string): string {
  if (!fecha) return ''
  // No usar Date aquí: parsear 'YYYY-MM-DD' como UTC y leer con getters locales
  // desplaza la fecha un día en timezones negativos (ej. Colombia UTC-5),
  // lo que le resta un mes al periodo de cualquier movimiento fechado el día 1.
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(fecha.trim())
  if (!match) return ''
  const [, anio, mes] = match
  return `${anio}-${mes}`
}

export function formatearPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  if (!anio || !mes) return periodo
  const index = Number(mes) - 1
  return `${NOMBRES_MESES[index] || mes} ${anio}`
}

export type MovimientoConciliadoContable = ResultadoCruce & { periodoBancario: string }

// Consulta independiente para el futuro "Reporte de Conciliación Contable".
// A diferencia de cargarConciliacionesGuardadas (que filtra por `periodo`, el mes
// real del extracto bancario), esta filtra por `periodo_contable` (el mes en que
// el gasto se causa según NIIF). No modifica ningún estado del componente ni
// afecta la vista actual de /bancos.
//
// Revisa los 3 errores de Supabase explicitamente: un fallo aqui NUNCA debe
// convertirse en un reporte vacio aparentemente valido (equivalente a "no
// hay movimientos"). Si algo falla, se registra el detalle tecnico y se
// lanza un error controlado -- el llamador (reporte-contable/page.tsx) debe
// capturarlo y mostrarlo, nunca tratarlo como una lista vacia.
export async function obtenerMovimientosPorPeriodoContable(
  empresaId: string,
  periodoContable: string
): Promise<MovimientoConciliadoContable[]> {
  if (!empresaId || !periodoContable) return []

  const [
    { data: previa, error: errorPrevia },
    { data: facturas, error: errorFacturas },
    { data: nomina, error: errorNomina },
  ] = await Promise.all([
    supabase
      .from('conciliaciones_bancarias')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('periodo_contable', periodoContable)
      .order('movimiento_fecha', { ascending: true }),
    supabase
      .from('facturas')
      .select('*')
      .eq('empresa_id', empresaId),
    supabase
      .from('nomina_programada')
      .select('*')
      .eq('empresa_id', empresaId),
  ])

  if (errorPrevia || errorFacturas || errorNomina) {
    registrarErrorSupabase('cargar el reporte de conciliación contable', errorPrevia || errorFacturas || errorNomina)
    throw new Error(mensajeErrorControlado('cargar el reporte de conciliación contable'))
  }

  return (previa || []).map((r: any) => ({
    movimiento: { fecha: r.movimiento_fecha, descripcion: r.movimiento_descripcion, valor: r.movimiento_valor },
    documentoEncontrado: r.documento_id ? (facturas || []).find((f: any) => f.id === r.documento_id) || null : null,
    nominaEncontrada: r.nomina_id ? (nomina || []).find((n: any) => n.id === r.nomina_id) || null : null,
    estadoCruce: r.estado,
    periodoDestino: r.periodo_contable,
    fechaRealOrigen: r.fecha_real_origen || null,
    periodoBancario: r.periodo,
  }))
}

export default function BancosPage() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<any>(null)
  const [resultados, setResultados] = useState<ResultadoCruce[]>([])
  const [mensaje, setMensaje] = useState('')
  const [periodos, setPeriodos] = useState<string[]>([])
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>('')
  const [periodoCerrado, setPeriodoCerrado] = useState(false)

  // Empresa cuyo estado esta reflejado actualmente en resultados/periodos/etc.
  // Al cambiar de empresa, se limpia todo lo derivado de la empresa anterior
  // DURANTE EL RENDER (no en un useEffect) -- es el patron que React
  // recomienda para "ajustar estado cuando cambia una prop" (ver
  // react.dev, "You Might Not Need An Effect"): evita el pase de render
  // extra de un efecto y el lint react-hooks/set-state-in-effect (llamar
  // setState sincronicamente dentro de un efecto). El resultado es el
  // mismo objetivo de seguridad: nunca se ve, ni siquiera brevemente, un
  // resultado, mensaje, periodo o estado "cerrado" que en realidad
  // pertenece a otra empresa.
  const [empresaReflejada, setEmpresaReflejada] = useState(empresaActiva?.id)
  if (empresaActiva?.id !== empresaReflejada) {
    setEmpresaReflejada(empresaActiva?.id)
    setResultados([])
    setMensaje('')
    setPeriodos([])
    setPeriodoSeleccionado('')
    setPeriodoCerrado(false)
  }

  // Claves de "consulta vigente" -- una por cada operacion asincrona que
  // puede quedar obsoleta si el usuario cambia de empresa o de periodo
  // antes de que la respuesta llegue. Cada clave incluye TODAS las
  // dimensiones de las que depende esa consulta (empresaId siempre;
  // periodo ademas para conciliaciones) -- antes solo se comparaba
  // `periodo`, asi que una respuesta tardia de la empresa anterior podia
  // sobreescribir el estado de la empresa nueva.
  const consultaPeriodosRef = useRef<string>('')
  const estadoConsultaPeriodos: EstadoConsultaVigente = {
    obtenerClaveVigente: () => consultaPeriodosRef.current,
    establecerClaveVigente: (c) => { consultaPeriodosRef.current = c },
  }

  const consultaConciliacionesRef = useRef<string>('')
  const estadoConsultaConciliaciones: EstadoConsultaVigente = {
    obtenerClaveVigente: () => consultaConciliacionesRef.current,
    establecerClaveVigente: (c) => { consultaConciliacionesRef.current = c },
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

  // Cargar conciliaciones bancarias guardadas cuando se monta el componente o cambia la empresa activa
  useEffect(() => {
    if (!empresaActiva?.id) return
    cargarPeriodosDisponibles(empresaActiva.id)
  }, [empresaActiva?.id])

  useEffect(() => {
    if (!empresaActiva?.id || !periodoSeleccionado) return
    cargarConciliacionesGuardadas(empresaActiva.id, periodoSeleccionado)
  }, [empresaActiva?.id, periodoSeleccionado])

  const obtenerPeriodosUnicos = (registros: any[]) => {
    const periodosSet = new Set<string>()
    registros.forEach(item => {
      if (item.periodo) periodosSet.add(item.periodo)
      else if (item.movimiento_fecha) periodosSet.add(construirPeriodo(item.movimiento_fecha))
    })
    return Array.from(periodosSet).filter(Boolean).sort((a, b) => b.localeCompare(a))
  }

  const cargarPeriodosDisponibles = async (empresaId: string) => {
    if (!empresaId) return
    const clave = claveConsulta(empresaId)

    await ejecutarSiVigente(
      estadoConsultaPeriodos,
      clave,
      async () => {
        const { data: periodosData, error: errorPeriodos } = await supabase
          .from('periodos_conciliacion_bancaria')
          .select('periodo,cerrado')
          .eq('empresa_id', empresaId)
          .order('periodo', { ascending: false })

        if (errorPeriodos) {
          registrarErrorSupabase('cargar los periodos disponibles', errorPeriodos)
          return { tipo: 'error' as const }
        }

        const { data: conciliacionesData, error: errorConciliaciones } = await supabase
          .from('conciliaciones_bancarias')
          .select('periodo')
          .eq('empresa_id', empresaId)

        if (errorConciliaciones) {
          registrarErrorSupabase('cargar los periodos con conciliaciones existentes', errorConciliaciones)
          return { tipo: 'error' as const }
        }

        const periodosDesdePeriodos = (periodosData || []).map((item: any) => item.periodo)
        const periodosDesdeConciliaciones = (conciliacionesData || []).map((item: any) => item.periodo)
        const periodosUnicos = Array.from(new Set([...periodosDesdePeriodos, ...periodosDesdeConciliaciones].filter(Boolean)))
          .sort((a: string, b: string) => b.localeCompare(a))

        const periodoInicial = periodosUnicos.length > 0 ? periodosUnicos[0] : construirPeriodo(new Date().toISOString().slice(0, 10))
        const periodosFinales = periodosUnicos.length > 0 ? periodosUnicos : [periodoInicial]
        const cerrado = !!periodosData?.find((item: any) => item.periodo === periodoInicial)?.cerrado

        return { tipo: 'ok' as const, periodosFinales, periodoInicial, cerrado }
      },
      (resultado) => {
        if (resultado.tipo === 'error') {
          setMensaje(mensajeErrorControlado('cargar los periodos disponibles'))
          return
        }
        setPeriodos(resultado.periodosFinales)
        setPeriodoSeleccionado(resultado.periodoInicial)
        setPeriodoCerrado(resultado.cerrado)
      }
    )
  }

  const cargarConciliacionesGuardadas = async (empresaId: string, periodo: string) => {
    if (!empresaId || !periodo) return
    const clave = claveConsulta(empresaId, periodo)

    await ejecutarSiVigente(
      estadoConsultaConciliaciones,
      clave,
      async () => {
        const [{ data: previa, error: errorPrevia }, { data: periodoRecord, error: errorPeriodoRecord }] = await Promise.all([
          supabase
            .from('conciliaciones_bancarias')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('periodo', periodo)
            .order('fecha_carga', { ascending: false }),
          supabase
            .from('periodos_conciliacion_bancaria')
            .select('cerrado')
            .eq('empresa_id', empresaId)
            .eq('periodo', periodo)
            .single(),
        ])

        // PGRST116 = .single() no encontro fila -- es "este periodo todavia
        // no tiene registro propio", no un fallo real; cualquier otro
        // codigo si lo es.
        if (errorPeriodoRecord && errorPeriodoRecord.code !== 'PGRST116') {
          registrarErrorSupabase('consultar el estado del periodo', errorPeriodoRecord)
        }
        const cerrado = !!periodoRecord?.cerrado

        if (errorPrevia) {
          registrarErrorSupabase('cargar las conciliaciones guardadas', errorPrevia)
          return { tipo: 'error' as const, cerrado }
        }

        if (!previa || previa.length === 0) {
          return { tipo: 'vacio' as const, cerrado }
        }

        const { data: facturas, error: errorFacturas } = await supabase
          .from('facturas')
          .select('*')
          .eq('empresa_id', empresaId)
        if (errorFacturas) registrarErrorSupabase('cargar las facturas', errorFacturas)

        const { data: nomina, error: errorNomina } = await supabase
          .from('nomina_programada')
          .select('*')
          .eq('empresa_id', empresaId)
        if (errorNomina) registrarErrorSupabase('cargar la nómina', errorNomina)

        const resultadosPrevios: ResultadoCruce[] = previa.map((r: any) => ({
          id: r.id,
          movimiento: { fecha: r.movimiento_fecha, descripcion: r.movimiento_descripcion, valor: r.movimiento_valor },
          documentoEncontrado: r.documento_id ? (facturas || []).find((f: any) => f.id === r.documento_id) || null : null,
          nominaEncontrada: r.nomina_id ? (nomina || []).find((n: any) => n.id === r.nomina_id) || null : null,
          estadoCruce: r.estado,
          candidatosAmbiguos: r.candidatos_ambiguos ?? [],
        }))

        return {
          tipo: 'ok' as const,
          cerrado,
          resultadosPrevios,
          totalPrevia: previa.length,
          huboErrorEnriquecimiento: !!(errorFacturas || errorNomina),
        }
      },
      (resultado) => {
        setPeriodoCerrado(resultado.cerrado)

        if (resultado.tipo === 'error') {
          setResultados([])
          setMensaje(mensajeErrorControlado('cargar las conciliaciones guardadas'))
          return
        }

        if (resultado.tipo === 'vacio') {
          setResultados([])
          setMensaje(`No hay conciliaciones guardadas para ${formatearPeriodo(periodo)}.`)
          return
        }

        setResultados(resultado.resultadosPrevios)
        let mensajeFinal = `Conciliacion previa cargada: ${resultado.totalPrevia} movimientos.`
        if (resultado.huboErrorEnriquecimiento) {
          mensajeFinal += ' Algunos datos de facturas o nómina no se pudieron cargar.'
        }
        setMensaje(mensajeFinal)
      }
    )
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const cerrarPeriodo = async () => {
    if (!empresaActiva?.id || !periodoSeleccionado) return

    let currentUser = user
    if (!currentUser) {
      const { data, error: errorUsuario } = await supabase.auth.getUser()
      if (errorUsuario) {
        registrarErrorSupabase('verificar tu sesión', errorUsuario)
        setMensaje(mensajeErrorControlado('cerrar el periodo'))
        return
      }
      currentUser = data.user
    }

    const { error: errorCerrar } = await supabase.from('periodos_conciliacion_bancaria').upsert(
      {
        empresa_id: empresaActiva.id,
        periodo: periodoSeleccionado,
        cerrado: true,
        closed_at: new Date().toISOString(),
        closed_by: currentUser?.id || null,
      },
      { onConflict: 'empresa_id,periodo' }
    )

    if (errorCerrar) {
      registrarErrorSupabase('cerrar el periodo', errorCerrar)
      setMensaje(mensajeErrorControlado('cerrar el periodo'))
      return
    }

    setPeriodoCerrado(true)
    setMensaje(`Periodo ${formatearPeriodo(periodoSeleccionado)} cerrado.`)
  }

  const confirmarCruce = async (idx: number) => {
    const resultado = resultados[idx]
    if (!resultado || !empresaActiva?.id) return

    if (resultado.documentoEncontrado) {
      const resultadoRpc = await confirmarCruceFactura(supabase, resultado.id)
      if (!resultadoRpc.ok) {
        console.error('[Bancos] Error confirmando el cruce:', resultadoRpc.error)
        setMensaje(mensajeErrorControlado('confirmar el cruce'))
        return
      }
      setResultados(prev => prev.map((r, i) => i === idx ? { ...r, estadoCruce: 'confirmado' } : r))
      return
    }

    if (resultado.nominaEncontrada) {
      // Se registra como abono (no como "Pagado" directo): el valor del movimiento bancario
      // puede ser un pago parcial. La referencia evita contar el mismo movimiento dos veces
      // si el extracto se vuelve a cruzar.
      const mov = resultado.movimiento
      const referencia = `banco:${empresaActiva.id}:${mov.fecha}:${mov.descripcion}:${mov.valor}`

      const resultadoConfirmacion = await confirmarCruceNomina({
        empresaId: empresaActiva.id,
        obligacionId: resultado.nominaEncontrada.id,
        valorAbonado: mov.valor,
        fechaAbono: mov.fecha,
        referencia,
        observaciones: mov.descripcion,
      })

      if (!resultadoConfirmacion.confirmado) {
        setMensaje(resultadoConfirmacion.mensaje)
        return
      }

      setResultados(prev => prev.map((r, i) => i === idx ? { ...r, estadoCruce: 'confirmado' } : r))
    }
  }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-2xl font-bold text-slate-800">Conciliacion Bancaria</h2>
          <Link href="/bancos/reporte-contable" className="text-sm text-emerald-600 hover:text-emerald-700 underline whitespace-nowrap mt-1">
            Ver reporte de conciliación contable →
          </Link>
        </div>
        <p className="text-slate-500 text-sm mb-6">Consulta tus conciliaciones bancarias guardadas por periodo</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800" role="status">
          {MENSAJE_CARGA_DESHABILITADA}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Periodo</label>
              <select value={periodoSeleccionado} onChange={e => setPeriodoSeleccionado(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white">
                <option value="" className="text-slate-900">Selecciona un periodo</option>
                {periodos.map(periodo => (
                  <option key={periodo} value={periodo} className="text-slate-900">{formatearPeriodo(periodo)}</option>
                ))}
              </select>
            </div>
            {periodoSeleccionado && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${periodoCerrado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {periodoCerrado ? 'Periodo cerrado' : 'Periodo abierto'}
              </span>
            )}
            {periodoSeleccionado && !periodoCerrado && (
              <button onClick={cerrarPeriodo} className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-xl font-medium">
                Cerrar periodo
              </button>
            )}
          </div>
        </div>

        {mensaje && <p className="mb-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl">{mensaje}</p>}

        {hayResultadosParaMostrar(resultados.length) ? (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✅ Encontrados: {resultados.filter(r => r.estadoCruce === 'encontrado').length}</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">❓ Sin coincidencia: {resultados.filter(r => r.estadoCruce === 'no_encontrado').length}</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">⚠️ Requiere revisión: {resultados.filter(r => r.estadoCruce === 'requiere_revision').length}</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">✔️ Confirmados: {resultados.filter(r => r.estadoCruce === 'confirmado').length}</span>
            </div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-4 py-3 font-medium">Fecha Banco</th>
                    <th className="px-4 py-3 font-medium">Descripcion Banco</th>
                    <th className="px-4 py-3 font-medium">Valor Banco</th>
                    <th className="px-4 py-3 font-medium">Documento Encontrado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, idx) => (
                    <tr key={idx} className={`border-t ${r.estadoCruce === 'confirmado' ? 'bg-emerald-50' : r.estadoCruce === 'encontrado' ? 'bg-yellow-50' : r.estadoCruce === 'requiere_revision' ? 'bg-orange-50' : ''}`}>
                      <td className="px-4 py-3 text-slate-600">{r.movimiento.fecha}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{r.movimiento.descripcion}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">${Math.round(r.movimiento.valor).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {r.documentoEncontrado && <div><p className="font-medium">{r.documentoEncontrado.proveedor}</p><p className="text-xs text-slate-500">${Math.round(r.documentoEncontrado.valor||0).toLocaleString()} · {r.documentoEncontrado.fecha}</p></div>}
                        {r.nominaEncontrada && <div><p className="font-medium">{r.nominaEncontrada.nombre_empleado}</p><p className="text-xs text-slate-500">Nomina · ${Math.round(r.nominaEncontrada.neto_pagar||0).toLocaleString()}</p></div>}
                        {!r.documentoEncontrado && !r.nominaEncontrada && <span className="text-slate-400 text-xs">Sin coincidencia</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.estadoCruce === 'confirmado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Confirmado</span>}
                        {r.estadoCruce === 'encontrado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Por confirmar</span>}
                        {r.estadoCruce === 'extemporaneo_pendiente' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Extemporáneo</span>}
                        {r.estadoCruce === 'no_encontrado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Sin match</span>}
                        {r.estadoCruce === 'requiere_revision' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Coincidencia ambigua — requiere revisión</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.estadoCruce === 'encontrado' && <button onClick={() => confirmarCruce(idx)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">Confirmar cruce</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-slate-500 text-sm">
            No hay conciliaciones guardadas para mostrar en este periodo.
          </div>
        )}
      </main>
    </div>
  )
}
