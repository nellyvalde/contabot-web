'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

function diasParaVencer(fechaVencimiento: string | null) {
  if (!fechaVencimiento) return null
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  return Math.floor((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function diasVencido(fecha: string | null) {
  if (!fecha) return 0
  const hoy = new Date()
  const f = new Date(fecha)
  return Math.floor((hoy.getTime() - f.getTime()) / (1000 * 60 * 60 * 24))
}

export default function AlertasPage() {
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

  const hoy = new Date()
  const cobrarVencidas = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Vencido')
  const cobrarProximas = facturas.filter(f => {
    if (f.categoria !== 'Factura de Venta' || f.estado === 'Pagado') return false
    const dias = diasParaVencer(f.fecha_vencimiento)
    return dias !== null && dias >= 0 && dias <= 7
  })
  const pagarVencidas = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Vencido')
  const docHoy = facturas.filter(f => new Date(f.created_at).toDateString() === hoy.toDateString())
  const totalAlertas = cobrarVencidas.length + cobrarProximas.length + pagarVencidas.length

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} alertCount={totalAlertas} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Centro de Alertas</h2>
        <p className="text-slate-500 text-sm mb-6">Seguimiento automatico generado por ContaBot</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-red-50 rounded-2xl p-5 border border-red-200"><p className="text-red-600 text-xs font-medium">Cobros Vencidos</p><p className="text-2xl font-bold text-red-700 mt-1">{cobrarVencidas.length}</p></div>
          <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-200"><p className="text-yellow-600 text-xs font-medium">Cobros Proximos</p><p className="text-2xl font-bold text-yellow-700 mt-1">{cobrarProximas.length}</p></div>
          <div className="bg-orange-50 rounded-2xl p-5 border border-orange-200"><p className="text-orange-600 text-xs font-medium">Pagos Vencidos</p><p className="text-2xl font-bold text-orange-700 mt-1">{pagarVencidas.length}</p></div>
          <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200"><p className="text-blue-600 text-xs font-medium">Docs Hoy</p><p className="text-2xl font-bold text-blue-700 mt-1">{docHoy.length}</p></div>
        </div>
        {totalAlertas === 0 && (
          <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
            <p className="text-5xl mb-4">✅</p>
            <p className="text-lg font-medium text-emerald-600">Todo al dia</p>
            <p className="text-sm mt-2">No hay alertas pendientes</p>
          </div>
        )}
        {cobrarVencidas.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-red-500">
            <h3 className="text-lg font-semibold text-red-700 mb-4">Facturas de Venta Vencidas</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="pb-2">Cliente</th><th className="pb-2">Valor</th><th className="pb-2">Dias Vencido</th></tr></thead>
              <tbody>{cobrarVencidas.map(f => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{f.proveedor}</td>
                  <td className="py-3 text-red-600">${Math.round(f.valor||0).toLocaleString()}</td>
                  <td className="py-3"><span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">{diasVencido(f.fecha_vencimiento||f.fecha)} dias</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {pagarVencidas.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-orange-500">
            <h3 className="text-lg font-semibold text-orange-700 mb-4">Pagos Vencidos</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="pb-2">Proveedor</th><th className="pb-2">Valor</th><th className="pb-2">Dias Vencido</th></tr></thead>
              <tbody>{pagarVencidas.map(f => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{f.proveedor}</td>
                  <td className="py-3 text-orange-600">${Math.round(f.valor||0).toLocaleString()}</td>
                  <td className="py-3"><span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">{diasVencido(f.fecha_vencimiento||f.fecha)} dias</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}