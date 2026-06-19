'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'

type ResumenNomina = {
  totalLiquidado: number
  totalPendientePago: number
  empleadosActivos: number
}

type ResumenDocumentos = {
  pendientesConciliar: number
  conciliados: number
  valorPendiente: number
}

type Vencimiento = {
  id: string
  obligacion: string
  fecha: string
  estado: 'proximo' | 'vencido' | 'cumplido'
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <DashboardContenido />
    </Suspense>
  )
}

function DashboardContenido() {
  const { user, handleLogout } = useUser()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumenNomina, setResumenNomina] = useState<ResumenNomina>({
    totalLiquidado: 0,
    totalPendientePago: 0,
    empleadosActivos: 0,
  })
  const [resumenDocumentos, setResumenDocumentos] = useState<ResumenDocumentos>({
    pendientesConciliar: 0,
    conciliados: 0,
    valorPendiente: 0,
  })

  const vencimientos: Vencimiento[] = useMemo(
    () => [
      { id: '1', obligacion: 'Retención en la fuente (mensual)', fecha: 'Según último dígito del NIT', estado: 'proximo' },
      { id: '2', obligacion: 'IVA (bimestral o cuatrimestral)', fecha: 'Calendario DIAN vigente', estado: 'proximo' },
      { id: '3', obligacion: 'Aportes a seguridad social (PILA)', fecha: 'Mismo plazo de la retención', estado: 'proximo' },
    ],
    []
  )

  useEffect(() => {
    cargarResumen()
  }, [])

  async function cargarResumen() {
    setCargando(true)
    setError(null)

    const { data: empresa, error: errEmpresa } = await supabase
      .from('empresas')
      .select('id')
      .limit(1)
      .single()

    if (errEmpresa || !empresa) {
      setError('No se encontró ninguna empresa registrada en Supabase.')
      setCargando(false)
      return
    }

    const [{ data: empleados }, { data: liquidaciones }, { data: documentos }] = await Promise.all([
      supabase.from('empleados').select('id').eq('empresa_id', empresa.id).eq('activo', true),
      supabase.from('liquidaciones_nomina').select('neto_a_pagar, pago_realizado, empleado_id, empleados!inner(empresa_id)').eq('empleados.empresa_id', empresa.id),
      supabase.from('documentos').select('estado_conciliacion, valor').eq('empresa_id', empresa.id),
    ])

    const totalLiquidado = (liquidaciones ?? []).reduce((sum, l: any) => sum + Number(l.neto_a_pagar ?? 0), 0)
    const totalPendientePago = (liquidaciones ?? []).filter((l: any) => !l.pago_realizado).reduce((sum, l: any) => sum + Number(l.neto_a_pagar ?? 0), 0)

    setResumenNomina({
      totalLiquidado,
      totalPendientePago,
      empleadosActivos: (empleados ?? []).length,
    })

    const pendientesConciliar = (documentos ?? []).filter((d) => d.estado_conciliacion === 'pendiente')
    const conciliados = (documentos ?? []).filter((d) => d.estado_conciliacion === 'conciliado')

    setResumenDocumentos({
      pendientesConciliar: pendientesConciliar.length,
      conciliados: conciliados.length,
      valorPendiente: pendientesConciliar.reduce((sum, d) => sum + Number(d.valor ?? 0), 0),
    })

    setCargando(false)
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
            <p className="text-sm text-slate-500">ContaBot</p>
            <h1 className="text-3xl font-semibold text-slate-900">Resumen general</h1>
            {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </section>

          {cargando ? (
            <p className="text-slate-500">Cargando resumen...</p>
          ) : (
            <>
              <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <Tarjeta titulo="Empleados activos" valor={resumenNomina.empleadosActivos.toString()} color="slate" />
                <Tarjeta titulo="Nómina liquidada" valor={`$${resumenNomina.totalLiquidado.toLocaleString()}`} color="emerald" />
                <Tarjeta titulo="Nómina pendiente de pago" valor={`$${resumenNomina.totalPendientePago.toLocaleString()}`} color="yellow" />
                <Tarjeta titulo="Documentos sin conciliar" valor={resumenDocumentos.pendientesConciliar.toString()} color="red" />
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900 mb-5">Conciliación de documentos</h2>
                  <div className="space-y-3">
                    <FilaResumen etiqueta="Conciliados" valor={resumenDocumentos.conciliados.toString()} />
                    <FilaResumen etiqueta="Pendientes" valor={resumenDocumentos.pendientesConciliar.toString()} />
                    <FilaResumen etiqueta="Valor pendiente" valor={`$${resumenDocumentos.valorPendiente.toLocaleString()}`} />
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900 mb-5">Vencimientos próximos</h2>
                  <div className="space-y-3">
                    {vencimientos.map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{v.obligacion}</p>
                          <p className="text-xs text-slate-500">{v.fecha}</p>
                        </div>
                        <EstadoBadge estado={v.estado} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Tarjeta({ titulo, valor, color }: { titulo: string; valor: string; color: 'slate' | 'emerald' | 'yellow' | 'red' }) {
  const estilos: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className={`rounded-3xl p-5 ${estilos[color]}`}>
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
    </div>
  )
}

function FilaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{etiqueta}</span>
      <span className="text-sm font-semibold text-slate-900">{valor}</span>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: Vencimiento['estado'] }) {
  const estilos: Record<Vencimiento['estado'], string> = {
    proximo: 'bg-yellow-100 text-yellow-700',
    vencido: 'bg-red-100 text-red-700',
    cumplido: 'bg-emerald-100 text-emerald-700',
  }
  const texto: Record<Vencimiento['estado'], string> = {
    proximo: 'Próximo',
    vencido: 'Vencido',
    cumplido: 'Cumplido',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${estilos[estado]}`}>
      {texto[estado]}
    </span>
  )
}