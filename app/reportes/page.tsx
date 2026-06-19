'use client'
import { Suspense } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'

export default function ReportesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <ReportesContenido />
    </Suspense>
  )
}

function ReportesContenido() {
  const { user, handleLogout } = useUser()

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-6">
        <div className="max-w-6xl mx-auto">
          <section className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">ContaBot</p>
            <h1 className="text-3xl font-semibold text-slate-900">Reportes</h1>
            <p className="mt-4 text-slate-500">Módulo de reportes en construcción.</p>
          </section>
        </div>
      </main>
    </div>
  )
}