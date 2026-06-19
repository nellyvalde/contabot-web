'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminPanel() {
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [empresas, setEmpresas] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nueva, setNueva] = useState({
    nombre: '', nit: '', correo: '', telefono: '', ciudad: '', password: ''
  })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/'; return }
      setUser(data.user)
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', data.user.id)
        .single()
      if (!admin) { window.location.href = '/dashboard'; return }
      setIsAdmin(true)
      cargarEmpresas()
      setLoading(false)
    })
  }, [])

  const cargarEmpresas = async () => {
    const { data } = await supabase
      .from('empresas')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setEmpresas(data)
  }

  const crearEmpresa = async () => {
    if (!nueva.nombre || !nueva.correo || !nueva.password) {
      setMensaje('Nombre, correo y contrasena son obligatorios')
      return
    }
    setMensaje('Creando empresa...')
    const res = await fetch('/api/crear-empresa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nueva)
    })
    const data = await res.json()
    if (data.success) {
      setMensaje('Empresa creada correctamente')
      setNueva({ nombre: '', nit: '', correo: '', telefono: '', ciudad: '', password: '' })
      setMostrarForm(false)
      cargarEmpresas()
    } else {
      setMensaje('Error: ' + data.error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-sm">📊</div>
          <div>
            <h1 className="font-bold text-white">ContaBot</h1>
            <p className="text-slate-400 text-xs">Panel de Administrador</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm">{user?.email}</span>
          <a href="/dashboard" className="bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm">
            Mi Dashboard
          </a>
          <button onClick={handleLogout} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm">
            Cerrar sesion
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Empresas Registradas</h2>
            <p className="text-slate-500 text-sm mt-1">{empresas.length} empresas en la plataforma</p>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-medium">
            + Nueva Empresa
          </button>
        </div>

        {mensaje && (
          <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-slate-700 text-sm">{mensaje}</p>
          </div>
        )}

        {mostrarForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border border-emerald-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Crear Nueva Empresa</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nombre de la Empresa *</label>
                <input type="text" value={nueva.nombre} onChange={(e) => setNueva({...nueva, nombre: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Empresa SAS" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">NIT</label>
                <input type="text" value={nueva.nit} onChange={(e) => setNueva({...nueva, nit: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="900123456-1" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Correo (usuario de acceso) *</label>
                <input type="email" value={nueva.correo} onChange={(e) => setNueva({...nueva, correo: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="empresa@correo.com" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Contrasena *</label>
                <input type="password" value={nueva.password} onChange={(e) => setNueva({...nueva, password: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Minimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Telefono</label>
                <input type="text" value={nueva.telefono} onChange={(e) => setNueva({...nueva, telefono: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="3001234567" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ciudad</label>
                <input type="text" value={nueva.ciudad} onChange={(e) => setNueva({...nueva, ciudad: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Bogota" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setMostrarForm(false)}
                className="px-6 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={crearEmpresa}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium">
                Crear Empresa
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm">
          {empresas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🏢</p>
              <p className="font-medium">No hay empresas registradas</p>
              <p className="text-sm mt-1">Crea la primera empresa con el boton de arriba</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-4">Empresa</th>
                  <th className="p-4">NIT</th>
                  <th className="p-4">Correo</th>
                  <th className="p-4">Ciudad</th>
                  <th className="p-4">Fecha Registro</th>
                  <th className="p-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-4 font-medium">{e.nombre}</td>
                    <td className="p-4 text-slate-500">{e.nit || '-'}</td>
                    <td className="p-4 text-slate-500">{e.correo || '-'}</td>
                    <td className="p-4 text-slate-500">{e.ciudad || '-'}</td>
                    <td className="p-4 text-slate-500">{e.created_at?.slice(0, 10)}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Activa
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

