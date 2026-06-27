'use client'
// app/documentos/page.tsx
//
// Registro y conciliaciÃ³n de documentos soporte (facturas, comprobantes).
// Esta versiÃ³n permite registrar el documento y su metadato contable
// (tipo, valor, cuenta PUC) manualmente. La carga del archivo fÃ­sico a
// Supabase Storage y la extracciÃ³n automÃ¡tica por OCR quedan marcadas
// como siguiente paso (ver comentarios "TODO") para no fingir una
// integraciÃ³n que aÃºn no existe.

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'

type TipoDocumento = 'factura_venta' | 'factura_compra' | 'soporte_nomina' | 'comprobante_egreso' | 'otro'
type EstadoConciliacion = 'pendiente' | 'conciliado' | 'rechazado'

type Documento = {
  id: string
  tipo: TipoDocumento
  proveedor_cliente: string | null
  fecha: string | null
  valor: number | null
  cuenta_puc: string | null
  estado: EstadoConciliacion
}

const ETIQUETAS_TIPO: Record<TipoDocumento, string> = {
  factura_venta: 'Factura de venta',
  factura_compra: 'Factura de compra',
  soporte_nomina: 'Soporte de nÃ³mina',
  comprobante_egreso: 'Comprobante de egreso',
  otro: 'Otro',
}

export default function DocumentosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <DocumentosContenido />
    </Suspense>
  )
}

function DocumentosContenido() {
  const { user, handleLogout } = useUser()
  const { empresaActiva } = useEmpresa()

  const empresaId = empresaActiva?.id ?? null
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<EstadoConciliacion | 'todos'>('todos')

  const [tipo, setTipo] = useState<TipoDocumento>('factura_compra')
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [valor, setValor] = useState('')
  const [cuentaPuc, setCuentaPuc] = useState('')

  useEffect(() => { if (empresaActiva?.id) cargarDocumentos() }, [empresaActiva?.id])

  async function cargarDocumentos() {
    setCargando(true)
    setError(null)

    const { data: empresa, error: errEmpresa } = await supabase
      .from('contabot_empresas')
      .select('id')
      .limit(1)
      .single()

    if (errEmpresa || !empresa) {
      setError('No se encontrÃ³ ninguna empresa registrada en Supabase.')
      setCargando(false)
      return
    }

    const { data, error: errDocs } = await supabase
      .from('documentos')
      .select('id, tipo, proveedor_cliente, fecha_emision, valor, cuenta_puc, estado_conciliacion')
      .eq('empresa_id', empresa.id)
      .order('fecha_emision', { ascending: false })

    if (errDocs) {
      setError(`Error cargando documentos: ${errDocs.message}`)
    } else {
      setDocumentos(data ?? [])
    }

    setCargando(false)
  }

  const documentosFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return documentos
    return documentos.filter((d) => d.estado_conciliacion === filtroEstado)
  }, [documentos, filtroEstado])

  const totales = useMemo(() => {
    const pendientes = documentos.filter((d) => d.estado_conciliacion === 'pendiente')
    const conciliados = documentos.filter((d) => d.estado_conciliacion === 'conciliado')
    return {
      pendientes: pendientes.length,
      conciliados: conciliados.length,
      valorPendiente: pendientes.reduce((sum, d) => sum + Number(d.valor ?? 0), 0),
    }
  }, [documentos])

  async function registrarDocumento() {
    if (!empresaId || !numero.trim() || !valor.trim()) return

    // TODO: aquÃ­ se debe subir el archivo real a Supabase Storage y guardar
    // su URL en `archivo_url`, y opcionalmente enviarlo a un servicio de
    // OCR/parseo para llenar `texto_extraido` automÃ¡ticamente.
    const { data, error: errInsert } = await supabase
      .from('documentos')
      .insert({
        empresa_id: empresaId,
        tipo,
        proveedor_cliente: numero.trim(),
        fecha_emision: fecha || null,
        valor: Number(valor),
        cuenta_puc: cuentaPuc.trim() || null,
        estado_conciliacion: 'pendiente',
      })
      .select()
      .single()

    if (errInsert) {
      setError(`No se pudo registrar el documento: ${errInsert.message}`)
      return
    }

    setDocumentos((prev) => [data as Documento, ...prev])
    setNumero('')
    setFecha('')
    setValor('')
    setCuentaPuc('')
  }

  async function cambiarEstado(id: string, nuevoEstado: EstadoConciliacion) {
    const { error: errUpdate } = await supabase
      .from('documentos')
      .update({ estado_conciliacion: nuevoEstado })
      .eq('id', id)

    if (errUpdate) {
      setError(`No se pudo actualizar el estado: ${errUpdate.message}`)
      return
    }

    setDocumentos((prev) =>
      prev.map((d) => (d.id === id ? { ...d, estado_conciliacion: nuevoEstado } : d))
    )
  }

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <section className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-500">ConciliaciÃ³n contable</p>
                <h1 className="text-3xl font-semibold text-slate-900">Documentos soporte</h1>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-3xl bg-yellow-50 p-5">
                  <p className="text-sm text-slate-500">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-700">{totales.pendientes}</p>
                </div>
                <div className="rounded-3xl bg-emerald-50 p-5">
                  <p className="text-sm text-slate-500">Conciliados</p>
                  <p className="text-2xl font-bold text-emerald-700">{totales.conciliados}</p>
                </div>
                <div className="rounded-3xl bg-red-50 p-5">
                  <p className="text-sm text-slate-500">Valor pendiente</p>
                  <p className="text-2xl font-bold text-red-700">${totales.valorPendiente.toLocaleString()}</p>
                </div>
              </div>
            </div>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Documentos registrados</h2>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as EstadoConciliacion | 'todos')}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="conciliado">Conciliados</option>
                  <option value="rechazado">Rechazados</option>
                </select>
              </div>

              {cargando ? (
                <p className="text-slate-500">Cargando documentos...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">NÂ° documento</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta PUC</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">AcciÃ³n</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {documentosFiltrados.map((doc) => (
                        <tr key={doc.id}>
                          <td className="px-4 py-4 text-slate-700">{ETIQUETAS_TIPO[doc.tipo]}</td>
                          <td className="px-4 py-4 text-slate-700">{doc.proveedor_cliente ?? 'â€”'}</td>
                          <td className="px-4 py-4 text-right text-slate-900 font-semibold">
                            ${Number(doc.valor ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-center text-slate-700">{doc.cuenta_puc ?? 'â€”'}</td>
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                                doc.estado_conciliacion === 'conciliado'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : doc.estado_conciliacion === 'rechazado'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {doc.estado_conciliacion}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {doc.estado_conciliacion !== 'conciliado' && (
                              <button
                                onClick={() => cambiarEstado(doc.id, 'conciliado')}
                                className="rounded-2xl bg-slate-800 px-3 py-2 text-xs text-white transition hover:bg-slate-700"
                              >
                                Conciliar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-5">Registrar documento</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoDocumento)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {Object.entries(ETIQUETAS_TIPO).map(([valorTipo, etiqueta]) => (
                      <option key={valorTipo} value={valorTipo}>{etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">NÃºmero de documento</label>
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="Ej. FV-1024"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de emisiÃ³n</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Valor</label>
                  <input
                    type="number"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="Ej. 850000"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Cuenta PUC</label>
                  <input
                    value={cuentaPuc}
                    onChange={(e) => setCuentaPuc(e.target.value)}
                    placeholder="Ej. 513500"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  onClick={registrarDocumento}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-white font-semibold transition hover:bg-emerald-700"
                >
                  Registrar documento
                </button>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  )
}





