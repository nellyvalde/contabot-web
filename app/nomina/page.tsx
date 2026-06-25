'use client'
// app/nomina/page.tsx
//
// ⚠️ AVISO DE INGENIERIA (leer antes de usar en produccion):
// Este modulo es el punto de partida visual que se proporciono para la tarea
// de separacion en carpetas. Tal como esta, NO cumple aun con la mision de
// ContaBot de eliminar el trabajo manual del auxiliar contable:
//   - Los empleados viven en useState (array "empleadosIniciales"), no en
//     Supabase. Al recargar la pagina se pierde todo lo que se agregue.
//   - No hay importacion de Excel ni conciliacion de PDFs.
//   - No se aplican reglas DIAN/UGPP: aportes a salud/pension/parafiscales,
//     Ley 1393 de 2010 (40% de pagos no constitutivos de salario que se
//     deben sumar a la base de aportes), ni cuentas PUC (51, 25xx, 23xx).
// Se deja funcionando para cumplir el pedido de "separar en carpetas", pero
// la siguiente fase deberia migrar esto a una tabla "empleados" en Supabase
// + un endpoint /api/leer-nomina que lea el Excel/PDF y aplique esas reglas.

import { Suspense, useMemo, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'

type Empleado = {
  id: number
  nombre: string
  puesto: string
  salario: number
  pagoRealizado: boolean
}

const empleadosIniciales: Empleado[] = [
  { id: 1, nombre: 'Ana Gómez', puesto: 'Contadora', salario: 3200000, pagoRealizado: false },
  { id: 2, nombre: 'Carlos Pérez', puesto: 'Auxiliar administrativo', salario: 1900000, pagoRealizado: false },
  { id: 3, nombre: 'María López', puesto: 'Analista de nómina', salario: 2700000, pagoRealizado: true },
]

export default function NominaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <NominaContenido />
    </Suspense>
  )
}

function NominaContenido() {
  const { user, handleLogout } = useUser()
  const [empleados, setEmpleados] = useState<Empleado[]>(empleadosIniciales)
  const [nombre, setNombre] = useState('')
  const [puesto, setPuesto] = useState('')
  const [salario, setSalario] = useState('')

  const totalNomina = useMemo(
    () => empleados.reduce((sum, empleado) => sum + empleado.salario, 0),
    [empleados]
  )

  const totalPendiente = useMemo(
    () => empleados.filter((empleado) => !empleado.pagoRealizado).reduce((sum, empleado) => sum + empleado.salario, 0),
    [empleados]
  )

  const agregarEmpleado = () => {
    if (!nombre.trim() || !puesto.trim() || !salario.trim()) return

    const nuevo: Empleado = {
      id: empleados.length + 1,
      nombre: nombre.trim(),
      puesto: puesto.trim(),
      salario: Number(salario),
      pagoRealizado: false,
    }

    setEmpleados((prev) => [...prev, nuevo])
    setNombre('')
    setPuesto('')
    setSalario('')
  }

  const togglePago = (id: number) => {
    setEmpleados((prev) =>
      prev.map((empleado) =>
        empleado.id === id ? { ...empleado, pagoRealizado: !empleado.pagoRealizado } : empleado
      )
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
                <p className="text-sm text-slate-500">Gestión de Nómina</p>
                <h1 className="text-3xl font-semibold text-slate-900">Nómina de empleados</h1>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="rounded-3xl bg-emerald-50 p-5">
                  <p className="text-sm text-slate-500">Total nómina</p>
                  <p className="text-2xl font-bold text-emerald-700">${totalNomina.toLocaleString()}</p>
                </div>
                <div className="rounded-3xl bg-yellow-50 p-5">
                  <p className="text-sm text-slate-500">Pago pendiente</p>
                  <p className="text-2xl font-bold text-yellow-700">${totalPendiente.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Empleados registrados</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Puesto</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Salario</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {empleados.map((empleado) => (
                      <tr key={empleado.id}>
                        <td className="px-4 py-4 text-slate-700">{empleado.nombre}</td>
                        <td className="px-4 py-4 text-slate-700">{empleado.puesto}</td>
                        <td className="px-4 py-4 text-right text-slate-900 font-semibold">
                          ${empleado.salario.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                              empleado.pagoRealizado ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {empleado.pagoRealizado ? 'Pagado' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => togglePago(empleado.id)}
                            className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-white transition hover:bg-slate-700"
                          >
                            {empleado.pagoRealizado ? 'Marcar pendiente' : 'Marcar pagado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-5">Agregar nuevo empleado</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nombre</label>
                  <input
                    value={nombre}
                    onChange={(event) => setNombre(event.target.value)}
                    placeholder="Ej. Laura Torres"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Puesto</label>
                  <input
                    value={puesto}
                    onChange={(event) => setPuesto(event.target.value)}
                    placeholder="Ej. Auxiliar contable"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Salario mensual</label>
                  <input
                    value={salario}
                    onChange={(event) => setSalario(event.target.value)}
                    placeholder="Ej. 2500000"
                    type="number"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  onClick={agregarEmpleado}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-white font-semibold transition hover:bg-emerald-700"
                >
                  Añadir empleado
                </button>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Resumen rápido</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">${totalNomina.toLocaleString()}</p>
                  <p className="text-sm text-slate-500">Total de nómina</p>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  )
}
