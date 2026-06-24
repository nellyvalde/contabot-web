'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { BANCOS, type BancoConfig } from '@/lib/bancos/config'

type MovimientoBanco = {
  fecha: string
  descripcion: string
  valor: number
}

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
  if (formato === 'DD/MM/YYYY') {
    const [d, m, y] = t.split('/')
    return `${y}-${m}-${d}`
  }
  if (formato === 'MM/DD/YYYY') {
    const [m, d, y] = t.split('/')
    return `${y}-${m}-${d}`
  }
  return t
}

function diferenciaDias(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1)
  const d2 = new Date(fecha2)
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

export default function BancosPage() {
  const [user, setUser] = useState<any>(null)
  const [bancoSeleccionado, setBancoSeleccionado] = useState('av_villas')
  const [movimientos, setMovimientos] = useState<MovimientoBanco[]>([])
  const [resultados, setResultados] = useState<ResultadoCruce[]>([])
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [paso, setPaso] = useState<'subir' | 'revisar'>('subir')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProcesando(true)
    setMensaje('Leyendo extracto bancario...')
    setMovimientos([])
    setResultados([])

    const config = BANCOS[bancoSeleccionado]

    try {
      let movs: MovimientoBanco[] = []

      if (file.name.endsWith('.pdf')) {
        movs = await leerPDF(file, config)
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        movs = await leerExcel(file, config)
      } else if (file.name.endsWith('.csv')) {
        movs = await leerCSV(file, config)
      } else {
        setMensaje('Formato no soportado. Usa PDF, Excel o CSV.')
        setProcesando(false)
        return
      }

      if (movs.length === 0) {
        setMensaje('No se encontraron movimientos en el archivo.')
        setProcesando(false)
        return
      }

      setMovimientos(movs)
      console.log('Primeros 3 movimientos:', JSON.stringify(movs.slice(0,3)))
      setMensaje(`Se encontraron ${movs.length} movimientos. Cruzando con documentos...`)
      await cruzarConDocumentos(movs)
      setPaso('revisar')
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
      const x = item.transform[4]
      if (!lineas[y]) lineas[y] = []
      if (item.str.trim()) lineas[y].push({ str: item.str, x })
    }

    const ysOrdenados = Object.keys(lineas).map(Number).sort((a, b) => b - a)

    for (const y of ysOrdenados) {
      const itemsLinea = lineas[y].sort((a, b) => a.x - b.x)
      const textos = itemsLinea.map(item => item.str.trim()).filter(Boolean)

      if (textos.length < 2) continue
      if (!regexFecha.test(textos[0].trim())) continue

      const fecha = parsearFecha(textos[0].trim(), config.formatoFecha)
      console.log('Texto original capturado:', textos.join(' '))

      const partesDesc: string[] = []
      const gruposNumericos: string[] = []
      let grupoActual = ''

      for (let j = 1; j < textos.length; j++) {
        const t = textos[j].trim()
        const esFragmentoNumerico = /^[\$\d.,]+$/.test(t.replace(/\s/g, ''))
        if (esFragmentoNumerico) {
          grupoActual += t.replace(/\s/g, '')
        } else {
          if (grupoActual) {
            gruposNumericos.push(grupoActual)
            grupoActual = ''
          }
          partesDesc.push(t)
        }
      }
      if (grupoActual) gruposNumericos.push(grupoActual)

      const descripcion = partesDesc.join(' ')

      let valorTexto = ''
     if (gruposNumericos.length >= 2) {
      const gruposSeparados: string[] = []
      for (const g of gruposNumericos) {
    const partes = g.split(/(?<=\d)(?=\$)/)
     gruposSeparados.push(...partes)
     }
  valorTexto = gruposSeparados.length >= 2
    ? gruposSeparados[gruposSeparados.length - 2]
    : gruposSeparados[0]
} else if (gruposNumericos.length === 1) {
  const partes = gruposNumericos[0].split(/(?<=\d)(?=\$)/)
  valorTexto = partes.length >= 2 ? partes[partes.length - 2] : partes[0]
}

      const valorLimpio = valorTexto
        .replace(/\$/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim()

      const montoFinal = parseFloat(valorLimpio) || 0
      console.log('Valor convertido final:', montoFinal, '| Texto:', valorTexto)

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
    const movs: MovimientoBanco[] = []

    for (const row of rows) {
      const fecha = parsearFecha(row[config.columnaFecha] || '', config.formatoFecha)
      const descripcion = row[config.columnaDescripcion] || ''
      let valor = 0

      if (config.columnaDebito && config.columnaCredito) {
        const debito = parsearValor(row[config.columnaDebito] || '0', config)
        const credito = parsearValor(row[config.columnaCredito] || '0', config)
        valor = debito + credito
      } else {
        valor = parsearValor(row[config.columnaValor] || '0', config)
      }

      if (fecha && valor > 0) movs.push({ fecha, descripcion, valor })
    }

    return movs
  }

  const leerCSV = async (file: File, config: BancoConfig): Promise<MovimientoBanco[]> => {
    const texto = await file.text()
    const lineas = texto.split('\n').filter(Boolean)
    if (lineas.length < 2) return []

    const encabezados = lineas[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const idxFecha = encabezados.findIndex(h => h === config.columnaFecha)
    const idxDesc = encabezados.findIndex(h => h === config.columnaDescripcion)
    const idxValor = encabezados.findIndex(h => h === config.columnaValor)

    const movs: MovimientoBanco[] = []
    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const fecha = parsearFecha(cols[idxFecha] || '', config.formatoFecha)
      const descripcion = cols[idxDesc] || ''
      const valor = parsearValor(cols[idxValor] || '0', config)
      if (fecha && valor > 0) movs.push({ fecha, descripcion, valor })
    }

    return movs
  }

  const cruzarConDocumentos = async (movs: MovimientoBanco[]) => {
    if (!user) return

    const { data: documentos } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', user.id)
      .eq('estado', 'Pendiente')

    const { data: nomina } = await supabase
      .from('nomina_programada')
      .select('*')
      .eq('user_id', user.id)
      .eq('estado', 'Pendiente de Pago')

    const resultadosCruce: ResultadoCruce[] = movs.map(mov => {
      // Buscar en documentos
      const docEncontrado = (documentos || []).find(doc => {
        const mismoValor = Math.abs((doc.valor || 0) - mov.valor) < 100
        const fechaCercana = doc.fecha ? diferenciaDias(doc.fecha, mov.fecha) <= 3 : false
        return mismoValor && fechaCercana
      }) || null

      // Buscar en nomina
      const nominaEncontrada = !docEncontrado ? ((nomina || []).find(n => {
        const mismoValor = Math.abs((n.neto_pagar || 0) - mov.valor) < 100
        return mismoValor
      }) || null) : null

      return {
        movimiento: mov,
        documentoEncontrado: docEncontrado,
        nominaEncontrada,
        estadoCruce: (docEncontrado || nominaEncontrada) ? 'encontrado' : 'no_encontrado',
      }
    })

    setResultados(resultadosCruce)
    const encontrados = resultadosCruce.filter(r => r.estadoCruce === 'encontrado').length
    setMensaje(`Cruce completado: ${encontrados} de ${movs.length} movimientos coinciden con documentos.`)
  }

  const confirmarCruce = async (idx: number) => {
    const resultado = resultados[idx]
    if (!resultado) return

    if (resultado.documentoEncontrado) {
      await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', resultado.documentoEncontrado.id)
    }
    if (resultado.nominaEncontrada) {
      await supabase.from('nomina_programada').update({ estado: 'Pagado' }).eq('id', resultado.nominaEncontrada.id)
    }

    setResultados(prev => prev.map((r, i) => i === idx ? { ...r, estadoCruce: 'confirmado' } : r))
  }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Conciliacion Bancaria</h2>
        <p className="text-slate-500 text-sm mb-6">Cruza tu extracto bancario con los documentos y nomina registrados en ContaBot</p>

        {paso === 'subir' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Banco</label>
              <select value={bancoSeleccionado} onChange={e => setBancoSeleccionado(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {Object.entries(BANCOS).map(([key, banco]) => (
                  <option key={key} value={key}>{banco.nombre}</option>
                ))}
              </select>
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
              <p className="text-4xl mb-4">🏦</p>
              <p className="text-slate-600 mb-2 font-medium">Sube tu extracto bancario</p>
              <p className="text-slate-400 text-sm mb-6">Formatos soportados: PDF, Excel (.xlsx), CSV</p>
              <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl transition-colors font-medium">
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
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  ✅ Encontrados: {resultados.filter(r => r.estadoCruce === 'encontrado').length}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  ❓ Sin coincidencia: {resultados.filter(r => r.estadoCruce === 'no_encontrado').length}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  ✔️ Confirmados: {resultados.filter(r => r.estadoCruce === 'confirmado').length}
                </span>
              </div>
              <button onClick={() => { setPaso('subir'); setResultados([]); setMovimientos([]); setMensaje('') }}
                className="text-sm text-slate-500 hover:text-slate-700 underline">
                Subir otro extracto
              </button>
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
                        {r.documentoEncontrado && (
                          <div>
                            <p className="font-medium text-slate-800">{r.documentoEncontrado.proveedor}</p>
                            <p className="text-xs text-slate-500">${Math.round(r.documentoEncontrado.valor || 0).toLocaleString()} · {r.documentoEncontrado.fecha}</p>
                          </div>
                        )}
                        {r.nominaEncontrada && (
                          <div>
                            <p className="font-medium text-slate-800">{r.nominaEncontrada.nombre_empleado}</p>
                            <p className="text-xs text-slate-500">Nomina · ${Math.round(r.nominaEncontrada.neto_pagar || 0).toLocaleString()}</p>
                          </div>
                        )}
                        {!r.documentoEncontrado && !r.nominaEncontrada && (
                          <span className="text-slate-400 text-xs">Sin coincidencia</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.estadoCruce === 'confirmado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Confirmado</span>}
                        {r.estadoCruce === 'encontrado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Por confirmar</span>}
                        {r.estadoCruce === 'no_encontrado' && <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Sin match</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.estadoCruce === 'encontrado' && (
                          <button onClick={() => confirmarCruce(idx)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                            Confirmar cruce
                          </button>
                        )}
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