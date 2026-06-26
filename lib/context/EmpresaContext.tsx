'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

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
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaActiva, setEmpresaActivaState] = useState<Empresa | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarEmpresas()
  }, [])

  async function cargarEmpresas() {
    setCargando(true)
    try {
      // Obtener sesion actual
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) { setCargando(false); return }

      // Query 1: obtener empresa_ids del usuario
      const { data: rels, error: e1 } = await supabase
        .from('usuarios_empresas')
        .select('empresa_id')
        .eq('user_id', session.user.id)


      if (e1 || !rels || rels.length === 0) { setCargando(false); return }

      const ids = rels.map((r: any) => r.empresa_id)

      // Query 2: obtener datos de esas empresas
      const { data: emps, error: e2 } = await supabase
        .from('contabot_empresas')
        .select('id, nit, razon_social, regimen_tributario')
        .in('id', ids)

      if (e2 || !emps) { setCargando(false); return }

      setEmpresas(emps)

      // Restaurar empresa activa desde localStorage
      const guardada = localStorage.getItem('contabot_empresa_activa')
      const encontrada = guardada ? emps.find((e: Empresa) => e.id === guardada) : null
      setEmpresaActivaState(encontrada ?? emps[0] ?? null)
    } catch (err) {
      console.error('Error cargando empresas:', err)
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

