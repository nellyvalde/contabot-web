// lib/nomina/importarExcel.ts
// Normalizador Semantico Inteligente para importacion de nomina
// Compatible con cualquier formato de Excel colombiano

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { liquidarNomina } from './calculo'
import { CUENTAS_PUC_NOMINA } from './conceptosPuc'

// ============================================================
// DETECTOR SEMANTICO DE COLUMNAS
// Busca la columna correcta por palabras clave sin importar
// el nombre exacto que use el cliente
// ============================================================
function detectarColumna(encabezados: string[], palabrasClave: string[]): string | null {
  for (const enc of encabezados) {
    const normalizado = enc.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
    for (const clave of palabrasClave) {
      const claveNorm = clave.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
      if (normalizado.includes(claveNorm)) return enc
    }
  }
  return null
}

function leerNumero(valor: any): number {
  if (valor === undefined || valor === null || valor === '') return 0
  const str = String(valor)
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  return parseFloat(str) || 0
}

function leerTexto(valor: any): string {
  if (valor === undefined || valor === null) return ''
  return String(valor).trim()
}

// ============================================================
// PARSER PRINCIPAL
// ============================================================
// ============================================================
// DETECTOR AUTOMATICO DE FILA DE ENCABEZADOS
// ============================================================
const PALABRAS_CLAVE_ENCABEZADO = [
  'nombre', 'empleado', 'cedula', 'identificacion', 'basico',
  'sueldo', 'salario', 'neto', 'transporte', 'trabajador'
]

function encontrarFilaEncabezado(hoja: XLSX.WorkSheet): number {
  const todasFilas: any[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1, defval: '', raw: false,
  })
  for (let i = 0; i < Math.min(todasFilas.length, 20); i++) {
    const fila = todasFilas[i]
    const textos = fila.map((c: any) =>
      String(c ?? '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
    )
    const coincidencias = PALABRAS_CLAVE_ENCABEZADO.filter(k => textos.some(t => t.includes(k)))
    if (coincidencias.length >= 2) return i
  }
  return 0
}
export async function parseExcelNomina(archivo: File): Promise<any[]> {
  const arrayBuffer = await archivo.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const hoja = workbook.Sheets[workbook.SheetNames[0]]

  // Detectar fila de encabezados automaticamente
  const filaEncabezado = encontrarFilaEncabezado(hoja)
  const todasFilas: any[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false })
  if (todasFilas.length <= filaEncabezado) return []
  const encabezados: string[] = todasFilas[filaEncabezado].map((h: any) => String(h ?? '').trim())
  const filasCrudas: Record<string, any>[] = []
  for (let i = filaEncabezado + 1; i < todasFilas.length; i++) {
    const fila = todasFilas[i]
    const obj: Record<string, any> = {}
    encabezados.forEach((enc, idx) => { if (enc) obj[enc] = fila[idx] ?? '' })
    filasCrudas.push(obj)
  }

  if (filasCrudas.length === 0) return []

  // Detectar columnas semanticamente
  const encabezados2 = Object.keys(filasCrudas[0])
  
  const colCedula = detectarColumna(encabezados2, [
    'cedula', 'cc', 'identificacion', 'documento', 'id empleado', 'nro documento',
    'numero documento', 'doc', 'identificador', 'nit', 'dni'
  ])
  
  const colNombre = detectarColumna(encabezados2, [
    'nombre', 'empleado', 'nombres', 'colaborador', 'trabajador', 
    'funcionario', 'personal', 'apellidos', 'nombre empleado',
    'nombre completo', 'apellido'
  ])
  
  const colArea = detectarColumna(encabezados2, [
    'area', 'cargo', 'puesto', 'departamento', 'seccion', 'sede',
    'lugar', 'centro costo', 'centro de costo', 'ubicacion', 'trabajo'
  ])
  
  const colBasico = detectarColumna(encabezados2, [
    'basico', 'sueldo', 'salario', 'pago base', 'salario base',
    'sueldo base', 'salario basico', 'basico mensual', 'salario mensual'
  ])
  
  const colTransporte = detectarColumna(encabezados2, [
    'transporte', 'auxilio', 'aux transporte', 'auxilio transporte',
    'aux de transporte', 'subsidio transporte'
  ])
  
  const colBonos = detectarColumna(encabezados2, [
    'bonos', 'bonificacion', 'bonificaciones', 'comision', 'comisiones',
    'nosalarial', 'no salarial', 'extra', 'recargo', 'incentivo'
  ])
  
  const colPrima = detectarColumna(encabezados2, [
    'prima', 'prima servicios', 'prima de servicios'
  ])
  
  const colVacaciones = detectarColumna(encabezados2, [
    'vacaciones', 'vacacion', 'dias vacaciones'
  ])

  const colPrestamo = detectarColumna(encabezados2, [
    'prestamo', 'credito', 'anticipos', 'anticipo', 'adelanto'
  ])
  
  const colDescuento = detectarColumna(encabezados2, [
    'descuento', 'descuentos', 'deduccion', 'deducciones', 'embargo'
  ])
  
  const colAbonoPrima = detectarColumna(encabezados2, [
    'abono prima', 'abono de prima', 'prima abono', 'pago prima'
  ])

  const colCesantias = detectarColumna(encabezados2, [
    'cesantias', 'cesantia', 'auxilio cesantias'
  ])

  const colAbonoCesantias = detectarColumna(encabezados2, [
    'abono cesantias', 'pago cesantias', 'cesantias abono'
  ])

  const colAbonoLiquidacion = detectarColumna(encabezados2, [
    'liquidacion', 'abono liquidacion', 'pago liquidacion', 'indemnizacion'
  ])

  const colDias = detectarColumna(encabezados2, [
    'dias', 'dias trabajados', 'dias laborados', 'jornada', 'dias laborales'
  ])
  
  const colNeto = detectarColumna(encabezados2, [
    'neto pagado', 'neto pagar', 'neto a pagar', 'a pagar', 'total pagar',
    'total a pagar', 'valor neto', 'neto', 'pago neto', 'total neto',
    'salario neto', 'salario real', 'valor pagado', 'total pagado'
  ])

  const colObservaciones = detectarColumna(encabezados2, [
    'observaciones', 'observacion', 'notas', 'nota', 'comentario', 'detalle'
  ])

  // Procesar filas
  const filas: any[] = []
  
  for (const fila of filasCrudas) {
    // Ignorar filas sin nombre (totales, espacios en blanco, encabezados duplicados)
    const nombre = colNombre ? leerTexto(fila[colNombre]) : ''
    if (!nombre || nombre.length < 2) continue
    
    // Ignorar filas que parezcan totales
    const nombreLower = nombre.toLowerCase()
    if (['total', 'totales', 'subtotal', 'suma', 'grand total'].some(t => nombreLower.includes(t))) continue

    const cedula = colCedula ? leerTexto(fila[colCedula]) : ''
    const area = colArea ? leerTexto(fila[colArea]) : null
    const basico = colBasico ? leerNumero(fila[colBasico]) : 0
    const transporte = colTransporte ? leerNumero(fila[colTransporte]) : 0
    const bonos = colBonos ? leerNumero(fila[colBonos]) : 0
    const prima = colPrima ? leerNumero(fila[colPrima]) : 0
    const vacaciones = colVacaciones ? leerNumero(fila[colVacaciones]) : 0
    const prestamo = colPrestamo ? leerNumero(fila[colPrestamo]) : 0
    const descuento = colDescuento ? leerNumero(fila[colDescuento]) : 0
    const abonoPrima = colAbonoPrima ? leerNumero(fila[colAbonoPrima]) : 0
    const cesantias = colCesantias ? leerNumero(fila[colCesantias]) : 0
    const abonoCesantias = colAbonoCesantias ? leerNumero(fila[colAbonoCesantias]) : 0
    const abonoLiquidacion = colAbonoLiquidacion ? leerNumero(fila[colAbonoLiquidacion]) : 0
    const dias = colDias ? leerNumero(fila[colDias]) : 30
    const netoExplicito = colNeto ? leerNumero(fila[colNeto]) : null
    const observaciones = colObservaciones ? leerTexto(fila[colObservaciones]) : null

    filas.push({
      cedula: cedula || `SIN-CEDULA-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      nombre,
      area,
      diasTrabajados: dias || 30,
      conceptos: {
        sueldoBase: basico,
        auxilioTransporte: transporte,
        bonificaciones: bonos,
        prima,
        vacaciones,
        prestamo,
        descuento,
        abonoPrima,
        cesantias,
        abonoCesantias,
        abonoLiquidacion,
      },
      netoExplicito: netoExplicito && netoExplicito > 0 ? netoExplicito : null,
      observaciones,
    })
  }

  return filas
}

// ============================================================
// GUARDADO EN SUPABASE CON UPSERT REAL
// ============================================================
export async function guardarNominaProgramada(
  filas: any[],
  userId: string,
  periodoContable: string
): Promise<{
  filasInsertadas: number
  filasActualizadas: number
  filasOmitidas: { cedula: string; motivo: string }[]
  alertasUgpp: { nombre: string; excesoLey1393: number }[]
}> {
  const filasOmitidas: { cedula: string; motivo: string }[] = []
  const alertasUgpp: { nombre: string; excesoLey1393: number }[] = []
  let filasInsertadas = 0
  let filasActualizadas = 0

  for (const fila of filas) {
    try {
      const liquidacion = liquidarNomina(fila.conceptos)
      
      if (liquidacion.excesoLey1393 > 0) {
        alertasUgpp.push({ nombre: fila.nombre, excesoLey1393: liquidacion.excesoLey1393 })
      }

      const netoPagar = fila.netoExplicito ?? liquidacion.netoAPagar

      const registro = {
        user_id: userId,
        nombre_empleado: fila.nombre,
        cedula: fila.cedula,
        area: fila.area || null,
        sueldo_base: fila.conceptos.sueldoBase,
        auxilio_transporte: fila.conceptos.auxilioTransporte,
        dias_trabajados: fila.diasTrabajados ?? 30,
        bonificaciones: fila.conceptos.bonificaciones,
        total_devengado: liquidacion.baseAportes,
        prima: fila.conceptos.prima,
        vacaciones: fila.conceptos.vacaciones,
        prestamo: fila.conceptos.prestamo,
        descuento: fila.conceptos.descuento,
        pension: liquidacion.aportePensionEmpleado,
        salud: liquidacion.aporteSaludEmpleado,
        total_deducciones: liquidacion.totalDeducciones,
        neto_pagar: netoPagar,
        observaciones: fila.observaciones || null,
        estado: 'Pendiente de Pago',
        fecha_carga: new Date().toISOString().slice(0, 10),
        periodo_contable: periodoContable,
        abono_prima: fila.conceptos.abonoPrima,
        cesantias: fila.conceptos.cesantias,
        abono_cesantias: fila.conceptos.abonoCesantias,
        abono_liquidacion: fila.conceptos.abonoLiquidacion,
        cuenta_puc_basico: CUENTAS_PUC_NOMINA.basico,
        cuenta_puc_transporte: CUENTAS_PUC_NOMINA.transporte,
        cuenta_puc_bonos: CUENTAS_PUC_NOMINA.bonos,
        cuenta_puc_prima: CUENTAS_PUC_NOMINA.prima,
        exceso_ley_1393: liquidacion.excesoLey1393,
        alerta_riesgo_ugpp: liquidacion.excesoLey1393 > 0,
      }

      // Buscar si ya existe este empleado en este periodo
      const { data: existente } = await supabase
        .from('nomina_programada')
        .select('id, estado')
        .eq('user_id', userId)
        .eq('cedula', fila.cedula)
        .eq('periodo_contable', periodoContable)
        .maybeSingle()

      if (existente) {
        // Ya existe â€” actualizar sin cambiar el estado si ya estÃ¡ Pagado
        const estadoFinal = existente.estado === 'Pagado' ? 'Pagado' : 'Pendiente de Pago'
        const { error } = await supabase
          .from('nomina_programada')
          .update({ ...registro, estado: estadoFinal })
          .eq('id', existente.id)
        
        if (error) {
          filasOmitidas.push({ cedula: fila.cedula, motivo: `Error actualizando: ${error.message}` })
        } else {
          filasActualizadas++
        }
      } else {
        // No existe â€” insertar
        const { error } = await supabase
          .from('nomina_programada')
          .insert(registro)
        
        if (error) {
          filasOmitidas.push({ cedula: fila.cedula, motivo: `Error insertando: ${error.message}` })
        } else {
          filasInsertadas++
        }
      }
    } catch (err: any) {
      filasOmitidas.push({ cedula: fila.cedula, motivo: `Error procesando: ${err.message}` })
    }
  }

  return { filasInsertadas, filasActualizadas, filasOmitidas, alertasUgpp }
}

