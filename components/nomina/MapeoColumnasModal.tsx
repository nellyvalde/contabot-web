'use client'

import { useState } from 'react'
import {
  CAMPOS_CONTABLES,
  calcularHuellaEncabezados,
  guardarMapeoColumnas,
  type CampoContable,
  type MapeoColumnas,
} from '@/lib/nomina/mapeoColumnas'

type Props = {
  encabezados: string[]
  empresaId: string
  onGuardado: (mapeo: MapeoColumnas) => void
  onCancelar: () => void
}

export default function MapeoColumnasModal({ encabezados, empresaId, onGuardado, onCancelar }: Props) {
  const [mapeo, setMapeo] = useState<MapeoColumnas>(() =>
    Object.fromEntries(encabezados.map((encabezado) => [encabezado, 'ignorar' as CampoContable]))
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function asignarCampo(encabezado: string, campo: CampoContable) {
    setMapeo((prev) => ({ ...prev, [encabezado]: campo }))
  }

  async function guardarMapeo() {
    setGuardando(true)
    setError(null)
    try {
      const huella = calcularHuellaEncabezados(encabezados)
      await guardarMapeoColumnas(empresaId, huella, mapeo)
      onGuardado(mapeo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando el mapeo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Mapear columnas del Excel</h2>
            <p className="text-xs text-slate-400 mt-0.5">No reconocemos esta plantilla. Asigna cada columna a un campo contable.</p>
          </div>
          <button onClick={onCancelar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          {encabezados.map((encabezado, i) => (
            <div key={`${encabezado}-${i}`} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate" title={encabezado}>
                  {encabezado || `Columna ${i + 1}`}
                </p>
              </div>
              <select
                value={mapeo[encabezado]}
                onChange={(e) => asignarCampo(encabezado, e.target.value as CampoContable)}
                className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
              >
                {CAMPOS_CONTABLES.map((campo) => (
                  <option key={campo.value} value={campo.value}>{campo.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-5">
          <button
            onClick={onCancelar}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={guardarMapeo}
            disabled={guardando}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            {guardando ? 'Guardando...' : 'Guardar mapeo'}
          </button>
        </div>
      </div>
    </div>
  )
}
