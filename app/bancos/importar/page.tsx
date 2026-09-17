'use client'
// app/bancos/importar/page.tsx
// Bloques A y B del nuevo flujo de importacion de extractos bancarios
// (aprobados; C y D todavia NO). Ruta deliberadamente separada de
// app/bancos/page.tsx -- no comparte archivo con el flujo ya probado de
// conciliaciones/cierre de periodo, y no esta enlazada desde /bancos ni
// desde components/Sidebar.tsx todavia (ver
// lib/bancos/__tests__/importarSinEnlaces.test.ts, que lo verifica por
// codigo fuente).
//
// Esta pagina NUNCA escribe: no hay ninguna llamada de escritura (insert,
// update, delete, upsert) ni ninguna RPC en todo este archivo. Bloque A trae cuentas_bancarias
// de solo lectura; Bloque B parsea y previsualiza un archivo enteramente
// en memoria, sin tocar la red. El boton para iniciar una importacion real
// (iniciar_o_reintentar_importacion, Bloque C) todavia no existe aqui.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import Sidebar from '@/components/Sidebar'
import { obtenerCuentasBancarias, type CuentaBancaria } from '@/lib/bancos/obtenerCuentasBancarias'
import {
  parsearExtractoAvVillas,
  validarArchivoAntesDeLeer,
  type MovimientoParseado,
  type FilaConError,
  type ResultadoParseoAvVillas,
} from '@/lib/bancos/parsearExtractoAvVillas'
import { mensajeErrorControlado, registrarErrorSupabase } from '@/lib/bancos/erroresBancos'
import { claveConsulta, ejecutarSiVigente } from '@/lib/bancos/consultaVigente'

export default function ImportarExtractoPage() {
  const { empresaActiva } = useEmpresa()
  const [user, setUser] = useState<User | null>(null)

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState('')
  const [mensajeCuentas, setMensajeCuentas] = useState('')

  const [nombreArchivo, setNombreArchivo] = useState('')
  const [movimientos, setMovimientos] = useState<MovimientoParseado[]>([])
  const [filasConError, setFilasConError] = useState<FilaConError[]>([])
  const [totalFilasLeidas, setTotalFilasLeidas] = useState(0)
  const [errorArchivo, setErrorArchivo] = useState('')

  // Reinicio al cambiar de empresa DURANTE EL RENDER -- mismo patron y
  // misma razon que app/bancos/page.tsx: evita el pase de render extra de
  // un efecto y react-hooks/set-state-in-effect, y nunca deja ver, ni
  // brevemente, cuentas o una previsualizacion que en realidad pertenecen
  // a otra empresa.
  const [empresaReflejada, setEmpresaReflejada] = useState(empresaActiva?.id)
  if (empresaActiva?.id !== empresaReflejada) {
    setEmpresaReflejada(empresaActiva?.id)
    setCuentas([])
    setCuentaSeleccionada('')
    setMensajeCuentas('')
    setNombreArchivo('')
    setMovimientos([])
    setFilasConError([])
    setTotalFilasLeidas(0)
    setErrorArchivo('')
  }

  // Identidad vigente -- empresa Y cuenta seleccionada -- para la carga de
  // cuentas y para el parseo de archivo. useLayoutEffect, nunca useEffect:
  // ver el comentario en app/bancos/page.tsx y en ejecutarSiVigente
  // (lib/bancos/consultaVigente.ts) sobre por que un efecto pasivo no
  // basta -- debe reflejar el valor REALMENTE renderizado antes de que
  // cualquier lectura de archivo (o consulta) pendiente pueda resolver.
  const empresaIdRenderizadoRef = useRef<string | undefined>(empresaActiva?.id)
  const cuentaSeleccionadaRenderizadaRef = useRef<string>(cuentaSeleccionada)
  useLayoutEffect(() => {
    empresaIdRenderizadoRef.current = empresaActiva?.id
    cuentaSeleccionadaRenderizadaRef.current = cuentaSeleccionada
  })

  const consultaCuentasRef = useRef<string>('')
  // Identidad vigente para la lectura/parseo de archivo (Bloque B) --
  // independiente de la de arriba porque protege una operacion distinta
  // (un archivo concreto, no la lista de cuentas).
  const consultaArchivoRef = useRef<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        registrarErrorSupabase('verificar la sesión', error)
        window.location.href = '/'
        return
      }
      if (!data.user) window.location.href = '/'
      else setUser(data.user)
    })
  }, [])

  // La carga de cuentas vive ENTERAMENTE dentro del efecto (no como una
  // funcion `cargarCuentas` aparte referenciada antes de declararse) --
  // evita tanto el hallazgo de lint "accessed before declared"
  // (react-hooks/immutability) como la dependencia faltante
  // (react-hooks/exhaustive-deps) que esa funcion aparte generaria: el
  // objeto `estado` se construye inline, leyendo/escribiendo unicamente
  // `consultaCuentasRef.current` (un ref, que el propio linter reconoce
  // como estable y no exige en el arreglo de dependencias).
  useEffect(() => {
    const empresaId = empresaActiva?.id
    if (!empresaId) return

    const clave = claveConsulta(empresaId)
    const esVigente = () => empresaIdRenderizadoRef.current === empresaId

    ejecutarSiVigente(
      {
        obtenerClaveVigente: () => consultaCuentasRef.current,
        establecerClaveVigente: (c: string) => { consultaCuentasRef.current = c },
      },
      clave,
      () => obtenerCuentasBancarias(supabase, empresaId),
      (resultado) => {
        if (!resultado.ok) {
          setMensajeCuentas(resultado.mensaje)
          return
        }
        setCuentas(resultado.cuentas)
        setMensajeCuentas(resultado.cuentas.length === 0 ? 'No hay cuentas bancarias configuradas para esta empresa.' : '')
      },
      esVigente
    )
  }, [empresaActiva?.id])

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const handleCuentaSeleccionada = (nuevaCuentaId: string) => {
    setCuentaSeleccionada(nuevaCuentaId)
    // Cambiar de cuenta invalida cualquier previsualizacion en pantalla --
    // ya no corresponde a la cuenta que ahora esta seleccionada.
    setNombreArchivo('')
    setMovimientos([])
    setFilasConError([])
    setTotalFilasLeidas(0)
    setErrorArchivo('')
  }

  const handleArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo despues de un error
    if (!file) return

    const empresaId = empresaActiva?.id
    const cuentaId = cuentaSeleccionada
    if (!empresaId || !cuentaId) return

    setNombreArchivo(file.name)
    setMovimientos([])
    setFilasConError([])
    setTotalFilasLeidas(0)
    setErrorArchivo('')

    const validacion = validarArchivoAntesDeLeer(file.name, file.size)
    if (!validacion.ok) {
      // Sincronico, sin ningun await de por medio -- no puede quedar
      // obsoleto, se aplica directo.
      setErrorArchivo(validacion.error)
      return
    }

    // Identidad capturada AQUI, antes de file.arrayBuffer() (el unico
    // await real de este flujo): empresaId, cuentaId, y un token de
    // operacion unico (claveConsulta ya incluye el token, asi que un
    // segundo archivo seleccionado antes de que el primero termine de
    // leerse siempre reemplaza la clave vigente). Si la empresa o la
    // cuenta activas cambian mientras el archivo se esta leyendo o
    // parseando, `esVigente` lo detecta al terminar y el resultado se
    // descarta sin tocar la UI -- ni el archivo de otra cuenta, ni un
    // error, ni una previsualizacion.
    const token = crypto.randomUUID()
    const clave = claveConsulta(empresaId, cuentaId, token)
    const esVigente = () =>
      empresaIdRenderizadoRef.current === empresaId && cuentaSeleccionadaRenderizadaRef.current === cuentaId

    ejecutarSiVigente(
      {
        obtenerClaveVigente: () => consultaArchivoRef.current,
        establecerClaveVigente: (c: string) => { consultaArchivoRef.current = c },
      },
      clave,
      async (): Promise<ResultadoParseoAvVillas> => {
        try {
          const bytes = await file.arrayBuffer()
          return parsearExtractoAvVillas(bytes, file.name)
        } catch {
          return { ok: false, error: mensajeErrorControlado('leer el archivo') }
        }
      },
      (resultado) => {
        if (!resultado.ok) {
          setErrorArchivo(resultado.error)
          return
        }
        setMovimientos(resultado.movimientos)
        setFilasConError(resultado.filasConError)
        setTotalFilasLeidas(resultado.totalFilasLeidas)
      },
      esVigente
    )
  }

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Importar extracto bancario (en construcción)</h2>
        <p className="text-slate-500 text-sm mb-6">
          Vista previa interna — todavía no guarda ningún movimiento. Banco admitido: AV Villas, en formato .xlsx o .csv.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800" role="status">
          Esta pantalla solo previsualiza el archivo en tu navegador. Todavía no envía nada a Supabase ni guarda ningún movimiento.
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Cuenta bancaria</label>
          {mensajeCuentas && <p className="text-sm text-slate-500 mb-2">{mensajeCuentas}</p>}
          <select
            value={cuentaSeleccionada}
            onChange={e => handleCuentaSeleccionada(e.target.value)}
            disabled={cuentas.length === 0}
            className="w-full max-w-md px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white"
          >
            <option value="" className="text-slate-900">Selecciona una cuenta</option>
            {cuentas.map(c => (
              <option key={c.id} value={c.id} className="text-slate-900">
                {c.banco}{c.alias ? ` — ${c.alias}` : ''}{c.numeroCuenta ? ` (${c.numeroCuenta})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Archivo del extracto</label>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={handleArchivoSeleccionado}
            disabled={!cuentaSeleccionada}
            className="block text-sm text-slate-600"
          />
          {!cuentaSeleccionada && (
            <p className="text-xs text-slate-400 mt-2">Selecciona una cuenta antes de elegir un archivo.</p>
          )}
          {errorArchivo && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mt-3">{errorArchivo}</p>
          )}
        </div>

        {(movimientos.length > 0 || filasConError.length > 0) && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Previsualización de &quot;{nombreArchivo}&quot;</h3>
            <p className="text-xs text-slate-500 mb-4">
              {totalFilasLeidas} fila(s) leída(s) · {movimientos.length} válida(s) · {filasConError.length} con error
            </p>

            {movimientos.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-100 mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-4 py-2 font-medium">Fila</th>
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium">Descripción</th>
                      <th className="px-4 py-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => (
                      <tr key={m.fila} className="border-t">
                        <td className="px-4 py-2 text-slate-400">{m.fila}</td>
                        <td className="px-4 py-2 text-slate-600">{m.fecha}</td>
                        <td className="px-4 py-2 text-slate-700 max-w-xs truncate">{m.descripcion}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">${Math.round(m.valor).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filasConError.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-red-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50 text-left text-red-700">
                      <th className="px-4 py-2 font-medium">Fila</th>
                      <th className="px-4 py-2 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConError.map(f => (
                      <tr key={f.fila} className="border-t">
                        <td className="px-4 py-2 text-slate-400">{f.fila}</td>
                        <td className="px-4 py-2 text-red-700">{f.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-4">Esta vista previa no guarda ningún movimiento todavía.</p>
          </div>
        )}
      </main>
    </div>
  )
}
