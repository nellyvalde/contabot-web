'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase/client'

type ResumenNomina = {
  totalLiquidado: number
  totalPendientePago: number
  empleadosActivos: number
}

type ResumenDocumentos = {
  pendientesConciliar: number
  conciliados: number
  valorPendiente: number
}

type Vencimiento = {
  id: string
  obligacion: string
  fecha: string
  estado: 'proximo' | 'vencido' | 'cumplido'
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white">Cargando...</p></div>}>
      <DashboardContenido />
    </Suspense>
  )
}

function DashboardContenido() {
  const { user, handleLogout } = useUser()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumenNomina, setResumenNomina] = useState<ResumenNomina>({
    totalLiquidado: 0,
    totalPendientePago: 0,
    empleadosActivos: 0,
  })
  const [resumenDocumentos, setResumenDocumentos] = useState<ResumenDocumentos>({
    pendientesConciliar: 0,
    conciliados: 0,
    valorPendiente: 0,
  })

  const vencimientos: Vencimiento[] = useMemo(
    () => [
      { id: '1', obligacion: 'Retención en la fuente (mensual)', fecha: 'Según último dígito del NIT', estado: 'proximo' },
      { id: '2', obligacion: 'IVA (bimestral o cuatrimestral)', fecha: 'Calendario DIAN vigente', estado: 'proximo' },
      { id: '3', obligacion: 'Aportes a seguridad social (PILA)', fecha: 'Mismo plazo de la retención', estado: 'proximo' },
    ],
    []
  )

  useEffect(() => {
    cargarResumen()
  }, [])

  async function cargarResumen() {
    setCargando(true)
    setError(null)

    const { data: empresa, error: errEmpresa } = await supabase
      .from('empresas')
      .select('id')
      .limit(1)
      .single()

    if (errEmpresa || !empresa) {
      setError('No se encontró ninguna empresa registrada en Supabase.')
      setCargando(false)
      return
    }

    const [{ data: empleados }, { data: liquidaciones }, { data: documentos }] = await Promise.all([
      supabase.from('empleados').select('id').eq('empresa_id', empresa.id).eq('activo', true),
      supabase.from('liquidaciones_nomina').select('neto_a_pagar, pago_realizado, empleado_id, empleados!inner(empresa_id)').eq('empleados.empresa_id', empresa.id),
      supabase.from('documentos').select('estado_conciliacion, valor').eq('empresa_id', empresa.id),
    ])

    const totalLiquidado = (liquidaciones ?? []).reduce((sum, l: any) => sum + Number(l.neto_a_pagar ?? 0), 0)
    const totalPendientePago = (liquidaciones ?? []).filter((l: any) => !l.pago_realizado).reduce((sum, l: any) => sum + Number(l.neto_a_pagar ?? 0), 0)

    setResumenNomina({
      totalLiquidado,
      totalPendientePago,
      empleadosActivos: (empleados ?? []).length,
    })

    const pendientesConciliar = (documentos ?? []).filter((d) => d.estado_conciliacion === 'pendiente')
    const conciliados = (documentos ?? []).filter((d) => d.estado_conciliacion === 'conciliado')

    setResumenDocumentos({
      pendientesConciliar: pendientesConciliar.length,
      conciliados: conciliados.length,
      valorPendiente: pendientesConciliar.reduce((sum, d) => sum + Number(d.valor ?? 0), 0),
    })

  async function cargarFacturas(userId: string) {
    const { data, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (!error) {
      setFacturas(data ?? [])
    }
  }


    setCargando(false)
  }
async function cargarFacturas(userId: string) {
    const { data, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (!error) {
      setFacturas(data ?? [])
    }
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
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!error) {
    setFacturas(data ?? [])
  }
}
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
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const cargarReportePeriodo = async () => {
  if (!user) return
  setLoadingReporte(true)
  setTotalDesembolsado(null)
  setNominaReporte([])
  setFacturasReporte([])

  const periodo = `${reporteAnio}-${String(reporteMes).padStart(2,'0')}`

  const { data: dataNomina } = await supabase
    .from('nomina_programada')
    .select('*')
    .eq('user_id', user.id)
    .eq('estado', 'Pagado')
    .eq('periodo_contable', periodo)

  if (dataNomina) {
    setNominaReporte(dataNomina)
    setTotalDesembolsado(
      dataNomina.reduce((a: number, b: any) => a + Math.round(b.neto_pagar || 0), 0)
    )
  }

  const { data: dataFact } = await supabase
    .from('facturas')
    .select('*')
    .eq('user_id', user.id)
    .eq('periodo_contable', periodo)

  if (dataFact) setFacturasReporte(dataFact)

  setLoadingReporte(false)
}
const descargarAliaddoVentasCompras = () => {
  const docs = facturasReporte.filter((f:any) => ['Factura de Venta','Factura de Compra','Gasto'].includes(f.categoria))
  const rows: any[] = [['Fecha','NIT Tercero','Nombre Tercero','Cuenta PUC','Concepto','Base','IVA','Total','Tipo']]
  docs.forEach((f:any) => {
    const base = Math.round(f.valor||0)
    const iva = Math.round(f.iva||0)
    if (f.categoria === 'Factura de Venta') {
      rows.push([f.fecha, f.nit||'-', f.proveedor, '4135', f.descripcion||'Ingreso por Ventas', base, 0, base, 'Ingreso'])
      if (iva > 0) rows.push([f.fecha, f.nit||'-', f.proveedor, '2408', 'IVA Ventas', 0, iva, iva, 'IVA'])
    } else {
      rows.push([f.fecha, f.nit||'-', f.proveedor, '5105', f.descripcion||f.categoria, base, 0, base, 'Egreso'])
      if (iva > 0) rows.push([f.fecha, f.nit||'-', f.proveedor, '2367', 'IVA Descontable', 0, iva, iva, 'IVA'])
    }
  })
  const csv = rows.map((r:any) => r.map((c:any) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Aliaddo_${meses[reporteMes-1]}_${reporteAnio}.csv`
  a.click()
}

const descargarResumen = () => {
  const pagados = nominaReporte.filter(n => n.estado === 'Pagado')
  const fmt = (v: number) => Math.round(v || 0)
  const rows = [
    [`RESUMEN NÓMINA - ${meses[reporteMes-1].toUpperCase()} ${reporteAnio}`],
    [`Empleados pagados: ${pagados.length}`],
    [],
    ['CONCEPTO','CUENTA CONTABLE','VALOR'],
    ['Salario Básico','510506', pagados.reduce((a,b)=>a+fmt(b.sueldo_base),0)],
    ['Auxilio de Transporte','510527', pagados.reduce((a,b)=>a+fmt(b.auxilio_transporte),0)],
    ['Bonificaciones','510548', pagados.reduce((a,b)=>a+fmt(b.bonificaciones),0)],
    ['Primas de Servicios','510530', pagados.reduce((a,b)=>a+fmt(b.abono_prima),0)],
    ['Deducción Salud (4%)','2370', -pagados.reduce((a,b)=>a+fmt(b.salud),0)],
    ['Deducción Pensión (4%)','2380', -pagados.reduce((a,b)=>a+fmt(b.pension),0)],
    [],
    ['TOTAL NETO A PAGAR','', pagados.reduce((a,b)=>a+fmt(b.neto_pagar),0)],
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Resumen_Nomina_${meses[reporteMes-1]}_${reporteAnio}.csv`
  a.click()
}

const descargarAliaddo = () => {
  const pagados = nominaReporte.filter(n => n.estado === 'Pagado')
  const fmt = (v: number) => Math.round(v || 0)
  const fecha = `${reporteAnio}-${String(reporteMes).padStart(2,'0')}-30`
  const rows: any[] = [['Fecha','TipoDocumento','Numero','NIT','Nombre','Cuenta','Concepto','Debito','Credito']]
  pagados.forEach((n, i) => {
    const num = `NOM${reporteAnio}${String(reporteMes).padStart(2,'0')}${String(i+1).padStart(3,'0')}`
    if (fmt(n.sueldo_base)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'510506','Salario Básico',fmt(n.sueldo_base),0])
    if (fmt(n.auxilio_transporte)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'510527','Auxilio Transporte',fmt(n.auxilio_transporte),0])
    if (fmt(n.bonificaciones)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'510548','Bonificaciones',fmt(n.bonificaciones),0])
    if (fmt(n.abono_prima)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'510530','Prima Servicios',fmt(n.abono_prima),0])
    if (fmt(n.salud)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'2370','Deducción Salud',0,fmt(n.salud)])
    if (fmt(n.pension)>0) rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'2380','Deducción Pensión',0,fmt(n.pension)])
    rows.push([fecha,'COMPROBANTE',num,n.cedula,n.nombre_empleado,'2610','Neto a Pagar',0,fmt(n.neto_pagar)])
  })
  const csv = rows.map(r => r.map((c: any)=>`"${c}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Aliaddo_Nomina_${meses[reporteMes-1]}_${reporteAnio}.csv`
  a.click()
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
  const ventasRep = facturasReporte.filter((f:any) => f.categoria === 'Factura de Venta')
const comprasRep = facturasReporte.filter((f:any) => ['Factura de Compra','Gasto'].includes(f.categoria))
const baseVentasRep = ventasRep.reduce((a:number,b:any) => a + Math.round(b.valor||0), 0)
const ivaVentasRep = ventasRep.reduce((a:number,b:any) => a + Math.round(b.iva||0), 0)
const baseComprasRep = comprasRep.reduce((a:number,b:any) => a + Math.round(b.valor||0), 0)
const ivaComprasRep = comprasRep.reduce((a:number,b:any) => a + Math.round(b.iva||0), 0)
  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  )
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 ml-64 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <section className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">ContaBot</p>
            <h1 className="text-3xl font-semibold text-slate-900">Resumen general</h1>
            {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </section>

          {cargando ? (
            <p className="text-slate-500">Cargando resumen...</p>
          ) : (
            <>
              <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <Tarjeta titulo="Empleados activos" valor={resumenNomina.empleadosActivos.toString()} color="slate" />
                <Tarjeta titulo="Nómina liquidada" valor={`$${resumenNomina.totalLiquidado.toLocaleString()}`} color="emerald" />
                <Tarjeta titulo="Nómina pendiente de pago" valor={`$${resumenNomina.totalPendientePago.toLocaleString()}`} color="yellow" />
                <Tarjeta titulo="Documentos sin conciliar" valor={resumenDocumentos.pendientesConciliar.toString()} color="red" />
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900 mb-5">Conciliación de documentos</h2>
                  <div className="space-y-3">
                    <FilaResumen etiqueta="Conciliados" valor={resumenDocumentos.conciliados.toString()} />
                    <FilaResumen etiqueta="Pendientes" valor={resumenDocumentos.pendientesConciliar.toString()} />
                    <FilaResumen etiqueta="Valor pendiente" valor={`$${resumenDocumentos.valorPendiente.toLocaleString()}`} />
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900 mb-5">Vencimientos próximos</h2>
                  <div className="space-y-3">
                    {vencimientos.map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{v.obligacion}</p>
                          <p className="text-xs text-slate-500">{v.fecha}</p>
                        </div>
                        <EstadoBadge estado={v.estado} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Tarjeta({ titulo, valor, color }: { titulo: string; valor: string; color: 'slate' | 'emerald' | 'yellow' | 'red' }) {
  const estilos: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className={`rounded-3xl p-5 ${estilos[color]}`}>
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
    </div>
  )
}

function FilaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{etiqueta}</span>
      <span className="text-sm font-semibold text-slate-900">{valor}</span>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: Vencimiento['estado'] }) {
  const estilos: Record<Vencimiento['estado'], string> = {
    proximo: 'bg-yellow-100 text-yellow-700',
    vencido: 'bg-red-100 text-red-700',
    cumplido: 'bg-emerald-100 text-emerald-700',
  }
  const texto: Record<Vencimiento['estado'], string> = {
    proximo: 'Próximo',
    vencido: 'Vencido',
    cumplido: 'Cumplido',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${estilos[estado]}`}>
      {texto[estado]}
    </span>
  )
}
