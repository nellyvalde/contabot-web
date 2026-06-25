// lib/nomina/importarExcel.ts
// Normalizador Semantico Inteligente para importacion de nomina
// Compatible con cualquier formato de Excel colombiano

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { liquidarNomina } from './calculo'
import { CUENTAS_PUC_NOMINA } from './conceptosPuc'

function detectarColumna(encabezados: string[], palabrasClave: string[]): string | null {
  for (const enc of encabezados) {
    const normalizado = enc.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').trim()
    for (const clave of palabrasClave) {
      const claveNorm = clave.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '').trim()
      if (normalizado.includes(claveNorm)) return enc
    }
  }
  return null
}

function leerNumero(valor: any): number {
  if (valor === undefined || valor === null || valor === '') return 0
  const str = String(valor)
    .replace(/\$/g, '').replace(/\s/g, '')
    .replace(/\./g, '').replace(',', '.').trim()
  return parseFloat(str) || 0
}

function leerTexto(valor: any): string {
  if (valor === undefined || valor === null) return ''
  return String(valor).trim()
}

// ============================================================
// BUSCADOR DINAMICO DE CABECERAS
// Recorre las primeras 20 filas buscando la que contenga
// palabras clave de nomina. Independiente de cuantas filas
// de titulo, logos o secciones tenga el Excel arriba.
// ============================================================
const PALABRAS_CABECERA = [
  'identificacion', 'cedula', 'empleado', 'nombre', 'trabajador',
  'basico', 'sueldo', 'salario', 'neto', 'transporte'
]

function encontrarFilaCabecera(filas: any[][]): number {
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const textoConcatenado = filas[i]
      .map((c: any) => String(c ?? '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ''))
      .join(' ')

    const coincidencias = PALABRAS_CABECERA.filter(p => textoConcatenado.includes(p))
    if (coincidencias.length >= 2 && !textoConcatenado.includes("datos basicos") && !textoConcatenado.includes("devengado")) {
      console.log(`[ContaBot] Encabezados detectados en fila ${i + 1}:`, coincidencias)
      return i
    }
  }
  console.warn('[ContaBot] No se detectaron encabezados en las primeras 20 filas. Usando fila 0.')
  return 0
}

// ============================================================
// PARSER PRINCIPAL
// ============================================================
export async function parseExcelNomina(archivo: File): Promise<any[]> {
  const arrayBuffer = await archivo.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const hoja = workbook.Sheets[workbook.SheetNames[0]]

  // Leer TODO el Excel como array crudo (sin interpretar encabezados)
  const todasLasFilas: any[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    defval: '',
    raw: false,
  })

  console.log('[ContaBot] Total filas en el Excel:', todasLasFilas.length)

  // Encontrar dinamicamente la fila de cabeceras
  const indiceCabecera = encontrarFilaCabecera(todasLasFilas)
  const encabezadosRaw: string[] = todasLasFilas[indiceCabecera]
    .map((h: any) => String(h ?? '').trim())

  console.log('[ContaBot] Encabezados encontrados:', encabezadosRaw.filter(e => e !== ''))

  // Construir objetos desde la fila SIGUIENTE a la cabecera
  const filasCrudas: Record<string, any>[] = []
  for (let i = indiceCabecera + 1; i < todasLasFilas.length; i++) {
    const filaArr = todasLasFilas[i]
    const obj: Record<string, any> = {}
    encabezadosRaw.forEach((enc, idx) => {
      if (enc) obj[enc] = filaArr[idx] ?? ''
    })
    filasCrudas.push(obj)
  }

  console.log('[ContaBot] Filas de datos a procesar:', filasCrudas.length)

  if (filasCrudas.length === 0) return []

  const encabezados = encabezadosRaw.filter(e => e !== '')

  const colCedula = detectarColumna(encabezados, [
    'cedula', 'cc', 'identificacion', 'documento', 'id empleado',
    'nro documento', 'numero documento', 'doc', 'identificador', 'nit', 'dni'
  ])
  const colNombre = detectarColumna(encabezados, [
    'nombre', 'empleado', 'nombres', 'colaborador', 'trabajador',
    'funcionario', 'personal', 'apellidos', 'nombre empleado',
    'nombre completo', 'apellido', 'nombre del empleado'
  ])
  const colArea = detectarColumna(encabezados, [
    'area', 'cargo', 'puesto', 'departamento', 'seccion', 'sede',
    'lugar', 'centro costo', 'ubicacion', 'trabajo', 'area trabajo'
  ])
  const colBasico = detectarColumna(encabezados, [
    'basico', 'sueldo', 'salario', 'pago base', 'salario base',
    'sueldo base', 'salario basico', 'basico mensual', 'sueldo basico'
  ])
  const colTransporte = detectarColumna(encabezados, [
    'transporte', 'auxilio', 'aux transporte', 'auxilio transporte',
    'aux de transporte', 'subsidio transporte', 'aux transp'
  ])
  const colBonos = detectarColumna(encabezados, [
    'bonos', 'bonificacion', 'bonificaciones', 'comision', 'comisiones',
    'nosalarial', 'no salarial', 'extra', 'recargo', 'incentivo'
  ])
  const colPrima = detectarColumna(encabezados, [
    'prima', 'prima servicios', 'prima de servicios'
  ])
  const colVacaciones = detectarColumna(encabezados, [
    'vacaciones', 'vacacion', 'dias vacaciones'
  ])
  const colPrestamo = detectarColumna(encabezados, [
    'prestamo', 'credito', 'anticipos', 'anticipo', 'adelanto'
  ])
  const colDescuento = detectarColumna(encabezados, [
    'descuento', 'descuentos', 'deduccion', 'deducciones', 'embargo'
  ])
  const colAbonoPrima = detectarColumna(encabezados, [
    'abono prima', 'abono de prima', 'prima abono', 'pago prima'
  ])
  const colCesantias = detectarColumna(encabezados, [
    'cesantias', 'cesantia', 'auxilio cesantias'
  ])
  const colAbonoCesantias = detectarColumna(encabezados, [
    'abono cesantias', 'pago cesantias', 'cesantias abono'
  ])
  const colAbonoLiquidacion = detectarColumna(encabezados, [
    'liquidacion', 'abono liquidacion', 'pago liquidacion', 'indemnizacion'
  ])
  const colDias = detectarColumna(encabezados, [
    'dias', 'dias trabajados', 'dias laborados', 'jornada',
    'dias laborales', 'dias horas trabajadas'
  ])
  const colNeto = detectarColumna(encabezados, [
    'neto pagado', 'neto pagar', 'neto a pagar', 'a pagar', 'total pagar',
    'total a pagar', 'valor neto', 'neto', 'pago neto', 'total neto',
    'salario neto', 'valor pagado', 'total pagado'
  ])
  const colObservaciones = detectarColumna(encabezados, [
    'observaciones', 'observacion', 'notas', 'nota', 'comentario', 'detalle'
  ])

  console.log('[ContaBot] Columnas mapeadas:', {
    colNombre, colCedula, colBasico, colTransporte, colNeto
  })

  const filas: any[] = []

  for (const fila of filasCrudas) {
    // Robustez: ignorar filas sin nombre o cedula, continuar sin detener el proceso
    const nombre = colNombre ? leerTexto(fila[colNombre]) : ''
    if (!nombre || nombre.length < 2) continue

    const nombreLower = nombre.toLowerCase()
    if (['total', 'totales', 'subtotal', 'suma', 'grand total']
      .some(t => nombreLower.includes(t))) continue

    const cedula = colCedula
      ? leerTexto(fila[colCedula]).replace(/[^0-9]/g, '')
      : ''

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
      cedula: cedula || `SIN-CEDULA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  console.log('[ContaBot] Filas validas para guardar:', filas.length)
  return filas
}

// ============================================================
// GUARDADO EN SUPABASE
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

      const { data: existente } = await supabase
        .from('nomina_programada')
        .select('id, estado')
        .eq('user_id', userId)
        .eq('cedula', fila.cedula)
        .eq('periodo_contable', periodoContable)
        .maybeSingle()

      if (existente) {
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


