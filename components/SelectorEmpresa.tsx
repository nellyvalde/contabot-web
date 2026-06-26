'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEmpresa } from '@/lib/context/EmpresaContext'

function getIniciales(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function getColor(id: string): string {
  const colores = ['bg-emerald-500','bg-blue-500','bg-violet-500','bg-amber-500','bg-rose-500']
  const idx = id.charCodeAt(0) % colores.length
  return colores[idx]
}

export default function SelectorEmpresa() {
  const { empresas, empresaActiva, setEmpresaActiva, cargando } = useEmpresa()
  const [abierto, setAbierto] = useState(false)
  const router = useRouter()

  if (cargando) {
    return (
      <div className="mx-3 mb-3 rounded-xl bg-slate-800 px-3 py-2.5 animate-pulse">
        <div className="h-3 w-20 bg-slate-700 rounded mb-1" />
        <div className="h-4 w-32 bg-slate-700 rounded" />
      </div>
    )
  }

  if (!empresaActiva) {
    return (
      <div className="mx-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
        <p className="text-xs text-amber-400 font-medium">⚠ Sin empresa seleccionada</p>
        <button
          onClick={() => router.push('/configuracion')}
          className="text-xs text-amber-300 underline mt-0.5"
        >
          Agregar empresa
        </button>
      </div>
    )
  }

  return (
    <div className="relative mx-3 mb-3">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-left hover:bg-slate-700/60 transition-all duration-150 group"
      >
        {/* Avatar con iniciales */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getColor(empresaActiva.id)}`}>
          {getIniciales(empresaActiva.razon_social)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            Empresa activa
          </p>
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {empresaActiva.razon_social}
          </p>
          <p className="text-[11px] text-slate-400 font-mono">
            NIT {empresaActiva.nit}
          </p>
        </div>
        <span className={`text-slate-400 text-xs transition-transform duration-200 flex-shrink-0 ${abierto ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Dropdown */}
      {abierto && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
          {empresas.map(empresa => (
            <button
              key={empresa.id}
              onClick={() => { setEmpresaActiva(empresa); setAbierto(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700 transition-colors ${
                empresa.id === empresaActiva.id ? 'bg-slate-700/50' : ''
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getColor(empresa.id)}`}>
                {getIniciales(empresa.razon_social)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{empresa.razon_social}</p>
                <p className="text-[11px] text-slate-400 font-mono">NIT {empresa.nit}</p>
              </div>
              {empresa.id === empresaActiva.id && (
                <span className="text-emerald-400 text-xs flex-shrink-0">✓</span>
              )}
            </button>
          ))}

          {/* Botón agregar empresa */}
          <div className="border-t border-slate-700">
            <button
              onClick={() => { router.push('/configuracion'); setAbierto(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg border border-dashed border-slate-500 flex items-center justify-center text-slate-400 flex-shrink-0">
                +
              </div>
              <p className="text-sm text-slate-400 hover:text-white transition-colors">
                Gestionar / Agregar empresa
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}