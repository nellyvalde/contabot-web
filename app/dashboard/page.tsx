'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

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
        setMensaje('❌ Error leyendo la factura')
      }
    } catch {
      setMensaje('❌ Error procesando el archivo')
    }
    setLoading(false)
  }

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
        {/* Tarjetas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-emerald-500">
            <p className="text-slate-500 text-sm">Ingresos del mes</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">$0</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-red-500">
            <p className="text-slate-500 text-sm">Gastos del mes</p>
            <p className="text-2xl font-bold text-red-600 mt-1">$0</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-yellow-500">
            <p className="text-slate-500 text-sm">Docs pendientes</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">0</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
            <p className="text-slate-500 text-sm">Caja disponible</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">$0</p>
          </div>
        </div>

        {/* Subir factura */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">📄 Subir Factura</h2>
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-4xl mb-3">📁</p>
            <p className="text-slate-600 mb-2">Selecciona tu factura — La IA leerá los datos automáticamente</p>
            <p className="text-slate-400 text-sm mb-4">JPG, PNG — máximo 5MB</p>
            <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl transition-colors">
              {loading ? 'Procesando...' : 'Seleccionar archivo'}
              <input type="file" accept="image/*" onChange={handleArchivo} className="hidden" disabled={loading} />
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
              <button className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl font-medium">
                💾 Guardar en ContaBot
              </button>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">📋 Documentos recientes</h2>
          <div className="text-center py-10 text-slate-400">
            <p className="text-4xl mb-3">📭</p>
            <p>No hay documentos aún. Sube tu primera factura.</p>
          </div>
        </div>
      </div>
    </main>
  )
}