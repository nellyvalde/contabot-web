'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const categoriaConfig: Record<string, { color: string }> = {
  'Factura de Venta':     { color: 'bg-green-100 text-green-700' },
  'Factura de Compra':    { color: 'bg-blue-100 text-blue-700' },
  'Gasto':                { color: 'bg-orange-100 text-orange-700' },
  'Nomina':               { color: 'bg-blue-100 text-blue-700' },
  'Extracto Bancario':    { color: 'bg-purple-100 text-purple-700' },
  'Documento Tributario': { color: 'bg-orange-100 text-orange-700' },
}

const estadoConfig: Record<string, { color: string }> = {
  'Pendiente': { color: 'bg-yellow-100 text-yellow-700' },
  'Pagado':    { color: 'bg-green-100 text-green-700' },
  'Vencido':   { color: 'bg-red-100 text-red-700' },
}

function diasVencidos(fechaVencimiento: string | null, estado: string) {
  if (!fechaVencimiento || estado === 'Pagado') return 0
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  const diff = Math.floor((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

function diasParaVencer(fechaVencimiento: string | null) {
  if (!fechaVencimiento) return null
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  return Math.floor((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Dashboard() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [seccion, setSeccion] = useState('dashboard')
  const [filtroCobrarCliente, setFiltroCobrarCliente] = useState('')
  const [filtroCobrarEstado, setFiltroCobrarEstado] = useState('')
  const [filtroCobrarFecha, setFiltroCobrarFecha] = useState('')
  const [pagoModal, setPagoModal] = useState<any>(null)
  const [filtroPagarProveedor, setFiltroPagarProveedor] = useState('')
  const [filtroPagarEstado, setFiltroPagarEstado] = useState('')
  const [filtroPagarFecha, setFiltroPagarFecha] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null)
  const [clientesDB, setClientesDB] = useState<any[]>([])
  const [editandoCliente, setEditandoCliente] = useState(false)
  const [datosEditCliente, setDatosEditCliente] = useState<any>({})
  const [filtroDoc, setFiltroDoc] = useState('todos')
  const [buscarDoc, setBuscarDoc] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstadoDoc, setFiltroEstadoDoc] = useState('')
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('')
  const [filtroFechaFin, setFiltroFechaFin] = useState('')
  const [filtroValorMin, setFiltroValorMin] = useState('')
  const [filtroValorMax, setFiltroValorMax] = useState('')
  const [preguntaBot, setPreguntaBot] = useState('')
const [respuestaBot, setRespuestaBot] = useState('')
const [cargandoBot, setCargandoBot] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sec = params.get('seccion')
    if (sec) setSeccion(sec)
    else setSeccion('dashboard')
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    if (empresaActiva?.id) {
      setFacturas([])
      cargarFacturas()
      cargarClientesDB()
    }
  }, [empresaActiva?.id])

  const cargarFacturas = async () => {
    if (!empresaActiva?.id) return
    setFacturas([])
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('empresa_id', empresaActiva.id)
      .order('created_at', { ascending: false })
    if (data) setFacturas(data)
  }

  const cargarClientesDB = async () => {
    if (!empresaActiva?.id) return
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaActiva.id)
    if (data) setClientesDB(data)
  }

const preguntarBot = async () => {
  if (!preguntaBot.trim()) return
  setCargandoBot(true)
  try {
    const res = await fetch('/api/leer-factura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'consulta',
        pregunta: preguntaBot,
        contexto: {
          empresa: empresaActiva?.razon_social,
          totalIngresos,
          totalGastos,
          utilidad,
          cuentasPorCobrar,
          cuentasPorPagar,
          totalFacturas: facturas.length,
        }
      })
    })
    const json = await res.json()
    setRespuestaBot(json.respuesta || 'No pude procesar tu consulta.')
  } catch {
    setRespuestaBot('Error de conexión.')
  }
  setCargandoBot(false)
  setPreguntaBot('')
}
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMensaje('La IA esta leyendo y clasificando tu documento...')
    setDatosFact(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setDatosFact(data.datos)
        setMensaje('Documento leido y clasificado correctamente')
      } else {
        setMensaje('Error: ' + data.error)
      }
    } catch {
      setMensaje('Error procesando el archivo')
    }
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('Seguro que deseas eliminar este documento?')) return
    await supabase.from('facturas').delete().eq('id', id)
    cargarFacturas()
  }

  const handleEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from('facturas').update({ estado: nuevoEstado }).eq('id', id)
    cargarFacturas()
  }

  const handleGuardar = async () => {
    if (!datosFact || !user || !empresaActiva?.id) return
    setGuardando(true)
    const { error } = await supabase.from('facturas').insert({
      user_id: user.id,
      empresa_id: empresaActiva.id,
      proveedor: datosFact.proveedor,
      fecha: datosFact.fecha,
      valor: datosFact.valor,
      iva: datosFact.iva,
      descripcion: datosFact.descripcion,
      tipo: datosFact.tipo,
      categoria: datosFact.categoria,
      estado: 'Pendiente',
    })
    if (error) {
      setMensaje('Error guardando: ' + error.message)
    } else {
      setMensaje('Documento guardado correctamente')
      setDatosFact(null)
      cargarFacturas()
    }
    setGuardando(false)
  }

  const handleRegistrarPago = async () => {
    if (!pagoModal) return
    await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', pagoModal.id)
    setPagoModal(null)
    cargarFacturas()
  }

  const abrirCliente = (nombre: string) => {
    const clienteDB = clientesDB.find((c: any) => c.nombre === nombre)
    setDatosEditCliente(clienteDB || {})
    setClienteSeleccionado(nombre)
    setEditandoCliente(false)
  }

  const guardarCliente = async (nombre: string) => {
    const clienteExistente = clientesDB.find((c: any) => c.nombre === nombre)
    if (clienteExistente) {
      await supabase.from('clientes').update(datosEditCliente).eq('id', clienteExistente.id)
    } else {
      await supabase.from('clientes').insert({
        ...datosEditCliente,
        nombre,
        user_id: user.id,
        empresa_id: empresaActiva?.id,
      })
    }
    setEditandoCliente(false)
    cargarClientesDB()
  }

  const totalIngresos = facturas.filter(f => f.categoria === 'Factura de Venta').reduce((a, b) => a + (b.valor || 0), 0)
  const totalGastos = facturas.filter(f => ['Factura de Compra', 'Gasto', 'Nomina'].includes(f.categoria)).reduce((a, b) => a + (b.valor || 0), 0)
  const utilidad = totalIngresos - totalGastos
const porcentajeGasto = totalIngresos > 0 ? Math.round((totalGastos / totalIngresos) * 100) : 0
  const cuentasPorCobrar = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)
  const cuentasPorPagar = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)

  const facturasCobrar = facturas.filter(f => {
    if (f.categoria !== 'Factura de Venta') return false
    if (filtroCobrarCliente && !f.proveedor?.toLowerCase().includes(filtroCobrarCliente.toLowerCase())) return false
    if (filtroCobrarEstado && f.estado !== filtroCobrarEstado) return false
    if (filtroCobrarFecha && f.fecha < filtroCobrarFecha) return false
    return true
  })

  const facturasPagar = facturas.filter(f => {
    if (!['Factura de Compra', 'Gasto'].includes(f.categoria)) return false
    if (filtroPagarProveedor && !f.proveedor?.toLowerCase().includes(filtroPagarProveedor.toLowerCase())) return false
    if (filtroPagarEstado && f.estado !== filtroPagarEstado) return false
    if (filtroPagarFecha && f.fecha < filtroPagarFecha) return false
    return true
  })

  const clientesAgrupados = Object.values(
    facturas.filter(f => f.categoria === 'Factura de Venta').reduce((acc: any, f) => {
      const nombre = f.proveedor || 'Sin nombre'
      if (!acc[nombre]) acc[nombre] = { nombre, cantidadFacturas: 0, totalFacturado: 0, totalPendiente: 0, ultimaFactura: f.fecha, facturas: [] }
      acc[nombre].cantidadFacturas++
      acc[nombre].totalFacturado += f.valor || 0
      if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
      if (f.fecha > acc[nombre].ultimaFactura) acc[nombre].ultimaFactura = f.fecha
      acc[nombre].facturas.push(f)
      return acc
    }, {})
  ).map((c: any) => {
    const clienteDB = clientesDB.find((db: any) => db.nombre === c.nombre)
    const tieneVencidas = c.facturas.some((f: any) => f.estado === 'Vencido')
    const tienePendientes = c.facturas.some((f: any) => f.estado === 'Pendiente')
    const estadoCartera = tieneVencidas ? 'Vencida' : tienePendientes ? 'Pendiente' : 'Al dia'
    return { ...c, ...(clienteDB || {}), estadoCartera }
  }) as any[]

  const proveedoresAgrupados = Object.values(
    facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria)).reduce((acc: any, f) => {
      const nombre = f.proveedor || 'Sin nombre'
      if (!acc[nombre]) acc[nombre] = { nombre, cantidadDocumentos: 0, totalComprado: 0, totalPendiente: 0, ultimoDocumento: f.fecha, documentos: [] }
      acc[nombre].cantidadDocumentos++
      acc[nombre].totalComprado += f.valor || 0
      if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
      if (f.fecha > acc[nombre].ultimoDocumento) acc[nombre].ultimoDocumento = f.fecha
      acc[nombre].documentos.push(f)
      return acc
    }, {})
  ) as any[]

  const hoy = new Date()
  const cobrarVencidas = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Vencido')
  const cobrarProximas = facturas.filter(f => {
    if (f.categoria !== 'Factura de Venta' || f.estado === 'Pagado') return false
    const dias = diasParaVencer(f.fecha_vencimiento)
    return dias !== null && dias >= 0 && dias <= 7
  })
  const pagarVencidas = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Vencido')
  const pagarProximas = facturas.filter(f => {
    if (!['Factura de Compra', 'Gasto'].includes(f.categoria) || f.estado === 'Pagado') return false
    const dias = diasParaVencer(f.fecha_vencimiento)
    return dias !== null && dias >= 0 && dias <= 7
  })
  const docHoy = facturas.filter(f => new Date(f.created_at).toDateString() === hoy.toDateString())
  const totalAlertas = cobrarVencidas.length + cobrarProximas.length + pagarVencidas.length + pagarProximas.length

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} alertCount={totalAlertas} />
      <main className="flex-1 ml-64 p-8">

        {seccion === 'dashboard' && (
  <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
      <p className="text-slate-400 text-sm mt-1">Resumen financiero de {empresaActiva?.razon_social}</p>
    </div>

    {/* KPIs */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Ingresos</p>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Ventas</span>
        </div>
        <p className="text-2xl font-bold text-slate-900">${totalIngresos.toLocaleString()}</p>
        <p className="text-xs text-emerald-600 mt-1 font-medium">● Facturas de venta</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Gastos</p>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Egresos</span>
        </div>
        <p className="text-2xl font-bold text-slate-900">${totalGastos.toLocaleString()}</p>
        <p className="text-xs text-red-500 mt-1 font-medium">● Compras y gastos</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Utilidad</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${totalIngresos - totalGastos >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
            {totalIngresos - totalGastos >= 0 ? 'Positiva' : 'Negativa'}
          </span>
        </div>
        <p className={`text-2xl font-bold ${totalIngresos - totalGastos >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
          ${(totalIngresos - totalGastos).toLocaleString()}
        </p>
        <p className="text-xs text-blue-500 mt-1 font-medium">● Ingresos - Gastos</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Documentos</p>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Total</span>
        </div>
        <p className="text-2xl font-bold text-slate-900">{facturas.length}</p>
        <p className="text-xs text-slate-400 mt-1 font-medium">● Registrados en ContaBot</p>
      </div>
    </div>

    {/* Gráfico + Actividad reciente */}
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.4fr] gap-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Ingresos vs Gastos</h3>
        <GraficoIngresosGastos facturas={facturas} />
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Actividad reciente</h3>
        <div className="space-y-3">
          {facturas.slice(0, 6).map(f => (
            <div key={f.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${f.categoria === 'Factura de Venta' ? 'bg-emerald-500' : 'bg-red-400'}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{f.proveedor || 'Sin nombre'}</p>
                <p className="text-xs text-slate-400">${Number(f.valor || 0).toLocaleString()} · {f.categoria}</p>
              </div>
            </div>
          ))}
          {facturas.length === 0 && <p className="text-xs text-slate-400">Sin actividad reciente</p>}
        </div>
      </div>
    </div>

    {/* Cuentas + Alertas */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSeccion('cobrar')}>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Por Cobrar</p>
        <p className="text-xl font-bold text-emerald-600">${cuentasPorCobrar.toLocaleString()}</p>
        <p className="text-xs text-slate-400 mt-1">Facturas pendientes de cobro →</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSeccion('pagar')}>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Por Pagar</p>
        <p className="text-xl font-bold text-red-500">${cuentasPorPagar.toLocaleString()}</p>
        <p className="text-xs text-slate-400 mt-1">Compras y gastos pendientes →</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 cursor-pointer hover:shadow-md transition-shadow border" onClick={() => setSeccion('alertas')}>
        <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Alertas</p>
        <p className="text-xl font-bold text-red-600">{totalAlertas}</p>
        <p className="text-xs text-slate-400 mt-1">Vencidas y próximas a vencer →</p>
      </div>
    </div>
{/* Calendario Tributario + Chat IA */}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

      {/* Calendario Tributario */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">📅 Vencimientos de Impuestos</h3>
        <CalendarioTributario nit={empresaActiva?.nit || ''} />
      </div>

      {/* Chat IA */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">🤖 Tu Asistente ContaBot</h3>

        {/* Sugerencia automática si utilidad negativa */}
        {utilidad < 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Análisis automático</p>
            <p className="text-xs text-amber-600">
              Tus gastos superan los ingresos en un {porcentajeGasto}%. Revisa los registros de Compras y Gastos para optimizar tu flujo de caja.
            </p>
          </div>
        )}

        {respuestaBot && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 mb-4">
            <p className="text-xs text-slate-600">{respuestaBot}</p>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <input
            value={preguntaBot}
            onChange={e => setPreguntaBot(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && preguntarBot()}
            placeholder="¿Cuál es mi utilidad del mes?"
            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={preguntarBot}
            disabled={cargandoBot}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {cargandoBot ? '...' : '→'}
          </button>
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          {['¿Cuál es mi utilidad?', '¿Qué debo pagar?', '¿Cómo mejorar mi flujo?'].map(q => (
            <button key={q} onClick={() => { setPreguntaBot(q); preguntarBot() }}
              className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-200">
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
    {/* Subir documento */}
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Subir Documento con IA</h3>
        <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm transition-colors font-medium">
          {loading ? 'Procesando...' : '+ Seleccionar archivo'}
          <input type="file" accept="image/*,application/pdf" onChange={handleArchivo} className="hidden" disabled={loading} />
        </label>
      </div>
      {mensaje && <div className="p-4 bg-slate-50 rounded-xl mb-4"><p className="text-slate-700 text-sm">{mensaje}</p></div>}
      {datosFact && (
        <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200">
          <h3 className="font-semibold text-emerald-800 mb-3 text-sm">Datos extraidos por IA:</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><p className="text-xs text-slate-500">Cliente/Proveedor</p><p className="font-medium text-sm">{datosFact.proveedor}</p></div>
            <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium text-sm">{datosFact.fecha}</p></div>
            <div><p className="text-xs text-slate-500">Valor</p><p className="font-medium text-sm text-emerald-700">${datosFact.valor?.toLocaleString()}</p></div>
            <div><p className="text-xs text-slate-500">IVA</p><p className="font-medium text-sm">${datosFact.iva?.toLocaleString()}</p></div>
            <div className="col-span-2"><p className="text-xs text-slate-500">Descripcion</p><p className="font-medium text-sm">{datosFact.descripcion}</p></div>
          </div>
          <button onClick={handleGuardar} disabled={guardando} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white py-2 rounded-xl font-medium text-sm">
            {guardando ? 'Guardando...' : 'Guardar en ContaBot'}
          </button>
        </div>
      )}
    </div>
  </div>
)}

        {seccion === 'cobrar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Cobrar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-green-400">
              <p className="text-slate-500 text-sm">Total pendiente por cobrar</p>
              <p className="text-3xl font-bold text-green-600 mt-1">${cuentasPorCobrar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder="Buscar por cliente..." value={filtroCobrarCliente} onChange={e => setFiltroCobrarCliente(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                <select value={filtroCobrarEstado} onChange={e => setFiltroCobrarEstado(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">
                  <option value="">Todos los estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Vencido">Vencido</option>
                </select>
                <input type="date" value={filtroCobrarFecha} onChange={e => setFiltroCobrarFecha(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {facturasCobrar.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p>No hay facturas pendientes de cobro.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Cliente</th><th className="pb-2">No. Factura</th><th className="pb-2">Valor</th><th className="pb-2">Estado</th><th className="pb-2">Dias Vencidos</th><th className="pb-2"></th>
                  </tr></thead>
                  <tbody>
                    {facturasCobrar.map(f => {
                      const dias = diasVencidos(f.fecha_vencimiento, f.estado)
                      return (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{f.proveedor}</td>
                          <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                          <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                          <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>{f.estado || 'Pendiente'}</span></td>
                          <td className="py-3">{dias > 0 ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{dias} dias</span> : <span className="text-slate-400 text-xs">Al dia</span>}</td>
                          <td className="py-3">{f.estado !== 'Pagado' && <button onClick={() => setPagoModal(f)} className="bg-emerald-500 text-white text-xs px-3 py-1 rounded-lg">Registrar pago</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'pagar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Pagar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-orange-400">
              <p className="text-slate-500 text-sm">Total pendiente por pagar</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">${cuentasPorPagar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder="Buscar por proveedor..." value={filtroPagarProveedor} onChange={e => setFiltroPagarProveedor(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                <select value={filtroPagarEstado} onChange={e => setFiltroPagarEstado(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">
                  <option value="">Todos los estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Vencido">Vencido</option>
                </select>
                <input type="date" value={filtroPagarFecha} onChange={e => setFiltroPagarFecha(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {facturasPagar.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p>No hay facturas pendientes de pago.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Proveedor</th><th className="pb-2">No. Factura</th><th className="pb-2">Valor</th><th className="pb-2">Categoria</th><th className="pb-2">Estado</th><th className="pb-2">Dias Vencidos</th><th className="pb-2"></th>
                  </tr></thead>
                  <tbody>
                    {facturasPagar.map(f => {
                      const dias = diasVencidos(f.fecha_vencimiento, f.estado)
                      return (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{f.proveedor}</td>
                          <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                          <td className="py-3 text-orange-600 font-medium">${f.valor?.toLocaleString()}</td>
                          <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>{f.categoria}</span></td>
                          <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>{f.estado || 'Pendiente'}</span></td>
                          <td className="py-3">{dias > 0 ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{dias} dias</span> : <span className="text-slate-400 text-xs">Al dia</span>}</td>
                          <td className="py-3">{f.estado !== 'Pagado' && <button onClick={() => setPagoModal(f)} className="bg-orange-500 text-white text-xs px-3 py-1 rounded-lg">Registrar pago</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'alertas' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Centro de Alertas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-red-50 rounded-2xl p-5 border border-red-200"><p className="text-red-600 text-xs font-medium">Cobros Vencidos</p><p className="text-2xl font-bold text-red-700 mt-1">{cobrarVencidas.length}</p></div>
              <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-200"><p className="text-yellow-600 text-xs font-medium">Cobros Proximos</p><p className="text-2xl font-bold text-yellow-700 mt-1">{cobrarProximas.length}</p></div>
              <div className="bg-orange-50 rounded-2xl p-5 border border-orange-200"><p className="text-orange-600 text-xs font-medium">Pagos Vencidos</p><p className="text-2xl font-bold text-orange-700 mt-1">{pagarVencidas.length}</p></div>
              <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200"><p className="text-blue-600 text-xs font-medium">Docs Hoy</p><p className="text-2xl font-bold text-blue-700 mt-1">{docHoy.length}</p></div>
            </div>
            {totalAlertas === 0 && <div className="bg-white rounded-2xl p-12 shadow-sm text-center"><p className="text-lg font-medium text-emerald-600">Todo al dia</p><p className="text-sm mt-2 text-slate-400">No hay alertas pendientes</p></div>}
          </div>
        )}

        {seccion === 'clientes' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Clientes</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {clientesAgrupados.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p>No hay clientes aun.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Cliente</th><th className="pb-2">Pendiente</th><th className="pb-2">Ultima Factura</th><th className="pb-2">Estado</th><th className="pb-2"></th>
                  </tr></thead>
                  <tbody>
                    {clientesAgrupados.map(c => (
                      <tr key={c.nombre} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 font-medium">{c.nombre}</td>
                        <td className="py-3"><span className={`font-medium ${c.totalPendiente > 0 ? 'text-yellow-600' : 'text-green-600'}`}>${c.totalPendiente.toLocaleString()}</span></td>
                        <td className="py-3 text-slate-500">{c.ultimaFactura}</td>
                        <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${c.estadoCartera === 'Vencida' ? 'bg-red-100 text-red-700' : c.estadoCartera === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{c.estadoCartera}</span></td>
                        <td className="py-3"><button onClick={() => abrirCliente(c.nombre)} className="bg-slate-700 text-white text-xs px-3 py-1 rounded-lg">Ver detalle</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'proveedores' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Proveedores</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {proveedoresAgrupados.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p>No hay proveedores aun.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Proveedor</th><th className="pb-2">Pendiente</th><th className="pb-2">Ultimo Doc</th><th className="pb-2">Estado</th>
                  </tr></thead>
                  <tbody>
                    {proveedoresAgrupados.map(p => (
                      <tr key={p.nombre} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 font-medium">{p.nombre}</td>
                        <td className="py-3 text-orange-600 font-medium">${p.totalPendiente.toLocaleString()}</td>
                        <td className="py-3 text-slate-500">{p.ultimoDocumento}</td>
                        <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${p.totalPendiente > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{p.totalPendiente > 0 ? 'Activo' : 'Inactivo'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'configuracion' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Configuracion</h2>
            <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
              <p className="text-lg font-medium">Modulo en construccion</p>
            </div>
          </div>
        )}

      </main>

      {pagoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Registrar Pago</h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between"><span className="text-slate-500 text-sm">Cliente/Proveedor</span><span className="font-medium text-sm">{pagoModal.proveedor}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 text-sm">Valor</span><span className="font-bold text-emerald-600">${pagoModal.valor?.toLocaleString()}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPagoModal(null)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleRegistrarPago} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium">Confirmar pago</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function CalendarioTributario({ nit }: { nit: string }) {
  const ultimoDigito = nit ? parseInt(nit.replace(/\D/g, '').slice(-1)) : 0
  const hoy = new Date()
  const mes = hoy.getMonth()
  const anio = hoy.getFullYear()

  const vencimientos = [
    {
      impuesto: 'Retención en la fuente',
      descripcion: 'Declaración mensual',
      fecha: new Date(anio, mes + 1, 8 + ultimoDigito),
      color: 'bg-blue-50 border-blue-200 text-blue-700',
    },
    {
      impuesto: 'IVA Bimestral',
      descripcion: 'Si es responsable bimestral',
      fecha: new Date(anio, mes + 1, 10 + ultimoDigito),
      color: 'bg-purple-50 border-purple-200 text-purple-700',
    },
    {
      impuesto: 'ICA',
      descripcion: 'Impuesto de industria y comercio',
      fecha: new Date(anio, mes + 1, 12 + ultimoDigito),
      color: 'bg-orange-50 border-orange-200 text-orange-700',
    },
  ]

  const diasRestantes = (fecha: Date) => {
    const diff = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="space-y-3">
      {vencimientos.map((v, i) => {
        const dias = diasRestantes(v.fecha)
        return (
          <div key={i} className={`rounded-xl border px-4 py-3 ${v.color}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">{v.impuesto}</p>
                <p className="text-xs opacity-70 mt-0.5">{v.descripcion}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold">
                  {v.fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                </p>
                <p className="text-xs opacity-70">
                  {dias > 0 ? `${dias} días` : dias === 0 ? '¡Hoy!' : 'Vencido'}
                </p>
              </div>
            </div>
          </div>
        )
      })}
      <p className="text-xs text-slate-400 mt-2">
        * Fechas calculadas para NIT terminado en {ultimoDigito}
      </p>
    </div>
  )
}
 function GraficoIngresosGastos({ facturas }: { facturas: any[] }) {
  const [vista, setVista] = useState<'meses' | 'dias'>('meses')

  const datosMeses = Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date()
    fecha.setMonth(fecha.getMonth() - (5 - i))
    const mes = fecha.toLocaleString('es-CO', { month: 'short' })
    const mesNum = fecha.getMonth()
    const anio = fecha.getFullYear()
    const ingresos = facturas
      .filter(f => f.categoria === 'Factura de Venta' && new Date(f.fecha || f.created_at).getMonth() === mesNum && new Date(f.fecha || f.created_at).getFullYear() === anio)
      .reduce((s, f) => s + (f.valor || 0), 0)
    const gastos = facturas
      .filter(f => ['Factura de Compra', 'Gasto', 'Nomina'].includes(f.categoria) && new Date(f.fecha || f.created_at).getMonth() === mesNum && new Date(f.fecha || f.created_at).getFullYear() === anio)
      .reduce((s, f) => s + (f.valor || 0), 0)
    return { label: mes, ingresos, gastos }
  })

  const datosDias = Array.from({ length: 15 }, (_, i) => {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - (14 - i))
    const dia = fecha.getDate()
    const mesNum = fecha.getMonth()
    const anio = fecha.getFullYear()
    const ingresos = facturas
      .filter(f => f.categoria === 'Factura de Venta' && new Date(f.fecha || f.created_at).getDate() === dia && new Date(f.fecha || f.created_at).getMonth() === mesNum && new Date(f.fecha || f.created_at).getFullYear() === anio)
      .reduce((s, f) => s + (f.valor || 0), 0)
    const gastos = facturas
      .filter(f => ['Factura de Compra', 'Gasto', 'Nomina'].includes(f.categoria) && new Date(f.fecha || f.created_at).getDate() === dia && new Date(f.fecha || f.created_at).getMonth() === mesNum && new Date(f.fecha || f.created_at).getFullYear() === anio)
      .reduce((s, f) => s + (f.valor || 0), 0)
    return { label: String(dia), ingresos, gastos }
  })

  const datos = vista === 'meses' ? datosMeses : datosDias

  const formatTooltip = (value: any, name: any): [string, string] => {
  return ['$' + Number(value).toLocaleString('es-CO'), name === 'ingresos' ? 'Ingresos' : 'Gastos']
}

  return (
    <div>
      <div className="flex justify-end mb-3 gap-2">
        <button onClick={() => setVista('meses')}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${vista === 'meses' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          Meses
        </button>
        <button onClick={() => setVista('dias')}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${vista === 'dias' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          Días
        </button>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={datos} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v}/>
          <Tooltip formatter={formatTooltip} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} labelStyle={{ fontWeight: 600, color: '#1e293b' }}/>
          <Area type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2.5} fill="url(#gradIngresos)" dot={false} activeDot={{ r: 4, fill: '#10b981' }}/>
          <Area type="monotone" dataKey="gastos" stroke="#f87171" strokeWidth={2.5} fill="url(#gradGastos)" dot={false} activeDot={{ r: 4, fill: '#f87171' }}/>
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded-full"/>Ingresos</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-red-400 inline-block rounded-full"/>Gastos</span>
      </div>
    </div>
  )
}