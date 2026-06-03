'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

const menuItems = [
  { id: 'dashboard',    icon: '📊', label: 'Dashboard' },
  { id: 'documentos',   icon: '📄', label: 'Documentos' },
  { id: 'cobrar',       icon: '💰', label: 'Cuentas por Cobrar' },
  { id: 'pagar',        icon: '💳', label: 'Cuentas por Pagar' },
  { id: 'revision',     icon: '🤖', label: 'Revision IA' },
  { id: 'clientes',     icon: '👥', label: 'Clientes' },
  { id: 'proveedores',  icon: '🏭', label: 'Proveedores' },
  { id: 'reportes',     icon: '📈', label: 'Reportes' },
  { id: 'configuracion',icon: '⚙️', label: 'Configuracion' },
]

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [seccion, setSeccion] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else {
        setUser(data.user)
        cargarFacturas(data.user.id)
      }
    })
  }, [])

  const cargarFacturas = async (userId: string) => {
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setFacturas(data)
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
    cargarFacturas(user.id)
  }

  const handleEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from('facturas').update({ estado: nuevoEstado }).eq('id', id)
    cargarFacturas(user.id)
  }

  const handleGuardar = async () => {
    if (!datosFact || !user) return
    setGuardando(true)
    const { error } = await supabase.from('facturas').insert({
      user_id: user.id,
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
      cargarFacturas(user.id)
    }
    setGuardando(false)
  }

  const totalIngresos = facturas.filter(f => f.categoria === 'Factura de Venta').reduce((a, b) => a + (b.valor || 0), 0)
  const totalGastos = facturas.filter(f => ['Factura de Compra', 'Gasto', 'Nomina'].includes(f.categoria)).reduce((a, b) => a + (b.valor || 0), 0)
  const cuentasPorCobrar = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)
  const cuentasPorPagar = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Menu lateral */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-sm">📊</div>
            <div>
              <h1 className="font-bold text-white text-sm">ContaBot</h1>
              <p className="text-slate-400 text-xs">Auxiliar Contable IA</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSeccion(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                seccion === item.id
                  ? 'bg-emerald-500 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-xs">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors">
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 ml-64 p-8">

        {/* DASHBOARD */}
        {seccion === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-emerald-500">
                <p className="text-slate-500 text-sm">Ingresos del mes</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">${totalIngresos.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-red-500">
                <p className="text-slate-500 text-sm">Gastos del mes</p>
                <p className="text-2xl font-bold text-red-600 mt-1">${totalGastos.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
                <p className="text-slate-500 text-sm">Caja disponible</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">${(totalIngresos - totalGastos).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-yellow-500">
                <p className="text-slate-500 text-sm">Documentos</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">{facturas.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-green-400">
                <p className="text-slate-500 text-sm">Cuentas por Cobrar</p>
                <p className="text-xs text-slate-400 mb-1">Facturas de Venta pendientes</p>
                <p className="text-2xl font-bold text-green-600 mt-1">${cuentasPorCobrar.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-orange-400">
                <p className="text-slate-500 text-sm">Cuentas por Pagar</p>
                <p className="text-xs text-slate-400 mb-1">Compras y Gastos pendientes</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">${cuentasPorPagar.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENTOS */}
        {(seccion === 'documentos' || seccion === 'revision') && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">
              {seccion === 'revision' ? 'Revision IA' : 'Documentos'}
            </h2>

            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Subir Documento</h3>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                <p className="text-4xl mb-3">📁</p>
                <p className="text-slate-600 mb-2">Selecciona tu documento - La IA lo leera y clasificara automaticamente</p>
                <p className="text-slate-400 text-sm mb-4">JPG, PNG, PDF - maximo 5MB</p>
                <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl transition-colors">
                  {loading ? 'Procesando...' : 'Seleccionar archivo'}
                  <input type="file" accept="image/*,application/pdf" onChange={handleArchivo} className="hidden" disabled={loading} />
                </label>
              </div>

              {mensaje && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <p className="text-slate-700">{mensaje}</p>
                </div>
              )}

              {datosFact && (
                <div className="mt-4 p-6 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-emerald-800">Datos extraidos por IA:</h3>
                    {datosFact.categoria && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${categoriaConfig[datosFact.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {datosFact.categoria}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-slate-500">Cliente/Proveedor</p><p className="font-medium">{datosFact.proveedor}</p></div>
                    <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium">{datosFact.fecha}</p></div>
                    <div><p className="text-xs text-slate-500">Valor</p><p className="font-medium text-emerald-700">${datosFact.valor?.toLocaleString()}</p></div>
                    <div><p className="text-xs text-slate-500">IVA</p><p className="font-medium">${datosFact.iva?.toLocaleString()}</p></div>
                    <div className="col-span-2"><p className="text-xs text-slate-500">Descripcion</p><p className="font-medium">{datosFact.descripcion}</p></div>
                    <div><p className="text-xs text-slate-500">Tipo</p><p className="font-medium">{datosFact.tipo}</p></div>
                  </div>
                  <button onClick={handleGuardar} disabled={guardando}
                    className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white py-2 rounded-xl font-medium">
                    {guardando ? 'Guardando...' : 'Guardar en ContaBot'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Documentos recientes</h3>
              {facturas.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-4xl mb-3">📭</p>
                  <p>No hay documentos aun.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Cliente/Proveedor</th>
                      <th className="pb-2">Fecha</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2">Estado</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3 text-slate-500">{f.fecha}</td>
                        <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                            {f.categoria || f.tipo}
                          </span>
                        </td>
                        <td className="py-3">
                          <select
                            value={f.estado || 'Pendiente'}
                            onChange={(e) => handleEstado(f.id, e.target.value)}
                            className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${estadoConfig[f.estado || 'Pendiente']?.color}`}
                          >
                            <option value="Pendiente">Pendiente</option>
                            <option value="Pagado">Pagado</option>
                            <option value="Vencido">Vencido</option>
                          </select>
                        </td>
                        <td className="py-3">
                          <button onClick={() => handleEliminar(f.id)} className="text-red-400 hover:text-red-600 text-xs">
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* CUENTAS POR COBRAR */}
        {seccion === 'cobrar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Cobrar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-green-400">
              <p className="text-slate-500 text-sm">Total pendiente por cobrar</p>
              <p className="text-3xl font-bold text-green-600 mt-1">${cuentasPorCobrar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Cliente</th>
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Valor</th>
                    <th className="pb-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Pendiente').map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-3 font-medium">{f.proveedor}</td>
                      <td className="py-3 text-slate-500">{f.fecha}</td>
                      <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                      <td className="py-3">
                        <select
                          value={f.estado || 'Pendiente'}
                          onChange={(e) => handleEstado(f.id, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${estadoConfig[f.estado || 'Pendiente']?.color}`}
                        >
                          <option value="Pendiente">Pendiente</option>
                          <option value="Pagado">Pagado</option>
                          <option value="Vencido">Vencido</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CUENTAS POR PAGAR */}
        {seccion === 'pagar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Pagar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-orange-400">
              <p className="text-slate-500 text-sm">Total pendiente por pagar</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">${cuentasPorPagar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="pb-2">Proveedor</th>
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Valor</th>
                    <th className="pb-2">Categoria</th>
                    <th className="pb-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Pendiente').map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-3 font-medium">{f.proveedor}</td>
                      <td className="py-3 text-slate-500">{f.fecha}</td>
                      <td className="py-3 text-orange-600 font-medium">${f.valor?.toLocaleString()}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                          {f.categoria}
                        </span>
                      </td>
                      <td className="py-3">
                        <select
                          value={f.estado || 'Pendiente'}
                          onChange={(e) => handleEstado(f.id, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${estadoConfig[f.estado || 'Pendiente']?.color}`}
                        >
                          <option value="Pendiente">Pendiente</option>
                          <option value="Pagado">Pagado</option>
                          <option value="Vencido">Vencido</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PROXIMAS SECCIONES */}
        {['clientes', 'proveedores', 'reportes', 'configuracion'].includes(seccion) && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6 capitalize">{seccion}</h2>
            <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
              <p className="text-5xl mb-4">🚧</p>
              <p className="text-lg font-medium">Modulo en construccion</p>
              <p className="text-sm mt-2">Esta seccion estara disponible proximamente</p>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
