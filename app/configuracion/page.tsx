'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function ConfiguracionPage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Configuracion</h2>
        <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
          <p className="text-5xl mb-4">⚙️</p>
          <p className="text-lg font-medium">Modulo en construccion</p>
          <p className="text-sm mt-2">Proximamente podras configurar tu empresa, usuarios y preferencias</p>
        </div>
      </main>
    </div>
  )
}