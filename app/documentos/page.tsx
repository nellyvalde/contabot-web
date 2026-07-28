'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/context/EmpresaContext'
import { detectarNovedades } from '@/lib/documentos/detectarNovedades'

type TipoDocumento = 'factura_venta' | 'factura_compra' | 'soporte_nomina' | 'comprobante_egreso' | 'otro'
type EstadoConciliacion = 'pendiente' | 'conciliado' | 'rechazado'

type Documento = {
  id: string
  tipo: TipoDocumento
  numero_documento: string | null
  proveedor_cliente: string | null
  descripcion: string | null
  valor: number | null
  iva: number | null
  retencion: number | null
  fecha_emision: string | null
  estado: string | null
  estado_conciliacion: EstadoConciliacion
  cuenta_puc: string | null
  archivo_url?: string | null
}

type DatosIA = {
  proveedor: string
  nit_proveedor: string
  numero_documento: string
  fecha: string
  fecha_emision: string
  valor_base: number
  iva: number
  valor: number
  valor_total: number
  descripcion: string
  tipo: string
  categoria: string
  tipo_documento: string
  cuenta_puc: string
  alerta: string
  ya_pagado: boolean
  empleado_sugerido_id?: string
  nombre_empleado_sugerido?: string
  cedula_empleado_sugerido?: string
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function obtenerPeriodoDeFecha(fechaStr?: string | null): string {
  if (!fechaStr) return new Date().toISOString().slice(0, 7)
  const matches = fechaStr.match(/^(\d{4})[-/.](\d{2})/)
  if (matches) {
    return `${matches[1]}-${matches[2]}`
  }
  return new Date().toISOString().slice(0, 7)
}

async function guardarAliasTercero(nombreProveedor: string, cedulaEmpleado: string, userId: string, empresaId: string) {
  if (!nombreProveedor || !cedulaEmpleado || !userId || !empresaId) return
  const aliasLimpio = nombreProveedor.trim()
  if (aliasLimpio.length < 3) return

  try {
    const { data: aliasExistente } = await supabase
      .from('alias_terceros')
      .select('id')
      .eq('user_id', userId)
      .eq('empresa_id', empresaId)
      .eq('cedula', cedulaEmpleado)
      .eq('alias', aliasLimpio)
      .maybeSingle()

    if (!aliasExistente) {
      await supabase.from('alias_terceros').insert({
        user_id: userId,
        empresa_id: empresaId,
        cedula: cedulaEmpleado,
        alias: aliasLimpio
      })
      console.log(`[ContaBot] Guardado alias "${aliasLimpio}" para empleado con cédula ${cedulaEmpleado}`)
    }
  } catch (err) {
    console.error('[ContaBot] Error guardando alias de tercero:', err)
  }
}

const ETIQUETAS_TIPO: Record<TipoDocumento, string> = {
  factura_venta: 'Factura de venta',
  factura_compra: 'Factura de compra',
  soporte_nomina: 'Soporte de nómina',
  comprobante_egreso: 'Comprobante de egreso',
  otro: 'Otro',
}

export default function DocumentosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <DocumentosContenido />
    </Suspense>
  )
}

function DocumentosContenido() {
  const { user, handleLogout } = useUser()
  const { empresaActiva } = useEmpresa()
  const fileRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const esRevision = searchParams.get('vista') === 'revision'

  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [facturasBanco, setFacturasBanco] = useState<{ proveedor: string | null; fecha: string | null; valor: number | null }[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<EstadoConciliacion | 'todos'>('todos')
  const [tabActiva, setTabActiva] = useState<'pendientes' | 'procesados'>('pendientes')

  const [escaneando, setEscaneando] = useState(false)
  const [datosIA, setDatosIA] = useState<DatosIA | null>(null)
  const [archivoOriginal, setArchivoOriginal] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [paginaActual, setPaginaActual] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(0)
  const [resultadosMultiples, setResultadosMultiples] = useState<any[]>([])

  const [tipo, setTipo] = useState<TipoDocumento>('factura_compra')
  const [numero, setNumero] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [fecha, setFecha] = useState('')
  const [valor, setValor] = useState('')
  const [cuentaPuc, setCuentaPuc] = useState('')

  async function enrutarDocumentoIA(datos: DatosIA, empresaId: string): Promise<DatosIA> {
    try {
      const periodo = obtenerPeriodoDeFecha(datos.fecha_emision || datos.fecha)
      const { data: empData } = await supabase
        .from('nomina_programada')
        .select('id, nombre_empleado, cedula, neto_pagar')
        .eq('empresa_id', empresaId)
        .eq('periodo_contable', periodo)
        .eq('estado', 'Pendiente de Pago')

      if (!empData || empData.length === 0) return datos

      const { data: aliasData } = await supabase
        .from('alias_terceros')
        .select('cedula, alias')
        .eq('empresa_id', empresaId)

      const aliasesMap: Record<string, string[]> = {}
      if (aliasData) {
        for (const row of aliasData) {
          if (!aliasesMap[row.cedula]) aliasesMap[row.cedula] = []
          aliasesMap[row.cedula].push(row.alias)
        }
      }

      const proveedorNorm = normalizar(datos.proveedor || '')
      const valorDoc = datos.valor_total || datos.valor || 0

      // 1. Coincidencia por Nombre/Alias + Valor (+/- 10)
      for (const emp of empData) {
        const empNombreNorm = normalizar(emp.nombre_empleado)
        const empAliases = aliasesMap[emp.cedula] || []
        
        let coincideNombre = proveedorNorm.includes(empNombreNorm) || empNombreNorm.includes(proveedorNorm)
        if (!coincideNombre) {
          for (const alias of empAliases) {
            const aliasNorm = normalizar(alias)
            if (aliasNorm && (proveedorNorm.includes(aliasNorm) || aliasNorm.includes(proveedorNorm))) {
              coincideNombre = true
              break
            }
          }
        }

        if (coincideNombre && Math.abs(Number(emp.neto_pagar) - Number(valorDoc)) <= 10) {
          return {
            ...datos,
            categoria: 'Nomina',
            tipo_documento: 'Comprobante de Pago a Terceros',
            cuenta_puc: '510506',
            empleado_sugerido_id: emp.id,
            nombre_empleado_sugerido: emp.nombre_empleado,
            cedula_empleado_sugerido: emp.cedula,
            alerta: `💡 Auto-categorizado como Nómina. Coincidencia por nombre/alias con el empleado ${emp.nombre_empleado}.`
          }
        }
      }

      // 2. Coincidencia por Valor Único (+/- 10)
      const coincidenValor = empData.filter(emp => Math.abs(Number(emp.neto_pagar) - Number(valorDoc)) <= 10)
      if (coincidenValor.length === 1) {
        const emp = coincidenValor[0]
        return {
          ...datos,
          categoria: 'Nomina',
          tipo_documento: 'Comprobante de Pago a Terceros',
          cuenta_puc: '510506',
          empleado_sugerido_id: emp.id,
          nombre_empleado_sugerido: emp.nombre_empleado,
          cedula_empleado_sugerido: emp.cedula,
          alerta: `💡 Auto-categorizado como Nómina. Se detectó coincidencia de valor único con el empleado ${emp.nombre_empleado}.`
        }
      }
    } catch (err) {
      console.error('[ContaBot] Error en enrutarDocumentoIA:', err)
    }
    return datos
  }

  useEffect(() => {
    if (empresaActiva?.id) {
      setDocumentos([])
      cargarDocumentos()
      cargarFacturasBanco()
    }
  }, [empresaActiva?.id])

  async function cargarDocumentos() {
    if (!empresaActiva?.id) return
    setCargando(true)
    setError(null)
    setDocumentos([])
    const { data, error: errDocs } = await supabase
      .from('documentos')
      .select('id, tipo, numero_documento, proveedor_cliente, descripcion, valor, iva, retencion, fecha_emision, estado, estado_conciliacion, cuenta_puc, archivo_url')
      .eq('empresa_id', empresaActiva.id)
      .order('fecha_emision', { ascending: false })
    if (errDocs) setError(`Error cargando documentos: ${errDocs.message}`)
    else setDocumentos(data ?? [])
    setCargando(false)
  }

  async function cargarFacturasBanco() {
    if (!empresaActiva?.id) return
    const { data } = await supabase
      .from('facturas')
      .select('proveedor, fecha, valor')
      .eq('empresa_id', empresaActiva.id)
    setFacturasBanco(data ?? [])
  }

  const documentosConNovedades = useMemo(() => {
    return documentos.map(d => ({ ...d, novedades: detectarNovedades(d, documentos, facturasBanco) }))
  }, [documentos, facturasBanco])

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !empresaActiva) return
    e.target.value = ''
    setEscaneando(true)
    setDatosIA(null)
    setArchivoOriginal(file)
    setError(null)
    setMensajeExito(null)
    setPaginaActual(0)
    setTotalPaginas(0)
    setResultadosMultiples([])

    try {
      if (!file.type.includes('pdf')) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('empresa_nombre', empresaActiva.razon_social)
        formData.append('empresa_nit', empresaActiva.nit)
        const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.success) {
          const datosEnrutados = await enrutarDocumentoIA(json.datos, empresaActiva.id)
          setDatosIA(datosEnrutados)
        } else {
          setError('La IA no pudo leer el documento: ' + json.error)
        }
        setEscaneando(false)
        return
      }

      const { PDFDocument } = await import('pdf-lib')
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const numPaginas = pdfDoc.getPageCount()

      if (numPaginas === 1) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('empresa_nombre', empresaActiva.razon_social)
        formData.append('empresa_nit', empresaActiva.nit)
        const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.success) {
          const datosEnrutados = await enrutarDocumentoIA(json.datos, empresaActiva.id)
          setDatosIA(datosEnrutados)
        } else {
          setError('La IA no pudo leer el documento: ' + json.error)
        }
        setEscaneando(false)
        return
      }

      setTotalPaginas(numPaginas)
      const resultados: any[] = []

      for (let i = 0; i < numPaginas; i++) {
        setPaginaActual(i + 1)
        const pdfPagina = await PDFDocument.create()
        const [pagina] = await pdfPagina.copyPages(pdfDoc, [i])
        pdfPagina.addPage(pagina)
        const bytesPagena = await pdfPagina.save()
        const blob = new Blob([bytesPagena.buffer as ArrayBuffer], { type: 'application/pdf' })
        const pdfBase64 = await blob.arrayBuffer().then(b => {
          const bytes = new Uint8Array(b)
          let binary = ''
          for (let j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j])
          return btoa(binary)
        })
        const formData = new FormData()
        formData.append('file', blob, `pagina_${i + 1}.pdf`)
        formData.append('empresa_nombre', empresaActiva.razon_social)
        formData.append('empresa_nit', empresaActiva.nit)
        try {
          const res = await fetch('/api/leer-factura', { method: 'POST', body: formData })
          const json = await res.json()
          if (json.success) resultados.push({ pagina: i + 1, datos: json.datos, pdfBase64 })
          else resultados.push({ pagina: i + 1, datos: null, error: json.error })
        } catch {
          resultados.push({ pagina: i + 1, datos: null, error: 'Error de conexión' })
        }
      }

      const registrosFinales: any[] = []
      let i = 0
      while (i < resultados.length) {
        const actual = resultados[i]
        const siguiente = resultados[i + 1]
        if (actual.datos && siguiente?.datos) {
          const esFactura = ['Factura Electronica', 'Factura de Compra', 'Factura de Venta'].includes(actual.datos.tipo_documento)
          const esComprobante = siguiente.datos.ya_pagado || ['Comprobante de Pago a Terceros'].includes(siguiente.datos.tipo_documento)
          const mismoValor = Math.abs((actual.datos.valor_total || 0) - (siguiente.datos.valor_total || 0)) < 5000
          if (esFactura && esComprobante && mismoValor) {
            registrosFinales.push({ ...actual.datos, ya_pagado: true, paginas: [actual.pagina, siguiente.pagina], fusionado: true, pdfBase64: actual.pdfBase64 })
            i += 2
            continue
          }
        }
        if (actual.datos) registrosFinales.push({ ...actual.datos, paginas: [actual.pagina], fusionado: false, pdfBase64: actual.pdfBase64 })
        i++
      }

      const registrosEnrutados = await Promise.all(
        registrosFinales.map(async (reg) => {
          return await enrutarDocumentoIA(reg, empresaActiva.id)
        })
      )

      setResultadosMultiples(registrosEnrutados)
      setMensajeExito(`✅ ${numPaginas} páginas procesadas — ${registrosEnrutados.length} documento(s) encontrado(s)`)
    } catch (err: any) {
      setError('Error procesando el archivo: ' + err.message)
    }
    setEscaneando(false)
  }

  async function guardarTodos() {
const total = resultadosMultiples.length
    const copia = [...resultadosMultiples]
    for (let i = 0; i < copia.length; i++) {
      await guardarRegistroMultiple(copia[i], 0)
    }
    setMensajeExito(`✅ ${total} documentos guardados correctamente`)
  }

  async function guardarRegistroMultiple(reg: any, idx: number) {
    if (!empresaActiva?.id || !user) return
    try {
      let archivoUrl = null
      if (reg.pdfBase64) {
        const nombreArchivo = `${empresaActiva.id}/${Date.now()}_pag${reg.paginas?.[0] || 1}.pdf`
        const pdfBytes = Uint8Array.from(atob(reg.pdfBase64), c => c.charCodeAt(0))
        const { error: storageError } = await supabase.storage
          .from('facturas')
          .upload(nombreArchivo, pdfBytes, { contentType: 'application/pdf' })
        if (!storageError) {
          const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(nombreArchivo)
          archivoUrl = urlData.publicUrl
        }
      }

      if (reg.categoria === 'Comprobante de Nomina' || reg.categoria === 'Nomina') {
        const nombreBeneficiario = (reg.proveedor || '').toUpperCase()
        const valorBuscado = reg.valor_total || reg.valor || 0
        let empleadoId = reg.empleado_sugerido_id
        let empleadoCedula = reg.cedula_empleado_sugerido
        let empleadoNombre = reg.nombre_empleado_sugerido

        if (!empleadoId) {
          let empleadoMatch = null
          if (nombreBeneficiario) {
            const { data: empData } = await supabase.from('nomina_programada').select('*').eq('empresa_id', empresaActiva.id).ilike('nombre_empleado', `%${nombreBeneficiario.split(' ')[0]}%`).maybeSingle()
            empleadoMatch = empData
          }
          if (!empleadoMatch && valorBuscado > 0) {
            const { data: empValor } = await supabase.from('nomina_programada').select('*').eq('empresa_id', empresaActiva.id).eq('neto_pagar', valorBuscado).maybeSingle()
            empleadoMatch = empValor
          }
          if (empleadoMatch) {
            empleadoId = empleadoMatch.id
            empleadoCedula = empleadoMatch.cedula
            empleadoNombre = empleadoMatch.nombre_empleado
          }
        }

        if (empleadoId) {
          await supabase.from('nomina_programada').update({ estado: 'Pagado', archivo_url: archivoUrl || 'subido' }).eq('id', empleadoId)
          if (reg.proveedor && empleadoCedula) {
            await guardarAliasTercero(reg.proveedor, empleadoCedula, user.id, empresaActiva.id)
          }
        } else {
          const { error: e } = await supabase.from('documentos').insert({
            empresa_id: empresaActiva.id, tipo: 'soporte_nomina',
            proveedor_cliente: reg.proveedor || null, descripcion: reg.descripcion || 'Comprobante de nómina — empleado no encontrado',
            fecha_emision: reg.fecha_emision || reg.fecha || null, valor: reg.valor_total || reg.valor || 0,
            iva: reg.iva || 0, cuenta_puc: '510506', estado_conciliacion: 'pendiente', estado: 'Pendiente', archivo_url: archivoUrl,
          })
          if (e?.code === '23505') { setError('⚠️ Este documento ya se encuentra registrado en el sistema y no puede ser duplicado.'); return }
        }
      } else {
        const tipoDoc: TipoDocumento = reg.categoria === 'Factura de Venta' ? 'factura_venta' : reg.categoria === 'Nomina' ? 'soporte_nomina' : 'factura_compra'
        const { error: e } = await supabase.from('documentos').insert({
          empresa_id: empresaActiva.id, tipo: tipoDoc,
          numero_documento: reg.numero_documento || null, proveedor_cliente: reg.proveedor || null,
          descripcion: reg.descripcion || null, fecha_emision: reg.fecha_emision || reg.fecha || null,
          valor: reg.valor_total || reg.valor || 0, iva: reg.iva || 0, cuenta_puc: reg.cuenta_puc || null,
          estado_conciliacion: reg.categoria === 'Nomina' ? 'pendiente' : 'conciliado',
          estado: reg.categoria === 'Nomina' ? 'Pendiente' : 'Pagado',
          archivo_url: archivoUrl,
        })
        if (e) {
          if (e.code === '23505') setError('⚠️ Este documento ya se encuentra registrado en el sistema y no puede ser duplicado.')
          else setError(`Error guardando: ${e.message}`)
          return
        }
        await supabase.from('facturas').insert({
          user_id: user.id, empresa_id: empresaActiva.id, proveedor: reg.proveedor || null,
          fecha: reg.fecha_emision || reg.fecha || new Date().toISOString().slice(0, 10),
          valor: reg.valor_total || reg.valor || 0, iva: reg.iva || 0, descripcion: reg.descripcion || null,
          tipo: reg.tipo_documento || reg.tipo || 'Factura de Compra', categoria: reg.categoria || 'Factura de Compra',
          estado: reg.ya_pagado ? 'Pagado' : 'Pendiente', numero_factura: reg.numero_documento || null,
        })
      }
      setResultadosMultiples(prev => prev.filter((_, i) => i !== idx))
      await cargarDocumentos()
    } catch (err: any) {
      setError(`Error guardando: ${err.message}`)
    }
  }

  async function guardarDesdeIA() {
    if (!datosIA || !empresaActiva?.id || !user) return
    setGuardando(true)
    setError(null)
    setMensajeExito(null)

    try {
      let archivoUrl = null
      if (archivoOriginal) {
        const nombreArchivo = `${empresaActiva.id}/${Date.now()}_${archivoOriginal.name}`
        const { error: storageError } = await supabase.storage
          .from('facturas')
          .upload(nombreArchivo, archivoOriginal)
        if (!storageError) {
          const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(nombreArchivo)
          archivoUrl = urlData.publicUrl
        }
      }

      if (datosIA.categoria === 'Nomina' || datosIA.categoria === 'Comprobante de Nomina') {
        let empleadoId = datosIA.empleado_sugerido_id
        let empleadoCedula = datosIA.cedula_empleado_sugerido
        let empleadoNombre = datosIA.nombre_empleado_sugerido

        if (!empleadoId) {
          const nombreBeneficiario = (datosIA.proveedor || '').toUpperCase()
          const valorBuscado = datosIA.valor_total || datosIA.valor || 0
          let empleadoMatch = null
          if (nombreBeneficiario) {
            const { data: empData } = await supabase
              .from('nomina_programada')
              .select('*')
              .eq('empresa_id', empresaActiva.id)
              .ilike('nombre_empleado', `%${nombreBeneficiario.split(' ')[0]}%`)
              .maybeSingle()
            empleadoMatch = empData
          }
          if (!empleadoMatch && valorBuscado > 0) {
            const { data: empValor } = await supabase
              .from('nomina_programada')
              .select('*')
              .eq('empresa_id', empresaActiva.id)
              .eq('neto_pagar', valorBuscado)
              .maybeSingle()
            empleadoMatch = empValor
          }
          if (empleadoMatch) {
            empleadoId = empleadoMatch.id
            empleadoCedula = empleadoMatch.cedula
            empleadoNombre = empleadoMatch.nombre_empleado
          }
        }

        if (empleadoId) {
          const { error: errPayroll } = await supabase
            .from('nomina_programada')
            .update({
              estado: 'Pagado',
              metodo_conciliacion: 'automatico_valor',
              referencia_conciliacion: `Conciliado desde Buzón IA (Soporte)`,
              archivo_url: archivoUrl || 'subido'
            })
            .eq('id', empleadoId)

          if (errPayroll) {
            setError(`Error marcando nómina como pagada: ${errPayroll.message}`)
            setGuardando(false)
            return
          }

          if (datosIA.proveedor && empleadoCedula) {
            await guardarAliasTercero(datosIA.proveedor, empleadoCedula, user.id, empresaActiva.id)
          }

          setMensajeExito(`✅ Nómina de ${empleadoNombre} marcada como pagada y soporte vinculado.`)
          setDatosIA(null)
          setArchivoOriginal(null)
          await cargarDocumentos()
          setGuardando(false)
          return
        }
      }

      if (datosIA.numero_documento) {
        const { data: existente } = await supabase.from('documentos').select('id').eq('empresa_id', empresaActiva.id).eq('numero_documento', datosIA.numero_documento).maybeSingle()
        if (existente) {
          setError('⚠️ Este documento ya fue registrado. Número: ' + datosIA.numero_documento)
          setGuardando(false)
          return
        }
      }
      const estadoConciliacion: EstadoConciliacion = datosIA.ya_pagado ? 'conciliado' : 'pendiente'
      const estadoTexto = datosIA.ya_pagado ? 'Pagado' : 'Pendiente'
      const tipoDoc: TipoDocumento = datosIA.categoria === 'Factura de Venta' ? 'factura_venta' : datosIA.categoria === 'Nomina' ? 'soporte_nomina' : 'factura_compra'
      const { error: e } = await supabase.from('documentos').insert({
        empresa_id: empresaActiva.id, tipo: tipoDoc,
        numero_documento: datosIA.numero_documento || null, proveedor_cliente: datosIA.proveedor || null,
        descripcion: datosIA.descripcion || null, fecha_emision: datosIA.fecha_emision || datosIA.fecha || null,
        valor: datosIA.valor_total || datosIA.valor || 0, iva: datosIA.iva || 0, cuenta_puc: datosIA.cuenta_puc || null,
        estado_conciliacion: estadoConciliacion, estado: estadoTexto, archivo_url: archivoUrl,
      })
      if (e) {
        if (e.code === '23505') setError('⚠️ Este documento ya se encuentra registrado en el sistema y no puede ser duplicado.')
        else setError(`Error guardando: ${e.message}`)
      } else {
        setMensajeExito('✅ Documento guardado correctamente')
        setDatosIA(null)
        setArchivoOriginal(null)
        await cargarDocumentos()
      }
    } catch (err: any) {
      setError(`Error: ${err.message}`)
    }
    setGuardando(false)
  }

  async function trasladarANomina(docId: string) {
    setError(null)
    setMensajeExito(null)
    try {
      const { data: doc, error: errDoc } = await supabase
        .from('documentos')
        .select('*')
        .eq('id', docId)
        .single()
      if (errDoc || !doc) {
        setError('No se pudo encontrar el documento original.')
        return
      }

      const periodo = obtenerPeriodoDeFecha(doc.fecha_emision)
      const { data: empMatches, error: errEmp } = await supabase
        .from('nomina_programada')
        .select('*')
        .eq('empresa_id', empresaActiva!.id)
        .eq('periodo_contable', periodo)
        .eq('estado', 'Pendiente de Pago')

      if (errEmp || !empMatches) {
        setError('Error consultando empleados pendientes: ' + (errEmp?.message || ''))
        return
      }

      const coincidenMonto = empMatches.filter(e => Math.abs(Number(e.neto_pagar) - Number(doc.valor)) <= 10)

      if (coincidenMonto.length === 0) {
        setError(`No se encontró ningún empleado pendiente en el periodo ${periodo} con neto a pagar de $${Number(doc.valor).toLocaleString()} (+/- $10)`)
        return
      }

      if (coincidenMonto.length > 1) {
        setError(`Hay múltiples empleados (${coincidenMonto.map(e => e.nombre_empleado).join(', ')}) con el mismo neto de $${Number(doc.valor).toLocaleString()}. Por favor concílialo manualmente en Nómina.`)
        return
      }

      const empleado = coincidenMonto[0]

      const { error: errUpdate } = await supabase
        .from('nomina_programada')
        .update({
          estado: 'Pagado',
          metodo_conciliacion: 'automatico_valor',
          referencia_conciliacion: `Conciliado tras traslado de documento "${doc.proveedor_cliente || 'Desconocido'}"`,
          archivo_url: doc.archivo_url
        })
        .eq('id', empleado.id)

      if (errUpdate) {
        setError('Error al actualizar la nómina: ' + errUpdate.message)
        return
      }

      if (doc.proveedor_cliente && empleado.cedula && user) {
        await guardarAliasTercero(doc.proveedor_cliente, empleado.cedula, user.id, empresaActiva!.id)
      }

      const { error: errDel } = await supabase
        .from('documentos')
        .delete()
        .eq('id', docId)

      if (errDel) {
        setError('Nómina marcada como pagada, pero falló eliminar el documento duplicado: ' + errDel.message)
        return
      }

      setMensajeExito(`✅ Registro trasladado con éxito. Nómina de ${empleado.nombre_empleado} marcada como Pagada y soporte vinculado.`)
      await cargarDocumentos()
    } catch (err: any) {
      setError('Error inesperado trasladando: ' + err.message)
    }
  }

  async function registrarDocumento() {
    if (!empresaActiva?.id || !numero.trim() || !valor.trim()) return
    const { data, error: errInsert } = await supabase.from('documentos').insert({
      empresa_id: empresaActiva.id, tipo, numero_documento: numero.trim(),
      proveedor_cliente: proveedor.trim() || null, fecha_emision: fecha || null,
      valor: Number(valor), cuenta_puc: cuentaPuc.trim() || null,
      estado_conciliacion: 'pendiente', estado: 'Pendiente',
    }).select().single()
    if (errInsert) {
      if (errInsert.code === '23505') setError('⚠️ Este documento ya se encuentra registrado en el sistema y no puede ser duplicado.')
      else setError(`No se pudo registrar: ${errInsert.message}`)
      return
    }
    setDocumentos(prev => [data as Documento, ...prev])
    setNumero(''); setProveedor(''); setFecha(''); setValor(''); setCuentaPuc('')
    setMensajeExito('✅ Documento registrado')
  }

  async function cambiarEstado(id: string, nuevoEstado: EstadoConciliacion) {
    const { error: errUpdate } = await supabase.from('documentos').update({ estado_conciliacion: nuevoEstado }).eq('id', id)
    if (errUpdate) { setError(`No se pudo actualizar: ${errUpdate.message}`); return }
    setDocumentos(prev => prev.map(d => d.id === id ? { ...d, estado_conciliacion: nuevoEstado } : d))
  }

  async function eliminarDocumento(id: string) {
    if (!confirm('¿Seguro que deseas eliminar este documento?')) return
    const { error: e } = await supabase.from('documentos').delete().eq('id', id)
    if (e) { setError(`No se pudo eliminar: ${e.message}`); return }
    setDocumentos(prev => prev.filter(d => d.id !== id))
  }

  const documentosPorTab = useMemo(() => {
    if (esRevision) return documentosConNovedades.filter(d => d.novedades.length > 0)
    switch (tabActiva) {
      case 'procesados': return documentosConNovedades.filter(d => d.estado_conciliacion === 'conciliado')
      default: return documentosConNovedades.filter(d => d.estado_conciliacion === 'pendiente')
    }
  }, [documentosConNovedades, tabActiva, esRevision])

  const documentosFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return documentosPorTab
    return documentosPorTab.filter(d => d.estado_conciliacion === filtroEstado)
  }, [documentosPorTab, filtroEstado])

  const totales = useMemo(() => {
    const pendientes = documentos.filter(d => d.estado_conciliacion === 'pendiente')
    const conciliados = documentos.filter(d => d.estado_conciliacion === 'conciliado')
    return {
      pendientes: pendientes.length,
      conciliados: conciliados.length,
      valorPendiente: pendientes.reduce((sum, d) => sum + Number(d.valor ?? 0), 0),
    }
  }, [documentos])

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>

  if (!empresaActiva) return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8 flex items-center justify-center">
        <p className="text-slate-400">Selecciona una empresa para continuar.</p>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">{esRevision ? 'Revisión IA' : 'Buzón IA'}</p>
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{esRevision ? 'Documentos con novedades' : 'Documentos soporte'}</h1>
                <p className="text-xs text-slate-400 mt-1">{empresaActiva.razon_social} — NIT {empresaActiva.nit}</p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Pendientes</p>
                  <p className="text-xl font-bold text-amber-700">{totales.pendientes}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Conciliados</p>
                  <p className="text-xl font-bold text-emerald-700">{totales.conciliados}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Valor pendiente</p>
                  <p className="text-xl font-bold text-red-700">${totales.valorPendiente.toLocaleString()}</p>
                </div>
              </div>
            </div>
            {error && <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{error}</p>}
            {mensajeExito && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{mensajeExito}</p>}
          </div>

          {!esRevision && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="text-base font-semibold text-slate-900 mb-4">🤖 Escanear documento con IA</h2>
            {!escaneando && !datosIA && resultadosMultiples.length === 0 && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-10 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                <span className="text-4xl mb-3">📄</span>
                <p className="font-medium text-slate-700">Subir factura o comprobante</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG o PDF — La IA extrae todos los datos automáticamente</p>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleArchivo} className="hidden" />
              </label>
            )}

            {escaneando && (
              <div className="flex flex-col items-center justify-center py-14 gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-200 animate-ping" />
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-2xl">🔍</span>
                </div>
                <div className="text-center">
                  {totalPaginas > 1 ? (
                    <>
                      <p className="font-semibold text-slate-800 text-lg">Procesando página {paginaActual} de {totalPaginas}</p>
                      <div className="w-64 h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${totalPaginas > 0 ? (paginaActual / totalPaginas) * 100 : 0}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">{Math.round((paginaActual / totalPaginas) * 100)}% completado</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-800 text-lg">IA Escaneando...</p>
                      <p className="text-sm text-slate-400 mt-1">Extrayendo proveedor, NIT, valores e IVA</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {datosIA && !escaneando && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-emerald-600 text-lg">✅</span>
                  <p className="font-semibold text-slate-800">Datos extraídos — revisa y corrige si es necesario</p>
                </div>
                {datosIA.alerta && <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{datosIA.alerta}</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Proveedor</label>
                    <input value={datosIA.proveedor} onChange={e => setDatosIA({...datosIA, proveedor: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">NIT Proveedor</label>
                    <input value={datosIA.nit_proveedor} onChange={e => setDatosIA({...datosIA, nit_proveedor: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Número de documento</label>
                    <input value={datosIA.numero_documento} onChange={e => setDatosIA({...datosIA, numero_documento: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Fecha de emisión</label>
                    <input type="date" value={datosIA.fecha_emision || datosIA.fecha} onChange={e => setDatosIA({...datosIA, fecha_emision: e.target.value, fecha: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Valor base (sin IVA)</label>
                    <input type="number" value={datosIA.valor_base} onChange={e => setDatosIA({...datosIA, valor_base: Number(e.target.value)})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">IVA</label>
                    <input type="number" value={datosIA.iva} onChange={e => setDatosIA({...datosIA, iva: Number(e.target.value)})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Valor total</label>
                    <input type="number" value={datosIA.valor_total || datosIA.valor} onChange={e => setDatosIA({...datosIA, valor_total: Number(e.target.value), valor: Number(e.target.value)})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Cuenta PUC</label>
                    <input value={datosIA.cuenta_puc} onChange={e => setDatosIA({...datosIA, cuenta_puc: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
                    <input value={datosIA.descripcion} onChange={e => setDatosIA({...datosIA, descripcion: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setDatosIA(null); setMensajeExito(null) }} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">✕ Cancelar</button>
                  <button onClick={guardarDesdeIA} disabled={guardando} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{guardando ? 'Guardando...' : '✓ Confirmar y guardar'}</button>
                </div>
              </div>
            )}

            {resultadosMultiples.length > 0 && !escaneando && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-slate-800">{resultadosMultiples.length} documento(s) detectado(s)</p>
                  <button onClick={guardarTodos} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">✓ Guardar todos</button>
                </div>
                {resultadosMultiples.map((reg, idx) => (
                  <div key={idx} className={`rounded-xl border px-4 py-3 ${reg.fusionado ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{reg.proveedor || 'Sin nombre'}</p>
                        <p className="text-xs text-slate-500">{reg.tipo_documento} · ${Number(reg.valor_total || reg.valor || 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-400">Página(s): {reg.paginas?.join(' + ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {reg.fusionado && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">🔗 Fusionado</span>}
                        {reg.ya_pagado && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">✅ Pagado</span>}
                        <button onClick={() => guardarRegistroMultiple(reg, idx)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Guardar</button>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setResultadosMultiples([])} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">Cancelar todo</button>
              </div>
            )}
          </div>
          )}

          <div className={esRevision ? 'grid gap-6' : 'grid gap-6 xl:grid-cols-[1.3fr_0.7fr]'}>
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                {esRevision ? (
                  <p className="text-sm font-semibold text-slate-700">🔎 {documentosPorTab.length} documento(s) con novedades</p>
                ) : (
                  <div className="flex gap-2">
                    {[{ id: 'pendientes', label: '📥 Por Procesar' }, { id: 'procesados', label: '✅ Procesados' }].map(tab => (
                      <button key={tab.id} onClick={() => setTabActiva(tab.id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tabActiva === tab.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                {!esRevision && (
                  <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as any)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="todos">Todos</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="conciliado">Conciliados</option>
                    <option value="rechazado">Rechazados</option>
                  </select>
                )}
              </div>
              {cargando ? (
                <div className="flex items-center gap-2 p-8 text-slate-400 text-sm"><span className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full" />Cargando...</div>
              ) : documentosFiltrados.length === 0 ? (
                <div className="p-8 text-center">
                  {esRevision ? (
                    <>
                      <p className="text-slate-500 font-medium">✅ Sin novedades pendientes</p>
                      <p className="text-slate-400 text-sm mt-1">Todos los documentos de {empresaActiva.razon_social} están completos.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-slate-500 font-medium">Sin documentos para {empresaActiva.razon_social}</p>
                      <p className="text-slate-400 text-sm mt-1">Sube un archivo o registra uno manualmente.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {(esRevision
                          ? ['Tipo','Nº Documento','Proveedor/Cliente','Valor','Estado','Novedades','PDF','Acción']
                          : ['Tipo','Nº Documento','Proveedor/Cliente','Valor','Cuenta PUC','Estado','PDF','Acción']
                        ).map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {documentosFiltrados.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors duration-100">
                          <td className="px-4 py-3.5 text-slate-700">{ETIQUETAS_TIPO[doc.tipo] ?? doc.tipo}</td>
                          <td className="px-4 py-3.5 text-slate-600">{doc.numero_documento ?? '—'}</td>
                          <td className="px-4 py-3.5 text-slate-600">{doc.proveedor_cliente ?? '—'}</td>
                          <td className="px-4 py-3.5 font-semibold text-slate-900">${Number(doc.valor ?? 0).toLocaleString()}</td>
                          {!esRevision && <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{doc.cuenta_puc ?? '—'}</td>}
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${doc.estado_conciliacion === 'conciliado' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : doc.estado_conciliacion === 'rechazado' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${doc.estado_conciliacion === 'conciliado' ? 'bg-emerald-500' : doc.estado_conciliacion === 'rechazado' ? 'bg-red-500' : 'bg-amber-400'}`}/>
                              {doc.estado_conciliacion}
                            </span>
                          </td>
                          {esRevision && (
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {(doc as any).novedades?.map((n: string) => (
                                  <span key={n} className="inline-flex items-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200 px-2 py-0.5 text-[11px] font-medium">{n}</span>
                                ))}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3.5">
                            {doc.archivo_url ? (
                              <a href={doc.archivo_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 shadow-sm hover:bg-blue-50">📄 Ver</a>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 flex gap-2">
                            {doc.estado_conciliacion !== 'conciliado' && (
                              <button onClick={() => cambiarEstado(doc.id, 'conciliado')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50">✓ Conciliar</button>
                            )}
                            <button onClick={() => eliminarDocumento(doc.id)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 shadow-sm hover:bg-red-50">🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!esRevision && (
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-base font-semibold text-slate-900 mb-4">Registrar manualmente</h2>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo</label>
                  <select value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {Object.entries(ETIQUETAS_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Número de documento</label>
                  <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej. FV-1024" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Proveedor / Cliente</label>
                  <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej. Empresa XYZ" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha de emisión</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Valor</label>
                  <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ej. 850000" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Cuenta PUC</label>
                  <input value={cuentaPuc} onChange={e => setCuentaPuc(e.target.value)} placeholder="Ej. 513500" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/></div>
                <button onClick={registrarDocumento} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">+ Registrar documento</button>
              </div>
            </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}