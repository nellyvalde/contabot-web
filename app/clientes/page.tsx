'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function ClientesPage() {
  const [user, setUser] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else { setUser(data.user); cargarFacturas(data.user.id) }
    })
  }, [])

  const cargarFacturas = async (userId: string) => {
    const { data } = await supabase.from('facturas').select('*').eq('user_id', userId)
    if (data) setFacturas(data)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const clientesAgrupados = Object.values(
    facturas.filter(f => f.categoria === 'Factura de Venta').reduce((acc: any, f) => {
      const nombre = f.proveedor || 'Sin nombre'
      if (!acc[nombre]) acc[nombre] = { nombre, totalFacturado: 0, totalPendiente: 0, cantidadFacturas: 0, ultimaFactura: f.fecha }
      acc[nombre].cantidadFacturas++
      acc[nombre].totalFacturado += f.valor || 0
      if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
      if (f.fecha > acc[nombre].ultimaFactura) acc[nombre].ultimaFactura = f.fecha
      return acc
    }, {})
  ) as any[]

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Clientes</h2>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {clientesAgrupados.length === 0 ? (
            <div className="text-center py-10 text-slate-400"><p>No hay clientes aun. Sube facturas de venta para verlos aqui.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Facturas</th>
                <th className="pb-2">Total Facturado</th>
                <th className="pb-2">Pendiente por Cobrar</th>
                <th className="pb-2">Ultima Factura</th>
                <th className="pb-2">Estado</th>
              </tr></thead>
              <tbody>
                {clientesAgrupados.map((c) => (
                  <tr key={c.nombre} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium">{c.nombre}</td>
                    <td className="py-3 text-slate-500">{c.cantidadFacturas}</td>
                    <td className="py-3 text-slate-700">${Math.round(c.totalFacturado).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`font-medium ${c.totalPendiente > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                        ${Math.round(c.totalPendiente).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{c.ultimaFactura}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.totalPendiente > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {c.totalPendiente > 0 ? 'Pendiente' : 'Al dia'}
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