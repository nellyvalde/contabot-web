'use client'
import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/context/EmpresaContext'

type Documento = {
  id: string
  tipo: string
  numero_documento: string | null
  proveedor_cliente: string | null
  descripcion: string | null
  valor: number | null
  iva: number | null
  fecha_emision: string | null
  estado: string | null
  estado_conciliacion: string
  cuenta_puc: string | null
  archivo_url: string | null
}

export default function ComprasPage() {
  const { user, handleLogout } = useUser()
  const { empresaActiva } = useEmpresa()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [cargando, setCargando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  useEffect(() => {
    if (empresaActiva?.id) cargarDocumentos()
  }, [empresaActiva?.id])

  async function cargarDocumentos() {
    if (!empresaActiva?.id) return
    setCargando(true)
    const { data } = await supabase
      .from('documentos')
      .select('id, tipo, numero_documento, proveedor_cliente, descripcion, valor, iva, fecha_emision, estado, estado_conciliacion, cuenta_puc, archivo_url')
      .eq('empresa_id', empresaActiva.id)
      .in('tipo', ['factura_compra', 'comprobante_egreso', 'soporte_nomina', 'otro'])
      .order('fecha_emision', { ascending: false })
    if (data) setDocumentos(data)
    setCargando(false)
  }

  const filtrados = useMemo(() => {
    let lista = documentos
    if (buscar) lista = lista.filter(d =>
      d.proveedor_cliente?.toLowerCase().includes(buscar.toLowerCase()) ||
      d.numero_documento?.toLowerCase().includes(buscar.toLowerCase())
    )
    if (filtroEstado !== 'todos') lista = lista.filter(d => d.estado_conciliacion === filtroEstado)
    return lista
  }, [documentos, buscar, filtroEstado])

  const totalGastado = documentos.reduce((s, d) => s + Number(d.valor ?? 0), 0)
  const totalPendiente = documentos.filter(d => d.estado_conciliacion === 'pendiente').reduce((s, d) => s + Number(d.valor ?? 0), 0)

  const ETIQUETAS: Record<string, string> = {
    factura_compra: 'Factura de compra',
    comprobante_egreso: 'Comprobante de egreso',
    soporte_nomina: 'Soporte nómina',
    otro: 'Otro',
  }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Registros</p>
                <h1 className="text-2xl font-semibold text-slate-900">Compras y Gastos</h1>
                <p className="text-xs text-slate-400 mt-1">{empresaActiva?.razon_social}</p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Total gastos</p>
                  <p className="text-xl font-bold text-red-600">${totalGastado.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Por pagar</p>
                  <p className="text-xl font-bold text-amber-700">${totalPendiente.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="text-base font-semibold text-slate-900">Historial de Compras y Gastos</h2>
              <div className="flex gap-2">
                <input value={buscar} onChange={e => setBuscar(e.target.value)}
                  placeholder="Buscar proveedor o N° documento..."
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-64" />
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="conciliado">Conciliado</option>
                </select>
              </div>
            </div>

            {cargando ? (
              <div className="flex items-center gap-2 p-8 text-slate-400 text-sm">
                <span className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full" />
                Cargando...
              </div>
            ) : filtrados.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-500 font-medium">Sin compras ni gastos registrados</p>
                <p className="text-slate-400 text-sm mt-1">Sube documentos desde el Buzón IA.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Tipo','Nº Documento','Proveedor','Fecha','Valor','IVA','Cuenta PUC','Estado','PDF'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtrados.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5 text-slate-600 text-xs">{ETIQUETAS[doc.tipo] ?? doc.tipo}</td>
                        <td className="px-4 py-3.5 text-slate-600 font-mono text-xs">{doc.numero_documento ?? '—'}</td>
                        <td className="px-4 py-3.5 font-medium text-slate-800">{doc.proveedor_cliente ?? '—'}</td>
                        <td className="px-4 py-3.5 text-slate-500">{doc.fecha_emision ?? '—'}</td>
                        <td className="px-4 py-3.5 font-semibold text-red-600">${Number(doc.valor ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-slate-500">${Number(doc.iva ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{doc.cuenta_puc ?? '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                            doc.estado_conciliacion === 'conciliado' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${doc.estado_conciliacion === 'conciliado' ? 'bg-emerald-500' : 'bg-amber-400'}`}/>
                            {doc.estado_conciliacion}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {doc.archivo_url ? (
                            <a href={doc.archivo_url} target="_blank" rel="noopener noreferrer"
                              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                              📄 Ver
                            </a>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}