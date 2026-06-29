'use client'
import { useEffect, useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function ProveedoresPage() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    if (empresaActiva?.id) cargarFacturas()
  }, [empresaActiva?.id])

  const cargarFacturas = async () => {
    if (!empresaActiva?.id) return
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('empresa_id', empresaActiva.id)
      .order('fecha', { ascending: false })
    if (data) setFacturas(data)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const proveedoresAgrupados = Object.values(
    facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria)).reduce((acc: any, f) => {
      const nombre = f.proveedor || 'Sin nombre'
      if (!acc[nombre]) acc[nombre] = { nombre, totalComprado: 0, totalPendiente: 0, cantidadDocumentos: 0, ultimoDocumento: f.fecha }
      acc[nombre].cantidadDocumentos++
      acc[nombre].totalComprado += f.valor || 0
      if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
      if (f.fecha > acc[nombre].ultimoDocumento) acc[nombre].ultimoDocumento = f.fecha
      return acc
    }, {})
  ) as any[]

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Proveedores</h2>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {proveedoresAgrupados.length === 0 ? (
            <div className="text-center py-10 text-slate-400"><p>No hay proveedores aún. Sube facturas de compra o gastos para verlos aquí.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Proveedor</th>
                <th className="pb-2">Documentos</th>
                <th className="pb-2">Total Comprado</th>
                <th className="pb-2">Pendiente por Pagar</th>
                <th className="pb-2">Ultimo Doc</th>
                <th className="pb-2">Estado</th>
              </tr></thead>
              <tbody>
                {proveedoresAgrupados.map((p) => (
                  <tr key={p.nombre} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium">{p.nombre}</td>
                    <td className="py-3 text-slate-500">{p.cantidadDocumentos}</td>
                    <td className="py-3 text-slate-700">${Math.round(p.totalComprado).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`font-medium ${p.totalPendiente > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        ${Math.round(p.totalPendiente).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{p.ultimoDocumento}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.totalPendiente > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.totalPendiente > 0 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}