'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { BANCOS, type BancoConfig } from '@/lib/bancos/config'

type MovimientoBanco = { fecha: string; descripcion: string; valor: number }
type ResultadoCruce = {
  movimiento: MovimientoBanco
  documentoEncontrado: any | null
  nominaEncontrada: any | null
  estadoCruce: 'encontrado' | 'no_encontrado' | 'confirmado' | 'extemporaneo_pendiente'
  periodoDestino?: string
  fechaRealOrigen?: string | null
}

function parsearValor(texto: string, config: BancoConfig): number {
  if (!texto) return 0
  let limpio = texto.toString()
  if (config.simboloMoneda) limpio = limpio.replace(config.simboloMoneda, '')
  if (config.separadorMiles) limpio = limpio.replace(/\./g, '').replace(',', '.')
  limpio = limpio.replace(',', '.').trim()
  return Math.abs(parseFloat(limpio) || 0)
}

function parsearFecha(texto: string, formato: string): string {
  if (!texto) return ''
  const t = texto.toString().trim()
  if (formato === 'YYYY/MM/DD') return t.replace(/\//g, '-')
  if (formato === 'DD/MM/YYYY') { const [d, m, y] = t.split('/'); return `${y}-${m}-${d}` }
  if (formato === 'MM/DD/YYYY') { const [m, d, y] = t.split('/'); return `${y}-${m}-${d}` }
  return t
}

function diferenciaDias(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1), d2 = new Date(fecha2)
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
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
export async function obtenerMovimientosPorPeriodoContable(
  empresaId: string,
  periodoContable: string
): Promise<MovimientoConciliadoContable[]> {
  if (!empresaId || !periodoContable) return []

  const [{ data: previa }, { data: facturas }, { data: nomina }] = await Promise.all([
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
  const [bancoSeleccionado, setBancoSeleccionado] = useState('av_villas')
  const [movimientos, setMovimientos] = useState<MovimientoBanco[]>([])
  const [resultados, setResultados] = useState<ResultadoCruce[]>([])
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [paso, setPaso] = useState<'subir' | 'revisar'>('subir')
  const [mostrarSubida, setMostrarSubida] = useState(false)
  const [periodos, setPeriodos] = useState<string[]>([])
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>('')
  const [periodoCerrado, setPeriodoCerrado] = useState(false)
  const periodoConsultaRef = useRef<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  // Cargar conciliaciones bancarias guardadas cuando se monta el componente o cambia la empresa activa
  useEffect(() => {
    if (!empresaActiva?.id) return
    cargarPeriodosDisponibles()
  }, [empresaActiva?.id])

  useEffect(() => {
    if (!empresaActiva?.id || !periodoSeleccionado) return
    cargarConciliacionesGuardadas(periodoSeleccionado)
  }, [empresaActiva?.id, periodoSeleccionado])

  const obtenerPeriodosUnicos = (registros: any[]) => {
    const periodosSet = new Set<string>()
    registros.forEach(item => {
      if (item.periodo) periodosSet.add(item.periodo)
      else if (item.movimiento_fecha) periodosSet.add(construirPeriodo(item.movimiento_fecha))
    })
    return Array.from(periodosSet).filter(Boolean).sort((a, b) => b.localeCompare(a))
  }

  const cargarPeriodosDisponibles = async () => {
    if (!empresaActiva?.id) return

    const { data: periodosData } = await supabase
      .from('periodos_conciliacion_bancaria')
      .select('periodo,cerrado')
      .eq('empresa_id', empresaActiva.id)
      .order('periodo', { ascending: false })

    const { data: conciliacionesData } = await supabase
      .from('conciliaciones_bancarias')
      .select('periodo')
      .eq('empresa_id', empresaActiva.id)

    const periodosDesdePeriodos = (periodosData || []).map((item: any) => item.periodo)
    const periodosDesdeConciliaciones = (conciliacionesData || []).map((item: any) => item.periodo)
    const periodosUnicos = Array.from(new Set([...periodosDesdePeriodos, ...periodosDesdeConciliaciones].filter(Boolean)))
      .sort((a: string, b: string) => b.localeCompare(a))

    const periodoInicial = periodosUnicos.length > 0 ? periodosUnicos[0] : construirPeriodo(new Date().toISOString().slice(0, 10))
    const periodosFinales = periodosUnicos.length > 0 ? periodosUnicos : [periodoInicial]

    setPeriodos(periodosFinales)
    setPeriodoSeleccionado(periodoInicial)
    setPeriodoCerrado(!!periodosData?.find((item: any) => item.periodo === periodoInicial)?.cerrado)
  }

  const cargarConciliacionesGuardadas = async (periodo: string) => {
    if (!empresaActiva?.id || !periodo) return

    // Marca cuál es la consulta "vigente": si el usuario cambia de periodo antes de que
    // esta respuesta llegue, la comparación de abajo la descarta en vez de pisar el estado.
    periodoConsultaRef.current = periodo

    const [{ data: previa }, { data: periodoRecord }] = await Promise.all([
      supabase
        .from('conciliaciones_bancarias')
        .select('*')
        .eq('empresa_id', empresaActiva.id)
        .eq('periodo', periodo)
        .order('fecha_carga', { ascending: false }),
      supabase
        .from('periodos_conciliacion_bancaria')
        .select('cerrado')
        .eq('empresa_id', empresaActiva.id)
        .eq('periodo', periodo)
        .single(),
    ])

    if (periodoConsultaRef.current !== periodo) return

    setPeriodoCerrado(!!periodoRecord?.cerrado)
    if (!previa || previa.length === 0) {
      setResultados([])
      setMensaje(`No hay conciliaciones guardadas para ${formatearPeriodo(periodo)}.`)
      return
    }

    setMensaje('')
    const { data: facturas } = await supabase
      .from('facturas')
      .select('*')
      .eq('empresa_id', empresaActiva.id)

    const { data: nomina } = await supabase
      .from('nomina_programada')
      .select('*')
      .eq('empresa_id', empresaActiva.id)

    if (periodoConsultaRef.current !== periodo) return

    const resultadosPrevios: ResultadoCruce[] = previa.map((r: any) => ({
      movimiento: { fecha: r.movimiento_fecha, descripcion: r.movimiento_descripcion, valor: r.movimiento_valor },
      documentoEncontrado: r.documento_id ? (facturas || []).find((f: any) => f.id === r.documento_id) || null : null,
      nominaEncontrada: r.nomina_id ? (nomina || []).find((n: any) => n.id === r.nomina_id) || null : null,
      estadoCruce: r.estado,
    }))

    setResultados(resultadosPrevios)
    setPaso('revisar')
    setMensaje(`Conciliacion previa cargada: ${previa.length} movimientos.`)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  async function obtenerPeriodoAbierto(empresaId: string): Promise<string> {
    const hoy = new Date()
    const { data, error } = await supabase
      .from('periodos_conciliacion_bancaria')
      .select('periodo')
      .eq('empresa_id', empresaId)
      .eq('cerrado', false)
      .order('periodo', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) {
      return construirPeriodo(hoy.toISOString().slice(0, 10))
    }

    return data[0]?.periodo || construirPeriodo(hoy.toISOString().slice(0, 10))
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !empresaActiva?.id) return
    if (periodoCerrado) {
      setMensaje('El periodo seleccionado está cerrado. Abre otro periodo o crea uno nuevo antes de subir el extracto.')
      return
    }

    setProcesando(true)
    setMensaje('Leyendo extracto bancario...')
    setMovimientos([])
    setResultados([])

    const config = BANCOS[bancoSeleccionado]
    try {
      let movs: MovimientoBanco[] = []
      if (file.name.endsWith('.pdf')) movs = await leerPDF(file, config)
      else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) movs = await leerExcel(file, config)
      else if (file.name.endsWith('.csv')) movs = await leerCSV(file, config)
      else { setMensaje('Formato no soportado. Usa PDF, Excel o CSV.'); setProcesando(false); return }

      if (movs.length === 0) { setMensaje('No se encontraron movimientos.'); setProcesando(false); return }

      setMovimientos(movs)
      setMensaje(`Se encontraron ${movs.length} movimientos. Cruzando con documentos...`)
      const periodoObjetivo = periodoSeleccionado || construirPeriodo(new Date().toISOString().slice(0, 10))
      // Asegurar que el periodo exista antes de borrar conciliaciones no confirmadas de ese periodo
      await crearOactualizarPeriodo(periodoObjetivo)
      // Borrar únicamente conciliaciones NO confirmadas del periodo objetivo (no afectar otros periodos)
      await supabase.from('conciliaciones_bancarias').delete()
        .eq('empresa_id', empresaActiva.id)
        .eq('periodo', periodoObjetivo)
        .neq('estado', 'confirmado')
      await cruzarConDocumentos(movs)
      setPaso('revisar')
      setMostrarSubida(false)
    } catch (err: any) {
      setMensaje('Error leyendo el archivo: ' + err.message)
    }
    setProcesando(false)
  }

  const leerPDF = async (file: File, config: BancoConfig): Promise<MovimientoBanco[]> => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const movs: MovimientoBanco[] = []
    const regexFecha = /^\d{4}\/\d{2}\/\d{2}$|^\d{2}\/\d{2}\/\d{4}$/
    const stopMarkers = [
      'VIGENCIA', 'TASA', 'TASAS', 'INTERES', 'INTERÉS', 'COSTO EFECTIVO', 'CONDICIONES', 'SALDO'
    ]

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lineas: Record<number, { str: string; x: number }[]> = {}
      for (const item of content.items as any[]) {
        const y = Math.round(item.transform[5] / 2) * 2
        if (!lineas[y]) lineas[y] = []
        if (item.str.trim()) lineas[y].push({ str: item.str, x: item.transform[4] })
      }

      let tablaIniciada = false
      for (const y of Object.keys(lineas).map(Number).sort((a, b) => b - a)) {
        const textos = lineas[y].sort((a, b) => a.x - b.x).map(i => i.str.trim()).filter(Boolean)
        if (textos.length < 2) continue

        const lineaTexto = textos.join(' ').toUpperCase()
        if (tablaIniciada && stopMarkers.some(marker => lineaTexto.includes(marker))) break

        let idxFecha = textos.findIndex(t => regexFecha.test(t.trim()))
        if (idxFecha === -1) {
          const regexFechaDash = /^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/
          idxFecha = textos.findIndex(t => regexFechaDash.test(t.trim()))
        }
        if (idxFecha === -1) continue

        const fechaToken = textos[idxFecha].trim().replace(/-/g, '/')
        const fecha = parsearFecha(fechaToken, config.formatoFecha)
        const partesDesc: string[] = [], gruposNumericos: string[] = []
        let grupoActual = ''
        for (let j = idxFecha + 1; j < textos.length; j++) {
          const t = textos[j].trim()
          if (/^[\$\d.,-]+$/.test(t.replace(/\s/g, ''))) grupoActual += t.replace(/\s/g, '')
          else { if (grupoActual) { gruposNumericos.push(grupoActual); grupoActual = '' } partesDesc.push(t) }
        }
        if (grupoActual) gruposNumericos.push(grupoActual)

        const descripcion = partesDesc.join(' ')
        if (!descripcion || /^[\d.,%\s]+$/.test(descripcion)) continue

        let valorTexto = ''
        if (gruposNumericos.length >= 2) {
          const gs: string[] = []
          for (const g of gruposNumericos) gs.push(...g.split(/(?<=\d)(?=\$)/))
          valorTexto = gs.length >= 2 ? gs[gs.length - 2] : gs[0]
        } else if (gruposNumericos.length === 1) {
          const p = gruposNumericos[0].split(/(?<=\d)(?=\$)/)
          valorTexto = p.length >= 2 ? p[p.length - 2] : p[0]
        }

        if (/%/.test(valorTexto) || /^[\d.,]+%$/.test(valorTexto.trim())) continue

        const montoFinal = parseFloat(valorTexto.replace(/\$/g, '').replace(/,/g, '').trim()) || 0
        if (fecha && montoFinal > 0) {
          tablaIniciada = true
          movs.push({ fecha, descripcion, valor: montoFinal })
        }
      }
    }
    return movs
  }

  const leerExcel = async (file: File, config: BancoConfig): Promise<MovimientoBanco[]> => {
    const XLSX = await import('xlsx')
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    return rows.map(row => {
      const fecha = parsearFecha(row[config.columnaFecha] || '', config.formatoFecha)
      const descripcion = row[config.columnaDescripcion] || ''
      const valor = config.columnaDebito && config.columnaCredito
        ? parsearValor(row[config.columnaDebito] || '0', config) + parsearValor(row[config.columnaCredito] || '0', config)
        : parsearValor(row[config.columnaValor] || '0', config)
      return { fecha, descripcion, valor }
    }).filter(m => m.fecha && m.valor > 0)
  }

  const leerCSV = async (file: File, config: BancoConfig): Promise<MovimientoBanco[]> => {
    const lineas = (await file.text()).split('\n').filter(Boolean)
    if (lineas.length < 2) return []
    const enc = lineas[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const iF = enc.findIndex(h => h === config.columnaFecha)
    const iD = enc.findIndex(h => h === config.columnaDescripcion)
    const iV = enc.findIndex(h => h === config.columnaValor)
    return lineas.slice(1).map(l => {
      const c = l.split(',').map(x => x.trim().replace(/"/g, ''))
      return { fecha: parsearFecha(c[iF] || '', config.formatoFecha), descripcion: c[iD] || '', valor: parsearValor(c[iV] || '0', config) }
    }).filter(m => m.fecha && m.valor > 0)
  }

  const cruzarConDocumentos = async (movs: MovimientoBanco[]) => {
    if (!empresaActiva?.id) return

    const { data: documentos } = await supabase
      .from('facturas').select('*')
      .eq('empresa_id', empresaActiva.id)   // ← fix: era user_id
      .eq('estado', 'Pendiente')

    const { data: nomina } = await supabase
      .from('nomina_programada').select('*')
      .eq('empresa_id', empresaActiva.id)   // ← fix: era user_id
      .eq('estado', 'Pendiente de Pago')

    const { data: periodosBancarios } = await supabase
      .from('periodos_conciliacion_bancaria')
      .select('periodo,cerrado')
      .eq('empresa_id', empresaActiva.id)

    const periodosCerrados = new Set(
      (periodosBancarios || []).filter((item: any) => item.cerrado).map((item: any) => item.periodo)
    )
    const periodoAbierto = await obtenerPeriodoAbierto(empresaActiva.id)

    const resultadosCruce: ResultadoCruce[] = movs.map(mov => {
      const periodoMovimiento = construirPeriodo(mov.fecha)
      const esPeriodoCerrado = periodosCerrados.has(periodoMovimiento)
      const periodoDestino = esPeriodoCerrado ? periodoAbierto : periodoMovimiento
      const docEncontrado = esPeriodoCerrado ? null : (documentos || []).find(doc =>
        Math.abs((doc.valor || 0) - mov.valor) < 1000 && doc.fecha && diferenciaDias(doc.fecha, mov.fecha) <= 5
      ) || null
      const nominaEncontrada = esPeriodoCerrado ? null : !docEncontrado
        ? (nomina || []).find(n => Math.abs((n.neto_pagar || 0) - mov.valor) < 1000) || null
        : null
      const estadoCruce = esPeriodoCerrado
        ? 'extemporaneo_pendiente'
        : (docEncontrado || nominaEncontrada) ? 'encontrado' : 'no_encontrado'

      return {
        movimiento: mov,
        documentoEncontrado: docEncontrado,
        nominaEncontrada: nominaEncontrada,
        estadoCruce,
        periodoDestino,
        fechaRealOrigen: esPeriodoCerrado ? mov.fecha : null,
      }
    })

    // Borrar únicamente conciliaciones NO confirmadas de los periodos que vamos a reemplazar
    const periodosAReemplazar = Array.from(new Set(resultadosCruce.map(r => r.periodoDestino ?? construirPeriodo(r.movimiento.fecha))))
    if (periodosAReemplazar.length > 0) {
      await supabase.from('conciliaciones_bancarias').delete()
        .eq('empresa_id', empresaActiva.id)
        .in('periodo', periodosAReemplazar)
        .neq('estado', 'confirmado')
    }

    const currentUser = user ?? (await supabase.auth.getUser()).data.user

    await supabase.from('conciliaciones_bancarias').insert(
      resultadosCruce.map(r => ({
        user_id: currentUser?.id || null,
        empresa_id: empresaActiva.id,
        banco: bancoSeleccionado,
        periodo: r.periodoDestino ?? construirPeriodo(r.movimiento.fecha),
        movimiento_fecha: r.movimiento.fecha,
        fecha_real_origen: r.fechaRealOrigen || null,
        movimiento_descripcion: r.movimiento.descripcion,
        movimiento_valor: r.movimiento.valor,
        documento_id: r.estadoCruce === 'extemporaneo_pendiente' ? null : r.documentoEncontrado?.id || null,
        nomina_id: r.estadoCruce === 'extemporaneo_pendiente' ? null : r.nominaEncontrada?.id || null,
        estado: r.estadoCruce,
      }))
    )

    setResultados(resultadosCruce)
    setMensaje(`Cruce completado: ${resultadosCruce.filter(r => r.estadoCruce === 'encontrado').length} de ${movs.length} coinciden.`)
  }

  const crearOactualizarPeriodo = async (periodo: string) => {
    if (!empresaActiva?.id || !periodo) return
    await supabase.from('periodos_conciliacion_bancaria').upsert(
      { empresa_id: empresaActiva.id, periodo, cerrado: false },
      { onConflict: 'empresa_id,periodo' }
    )
  }

  const cerrarPeriodo = async () => {
    if (!empresaActiva?.id || !periodoSeleccionado) return
    const currentUser = user ?? (await supabase.auth.getUser()).data.user
    await supabase.from('periodos_conciliacion_bancaria').upsert(
      {
        empresa_id: empresaActiva.id,
        periodo: periodoSeleccionado,
        cerrado: true,
        closed_at: new Date().toISOString(),
        closed_by: currentUser?.id || null,
      },
      { onConflict: 'empresa_id,periodo' }
    )
    setPeriodoCerrado(true)
    setMensaje(`Periodo ${formatearPeriodo(periodoSeleccionado)} cerrado.`)
  }

  const confirmarCruce = async (idx: number) => {
    const resultado = resultados[idx]
    if (!resultado) return
    if (resultado.documentoEncontrado) await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', resultado.documentoEncontrado.id)
    if (resultado.nominaEncontrada) await supabase.from('nomina_programada').update({ estado: 'Pagado' }).eq('id', resultado.nominaEncontrada.id)
    setResultados(prev => prev.map((r, i) => i === idx ? { ...r, estadoCruce: 'confirmado' } : r))
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
        <p className="text-slate-500 text-sm mb-6">Cruza tu extracto bancario con los documentos y nomina registrados en ContaBot</p>

        {(paso === 'subir' || mostrarSubida) && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Banco</label>
                <select value={bancoSeleccionado} onChange={e => setBancoSeleccionado(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl text-sm">
                  {Object.entries(BANCOS).map(([key, banco]) => <option key={key} value={key}>{banco.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Periodo cargado</label>
                <select value={periodoSeleccionado} onChange={e => setPeriodoSeleccionado(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white">
                  <option value="" className="text-slate-900">Selecciona un periodo</option>
                  {periodos.map(periodo => (
                    <option key={periodo} value={periodo} className="text-slate-900">{formatearPeriodo(periodo)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
              <p className="text-4xl mb-4">🏦</p>
              <p className="text-slate-600 mb-2 font-medium">Sube tu extracto bancario</p>
              <p className="text-slate-400 text-sm mb-6">Formatos soportados: PDF, Excel (.xlsx), CSV</p>
              <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium">
                {procesando ? 'Procesando...' : 'Seleccionar extracto'}
                <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleArchivo} className="hidden" disabled={procesando} />
              </label>
            </div>
            {mensaje && <p className="mt-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl">{mensaje}</p>}
          </div>
        )}

        {paso === 'revisar' && resultados.length > 0 && (
          <div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✅ Encontrados: {resultados.filter(r => r.estadoCruce === 'encontrado').length}</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">❓ Sin coincidencia: {resultados.filter(r => r.estadoCruce === 'no_encontrado').length}</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">✔️ Confirmados: {resultados.filter(r => r.estadoCruce === 'confirmado').length}</span>
                {periodoSeleccionado && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${periodoCerrado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {periodoCerrado ? 'Periodo cerrado' : 'Periodo abierto'}
                  </span>
                )}
              </div>
              <div className="flex gap-3 items-center">
                {periodoSeleccionado && !periodoCerrado && (
                  <button onClick={cerrarPeriodo} className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-xl font-medium">
                    Cerrar periodo
                  </button>
                )}
                <button onClick={() => { setMostrarSubida(true); setMensaje('') }} className="text-sm text-slate-500 hover:text-slate-700 underline">Subir otro extracto</button>
              </div>
            </div>
            {mensaje && <p className="mb-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl">{mensaje}</p>}
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
                    <tr key={idx} className={`border-t ${r.estadoCruce === 'confirmado' ? 'bg-emerald-50' : r.estadoCruce === 'encontrado' ? 'bg-yellow-50' : ''}`}>
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
        )}
      </main>
    </div>
  )
}