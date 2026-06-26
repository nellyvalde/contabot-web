'use client'

import { useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'

export default function SelectorEmpresa() {
  const { empresas, empresaActiva, setEmpresaActiva, cargando } = useEmpresa()
  const [abierto, setAbierto] = useState(false)

  if (cargando) {
    return (
      <div className="mx-3 mb-4 rounded-xl bg-slate-100 px-3 py-2.5 animate-pulse">
        <div className="h-3 w-24 bg-slate-200 rounded" />
      </div>
    )
  }

  if (!empresaActiva) return null

  return (
    <div className="relative mx-3 mb-4">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:bg-slate-50 transition-all"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Empresa activa</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{empresaActiva.razon_social}</p>
          <p className="text-[11px] text-slate-400 font-mono">NIT {empresaActiva.nit}</p>
        </div>
        <span className={`text-slate-400 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {abierto && empresas.length > 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {empresas.map(empresa => (
            <button
              key={empresa.id}
              onClick={() => { setEmpresaActiva(empresa); setAbierto(false) }}
              className={`w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${empresa.id === empresaActiva.id ? 'bg-emerald-50' : ''}`}
            >
              <p className="text-sm font-medium text-slate-800 truncate">{empresa.razon_social}</p>
              <p className="text-[11px] text-slate-400 font-mono">NIT {empresa.nit}</p>
              {empresa.id === empresaActiva.id && <span className="text-[10px] font-semibold text-emerald-600">✓ Activa</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
