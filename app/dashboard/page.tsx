'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])

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
    setMensaje('🤖 La IA está leyendo tu factura...')
    setDatosFact(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.success) {
        setDatosFact(data.datos)
        setMensaje('✅ Factura leída correctamente')
      } else {
        setMensaje('❌ Error leyendo la factura: ' + data.error)
      }
    } catch {
      setMensaje('❌ Error procesando el archivo')
    }
    setLoading(false)
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
    })
    if (error) {
      setMensaje('❌ Error guardando: ' + error.message)
    } else {
      setMensaje('✅ Factura guardada correctamente')
      setDatosFact(null)
      cargarFacturas(user.id)
    }
    setGuardando(false)
  }

  const totalIngresos = facturas.filter(f => f.tipo === 'Factura de Venta').reduce((a, b) => a + (b.valor || 0), 0)
  const totalGastos = facturas.filter(f => f.tipo === 'Factura de Compra').reduce((a, b) => a + (b.valor || 0), 0)

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <h1 className="text-xl font-bold">ContaBot</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm">{user.email}</span>
          <button onClick={handleLogout} className="bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm">
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-emerald-500">
            <p className="text-slate-500 text-sm">Ingresos del mes</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">${totalIngresos.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-red-500">
            <p className="text-slate-500 text-sm">Gastos del mes</p>
            <p className="text-2xl font-bold text-red-600 mt-1">${totalGastos.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-yellow-500">
            <p className="text-slate-500 text-sm">Docs pendientes</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{facturas.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
            <p className="text-slate-500 text-sm">Caja disponible</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">${(totalIngresos - totalGastos).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">📄 Subir Factura</h2>
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-4xl mb-3">📁</p>
            <p className="text-slate-600 mb-2">Selecciona tu factura — La IA leerá los datos automáticamente</p>
            <p className="text-slate-400 text-sm mb-4">JPG, PNG, PDF — máximo 5MB</p>
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
              <h3 className="font-semibold text-emerald-800 mb-3">📋 Datos extraídos por IA:</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-500">Proveedor</p><p className="font-medium">{datosFact.proveedor}</p></div>
                <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium">{datosFact.fecha}</p></div>
                <div><p className="text-xs text-slate-500">Valor</p><p className="font-medium text-emerald-700">${datosFact.valor?.toLocaleString()}</p></div>
                <div><p className="text-xs text-slate-500">IVA</p><p className="font-medium">${datosFact.iva?.toLocaleString()}</p></div>
                <div className="col-span-2"><p className="text-xs text-slate-500">Descripción</p><p className="font-medium">{datosFact.descripcion}</p></div>
                <div><p className="text-xs text-slate-500">Tipo</p><p className="font-medium">{datosFact.tipo}</p></div>
              </div>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white py-2 rounded-xl font-medium">
                {guardando ? 'Guardando...' : '💾 Guardar en ContaBot'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">📋 Documentos recientes</h2>
          {facturas.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-4xl mb-3">📭</p>
              <p>No hay documentos aún. Sube tu primera factura.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Valor</th>
                  <th className="pb-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium">{f.proveedor}</td>
                    <td className="py-3 text-slate-500">{f.fecha}</td>
                    <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${f.tipo === 'Factura de Venta' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {f.tipo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  )
}
