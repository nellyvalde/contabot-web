'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const categoriaConfig: Record<string, { color: string, emoji: string }> = {
  'Factura de Venta':     { color: 'bg-green-100 text-green-700',   emoji: '🟢' },
  'Factura de Compra':    { color: 'bg-red-100 text-red-700',       emoji: '🔴' },
  'Gasto':                { color: 'bg-yellow-100 text-yellow-700', emoji: '🟡' },
  'Nomina':               { color: 'bg-blue-100 text-blue-700',     emoji: '🔵' },
  'Extracto Bancario':    { color: 'bg-purple-100 text-purple-700', emoji: '🟣' },
  'Documento Tributario': { color: 'bg-orange-100 text-orange-700', emoji: '🟠' },
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else {
        setUser(data.user)
        cargarFacturas(data.user.id)
      }
    })
  }, [])

  const cargarFacturas = async (userId: string) => {
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setFacturas(data)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMensaje('🤖 La IA está leyendo y clasificando tu documento...')
    setDatosFact(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setDatosFact(data.datos)
        setMensaje('✅ Documento leído y clasificado correctamente')
      } else {
        setMensaje('❌ Error: ' + data.error)
      }
    } catch {
      setMensaje('❌ Error procesando el archivo')
    }
    setLoading(false)
  }

  const hand
  </div>
      </div>
    </main>
  )
}
