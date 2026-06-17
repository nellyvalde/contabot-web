'use client'
// lib/hooks/useUser.ts
// Hook compartido de autenticacion. Evita repetir supabase.auth.getUser() + logout
// en cada page.tsx (dashboard, documentos, nomina, reportes, etc).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useUser() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return { user, handleLogout }
}