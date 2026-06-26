'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'

export type Empresa = {
  id: string
  nit: string
  razon_social: string
  regimen_tributario: string | null
}

type EmpresaContextType = {
  empresas: Empresa[]
  empresaActiva: Empresa | null
  setEmpresaActiva: (e: Empresa) => void
  cargando: boolean
}

const EmpresaContext = createContext<EmpresaContextType>({
  empresas: [],
  empresaActiva: null,
  setEmpresaActiva: () => {},
  cargando: true,
})

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaActiva, setEmpresaActivaState] = useState<Empresa | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    cargarEmpresas()
  }, [user?.id])

  async function cargarEmpresas() {
    setCargando(true)
    const { data, error } = await supabase
      .from('usuarios_empresas')
      .select('empresa_id, contabot_empresas (id, nit, razon_social, regimen_tributario)')
      .eq('user_id', user!.id)
      .eq('activo', true)

    if (error || !data) { setCargando(false); return }

    const lista: Empresa[] = data.map((row: any) => row.contabot_empresas).filter(Boolean)
    setEmpresas(lista)

    const guardada = localStorage.getItem('contabot_empresa_activa')
    const encontrada = guardada ? lista.find(e => e.id === guardada) : null
    setEmpresaActivaState(encontrada ?? lista[0] ?? null)
    setCargando(false)
  }

  function setEmpresaActiva(empresa: Empresa) {
    setEmpresaActivaState(empresa)
    localStorage.setItem('contabot_empresa_activa', empresa.id)
  }

  return (
    <EmpresaContext.Provider value={{ empresas, empresaActiva, setEmpresaActiva, cargando }}>
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa() {
  return useContext(EmpresaContext)
}
