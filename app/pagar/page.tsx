'use client'
import { useEffect, useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const estadoConfig: Record<string, string> = {
  'Pendiente': 'bg-yellow-100 text-yellow-700',
  'Pagado': 'bg-green-100 text-green-700',
  'Vencido': 'bg-red-100 text-red-700',
}

const categoriaConfig: Record<string, string> = {
  'Factura de Compra': 'bg-blue-100 text-blue-700',
  'Gasto': 'bg-orange-100 text-orange-700',
}

export default function PagarPage() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [pagoModal, setPagoModal] = useState<any>(null)
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

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

  const handleRegistrarPago = async () => {
    if (!pagoModal) return
    await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', pagoModal.id)
    setPagoModal(null)
    cargarFacturas()
  }

  const facturasPagar = facturas.filter(f => {
    if (!['Factura de Compra', 'Gasto'].includes(f.categoria)) return false
    if (filtroProveedor && !f.proveedor?.toLowerCase().includes(filtroProveedor.toLowerCase())) return false
    if (filtroEstado && f.estado !== filtroEstado) return false
    return true
  })

  const total = facturasPagar.filter(f => f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Pagar</h2>
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-orange-400">
          <p className="text-slate-500 text-sm">Total pendiente por pagar</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">${Math.round(total).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Buscar proveedor..." value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm" />
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">
              <option value="">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Pagado">Pagado</option>
              <option value="Vencido">Vencido</option>
            </select>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {facturasPagar.length === 0 ? (
            <p className="text-center py-10 text-slate-400">No hay facturas de compra o gastos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Proveedor</th><th className="pb-2">Valor</th>
                <th className="pb-2">Categoria</th><th className="pb-2">Estado</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>{facturasPagar.map(f => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-3 font-medium">{f.proveedor}</td>
                  <td className="py-3 text-orange-600 font-medium">${Math.round(f.valor||0).toLocaleString()}</td>
                  <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]||'bg-gray-100 text-gray-700'}`}>{f.categoria}</span></td>
                  <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado||'Pendiente']}`}>{f.estado||'Pendiente'}</span></td>
                  <td className="py-3">{f.estado !== 'Pagado' && <button onClick={() => setPagoModal(f)} className="bg-orange-500 text-white text-xs px-3 py-1 rounded-lg">Registrar pago</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>
      {pagoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Registrar Pago</h3>
            <p className="mb-6 text-slate-600">Proveedor: <strong>{pagoModal.proveedor}</strong></p>
            <div className="flex gap-3">
              <button onClick={() => setPagoModal(null)} className="flex-1 px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={handleRegistrarPago} className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



