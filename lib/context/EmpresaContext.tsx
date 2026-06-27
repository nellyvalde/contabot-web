'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

export type Empresa = {
  id: string
  nit: string
  razon_social: string
  
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
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaActiva, setEmpresaActivaState] = useState<Empresa | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargarEmpresas() }, [])

  async function cargarEmpresas() {
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) { setCargando(false); return }

      const { data, error } = await supabase
        .from('usuarios_empresas')
        .select('empresa_id, contabot_empresas(id, nit, razon_social, empresas_legacy_id)')
        .eq('user_id', session.user.id)

      if (error || !data || data.length === 0) {
        console.error('Error cargando empresas:', error)
        setCargando(false)
        return
      }

      const lista: Empresa[] = data.map((row: any) => row.contabot_empresas).filter(Boolean)
      if (lista.length === 0) { setCargando(false); return }

      setEmpresas(lista)
      const guardada = localStorage.getItem('contabot_empresa_activa')
      const encontrada = guardada ? lista.find(e => e.id === guardada) : null
      setEmpresaActivaState(encontrada ?? lista[0])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setCargando(false)
    }
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



