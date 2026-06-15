'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const categoriaConfig: Record<string, { color: string }> = {
  'Factura de Venta':     { color: 'bg-green-100 text-green-700' },
  'Factura de Compra':    { color: 'bg-blue-100 text-blue-700' },
  'Gasto':                { color: 'bg-orange-100 text-orange-700' },
  'Nomina':               { color: 'bg-blue-100 text-blue-700' },
  'Extracto Bancario':    { color: 'bg-purple-100 text-purple-700' },
  'Documento Tributario': { color: 'bg-orange-100 text-orange-700' },
}

const estadoConfig: Record<string, { color: string }> = {
  'Pendiente': { color: 'bg-yellow-100 text-yellow-700' },
  'Pagado':    { color: 'bg-green-100 text-green-700' },
  'Vencido':   { color: 'bg-red-100 text-red-700' },
}

const menuItems = [
  { id: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { id: 'documentos',    icon: '📄', label: 'Documentos' },
  { id: 'cobrar',        icon: '💰', label: 'Cuentas por Cobrar' },
  { id: 'pagar',         icon: '💳', label: 'Cuentas por Pagar' },
  { id: 'alertas',       icon: '⚠️', label: 'Centro de Alertas' },
  { id: 'revision',      icon: '🤖', label: 'Revision IA' },
  { id: 'clientes',      icon: '👥', label: 'Clientes' },
  { id: 'proveedores',   icon: '🏭', label: 'Proveedores' },
  { id: 'nomina', icon: '👷', label: 'Nomina' },
  { id: 'clasificar', icon: '🗂️', label: 'Por Clasificar' },
  { id: 'reportes',      icon: '📈', label: 'Reportes' },
  { id: 'configuracion', icon: '⚙️', label: 'Configuracion' },
]

function diasDesde(fecha: string | null) {
  if (!fecha) return 0
  const hoy = new Date()
  const f = new Date(fecha)
  return Math.floor((hoy.getTime() - f.getTime()) / (1000 * 60 * 60 * 24))
}

function diasVencidos(fechaVencimiento: string | null, estado: string) {
  if (!fechaVencimiento || estado === 'Pagado') return 0
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  const diff = Math.floor((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

function diasParaVencer(fechaVencimiento: string | null) {
  if (!fechaVencimiento) return null
  const hoy = new Date()
  const vence = new Date(fechaVencimiento)
  const diff = Math.floor((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}
function DocsporClasificar({ userId, supabase }: { userId: string, supabase: any }) {
  const [docs, setDocs] = useState<any[]>([])
const [cargando, setCargando] = useState(true)

useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('docs_por_clasificar')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      setDocs(data || [])
      setCargando(false)
    }
    cargar()
  }, [userId])

  const eliminar = async (id: number) => {
    await supabase.from('docs_por_clasificar').delete().eq('id', id)
    setDocs(docs.filter(d => d.id !== id))
  }

  if (cargando) return <p className="text-slate-500">Cargando...</p>
  if (docs.length === 0) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
      <p className="text-green-700 font-medium">✅ No hay documentos pendientes por clasificar</p>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-left">Archivo</th>
            <th className="px-4 py-3 text-left">Remitente</th>
            <th className="px-4 py-3 text-left">Razón</th>
            <th className="px-4 py-3 text-left">Categoría sugerida</th>
            <th className="px-4 py-3 text-left">Acción</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">{doc.fecha_correo || '-'}</td>
              <td className="px-4 py-3 font-medium text-slate-700">{doc.nombre_archivo || '-'}</td>
              <td className="px-4 py-3 text-slate-500">{doc.remitente || '-'}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{doc.razon || '-'}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                  {doc.categoria_sugerida || 'Desconocido'}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => eliminar(doc.id)}
                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function NominaRow({ n, supabase, user, setVisorNominaUrl, cargarNominaProgramada }: any) {
  const [expandido, setExpandido] = useState(false)
const generarDesprendible = () => {
  const html = `<html><head><title>Desprendible - ${n.nombre_empleado}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:40px;color:#333}
    h1{color:#059669;font-size:18px}
    h2{font-size:14px;color:#666;margin-top:20px;border-bottom:1px solid #eee;padding-bottom:6px}
    .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
    .total{font-weight:bold;border-top:2px solid #333;margin-top:8px;padding-top:8px;font-size:15px}
    .neto{color:#059669;font-size:18px;font-weight:bold}
    .header{display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:2px solid #059669;padding-bottom:10px}
    .firma{margin-top:60px;border-top:1px solid #333;width:200px;text-align:center;font-size:12px;color:#666}
  </style></head><body>
  <div class="header">
    <div><h1>SODEPORTC SAS</h1><p style="font-size:12px;color:#666;margin:0">NIT 901.183.507-5</p></div>
    <div style="text-align:right;font-size:12px;color:#666"><p><b>Desprendible de Pago</b></p></div>
  </div>
  <p><b>Empleado:</b> ${n.nombre_empleado}</p>
  <p><b>Cédula:</b> ${n.cedula} &nbsp;&nbsp; <b>Área:</b> ${n.area}</p>
  <h2>Devengados</h2>
  ${n.sueldo_base > 0 ? `<div class="row"><span>Sueldo Básico</span><span>$${n.sueldo_base?.toLocaleString()}</span></div>` : ''}
  ${n.auxilio_transporte > 0 ? `<div class="row"><span>Aux. Transporte</span><span>$${n.auxilio_transporte?.toLocaleString()}</span></div>` : ''}
  ${n.bonificaciones > 0 ? `<div class="row"><span>Bonificaciones</span><span>$${n.bonificaciones?.toLocaleString()}</span></div>` : ''}
  ${n.abono_prima > 0 ? `<div class="row"><span>Abono Prima</span><span>$${n.abono_prima?.toLocaleString()}</span></div>` : ''}
  ${n.saldo_anterior > 0 ? `<div class="row"><span>Saldo Anterior</span><span>$${n.saldo_anterior?.toLocaleString()}</span></div>` : ''}
  ${n.pension > 0 || n.salud > 0 ? '<h2>Deducciones</h2>' : ''}
  ${n.pension > 0 ? `<div class="row"><span>Pensión</span><span>-$${n.pension?.toLocaleString()}</span></div>` : ''}
  ${n.salud > 0 ? `<div class="row"><span>Salud</span><span>-$${n.salud?.toLocaleString()}</span></div>` : ''}
  <div class="row total"><span>NETO A PAGAR</span><span class="neto">$${n.neto_pagar?.toLocaleString()}</span></div>
  <div class="firma"><p style="margin-top:8px">Firma del Empleado</p></div>
  <script>window.print()</script>
  </body></html>`
  const w = window.open('', '_blank')
  w?.document.write(html)
  w?.document.close()
}
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandido(!expandido)}>
        <td className="py-2 text-slate-400 text-center">
          {expandido ? '▼' : '▶'}
        </td>
        <td className="py-2 font-medium text-slate-700">{n.nombre_empleado}</td>
        <td className="py-2 text-slate-500">{n.cedula}</td>
        <td className="py-2 text-right pr-4 font-semibold text-emerald-600">
          ${n.neto_pagar?.toLocaleString()}
        </td>
        <td className="py-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            n.estado === 'Pagado' ? 'bg-green-100 text-green-700' :
            n.estado === 'Revisar Valor' ? 'bg-orange-100 text-orange-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>{n.estado}</span>
        </td>
        <td className="py-2">
          {n.archivo_url && (
            <button onClick={(e) => { e.stopPropagation(); setVisorNominaUrl(n.archivo_url) }}
              className="text-blue-400 hover:text-blue-600">👁</button>
      <button
  onClick={(e) => { e.stopPropagation(); generarDesprendible(n) }}
  className="text-emerald-500 hover:text-emerald-700 text-xs ml-2"
  title="Generar Desprendible"
>📄</button>
        </td>
      </tr>
     {expandido && (
  <tr className="bg-slate-50 border-b">
    <td colSpan={6} className="px-8 py-4">
      <div className="grid grid-cols-2 gap-6 text-xs">

        {/* DEVENGADOS */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">💰 Devengados</p>
          <div className="space-y-2">
            {n.sueldo_base > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Sueldo Básico</span>
                <span className="font-medium">${n.sueldo_base?.toLocaleString()}</span>
              </div>
            )}
            {n.auxilio_transporte > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Aux. Transporte</span>
                <span className="font-medium">${n.auxilio_transporte?.toLocaleString()}</span>
              </div>
            )}
            {n.bonificaciones > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Bonificaciones / Descansos</span>
                <span className="font-medium">${n.bonificaciones?.toLocaleString()}</span>
              </div>
            )}
            {n.abono_prima > 0 && (
              <div className="flex justify-between">
                <span className="text-blue-500">Abono Prima</span>
                <span className="font-medium text-blue-600">${n.abono_prima?.toLocaleString()}</span>
              </div>
            )}
            {n.saldo_anterior > 0 && (
              <div className="flex justify-between">
                <span className="text-purple-500">Saldo Mes Anterior</span>
                <span className="font-medium text-purple-600">${n.saldo_anterior?.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-1">
              <span className="text-slate-500 font-medium">Total Devengado</span>
              <span className="font-semibold">
                ${((n.sueldo_base || 0) + (n.auxilio_transporte || 0) + (n.bonificaciones || 0) + (n.abono_prima || 0) + (n.saldo_anterior || 0)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* DEDUCCIONES Y NETO */}
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">➖ Deducciones</p>
            <div className="space-y-2">
              {n.pension > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Pensión (4%)</span>
                  <span className="font-medium text-red-500">-${n.pension?.toLocaleString()}</span>
                </div>
              )}
              {n.salud > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Salud (4%)</span>
                  <span className="font-medium text-red-500">-${n.salud?.toLocaleString()}</span>
                </div>
              )}
              {n.total_deducciones > 0 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-slate-500 font-medium">Total Deducciones</span>
                  <span className="font-semibold text-red-500">-${n.total_deducciones?.toLocaleString()}</span>
                </div>
              )}
              {!n.pension && !n.salud && (
                <p className="text-slate-400 italic">Sin deducciones registradas</p>
              )}
            </div>
          </div>

          {/* NETO FINAL */}
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700 uppercase tracking-wide text-xs">Neto a Pagar</span>
              <span className="font-bold text-emerald-600 text-base">${n.neto_pagar?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-400 text-xs">Área</span>
              <span className="text-slate-500 text-xs">{n.area}</span>
            </div>
          </div>
        </div>

      </div>
    </td>
  </tr>
)}
    </>
  )
}
export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [datosFact, setDatosFact] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [seccion, setSeccion] = useState('dashboard')
  const [filtroCobrarCliente, setFiltroCobrarCliente] = useState('')
  const [filtroCobrarEstado, setFiltroCobrarEstado] = useState('')
  const [filtroCobrarFecha, setFiltroCobrarFecha] = useState('')
  const [pagoModal, setPagoModal] = useState<any>(null)
  const [filtroPagarProveedor, setFiltroPagarProveedor] = useState('')
  const [filtroPagarEstado, setFiltroPagarEstado] = useState('')
  const [filtroPagarFecha, setFiltroPagarFecha] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null)
  const [clientesDB, setClientesDB] = useState<any[]>([])
  const [editandoCliente, setEditandoCliente] = useState(false)
  const [datosEditCliente, setDatosEditCliente] = useState<any>({})
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<string | null>(null)
  const [nominas, setNominas] = useState<any[]>([])
const [nominaForm, setNominaForm] = useState({ nombre_empleado: '', sueldo_pagado: '', ibc_pila: '', fecha_pago: '', notas: '' })
  const [nominaProgramada, setNominaProgramada] = useState<any[]>([])
const [cargandoExcel, setCargandoExcel] = useState(false)
const [mensajeExcel, setMensajeExcel] = useState('')
  const [procesandoConciliacion, setProcesandoConciliacion] = useState(false)
const [resultadosConciliacion, setResultadosConciliacion] = useState<any[]>([])
const [periodoConciliacion, setPeriodoConciliacion] = useState('MAYO 2026')
const [visorNominaUrl, setVisorNominaUrl] = useState<string | null>(null)
const [guardandoNomina, setGuardandoNomina] = useState(false)
const [mensajeNomina, setMensajeNomina] = useState('')
  const [facturaViewer, setFacturaViewer] = useState<any>(null)
const [archivoFile, setArchivoFile] = useState<File | null>(null)
const [filtroDoc, setFiltroDoc] = useState('todos')
  const [buscarDoc, setBuscarDoc] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstadoDoc, setFiltroEstadoDoc] = useState('')
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('')
  const [filtroFechaFin, setFiltroFechaFin] = useState('')
  const [filtroValorMin, setFiltroValorMin] = useState('')
  const [filtroValorMax, setFiltroValorMax] = useState('')
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else {
        setUser(data.user)
        cargarFacturas(data.user.id)
        cargarClientesDB(data.user.id)
        cargarNominas(data.user.id)
        cargarNominaProgramada(data.user.id)
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
  const cargarNominaProgramada = async (userId: string) => {
  const { data } = await supabase.from('nomina_programada').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (data) setNominaProgramada(data)
}
const normalizarNombre = (nombre: string) => 
  nombre?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').trim() || ''

const handleConciliacion = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || [])
  if (!files.length || !user) return
  setProcesandoConciliacion(true)
  setResultadosConciliacion([])
  const resultados: any[] = []

  for (const file of files) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
      const data = await res.json()
      const datos = data.datos || {}
      const nombrePDF = normalizarNombre(datos.proveedor || '')
      const valorPDF = parseFloat(datos.valor) || 0

      const { data: empleados } = await supabase
        .from('nomina_programada')
        .select('*')
        .eq('user_id', user.id)
      
      // Subir archivo a Storage
      let archivo_url = null
      const bytes = await file.arrayBuffer()
      const buffer = new Uint8Array(bytes)
      const path = `${user.id}/nomina/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('facturas').upload(path, buffer, { contentType: 'application/pdf' })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(path)
        archivo_url = urlData.publicUrl
      }

      // 1. Buscar por nombre (coincidencia parcial)
      const matchNombre = (empleados || []).find((emp: any) => {
  const nombreEmp = normalizarNombre(emp.nombre_empleado || '')
  const palabrasPDF = nombrePDF.split(' ').filter((p: string) => p.length > 2)
  return palabrasPDF.some((p: string) => nombreEmp.includes(p))
})

// Buscar por nombre alterno (ej: pago hecho por cónyuge)
let matchAlterno = null
if (!matchNombre) {
  console.log('🔍 Buscando alterno para:', nombrePDF.trim())
  const { data: alterno } = await supabase
    .from('nombres_alternos')
    .select('nombre_empleado')
    .ilike('nombre_alterno', nombrePDF.trim())
    .maybeSingle()
  console.log('📋 Resultado alterno:', alterno)
  if (alterno) {
    matchAlterno = (empleados || []).find((emp: any) =>
      normalizarNombre(emp.nombre_empleado || '').includes(
        normalizarNombre(alterno.nombre_empleado)
      )
    )
    console.log('👤 matchAlterno:', matchAlterno)
console.log('📊 empleados:', (empleados || []).map((e:any) => e.nombre_empleado))
  }
}
const match = matchNombre || matchAlterno

if (match) {
        const valorEmp = parseFloat(match.neto_pagar) || 0
        const diferencia = Math.abs(valorPDF - valorEmp)
        if (diferencia <= 2) {
          await supabase.from('nomina_programada').update({
            estado: 'Pagado',
            archivo_url,
          }).eq('id', match.id)
          resultados.push({ archivo: file.name, estado: 'pagado', mensaje: '✅ ' + match.nombre_empleado + ' — Pagado correctamente' })
        } else {
          await supabase.from('nomina_programada').update({
            estado: 'Revisar Valor',
            archivo_url,
          }).eq('id', match.id)
          resultados.push({ archivo: file.name, estado: 'revisar', mensaje: '🟠 ' + match.nombre_empleado + ' — Revisar valor: PDF $' + valorPDF.toLocaleString() + ' vs Nómina $' + valorEmp.toLocaleString() })
        }
      } else {
        // 2. Buscar por valor (+/- $2)
        const matchesValor = (empleados || []).filter((emp: any) => {
          const valorEmp = parseFloat(emp.neto_pagar) || 0
          return Math.abs(valorPDF - valorEmp) <= 2
        })

        if (matchesValor.length === 1) {
          await supabase.from('nomina_programada').update({
            estado: 'Pagado',
            archivo_url,
            notas: `Pago recibido a nombre de: ${datos.proveedor || 'sin nombre'}`
          }).eq('id', matchesValor[0].id)
          resultados.push({ archivo: file.name, estado: 'pagado', mensaje: '✅ ' + matchesValor[0].nombre_empleado + ' — Pagado (coincidencia por valor $' + valorPDF.toLocaleString() + '). Nombre en PDF: ' + (datos.proveedor || 'sin nombre') })
        } else if (matchesValor.length > 1) {
          for (const emp of matchesValor) {
            await supabase.from('nomina_programada').update({
              estado: 'Confirmar Beneficiario',
              archivo_url,
              notas: `Confirmar: PDF a nombre de ${datos.proveedor || 'sin nombre'} por $${valorPDF.toLocaleString()}`
            }).eq('id', emp.id)
          }
          const nombres = matchesValor.map((e: any) => e.nombre_empleado).join(', ')
          resultados.push({ archivo: file.name, estado: 'revisar', mensaje: '🟠 Confirmar beneficiario — Varios empleados con valor $' + valorPDF.toLocaleString() + ': ' + nombres })
        } else {
          resultados.push({ archivo: file.name, estado: 'no_encontrado', mensaje: '⚠️ Comprobante no reconocido — Nombre: ' + (datos.proveedor || 'sin nombre') + ' | Valor: $' + valorPDF.toLocaleString() })
        }
      }
    } catch {
      resultados.push({ archivo: file.name, estado: 'error', mensaje: '❌ Error procesando: ' + file.name })
    }
  }
  setResultadosConciliacion(resultados)
  cargarNominaProgramada(user.id)
  setProcesandoConciliacion(false)
}
const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || !user) return
  setCargandoExcel(true)
  setMensajeExcel('Leyendo Excel...')
  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const dataRows = rows.filter((r: any[]) => 
  r[2] && 
  typeof r[2] === 'string' && 
  r[2].trim().length > 3 &&
  r[2].trim().toLowerCase() !== 'nombre del empleado'
)
    const registros = dataRows.map((r: any[]) => ({
      user_id: user.id,
      nombre_empleado: r[2] || '',
      cedula: String(r[3] || ''),
      area: r[4] || '',
      sueldo_base: parseFloat(r[5]) || 0,
      auxilio_transporte: parseFloat(r[6]) || 0,
      dias_trabajados: parseFloat(r[7]) || 0,
      bonificaciones: parseFloat(r[10]) || 0,
      total_devengado: parseFloat(r[11]) || 0,
      prima: parseFloat(r[14]) || 0,
      abono_prima: parseFloat(r[15]) || 0,
      vacaciones: parseFloat(r[16]) || 0,
      prestamo: parseFloat(r[12]) || 0,
      descuento: parseFloat(r[13]) || 0,
      pension: parseFloat(r[19]) || 0,
      salud: parseFloat(r[20]) || 0,
      total_deducciones: parseFloat(r[21]) || 0,
     neto_pagar: parseFloat(r[22]) || 0,
      observaciones: r[23] || '',
      estado: 'Pendiente de Pago',
      fecha_carga: new Date().toISOString().slice(0, 10),
    }))
    const { error } = await supabase.from('nomina_programada').insert(registros)
    if (error) {
      setMensajeExcel('Error guardando: ' + error.message)
    } else {
      setMensajeExcel(`✅ ${registros.length} empleados cargados correctamente`)
      cargarNominaProgramada(user.id)
    }
  } catch (err) {
    setMensajeExcel('Error leyendo el Excel. Verifica el formato.')
  }
  setCargandoExcel(false)
}
    const cargarNominas = async (userId: string) => {
  const { data } = await supabase.from('NOMINA').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (data) setNominas(data)
}
  const cargarClientesDB = async (userId: string) => {
    const { data } = await supabase.from('clientes').select('*').eq('user_id', userId)
    if (data) setClientesDB(data)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivoFile(file)
    setLoading(true)
    setMensaje('La IA esta leyendo y clasificando tu documento...')
    setDatosFact(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setDatosFact(data.datos)
        setMensaje('Documento leido y clasificado correctamente')
      } else {
        setMensaje('Error: ' + data.error)
      }
    } catch {
      setMensaje('Error procesando el archivo')
    }
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('Seguro que deseas eliminar este documento?')) return
    await supabase.from('facturas').delete().eq('id', id)
    cargarFacturas(user.id)
  }

  const handleEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from('facturas').update({ estado: nuevoEstado }).eq('id', id)
    cargarFacturas(user.id)
  }

 const handleGuardar = async () => {
  if (!datosFact || !user) return
  setGuardando(true)
  // Verificar duplicado
// Verificar duplicado por numero_factura
if (datosFact.numero_factura) {
  const { data: dupNumero } = await supabase
    .from('facturas')
    .select('id')
    .eq('user_id', user.id)
    .eq('numero_factura', datosFact.numero_factura)
    .maybeSingle()

  if (dupNumero) {
    setMensaje('⚠️ Ya existe una factura con el número ' + datosFact.numero_factura + '. No se guardó para evitar duplicados.')
    setGuardando(false)
    return
  }
}

// Verificar duplicado por proveedor + fecha + valor
const { data: duplicado } = await supabase
  .from('facturas')
  .select('id')
  .eq('user_id', user.id)
  .eq('proveedor', datosFact.proveedor)
  .eq('valor', datosFact.valor)
  .eq('fecha', datosFact.fecha)
  .maybeSingle()

if (duplicado) {
  setMensaje('⚠️ Este documento ya existe en ContaBot. No se guardó para evitar duplicados.')
  setGuardando(false)
  return
}
  let archivo_url = null
  if (archivoFile) {
    const ext = archivoFile.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('facturas')
      .upload(path, archivoFile)
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(path)
      archivo_url = urlData.publicUrl
    }
  }
  const { error } = await supabase.from('facturas').insert({
    user_id: user.id,
    proveedor: datosFact.proveedor,
    fecha: datosFact.fecha,
    valor: datosFact.valor,
    iva: datosFact.iva,
    descripcion: datosFact.descripcion,
    tipo: datosFact.tipo,
    categoria: datosFact.categoria,
    estado: 'Pendiente',
    archivo_url,
    tipo_documento: datosFact.tipo_documento || null,
    combustible: datosFact.combustible || null,
    cuenta_puc: datosFact.cuenta_puc || null,
    alerta: datosFact.alerta || null,
  })
  if (error) {
    setMensaje('Error guardando: ' + error.message)
  } else {
    setMensaje('Documento guardado correctamente')
    setDatosFact(null)
    setArchivoFile(null)
    cargarFacturas(user.id)
  }
  setGuardando(false)
}
  const handleGuardarNomina = async () => {
  if (!user || !nominaForm.nombre_empleado || !nominaForm.sueldo_pagado) return
  setGuardandoNomina(true)
  const sueldo = parseFloat(nominaForm.sueldo_pagado)
  const ibc = parseFloat(nominaForm.ibc_pila || '0')
  const diferencia = sueldo - ibc
  const { error } = await supabase.from('NOMINA').insert({
    user_id: user.id,
    nombre_empleado: nominaForm.nombre_empleado,
    sueldo_pagado: sueldo,
    ibc_pila: ibc,
    diferencia,
    fecha_pago: nominaForm.fecha_pago,
    notas: nominaForm.notas,
  })
  if (error) {
    setMensajeNomina('Error: ' + error.message)
  } else {
    setMensajeNomina('Pago de nomina guardado correctamente')
    setNominaForm({ nombre_empleado: '', sueldo_pagado: '', ibc_pila: '', fecha_pago: '', notas: '' })
    cargarNominas(user.id)
  }
  setGuardandoNomina(false)
}
  const handleRegistrarPago = async () => {
    if (!pagoModal) return
    await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', pagoModal.id)
    setPagoModal(null)
    cargarFacturas(user.id)
  }

  const abrirCliente = (nombre: string) => {
    const clienteDB = clientesDB.find((c: any) => c.nombre === nombre)
    setDatosEditCliente(clienteDB || {})
    setClienteSeleccionado(nombre)
    setEditandoCliente(false)
  }

  const guardarCliente = async (nombre: string) => {
    const clienteExistente = clientesDB.find((c: any) => c.nombre === nombre)
    if (clienteExistente) {
      await supabase.from('clientes').update(datosEditCliente).eq('id', clienteExistente.id)
    } else {
      await supabase.from('clientes').insert({ ...datosEditCliente, nombre, user_id: user.id })
    }
    setEditandoCliente(false)
    cargarClientesDB(user.id)
  }
const generarDesprendible = (n: any) => {
    const html = `<html><head><title>Desprendible - ${n.nombre_empleado}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{color:#059669;font-size:18px}h2{font-size:14px;color:#666;margin-top:20px;border-bottom:1px solid #eee;padding-bottom:6px}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}.total{font-weight:bold;border-top:2px solid #333;margin-top:8px;padding-top:8px;font-size:15px}.neto{color:#059669;font-size:18px;font-weight:bold}.firma{margin-top:60px;border-top:1px solid #333;width:200px;text-align:center;font-size:12px;color:#666}.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:2px solid #059669;padding-bottom:10px}</style></head><body>
    <div class="header"><div><h1>SODEPORTC SAS</h1><p style="font-size:12px;color:#666;margin:0">NIT 901.183.507-5</p></div><div style="text-align:right;font-size:12px;color:#666"><p><b>Desprendible de Pago</b></p><p>${new Date().toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</p></div></div>
    <p><b>Empleado:</b> ${n.nombre_empleado}</p>
    <p><b>Cédula:</b> ${n.cedula} &nbsp;&nbsp; <b>Área:</b> ${n.area}</p>
    <h2>💰 Devengados</h2>
    ${n.sueldo_base>0?'<div class="row"><span>Sueldo Básico</span><span>$'+n.sueldo_base?.toLocaleString()+'</span></div>':''}
    ${n.auxilio_transporte>0?'<div class="row"><span>Aux. Transporte</span><span>$'+n.auxilio_transporte?.toLocaleString()+'</span></div>':''}
    ${n.bonificaciones>0?'<div class="row"><span>Bonificaciones</span><span>$'+n.bonificaciones?.toLocaleString()+'</span></div>':''}
    ${n.abono_prima>0?'<div class="row"><span>Abono Prima</span><span>$'+n.abono_prima?.toLocaleString()+'</span></div>':''}
    ${n.saldo_anterior>0?'<div class="row"><span>Saldo Mes Anterior</span><span>$'+n.saldo_anterior?.toLocaleString()+'</span></div>':''}
    ${n.pension>0||n.salud>0?'<h2>➖ Deducciones</h2>':''}
    ${n.pension>0?'<div class="row"><span>Pensión (4%)</span><span>-$'+n.pension?.toLocaleString()+'</span></div>':''}
    ${n.salud>0?'<div class="row"><span>Salud (4%)</span><span>-$'+n.salud?.toLocaleString()+'</span></div>':''}
    <div class="row total"><span>NETO A PAGAR</span><span class="neto">$${n.neto_pagar?.toLocaleString()}</span></div>
    <div class="firma"><p style="margin-top:8px">Firma del Empleado</p></div>
    <script>window.print()</script></body></html>`
    const win = window.open('', '_blank')
    win?.document.write(html)
    win?.document.close()
  }
  const totalIngresos = facturas.filter(f => f.categoria === 'Factura de Venta').reduce((a, b) => a + (b.valor || 0), 0)
  const totalGastos = facturas.filter(f => ['Factura de Compra', 'Gasto', 'Nomina'].includes(f.categoria)).reduce((a, b) => a + (b.valor || 0), 0)
  const cuentasPorCobrar = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)
  const cuentasPorPagar = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Pendiente').reduce((a, b) => a + (b.valor || 0), 0)

  const facturasCobrar = facturas.filter(f => {
    if (f.categoria !== 'Factura de Venta') return false
    if (filtroCobrarCliente && !f.proveedor?.toLowerCase().includes(filtroCobrarCliente.toLowerCase())) return false
    if (filtroCobrarEstado && f.estado !== filtroCobrarEstado) return false
    if (filtroCobrarFecha && f.fecha < filtroCobrarFecha) return false
    return true
  })

  const facturasPagar = facturas.filter(f => {
    if (!['Factura de Compra', 'Gasto'].includes(f.categoria)) return false
    if (filtroPagarProveedor && !f.proveedor?.toLowerCase().includes(filtroPagarProveedor.toLowerCase())) return false
    if (filtroPagarEstado && f.estado !== filtroPagarEstado) return false
    if (filtroPagarFecha && f.fecha < filtroPagarFecha) return false
    return true
  })

  const clientesAgrupados = Object.values(
    facturas
      .filter(f => f.categoria === 'Factura de Venta')
      .reduce((acc: any, f) => {
        const nombre = f.proveedor || 'Sin nombre'
        if (!acc[nombre]) {
          acc[nombre] = { nombre, cantidadFacturas: 0, totalFacturado: 0, totalPendiente: 0, ultimaFactura: f.fecha, facturas: [] }
        }
        acc[nombre].cantidadFacturas++
        acc[nombre].totalFacturado += f.valor || 0
        if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
        if (f.fecha > acc[nombre].ultimaFactura) acc[nombre].ultimaFactura = f.fecha
        acc[nombre].facturas.push(f)
        return acc
      }, {})
  ).map((c: any) => {
    const clienteDB = clientesDB.find((db: any) => db.nombre === c.nombre)
    const tieneVencidas = c.facturas.some((f: any) => f.estado === 'Vencido')
    const tienePendientes = c.facturas.some((f: any) => f.estado === 'Pendiente')
    const estadoCartera = tieneVencidas ? 'Vencida' : tienePendientes ? 'Pendiente' : 'Al dia'
    return { ...c, ...(clienteDB || {}), estadoCartera }
  }) as any[]

  const proveedoresAgrupados = Object.values(
    facturas
      .filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria))
      .reduce((acc: any, f) => {
        const nombre = f.proveedor || 'Sin nombre'
        if (!acc[nombre]) {
          acc[nombre] = { nombre, cantidadDocumentos: 0, totalComprado: 0, totalPendiente: 0, ultimoDocumento: f.fecha, documentos: [] }
        }
        acc[nombre].cantidadDocumentos++
        acc[nombre].totalComprado += f.valor || 0
        if (f.estado === 'Pendiente' || f.estado === 'Vencido') acc[nombre].totalPendiente += f.valor || 0
        if (f.fecha > acc[nombre].ultimoDocumento) acc[nombre].ultimoDocumento = f.fecha
        acc[nombre].documentos.push(f)
        return acc
      }, {})
  ) as any[]

  // ALERTAS
  const hoy = new Date()
  const cobrarVencidas = facturas.filter(f => f.categoria === 'Factura de Venta' && f.estado === 'Vencido')
  const cobrarProximas = facturas.filter(f => {
    if (f.categoria !== 'Factura de Venta' || f.estado === 'Pagado') return false
    const dias = diasParaVencer(f.fecha_vencimiento)
    return dias !== null && dias >= 0 && dias <= 7
  })
  const pagarVencidas = facturas.filter(f => ['Factura de Compra', 'Gasto'].includes(f.categoria) && f.estado === 'Vencido')
  const pagarProximas = facturas.filter(f => {
    if (!['Factura de Compra', 'Gasto'].includes(f.categoria) || f.estado === 'Pagado') return false
    const dias = diasParaVencer(f.fecha_vencimiento)
    return dias !== null && dias >= 0 && dias <= 7
  })
  const docHoy = facturas.filter(f => {
    const fechaDoc = new Date(f.created_at)
    return fechaDoc.toDateString() === hoy.toDateString()
  })
  const totalAlertas = cobrarVencidas.length + cobrarProximas.length + pagarVencidas.length + pagarProximas.length
const facturasFiltradas = facturas.filter(f => {
    const matchFiltro = filtroDoc === 'todos' ? true :
      filtroDoc === 'Pendiente' || filtroDoc === 'Pagado' || filtroDoc === 'Vencido'
        ? f.estado === filtroDoc
        : f.categoria === filtroDoc
    const buscar = buscarDoc.toLowerCase()
    const matchBuscar = !buscarDoc ||
      f.proveedor?.toLowerCase().includes(buscar) ||
      f.numero_factura?.toLowerCase().includes(buscar) ||
      f.descripcion?.toLowerCase().includes(buscar)
    const matchTipo = !filtroTipo || f.categoria === filtroTipo
    const matchEstado = !filtroEstadoDoc || f.estado === filtroEstadoDoc
    const matchFechaInicio = !filtroFechaInicio || f.fecha >= filtroFechaInicio
    const matchFechaFin = !filtroFechaFin || f.fecha <= filtroFechaFin
    const matchValorMin = !filtroValorMin || (f.valor || 0) >= parseFloat(filtroValorMin)
    const matchValorMax = !filtroValorMax || (f.valor || 0) <= parseFloat(filtroValorMax)
    return matchFiltro && matchBuscar && matchTipo && matchEstado && matchFechaInicio && matchFechaFin && matchValorMin && matchValorMax
  })
  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )
const generarDesprendible = (n: any) => {
  const html = `<html><head><title>Desprendible - ${n.nombre_empleado}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
      h1 { color: #059669; font-size: 18px; }
      h2 { font-size: 14px; color: #666; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
      .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .total { font-weight: bold; border-top: 2px solid #333; margin-top: 8px; padding-top: 8px; font-size: 15px; }
      .neto { color: #059669; font-size: 18px; font-weight: bold; }
      .firma { margin-top: 60px; border-top: 1px solid #333; width: 200px; text-align: center; font-size: 12px; color: #666; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #059669; padding-bottom: 10px; }
    </style></head><body>
    <div class="header">
      <div><h1>SODEPORTC SAS</h1><p style="font-size:12px;color:#666;margin:0">NIT 901.183.507-5</p></div>
      <div style="text-align:right;font-size:12px;color:#666">
        <p><b>Desprendible de Pago</b></p>
        <p>${new Date().toLocaleDateString('es-CO', {month:'long', year:'numeric'})}</p>
      </div>
    </div>
    <p><b>Empleado:</b> ${n.nombre_empleado}</p>
    <p><b>Cédula:</b> ${n.cedula} &nbsp;&nbsp; <b>Área:</b> ${n.area}</p>
    <h2>💰 Devengados</h2>
    ${n.sueldo_base > 0 ? '<div class="row"><span>Sueldo Básico</span><span>$' + n.sueldo_base?.toLocaleString() + '</span></div>' : ''}
    ${n.auxilio_transporte > 0 ? '<div class="row"><span>Aux. Transporte</span><span>$' + n.auxilio_transporte?.toLocaleString() + '</span></div>' : ''}
    ${n.bonificaciones > 0 ? '<div class="row"><span>Bonificaciones / Descansos</span><span>$' + n.bonificaciones?.toLocaleString() + '</span></div>' : ''}
    ${n.abono_prima > 0 ? '<div class="row"><span>Abono Prima</span><span>$' + n.abono_prima?.toLocaleString() + '</span></div>' : ''}
    ${n.saldo_anterior > 0 ? '<div class="row"><span>Saldo Mes Anterior</span><span>$' + n.saldo_anterior?.toLocaleString() + '</span></div>' : ''}
    ${n.pension > 0 || n.salud > 0 ? '<h2>➖ Deducciones</h2>' : ''}
    ${n.pension > 0 ? '<div class="row"><span>Pensión (4%)</span><span>-$' + n.pension?.toLocaleString() + '</span></div>' : ''}
    ${n.salud > 0 ? '<div class="row"><span>Salud (4%)</span><span>-$' + n.salud?.toLocaleString() + '</span></div>' : ''}
    <div class="row total"><span>NETO A PAGAR</span><span class="neto">$${n.neto_pagar?.toLocaleString()}</span></div>
    <div class="firma"><p style="margin-top:8px">Firma del Empleado</p></div>
    <script>window.print()</script>
    </body></html>`
  const win = window.open('', '_blank')
  win?.document.write(html)
  win?.document.close()
}
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-sm">📊</div>
            <div>
              <h1 className="font-bold text-white text-sm">ContaBot</h1>
              <p className="text-slate-400 text-xs">Auxiliar Contable IA</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => (
            <button key={item.id} onClick={() => setSeccion(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                seccion === item.id ? 'bg-emerald-500 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}>
              <span>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'alertas' && totalAlertas > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{totalAlertas}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-xs">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <p className="text-xs text-white truncate flex-1">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors">
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8">

        {seccion === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-emerald-500">
                <p className="text-slate-500 text-sm">Ingresos del mes</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">${totalIngresos.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-red-500">
                <p className="text-slate-500 text-sm">Gastos del mes</p>
                <p className="text-2xl font-bold text-red-600 mt-1">${totalGastos.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
                <p className="text-slate-500 text-sm">Caja disponible</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">${(totalIngresos - totalGastos).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-yellow-500">
                <p className="text-slate-500 text-sm">Documentos</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">{facturas.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-green-400 cursor-pointer hover:shadow-md" onClick={() => setSeccion('cobrar')}>
                <p className="text-slate-500 text-sm">Cuentas por Cobrar</p>
                <p className="text-xs text-slate-400 mb-1">Facturas de Venta pendientes</p>
                <p className="text-2xl font-bold text-green-600 mt-1">${cuentasPorCobrar.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-orange-400 cursor-pointer hover:shadow-md" onClick={() => setSeccion('pagar')}>
                <p className="text-slate-500 text-sm">Cuentas por Pagar</p>
                <p className="text-xs text-slate-400 mb-1">Compras y Gastos pendientes</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">${cuentasPorPagar.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-red-400 cursor-pointer hover:shadow-md md:col-span-3" onClick={() => setSeccion('alertas')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-sm">Alertas Activas</p>
                    <p className="text-xs text-slate-400 mb-1">Facturas vencidas y proximas a vencer</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{totalAlertas} alertas pendientes</p>
                  </div>
                  <span className="text-4xl">⚠️</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {(seccion === 'documentos' || seccion === 'revision') && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">{seccion === 'revision' ? 'Revision IA' : 'Documentos'}</h2>

            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Subir Documento</h3>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                <p className="text-4xl mb-3">📁</p>
                <p className="text-slate-600 mb-2">Selecciona tu documento - La IA lo leera y clasificara automaticamente</p>
                <p className="text-slate-400 text-sm mb-4">JPG, PNG, PDF - maximo 5MB</p>
                <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl transition-colors">
                  {loading ? 'Procesando...' : 'Seleccionar archivo'}
                  <input type="file" accept="image/*,application/pdf" onChange={handleArchivo} className="hidden" disabled={loading} />
                </label>
              </div>
              {mensaje && <div className="mt-4 p-4 bg-slate-50 rounded-xl"><p className="text-slate-700">{mensaje}</p></div>}
              {datosFact && (
                <div className="mt-4 p-6 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-emerald-800">Datos extraidos por IA:</h3>
                    {datosFact.categoria && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${categoriaConfig[datosFact.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {datosFact.categoria}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-slate-500">Cliente/Proveedor</p><p className="font-medium text-slate-900">{datosFact.proveedor}</p></div>
                    <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium text-slate-900">{datosFact.fecha}</p></div>
                    <div><p className="text-xs text-slate-500">Valor</p><p className="font-medium text-emerald-700">${datosFact.valor?.toLocaleString()}</p></div>
                    <div><p className="text-xs text-slate-500">IVA</p><p className="font-medium text-slate-900">${datosFact.iva?.toLocaleString()}</p></div>
                    <div className="col-span-2"><p className="text-xs text-slate-500">Descripcion</p><p className="font-medium text-slate-900">{datosFact.descripcion}</p></div>
                    <div><p className="text-xs text-slate-500">Tipo Documento</p><p className="font-medium text-slate-900">{datosFact.tipo_documento || datosFact.tipo}</p></div>
{datosFact.combustible && <div><p className="text-xs text-slate-500">Combustible</p><p className="font-medium text-slate-900">⛽ {datosFact.combustible}</p></div>}
{datosFact.cuenta_puc && <div className="col-span-2"><p className="text-xs text-slate-500">Cuenta PUC</p><p className="font-medium text-slate-900">📒 {datosFact.cuenta_puc}</p></div>}
{datosFact.alerta && <div className="col-span-2 bg-yellow-50 border border-yellow-300 rounded-xl p-3"><p className="text-yellow-800 text-sm font-medium">{datosFact.alerta}</p></div>}
                  </div>
                  <button onClick={handleGuardar} disabled={guardando}
                    className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white py-2 rounded-xl font-medium">
                    {guardando ? 'Guardando...' : 'Guardar en ContaBot'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
             <div className="space-y-4 mb-6">
                <input
                  type="text"
                  placeholder="Buscar por cliente, proveedor, numero de factura o descripcion..."
                  value={buscarDoc}
                  onChange={(e) => setBuscarDoc(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">Tipo de documento</option>
                    <option value="Factura de Venta">Factura de Venta</option>
                    <option value="Factura de Compra">Factura de Compra</option>
                    <option value="Gasto">Gasto</option>
                    <option value="Nomina">Nomina</option>
                    <option value="Extracto Bancario">Extracto Bancario</option>
                    <option value="Documento Tributario">Documento Tributario</option>
                  </select>
                  <select value={filtroEstadoDoc} onChange={(e) => setFiltroEstadoDoc(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">Todos los estados</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pagado">Pagado</option>
                    <option value="Vencido">Vencido</option>
                  </select>
                  <button
                    onClick={() => { setBuscarDoc(''); setFiltroTipo(''); setFiltroEstadoDoc(''); setFiltroFechaInicio(''); setFiltroFechaFin(''); setFiltroValorMin(''); setFiltroValorMax(''); setFiltroDoc('todos') }}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">
                    Limpiar filtros
                  </button>
                  <input type="date" value={filtroFechaInicio} onChange={(e) => setFiltroFechaInicio(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="date" value={filtroFechaFin} onChange={(e) => setFiltroFechaFin(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Valor min" value={filtroValorMin} onChange={(e) => setFiltroValorMin(e.target.value)}
                      className="w-1/2 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" placeholder="Valor max" value={filtroValorMax} onChange={(e) => setFiltroValorMax(e.target.value)}
                      className="w-1/2 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { key: 'todos', label: 'Todos', count: facturas.length },
                  { key: 'Factura de Venta', label: 'Ventas', count: facturas.filter(f => f.categoria === 'Factura de Venta').length },
                  { key: 'Factura de Compra', label: 'Compras', count: facturas.filter(f => f.categoria === 'Factura de Compra').length },
                  { key: 'Gasto', label: 'Gastos', count: facturas.filter(f => f.categoria === 'Gasto').length },
                  { key: 'Pendiente', label: 'Pendientes', count: facturas.filter(f => f.estado === 'Pendiente').length },
                  { key: 'Pagado', label: 'Pagados', count: facturas.filter(f => f.estado === 'Pagado').length },
                  { key: 'Vencido', label: 'Vencidos', count: facturas.filter(f => f.estado === 'Vencido').length },
                ].map((filtro) => (
                  <button
                    key={filtro.key}
                    onClick={() => setFiltroDoc(filtro.key)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      filtroDoc === filtro.key
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filtro.label} ({filtro.count})
                  </button>
                ))}
              </div>

              {facturasFiltradas.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p className="text-4xl mb-3">📭</p><p>No hay documentos que coincidan.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Fecha</th>
                      <th className="pb-2">Cliente/Proveedor</th>
                      <th className="pb-2">Tipo</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Estado</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasFiltradas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 text-slate-500">{f.fecha}</td>
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                            {f.categoria || f.tipo}
                          </span>
                        </td>
                        <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <select value={f.estado || 'Pendiente'} onChange={(e) => handleEstado(f.id, e.target.value)}
                            className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Pagado">Pagado</option>
                            <option value="Vencido">Vencido</option>
                          </select>
                        </td>
                        <td className="py-3 flex items-center gap-2">
  {f.archivo_url && (
    <button onClick={() => setFacturaViewer(f)}
      className="text-blue-400 hover:text-blue-600 text-xs">👁</button>
  )}
  <button onClick={() => handleEliminar(f.id)}
    className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'cobrar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Cobrar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-green-400">
              <p className="text-slate-500 text-sm">Total pendiente por cobrar</p>
              <p className="text-3xl font-bold text-green-600 mt-1">${cuentasPorCobrar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder="Buscar por cliente..." value={filtroCobrarCliente}
                  onChange={(e) => setFiltroCobrarCliente(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <select value={filtroCobrarEstado} onChange={(e) => setFiltroCobrarEstado(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Todos los estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Vencido">Vencido</option>
                </select>
                <input type="date" value={filtroCobrarFecha} onChange={(e) => setFiltroCobrarFecha(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {facturasCobrar.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p className="text-4xl mb-3">📭</p><p>No hay facturas que coincidan.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Cliente</th>
                      <th className="pb-2">No. Factura</th>
                      <th className="pb-2">Fecha Factura</th>
                      <th className="pb-2">Fecha Vencimiento</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Estado</th>
                      <th className="pb-2">Dias Vencidos</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasCobrar.map((f) => {
                      const dias = diasVencidos(f.fecha_vencimiento, f.estado)
                      return (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{f.proveedor}</td>
                          <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                          <td className="py-3 text-slate-500">{f.fecha}</td>
                          <td className="py-3 text-slate-500">{f.fecha_vencimiento || '-'}</td>
                          <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                              {f.estado || 'Pendiente'}
                            </span>
                          </td>
                          <td className="py-3">
                            {dias > 0 ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{dias} dias</span>
                            ) : (
                              <span className="text-slate-400 text-xs">Al dia</span>
                            )}
                          </td>
                          <td className="py-3">
                            {f.estado !== 'Pagado' && (
                              <button onClick={() => setPagoModal(f)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1 rounded-lg">
                                Registrar pago
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'pagar' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Cuentas por Pagar</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 border-l-4 border-orange-400">
              <p className="text-slate-500 text-sm">Total pendiente por pagar</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">${cuentasPorPagar.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder="Buscar por proveedor..." value={filtroPagarProveedor}
                  onChange={(e) => setFiltroPagarProveedor(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <select value={filtroPagarEstado} onChange={(e) => setFiltroPagarEstado(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Todos los estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Vencido">Vencido</option>
                </select>
                <input type="date" value={filtroPagarFecha} onChange={(e) => setFiltroPagarFecha(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {facturasPagar.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><p className="text-4xl mb-3">📭</p><p>No hay facturas que coincidan.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Proveedor</th>
                      <th className="pb-2">No. Factura</th>
                      <th className="pb-2">Fecha Factura</th>
                      <th className="pb-2">Fecha Vencimiento</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2">Estado</th>
                      <th className="pb-2">Dias Vencidos</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasPagar.map((f) => {
                      const dias = diasVencidos(f.fecha_vencimiento, f.estado)
                      return (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{f.proveedor}</td>
                          <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                          <td className="py-3 text-slate-500">{f.fecha}</td>
                          <td className="py-3 text-slate-500">{f.fecha_vencimiento || '-'}</td>
                          <td className="py-3 text-orange-600 font-medium">${f.valor?.toLocaleString()}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                              {f.categoria}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                              {f.estado || 'Pendiente'}
                            </span>
                          </td>
                          <td className="py-3">
                            {dias > 0 ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{dias} dias</span>
                            ) : (
                              <span className="text-slate-400 text-xs">Al dia</span>
                            )}
                          </td>
                          <td className="py-3">
                            {f.estado !== 'Pagado' && (
                              <button onClick={() => setPagoModal(f)}
                                className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 rounded-lg">
                                Registrar pago
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {seccion === 'alertas' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Centro de Alertas</h2>
            <p className="text-slate-500 text-sm mb-6">Seguimiento automatico generado por ContaBot</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-red-50 rounded-2xl p-5 border border-red-200">
                <p className="text-red-600 text-xs font-medium">Cobros Vencidos</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{cobrarVencidas.length}</p>
              </div>
              <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-200">
                <p className="text-yellow-600 text-xs font-medium">Cobros Proximos</p>
                <p className="text-2xl font-bold text-yellow-700 mt-1">{cobrarProximas.length}</p>
              </div>
              <div className="bg-orange-50 rounded-2xl p-5 border border-orange-200">
                <p className="text-orange-600 text-xs font-medium">Pagos Vencidos</p>
                <p className="text-2xl font-bold text-orange-700 mt-1">{pagarVencidas.length}</p>
              </div>
              <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200">
                <p className="text-blue-600 text-xs font-medium">Docs Hoy</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{docHoy.length}</p>
              </div>
            </div>

            {cobrarVencidas.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-red-500">
                <h3 className="text-lg font-semibold text-red-700 mb-4">Facturas de Venta Vencidas</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Cliente</th>
                      <th className="pb-2">No. Factura</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Dias Vencido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobrarVencidas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-red-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                        <td className="py-3 text-red-600 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            {diasDesde(f.fecha_vencimiento || f.fecha)} dias
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {cobrarProximas.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-yellow-700 mb-4">Facturas de Venta Proximas a Vencer (7 dias)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Cliente</th>
                      <th className="pb-2">No. Factura</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Vence en</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobrarProximas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-yellow-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                        <td className="py-3 text-yellow-600 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            {diasParaVencer(f.fecha_vencimiento)} dias
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pagarVencidas.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-orange-500">
                <h3 className="text-lg font-semibold text-orange-700 mb-4">Facturas de Compra/Gastos Vencidos</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Proveedor</th>
                      <th className="pb-2">No. Documento</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Dias Vencido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagarVencidas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-orange-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                        <td className="py-3 text-orange-600 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            {diasDesde(f.fecha_vencimiento || f.fecha)} dias
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pagarProximas.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-yellow-400">
                <h3 className="text-lg font-semibold text-yellow-700 mb-4">Pagos Proximos a Vencer (7 dias)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Proveedor</th>
                      <th className="pb-2">No. Documento</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Vence en</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagarProximas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-yellow-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                        <td className="py-3 text-yellow-600 font-medium">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            {diasParaVencer(f.fecha_vencimiento)} dias
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {docHoy.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold text-blue-700 mb-4">Documentos Procesados Hoy ({docHoy.length})</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Cliente/Proveedor</th>
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docHoy.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-blue-50">
                        <td className="py-3 font-medium">{f.proveedor}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoriaConfig[f.categoria]?.color || 'bg-gray-100 text-gray-700'}`}>
                            {f.categoria}
                          </span>
                        </td>
                        <td className="py-3 font-medium text-slate-700">${f.valor?.toLocaleString()}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                            {f.estado || 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalAlertas === 0 && docHoy.length === 0 && (
              <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
                <p className="text-5xl mb-4">✅</p>
                <p className="text-lg font-medium text-emerald-600">Todo al dia</p>
                <p className="text-sm mt-2">No hay alertas pendientes en este momento</p>
              </div>
            )}
          </div>
        )}

        {seccion === 'clientes' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Clientes</h2>
            {!clienteSeleccionado ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <p className="text-slate-500 text-sm mb-4">Clientes generados automaticamente desde Facturas de Venta</p>
                {clientesAgrupados.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <p className="text-4xl mb-3">👥</p>
                    <p>No hay clientes aun. Sube facturas de venta para verlos aqui.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="pb-2">Cliente</th>
                        <th className="pb-2">Pendiente por Cobrar</th>
                        <th className="pb-2">Ultima Factura</th>
                        <th className="pb-2">Estado Cartera</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientesAgrupados.map((c) => (
                        <tr key={c.nombre} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{c.nombre}</td>
                          <td className="py-3">
                            <span className={`font-medium ${c.totalPendiente > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                              ${c.totalPendiente.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 text-slate-500">{c.ultimaFactura}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              c.estadoCartera === 'Vencida' ? 'bg-red-100 text-red-700' :
                              c.estadoCartera === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {c.estadoCartera}
                            </span>
                          </td>
                          <td className="py-3">
                            <button onClick={() => abrirCliente(c.nombre)}
                              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1 rounded-lg">
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div>
                <button onClick={() => setClienteSeleccionado(null)}
                  className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm">
                  &larr; Volver a Clientes
                </button>
                {(() => {
                  const c = clientesAgrupados.find(x => x.nombre === clienteSeleccionado)
                  if (!c) return null
                  const totalCobrado = c.facturas.filter((f: any) => f.estado === 'Pagado').reduce((a: number, b: any) => a + (b.valor || 0), 0)
                  const facturasPendientes = c.facturas.filter((f: any) => f.estado !== 'Pagado')
                  const facturasPagadas = c.facturas.filter((f: any) => f.estado === 'Pagado')
                  return (
                    <div>
                      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-slate-800">Informacion General</h3>
                          {!editandoCliente ? (
                            <button onClick={() => setEditandoCliente(true)}
                              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1 rounded-lg">
                              Editar datos
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => setEditandoCliente(false)}
                                className="border border-slate-200 text-slate-500 text-xs px-3 py-1 rounded-lg hover:bg-slate-50">
                                Cancelar
                              </button>
                              <button onClick={() => guardarCliente(c.nombre)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1 rounded-lg">
                                Guardar
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Razon Social</p>
                            <p className="font-medium text-sm">{c.nombre}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">NIT</p>
                            {editandoCliente ? (
                              <input type="text" value={datosEditCliente.nit || ''} onChange={(e) => setDatosEditCliente((p: any) => ({ ...p, nit: e.target.value }))}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="NIT" />
                            ) : <p className="text-sm">{c.nit || '-'}</p>}
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Estado de Cartera</p>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              c.estadoCartera === 'Vencida' ? 'bg-red-100 text-red-700' :
                              c.estadoCartera === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {c.estadoCartera}
                            </span>
                          </div>
                          {editandoCliente && (
                            <>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Correo</p>
                                <input type="text" value={datosEditCliente.correo || ''} onChange={(e) => setDatosEditCliente((p: any) => ({ ...p, correo: e.target.value }))}
                                  className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Correo" />
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Telefono</p>
                                <input type="text" value={datosEditCliente.telefono || ''} onChange={(e) => setDatosEditCliente((p: any) => ({ ...p, telefono: e.target.value }))}
                                  className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Telefono" />
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Ciudad</p>
                                <input type="text" value={datosEditCliente.ciudad || ''} onChange={(e) => setDatosEditCliente((p: any) => ({ ...p, ciudad: e.target.value }))}
                                  className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ciudad" />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-emerald-500">
                          <p className="text-slate-500 text-xs">Total Facturado</p>
                          <p className="text-xl font-bold text-emerald-600 mt-1">${c.totalFacturado.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-blue-500">
                          <p className="text-slate-500 text-xs">Total Cobrado</p>
                          <p className="text-xl font-bold text-blue-600 mt-1">${totalCobrado.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-yellow-500">
                          <p className="text-slate-500 text-xs">Pendiente por Cobrar</p>
                          <p className="text-xl font-bold text-yellow-600 mt-1">${c.totalPendiente.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-slate-400">
                          <p className="text-slate-500 text-xs">Total Facturas</p>
                          <p className="text-xl font-bold text-slate-600 mt-1">{c.cantidadFacturas}</p>
                        </div>
                      </div>
                      {facturasPendientes.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
                          <h3 className="text-lg font-semibold text-slate-800 mb-4">Facturas Pendientes</h3>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-500 border-b">
                                <th className="pb-2">No. Factura</th>
                                <th className="pb-2">Fecha Factura</th>
                                <th className="pb-2">Valor</th>
                                <th className="pb-2">Dias Pendiente</th>
                                <th className="pb-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {facturasPendientes.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                  <td className="py-3 text-slate-500">{f.fecha}</td>
                                  <td className="py-3 text-yellow-600 font-medium">${f.valor?.toLocaleString()}</td>
                                  <td className="py-3">
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                      {diasDesde(f.fecha)} dias
                                    </span>
                                  </td>
                                  <td className="py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                      {f.estado || 'Pendiente'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {facturasPagadas.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
                          <h3 className="text-lg font-semibold text-slate-800 mb-4">Facturas Pagadas</h3>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-500 border-b">
                                <th className="pb-2">No. Factura</th>
                                <th className="pb-2">Fecha Factura</th>
                                <th className="pb-2">Valor</th>
                                <th className="pb-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {facturasPagadas.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                  <td className="py-3 text-slate-500">{f.fecha}</td>
                                  <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                                  <td className="py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                      {f.estado || 'Pendiente'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Historial Completo</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b">
                              <th className="pb-2">No. Factura</th>
                              <th className="pb-2">Fecha</th>
                              <th className="pb-2">Descripcion</th>
                              <th className="pb-2">Valor</th>
                              <th className="pb-2">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.facturas.map((f: any) => (
                              <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                <td className="py-3 text-slate-500">{f.fecha}</td>
                                <td className="py-3">{f.descripcion}</td>
                                <td className="py-3 font-medium text-slate-700">${f.valor?.toLocaleString()}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                    {f.estado || 'Pendiente'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {seccion === 'proveedores' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Proveedores</h2>
            {!proveedorSeleccionado ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <p className="text-slate-500 text-sm mb-4">Proveedores generados automaticamente desde Facturas de Compra y Gastos</p>
                {proveedoresAgrupados.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <p className="text-4xl mb-3">🏭</p>
                    <p>No hay proveedores aun. Sube facturas de compra o gastos para verlos aqui.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="pb-2">Proveedor</th>
                        <th className="pb-2">Pendiente por Pagar</th>
                        <th className="pb-2">Ultimo Documento</th>
                        <th className="pb-2">Estado</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {proveedoresAgrupados.map((p) => (
                        <tr key={p.nombre} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-3 font-medium">{p.nombre}</td>
                          <td className="py-3">
                            <span className={`font-medium ${p.totalPendiente > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              ${p.totalPendiente.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 text-slate-500">{p.ultimoDocumento}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.totalPendiente > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                              {p.totalPendiente > 0 ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3">
                            <button onClick={() => setProveedorSeleccionado(p.nombre)}
                              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1 rounded-lg">
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div>
                <button onClick={() => setProveedorSeleccionado(null)}
                  className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm">
                  &larr; Volver a Proveedores
                </button>
                {(() => {
                  const p = proveedoresAgrupados.find(x => x.nombre === proveedorSeleccionado)
                  if (!p) return null
                  const totalPagado = p.documentos.filter((f: any) => f.estado === 'Pagado').reduce((a: number, b: any) => a + (b.valor || 0), 0)
                  const docsPendientes = p.documentos.filter((f: any) => f.estado !== 'Pagado')
                  const docsPagados = p.documentos.filter((f: any) => f.estado === 'Pagado')
                  return (
                    <div>
                      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Informacion General</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Razon Social</p>
                            <p className="font-medium text-sm">{p.nombre}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">NIT</p>
                            <p className="text-sm">{p.nit || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Estado</p>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.totalPendiente > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                              {p.totalPendiente > 0 ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-slate-500">
                          <p className="text-slate-500 text-xs">Total Comprado</p>
                          <p className="text-xl font-bold text-slate-700 mt-1">${p.totalComprado.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-blue-500">
                          <p className="text-slate-500 text-xs">Total Pagado</p>
                          <p className="text-xl font-bold text-blue-600 mt-1">${totalPagado.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-orange-500">
                          <p className="text-slate-500 text-xs">Pendiente por Pagar</p>
                          <p className="text-xl font-bold text-orange-600 mt-1">${p.totalPendiente.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-slate-400">
                          <p className="text-slate-500 text-xs">Total Documentos</p>
                          <p className="text-xl font-bold text-slate-600 mt-1">{p.cantidadDocumentos}</p>
                        </div>
                      </div>
                      {docsPendientes.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
                          <h3 className="text-lg font-semibold text-slate-800 mb-4">Documentos Pendientes</h3>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-500 border-b">
                                <th className="pb-2">No. Documento</th>
                                <th className="pb-2">Fecha</th>
                                <th className="pb-2">Valor</th>
                                <th className="pb-2">Dias Pendiente</th>
                                <th className="pb-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {docsPendientes.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                  <td className="py-3 text-slate-500">{f.fecha}</td>
                                  <td className="py-3 text-orange-600 font-medium">${f.valor?.toLocaleString()}</td>
                                  <td className="py-3">
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                      {diasDesde(f.fecha)} dias
                                    </span>
                                  </td>
                                  <td className="py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                      {f.estado || 'Pendiente'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {docsPagados.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
                          <h3 className="text-lg font-semibold text-slate-800 mb-4">Documentos Pagados</h3>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-500 border-b">
                                <th className="pb-2">No. Documento</th>
                                <th className="pb-2">Fecha</th>
                                <th className="pb-2">Valor</th>
                                <th className="pb-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {docsPagados.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                  <td className="py-3 text-slate-500">{f.fecha}</td>
                                  <td className="py-3 text-emerald-700 font-medium">${f.valor?.toLocaleString()}</td>
                                  <td className="py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                      {f.estado || 'Pendiente'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Historial Completo</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b">
                              <th className="pb-2">No. Documento</th>
                              <th className="pb-2">Fecha</th>
                              <th className="pb-2">Descripcion</th>
                              <th className="pb-2">Valor</th>
                              <th className="pb-2">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.documentos.map((f: any) => (
                              <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="py-3 text-slate-500">{f.numero_factura || '-'}</td>
                                <td className="py-3 text-slate-500">{f.fecha}</td>
                                <td className="py-3">{f.descripcion}</td>
                                <td className="py-3 font-medium text-slate-700">${f.valor?.toLocaleString()}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoConfig[f.estado || 'Pendiente']?.color}`}>
                                    {f.estado || 'Pendiente'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
        {seccion === 'nomina' && (
  <div>
    <h2 className="text-2xl font-bold text-slate-800 mb-6">Nómina</h2>
    <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Registrar Pago de Nómina</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Nombre Empleado *</p>
          <input type="text" value={nominaForm.nombre_empleado} onChange={e => setNominaForm(p => ({...p, nombre_empleado: e.target.value}))}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ej: Juan Perez" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Fecha de Pago *</p>
          <input type="date" value={nominaForm.fecha_pago} onChange={e => setNominaForm(p => ({...p, fecha_pago: e.target.value}))}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Sueldo Pagado *</p>
          <input type="number" value={nominaForm.sueldo_pagado} onChange={e => setNominaForm(p => ({...p, sueldo_pagado: e.target.value}))}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">IBC PILA (Base Seguridad Social)</p>
          <input type="number" value={nominaForm.ibc_pila} onChange={e => setNominaForm(p => ({...p, ibc_pila: e.target.value}))}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0" />
        </div>
        <div className="col-span-2">
          <p className="text-xs text-slate-500 mb-1">Notas</p>
          <input type="text" value={nominaForm.notas} onChange={e => setNominaForm(p => ({...p, notas: e.target.value}))}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ej: Quincena mayo, auxilio transporte..." />
        </div>
      </div>
      {nominaForm.sueldo_pagado && nominaForm.ibc_pila && parseFloat(nominaForm.sueldo_pagado) !== parseFloat(nominaForm.ibc_pila) && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-xl">
          <p className="text-yellow-800 text-sm font-medium">⚠️ Pago No Prestacional: diferencia de ${(parseFloat(nominaForm.sueldo_pagado) - parseFloat(nominaForm.ibc_pila)).toLocaleString()} — este valor no aplica para base de seguridad social.</p>
        </div>
      )}
      <div className="mt-6 pt-6 border-t border-slate-200">
  <h3 className="text-lg font-semibold text-slate-800 mb-3">📊 Importar Nómina desde Excel</h3>
  <div className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center bg-blue-50">
    <p className="text-slate-600 text-sm mb-3">Sube tu Excel de nómina SODEPORTC (.xlsx) — se mapearán automáticamente todos los campos</p>
    <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl text-sm">
      {cargandoExcel ? 'Procesando...' : '📂 Subir Excel de Nómina'}
      <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" disabled={cargandoExcel} />
    </label>
  </div>
   <div className="mt-6 pt-6 border-t border-slate-200">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-lg font-semibold text-slate-800">🏦 Conciliación de Comprobantes</h3>
    <select value={periodoConciliacion} onChange={e => setPeriodoConciliacion(e.target.value)}
      className="px-3 py-1 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
      <option>MAYO 2026</option>
      <option>JUNIO 2026</option>
      <option>JULIO 2026</option>
    </select>
  </div>
  <div className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center bg-emerald-50">
    <p className="text-slate-600 text-sm mb-3">Arrastra aquí los comprobantes de pago bancarios (PDF) — el sistema los conciliará automáticamente</p>
    <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm">
      {procesandoConciliacion ? '⏳ Procesando...' : '📎 Subir Comprobantes PDF'}
      <input type="file" accept=".pdf" multiple onChange={handleConciliacion} className="hidden" disabled={procesandoConciliacion} />
    </label>
  </div>
  {resultadosConciliacion.length > 0 && (
    <div className="mt-4 space-y-2">
      {resultadosConciliacion.map((r, i) => (
        <div key={i} className={`p-3 rounded-xl text-sm ${
          r.estado === 'pagado' ? 'bg-green-50 text-green-800' :
          r.estado === 'revisar' ? 'bg-orange-50 text-orange-800' :
          'bg-red-50 text-red-800'
        }`}>{r.mensaje}</div>
      ))}
    </div>
  )}
</div>     
   {nominaProgramada.length > 0 && (
  <button onClick={async () => {
    if (!confirm('¿Seguro que deseas limpiar toda la nómina cargada?')) return
    await supabase.from('nomina_programada').delete().eq('user_id', user.id)
    setNominaProgramada([])
    setMensajeExcel('🗑 Nómina limpiada. Ya puedes subir el Excel del nuevo mes.')
  }} className="mt-3 w-full border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm font-medium">
    🗑 Limpiar nómina cargada (nuevo mes)
  </button>
  )}     
  {mensajeExcel && <div className="mt-3 p-3 bg-slate-50 rounded-xl"><p className="text-sm text-slate-700">{mensajeExcel}</p></div>}
  {nominaProgramada.length > 0 && (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b">
           <th className="pb-2 w-8"></th>
            <th className="pb-2">Empleado</th>
            <th className="pb-2">Identificación</th>
            <th className="pb-2 text-right pr-4">Neto a Pagar</th>
            <th className="pb-2">Estado</th>
            <th className="pb-2">Soporte</th>
          </tr>
        </thead>
        <tbody>
          {nominaProgramada.map((n) => (
  <NominaRow key={n.id} n={n} supabase={supabase} user={user} setVisorNominaUrl={setVisorNominaUrl} cargarNominaProgramada={cargarNominaProgramada} />
))}
</tbody>
</table>
    </div>
  )}
</div>
      {mensajeNomina && <div className="mt-4 p-3 bg-slate-50 rounded-xl"><p className="text-slate-700 text-sm">{mensajeNomina}</p></div>}
      <button onClick={handleGuardarNomina} disabled={guardandoNomina}
        className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white py-2 rounded-xl font-medium">
        {guardandoNomina ? 'Guardando...' : 'Guardar Pago de Nomina'}
      </button>
    </div>
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Historial de Pagos</h3>
      {nominas.length === 0 ? (
        <div className="text-center py-10 text-slate-400"><p className="text-4xl mb-3">👷</p><p>No hay pagos registrados aun.</p></div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="pb-2">Empleado</th>
              <th className="pb-2">Fecha Pago</th>
              <th className="pb-2">Sueldo Pagado</th>
              <th className="pb-2">IBC PILA</th>
              <th className="pb-2">Diferencia</th>
              <th className="pb-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {nominas.map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-3 font-medium">{n.nombre_empleado}</td>
                <td className="py-3 text-slate-500">{n.fecha_pago}</td>
                <td className="py-3 text-emerald-700 font-medium">${n.sueldo_pagado?.toLocaleString()}</td>
                <td className="py-3 text-slate-700">${n.ibc_pila?.toLocaleString()}</td>
                <td className="py-3">
                  {n.diferencia > 0 ? (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      Pago No Prestacional: ${n.diferencia?.toLocaleString()}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Correcto</span>
                  )}
                </td>
                <td className="py-3 text-slate-500">{n.notas || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
)}
       {seccion === 'clasificar' && (
  <div>
    <h2 className="text-2xl font-bold text-slate-800 mb-6">🗂️ Documentos por Clasificar</h2>
    <DocsporClasificar userId={user?.id} supabase={supabase} />
  </div>
)}

{['reportes', 'configuracion'].includes(seccion) && (
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6 capitalize">{seccion}</h2>
            <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-slate-400">
              <p className="text-lg font-medium">Modulo en construccion</p>
              <p className="text-sm mt-2">Esta seccion estara disponible proximamente</p>
            </div>
          </div>
        )}

      </main>

      {pagoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Registrar Pago</h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500 text-sm">Cliente/Proveedor</span>
                <span className="font-medium text-sm">{pagoModal.proveedor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 text-sm">Valor</span>
                <span className="font-bold text-emerald-600">${pagoModal.valor?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 text-sm">Fecha factura</span>
                <span className="text-sm">{pagoModal.fecha}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">Al confirmar, el estado cambiara a <strong>Pagado</strong>.</p>
            <div className="flex gap-3">
              <button onClick={() => setPagoModal(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleRegistrarPago}
                className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium">
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
{facturaViewer && (
  <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h3 className="font-bold text-slate-800">{facturaViewer.proveedor}</h3>
          <p className="text-xs text-slate-400">{facturaViewer.fecha} · ${facturaViewer.valor?.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={facturaViewer.archivo_url} download target="_blank" rel="noreferrer"
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-4 py-2 rounded-xl">
            ⬇ Descargar original
          </a>
          <button onClick={() => setFacturaViewer(null)}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold px-2">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden rounded-b-2xl">
        <iframe src={facturaViewer.archivo_url} className="w-full h-full border-0" title="Visor de factura" />
      </div>
    </div>
  </div>
)}
      {visorNominaUrl && (
  <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h3 className="font-bold text-slate-800">Comprobante de Pago</h3>
        <div className="flex gap-3">
          <a href={visorNominaUrl} download target="_blank" rel="noreferrer"
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-4 py-2 rounded-xl">
            ⬇ Descargar
          </a>
          <button onClick={() => setVisorNominaUrl(null)}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold px-2">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden rounded-b-2xl">
        {visorNominaUrl?.startsWith('http') ? (
  <iframe src={visorNominaUrl} className="w-full h-full border-0" title="Comprobante" />
) : (
  <div className="flex items-center justify-center h-full text-slate-400 text-center p-8">
    <div>
      <p className="text-4xl mb-4">📄</p>
      <p className="font-medium text-slate-600">Soporte registrado</p>
      <p className="text-sm mt-2">{visorNominaUrl}</p>
      <p className="text-xs mt-4 text-slate-400">El archivo fue procesado por email automáticamente</p>
    </div>
  </div>
)}
      </div>
    </div>
  </div>
)}
    </div>
  )
}
