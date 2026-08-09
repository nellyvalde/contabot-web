'use client'

import { useState } from 'react'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { supabase } from '@/lib/supabase/client'
import { crearEmpresaYVincular } from '@/lib/empresas/agregarEmpresa'

function getIniciales(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function getColor(id: string): string {
  const colores = ['bg-emerald-500','bg-blue-500','bg-violet-500','bg-amber-500','bg-rose-500']
  return colores[id.charCodeAt(0) % colores.length]
}

export default function SelectorEmpresa() {
  const { empresas, empresaActiva, setEmpresaActiva, cargando } = useEmpresa()
  const [abierto, setAbierto] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [nitNuevo, setNitNuevo] = useState('')
  const [razonNueva, setRazonNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  async function agregarEmpresa() {
    if (!nitNuevo.trim() || !razonNueva.trim()) {
      setErrorModal('NIT y razón social son obligatorios.')
      return
    }
    setGuardando(true)
    setErrorModal(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) { setErrorModal('No hay sesión activa.'); setGuardando(false); return }

    const resultado = await crearEmpresaYVincular(supabase, { nit: nitNuevo, razonSocial: razonNueva })
    if (!resultado.ok) { setErrorModal(`Error: ${resultado.error}`); setGuardando(false); return }

    const { empresa } = resultado
    setEmpresaActiva({ id: empresa.id, nit: empresa.nit, razon_social: empresa.razon_social })
    setModalAbierto(false)
    setNitNuevo('')
    setRazonNueva('')
    setGuardando(false)
    window.location.reload()
  }

  if (cargando) return (
    <div className="mx-3 mb-3 rounded-xl bg-slate-800 px-3 py-2.5 animate-pulse">
      <div className="h-3 w-20 bg-slate-700 rounded mb-1" />
      <div className="h-4 w-32 bg-slate-700 rounded" />
    </div>
  )

  if (!empresaActiva) return (
    <>
      <div className="mx-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
        <p className="text-xs text-amber-400 font-medium">⚠ Sin empresa seleccionada</p>
        <button onClick={() => setModalAbierto(true)} className="text-xs text-amber-300 underline mt-0.5">Agregar empresa</button>
      </div>

      {/* Modal agregar empresa (también visible cuando no hay empresa activa) */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Agregar nueva empresa</h2>
              <button onClick={() => { setModalAbierto(false); setErrorModal(null) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">NIT de la empresa</label>
                <input
                  value={nitNuevo}
                  onChange={e => setNitNuevo(e.target.value)}
                  placeholder="Ej. 900123456"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Razón social</label>
                <input
                  value={razonNueva}
                  onChange={e => setRazonNueva(e.target.value)}
                  placeholder="Ej. MI EMPRESA SAS"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              {errorModal && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorModal}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setModalAbierto(false); setErrorModal(null) }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={agregarEmpresa}
                  disabled={guardando}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  {guardando ? 'Guardando...' : '+ Agregar empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return (
    <>
      <div className="relative mx-3 mb-3">
        <button
          onClick={() => setAbierto(!abierto)}
          className="w-full flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-left hover:bg-slate-700/60 transition-all duration-150"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getColor(empresaActiva.id)}`}>
            {getIniciales(empresaActiva.razon_social)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Empresa activa</p>
            <p className="text-sm font-semibold text-white truncate leading-tight">{empresaActiva.razon_social}</p>
            <p className="text-[11px] text-slate-400 font-mono">NIT {empresaActiva.nit}</p>
          </div>
          <span className={`text-slate-400 text-xs transition-transform duration-200 flex-shrink-0 ${abierto ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {abierto && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
            {empresas.map(empresa => (
              <button
                key={empresa.id}
                onClick={() => { setEmpresaActiva(empresa); setAbierto(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700 transition-colors ${empresa.id === empresaActiva.id ? 'bg-slate-700/50' : ''}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getColor(empresa.id)}`}>
                  {getIniciales(empresa.razon_social)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{empresa.razon_social}</p>
                  <p className="text-[11px] text-slate-400 font-mono">NIT {empresa.nit}</p>
                </div>
                {empresa.id === empresaActiva.id && <span className="text-emerald-400 text-xs">✓</span>}
              </button>
            ))}
            <div className="border-t border-slate-700">
              <button
                onClick={() => { setModalAbierto(true); setAbierto(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg border border-dashed border-slate-500 flex items-center justify-center text-slate-400 flex-shrink-0 text-lg">+</div>
                <p className="text-sm text-slate-400">Gestionar / Agregar empresa</p>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal agregar empresa */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Agregar nueva empresa</h2>
              <button onClick={() => { setModalAbierto(false); setErrorModal(null) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">NIT de la empresa</label>
                <input
                  value={nitNuevo}
                  onChange={e => setNitNuevo(e.target.value)}
                  placeholder="Ej. 900123456"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Razón social</label>
                <input
                  value={razonNueva}
                  onChange={e => setRazonNueva(e.target.value)}
                  placeholder="Ej. MI EMPRESA SAS"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              {errorModal && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorModal}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setModalAbierto(false); setErrorModal(null) }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={agregarEmpresa}
                  disabled={guardando}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  {guardando ? 'Guardando...' : '+ Agregar empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}