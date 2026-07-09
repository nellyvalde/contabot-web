'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { BANCOS, type BancoConfig } from '@/lib/bancos/config'

type MovimientoBanco = { fecha: string; descripcion: string; valor: number }
type ResultadoCruce = {
  movimiento: MovimientoBanco
  documentoEncontrado: any | null
  nominaEncontrada: any | null
  estadoCruce: 'encontrado' | 'no_encontrado' | 'confirmado'
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  // Cargar conciliaciones bancarias guardadas cuando se monta el componente o cambia la empresa activa
  useEffect(() => {
    if (!empresaActiva?.id) return
    cargarConciliacionesGuardadas()
  }, [empresaActiva?.id])

  const cargarConciliacionesGuardadas = async () => {
    if (!empresaActiva?.id) return

    const { data: previa } = await supabase
      .from('conciliaciones_bancarias')
      .select('*')
      .eq('empresa_id', empresaActiva.id)   // ← fix: era user_id
      .order('fecha_carga', { ascending: false })

    if (!previa || previa.length === 0) return

    const { data: facturas } = await supabase
      .from('facturas')
      .select('*')
      .eq('empresa_id', empresaActiva.id)   // ← fix: era user_id

    const { data: nomina } = await supabase
      .from('nomina_programada')
      .select('*')
      .eq('empresa_id', empresaActiva.id)   // ← fix: era user_id

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

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !empresaActiva?.id) return
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
      await supabase.from('conciliaciones_bancarias').delete()
        .eq('empresa_id', empresaActiva.id).neq('estado', 'confirmado')
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

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lineas: Record<number, { str: string; x: number }[]> = {}
      for (const item of content.items as any[]) {
        const y = Math.round(item.transform[5] / 2) * 2
        if (!lineas[y]) lineas[y] = []
        if (item.str.trim()) lineas[y].push({ str: item.str, x: item.transform[4] })
      }
      for (const y of Object.keys(lineas).map(Number).sort((a, b) => b - a)) {
        const textos = lineas[y].sort((a, b) => a.x - b.x).map(i => i.str.trim()).filter(Boolean)
        if (textos.length < 2 || !regexFecha.test(textos[0].trim())) continue
        const fecha = parsearFecha(textos[0].trim(), config.formatoFecha)
        const partesDesc: string[] = [], gruposNumericos: string[] = []
        let grupoActual = ''
        for (let j = 1; j < textos.length; j++) {
          const t = textos[j].trim()
          if (/^[\$\d.,]+$/.test(t.replace(/\s/g, ''))) grupoActual += t.replace(/\s/g, '')
          else { if (grupoActual) { gruposNumericos.push(grupoActual); grupoActual = '' } partesDesc.push(t) }
        }
        if (grupoActual) gruposNumericos.push(grupoActual)
        const descripcion = partesDesc.join(' ')
        let valorTexto = ''
        if (gruposNumericos.length >= 2) {
          const gs: string[] = []
          for (const g of gruposNumericos) gs.push(...g.split(/(?<=\d)(?=\$)/))
          valorTexto = gs.length >= 2 ? gs[gs.length - 2] : gs[0]
        } else if (gruposNumericos.length === 1) {
          const p = gruposNumericos[0].split(/(?<=\d)(?=\$)/)
          valorTexto = p.length >= 2 ? p[p.length - 2] : p[0]
        }
        const montoFinal = parseFloat(valorTexto.replace(/\$/g, '').replace(/,/g, '').trim()) || 0
        if (fecha && montoFinal > 0) movs.push({ fecha, descripcion, valor: montoFinal })
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

    const resultadosCruce: ResultadoCruce[] = movs.map(mov => {
      const docEncontrado = (documentos || []).find(doc =>
        Math.abs((doc.valor || 0) - mov.valor) < 1000 && doc.fecha && diferenciaDias(doc.fecha, mov.fecha) <= 5
      ) || null
      const nominaEncontrada = !docEncontrado
        ? (nomina || []).find(n => Math.abs((n.neto_pagar || 0) - mov.valor) < 1000) || null
        : null
      return { movimiento: mov, documentoEncontrado: docEncontrado, nominaEncontrada, estadoCruce: (docEncontrado || nominaEncontrada) ? 'encontrado' : 'no_encontrado' }
    })

    await supabase.from('conciliaciones_bancarias').delete()
      .eq('empresa_id', empresaActiva.id).eq('estado', 'no_encontrado')

    const currentUser = user ?? (await supabase.auth.getUser()).data.user

    await supabase.from('conciliaciones_bancarias').insert(
      resultadosCruce.map(r => ({
        user_id: currentUser?.id || null,
        empresa_id: empresaActiva.id,        // ← fix: era user_id
        banco: bancoSeleccionado,
        movimiento_fecha: r.movimiento.fecha,
        movimiento_descripcion: r.movimiento.descripcion,
        movimiento_valor: r.movimiento.valor,
        documento_id: r.documentoEncontrado?.id || null,
        nomina_id: r.nominaEncontrada?.id || null,
        estado: r.estadoCruce,
      }))
    )

    setResultados(resultadosCruce)
    setMensaje(`Cruce completado: ${resultadosCruce.filter(r => r.estadoCruce === 'encontrado').length} de ${movs.length} coinciden.`)
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
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Conciliacion Bancaria</h2>
        <p className="text-slate-500 text-sm mb-6">Cruza tu extracto bancario con los documentos y nomina registrados en ContaBot</p>

        {(paso === 'subir' || mostrarSubida) && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Banco</label>
              <select value={bancoSeleccionado} onChange={e => setBancoSeleccionado(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl text-sm">
                {Object.entries(BANCOS).map(([key, banco]) => <option key={key} value={key}>{banco.nombre}</option>)}
              </select>
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-4">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✅ Encontrados: {resultados.filter(r => r.estadoCruce === 'encontrado').length}</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">❓ Sin coincidencia: {resultados.filter(r => r.estadoCruce === 'no_encontrado').length}</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">✔️ Confirmados: {resultados.filter(r => r.estadoCruce === 'confirmado').length}</span>
              </div>
              <button onClick={() => { setMostrarSubida(true); setMensaje('') }} className="text-sm text-slate-500 hover:text-slate-700 underline">Subir otro extracto</button>
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
                      <td className="px-4 py-3 font-medium">${Math.round(r.movimiento.valor).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {r.documentoEncontrado && <div><p className="font-medium">{r.documentoEncontrado.proveedor}</p><p className="text-xs text-slate-500">${Math.round(r.documentoEncontrado.valor||0).toLocaleString()} · {r.documentoEncontrado.fecha}</p></div>}
                        {r.nominaEncontrada && <div><p className="font-medium">{r.nominaEncontrada.nombre_empleado}</p><p className="text-xs text-slate-500">Nomina · ${Math.round(r.nominaEncontrada.neto_pagar||0).toLocaleString()}</p></div>}
                        {!r.documentoEncontrado && !r.nominaEncontrada && <span className="text-slate-400 text-xs">Sin coincidencia</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.estadoCruce === 'confirmado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Confirmado</span>}
                        {r.estadoCruce === 'encontrado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Por confirmar</span>}
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