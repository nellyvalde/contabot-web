// lib/nomina/importarExcel.ts
// Normalizador Semantico Inteligente para importacion de nomina v3

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { liquidarNomina } from './calculo'
import { CUENTAS_PUC_NOMINA } from './conceptosPuc'

function detectarColumna(encabezados: string[], palabrasClave: string[]): string | null {
  for (const enc of encabezados) {
    const normalizado = enc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
    for (const clave of palabrasClave) {
      const claveNorm = clave.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
      if (normalizado.includes(claveNorm)) return enc
    }
  }
  return null
}

function leerNumero(valor: any): number {
  if (valor === undefined || valor === null || valor === '') return 0
  if (typeof valor === 'number') return Math.round(Math.abs(valor))
  const soloDigitos = String(valor).replace(/[^0-9]/g, '')
  if (!soloDigitos) return 0
  return parseInt(soloDigitos, 10)
}

function leerTexto(valor: any): string {
  if (valor === undefined || valor === null) return ''
  return String(valor).trim()
}

export async function parseExcelNomina(archivo: File): Promise<any[]> {
  const arrayBuffer = await archivo.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const hoja = workbook.Sheets[workbook.SheetNames[0]]
  const todasLasFilas: any[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false })

  console.log('[ContaBot] Total filas en el Excel:', todasLasFilas.length)

  const PALABRAS = ['identificacion', 'cedula', 'empleado', 'nombre', 'trabajador', 'basico', 'sueldo', 'salario', 'neto', 'transporte']
  const EXCLUIR = ['datos basicos', 'devengado', 'deducciones']

  let indiceCabecera = 0
  for (let i = 0; i < Math.min(todasLasFilas.length, 20); i++) {
    const texto = todasLasFilas[i].map((c: any) => String(c ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '')).join(' ')
    const esSeccion = EXCLUIR.some(e => texto.includes(e) && !texto.includes('nombre'))
    if (esSeccion) continue
    const coincidencias = PALABRAS.filter(p => texto.includes(p))
    if (coincidencias.length >= 2) {
      indiceCabecera = i
      console.log('[ContaBot] Encabezados detectados en fila', i + 1, ':', coincidencias)
      break
    }
  }

  const encabezadosRaw: string[] = todasLasFilas[indiceCabecera].map((h: any) => String(h ?? '').trim())
  console.log('[ContaBot] Encabezados encontrados:', encabezadosRaw.filter(e => e !== ''))

  const filasCrudas: Record<string, any>[] = []
  for (let i = indiceCabecera + 1; i < todasLasFilas.length; i++) {
    const obj: Record<string, any> = {}
    encabezadosRaw.forEach((enc, idx) => { if (enc) obj[enc] = todasLasFilas[i][idx] ?? '' })
    filasCrudas.push(obj)
  }

  const encabezados = encabezadosRaw.filter(e => e !== '')
  console.log('[ContaBot] Filas de datos a procesar:', filasCrudas.length)

  const colCedula = detectarColumna(encabezados, ['cedula','cc','identificacion','documento','id empleado','nro documento','identificador','nit','dni','identificacion no'])
  const colNombre = detectarColumna(encabezados, ['nombre','empleado','nombres','colaborador','trabajador','funcionario','personal','apellidos','nombre empleado','nombre completo','apellido','nombre del empleado'])
  const colArea = detectarColumna(encabezados, ['area','cargo','puesto','departamento','seccion','sede','lugar','centro costo','ubicacion','trabajo','area trabajo'])
  const colBasico = detectarColumna(encabezados, ['basico','sueldo','salario','pago base','salario base','sueldo base','salario basico','basico mensual','sueldo basico'])
  const colTransporte = detectarColumna(encabezados, ['transporte','auxilio','aux transporte','auxilio transporte','aux de transporte','subsidio transporte','aux transp'])
  const colBonos = detectarColumna(encabezados, ['bonos','bonificacion','bonificaciones','comision','comisiones','nosalarial','no salarial','extra','recargo','incentivo'])
  const colPrima = detectarColumna(encabezados, ['prima','prima servicios','prima de servicios'])
  const colVacaciones = detectarColumna(encabezados, ['vacaciones','vacacion','dias vacaciones'])
  const colPrestamo = detectarColumna(encabezados, ['prestamo','credito','anticipos','anticipo','adelanto'])
  const colDescuento = detectarColumna(encabezados, ['descuento','descuentos','deduccion','deducciones','embargo'])
  const colAbonoPrima = detectarColumna(encabezados, ['abono prima','abono de prima','prima abono','pago prima'])
  const colCesantias = detectarColumna(encabezados, ['cesantias','cesantia','auxilio cesantias'])
  const colAbonoCesantias = detectarColumna(encabezados, ['abono cesantias','pago cesantias','cesantias abono'])
  const colAbonoLiquidacion = detectarColumna(encabezados, ['liquidacion','abono liquidacion','pago liquidacion','indemnizacion'])
  const colDias = detectarColumna(encabezados, ['dias','dias trabajados','dias laborados','jornada','dias laborales','dias horas trabajadas'])
  const colNeto = detectarColumna(encabezados, ['neto pagado','neto pagar','neto a pagar','a pagar','total pagar','total a pagar','valor neto','neto','pago neto','total neto','salario neto','valor pagado','total pagado'])
  const colObservaciones = detectarColumna(encabezados, ['observaciones','observacion','notas','nota','comentario','detalle'])

  console.log('[ContaBot] Columnas mapeadas:', { colNombre, colCedula, colBasico, colTransporte, colNeto })

  const filas: any[] = []
  for (const fila of filasCrudas) {
    const nombre = colNombre ? leerTexto(fila[colNombre]) : ''
    if (!nombre || nombre.length < 2) continue
    const nombreLower = nombre.toLowerCase()
    if (['total','totales','subtotal','suma','grand total'].some(t => nombreLower.includes(t))) continue
    const cedula = colCedula ? leerTexto(fila[colCedula]).replace(/[^0-9]/g, '') : ''
    filas.push({
      cedula: cedula || `SIN-CEDULA-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      nombre,
      area: colArea ? leerTexto(fila[colArea]) : null,
      diasTrabajados: colDias ? leerNumero(fila[colDias]) || 30 : 30,
      conceptos: {
        sueldoBase: colBasico ? leerNumero(fila[colBasico]) : 0,
        auxilioTransporte: colTransporte ? leerNumero(fila[colTransporte]) : 0,
        bonificaciones: colBonos ? leerNumero(fila[colBonos]) : 0,
        prima: colPrima ? leerNumero(fila[colPrima]) : 0,
        vacaciones: colVacaciones ? leerNumero(fila[colVacaciones]) : 0,
        prestamo: colPrestamo ? leerNumero(fila[colPrestamo]) : 0,
        descuento: colDescuento ? leerNumero(fila[colDescuento]) : 0,
        abonoPrima: colAbonoPrima ? leerNumero(fila[colAbonoPrima]) : 0,
        cesantias: colCesantias ? leerNumero(fila[colCesantias]) : 0,
        abonoCesantias: colAbonoCesantias ? leerNumero(fila[colAbonoCesantias]) : 0,
        abonoLiquidacion: colAbonoLiquidacion ? leerNumero(fila[colAbonoLiquidacion]) : 0,
      },
      netoExplicito: colNeto ? (leerNumero(fila[colNeto]) || null) : null,
      observaciones: colObservaciones ? leerTexto(fila[colObservaciones]) : null,
    })
  }

  console.log('[ContaBot] Filas validas para guardar:', filas.length)
  return filas
}

export async function guardarNominaProgramada(filas: any[], userId: string, periodoContable: string): Promise<{ filasInsertadas: number; filasActualizadas: number; filasOmitidas: { cedula: string; motivo: string }[]; alertasUgpp: { nombre: string; excesoLey1393: number }[] }> {
  const filasOmitidas: { cedula: string; motivo: string }[] = []
  const alertasUgpp: { nombre: string; excesoLey1393: number }[] = []
  let filasInsertadas = 0
  let filasActualizadas = 0

  for (const fila of filas) {
    try {
      const liquidacion = liquidarNomina(fila.conceptos)
      if (liquidacion.excesoLey1393 > 0) alertasUgpp.push({ nombre: fila.nombre, excesoLey1393: liquidacion.excesoLey1393 })
      const netoPagar = Math.round(fila.netoExplicito ?? liquidacion.netoAPagar)
      const registro = {
        user_id: userId, nombre_empleado: fila.nombre, cedula: fila.cedula, area: fila.area || null,
        sueldo_base: fila.conceptos.sueldoBase, auxilio_transporte: fila.conceptos.auxilioTransporte,
        dias_trabajados: fila.diasTrabajados ?? 30, bonificaciones: fila.conceptos.bonificaciones,
        total_devengado: liquidacion.baseAportes, prima: fila.conceptos.prima,
        vacaciones: fila.conceptos.vacaciones, prestamo: fila.conceptos.prestamo,
        descuento: fila.conceptos.descuento, pension: liquidacion.aportePensionEmpleado,
        salud: liquidacion.aporteSaludEmpleado, total_deducciones: liquidacion.totalDeducciones,
        neto_pagar: netoPagar, observaciones: fila.observaciones || null,
        estado: 'Pendiente de Pago', fecha_carga: new Date().toISOString().slice(0,10),
        periodo_contable: periodoContable, abono_prima: fila.conceptos.abonoPrima,
        cesantias: fila.conceptos.cesantias, abono_cesantias: fila.conceptos.abonoCesantias,
        abono_liquidacion: fila.conceptos.abonoLiquidacion,
        cuenta_puc_basico: CUENTAS_PUC_NOMINA.basico, cuenta_puc_transporte: CUENTAS_PUC_NOMINA.transporte,
        cuenta_puc_bonos: CUENTAS_PUC_NOMINA.bonos, cuenta_puc_prima: CUENTAS_PUC_NOMINA.prima,
        exceso_ley_1393: liquidacion.excesoLey1393, alerta_riesgo_ugpp: liquidacion.excesoLey1393 > 0,
      }
      const { data: existente } = await supabase.from('nomina_programada').select('id, estado').eq('user_id', userId).eq('cedula', fila.cedula).eq('periodo_contable', periodoContable).maybeSingle()
      if (existente) {
        const estadoFinal = existente.estado === 'Pagado' ? 'Pagado' : 'Pendiente de Pago'
        const { error } = await supabase.from('nomina_programada').update({ ...registro, estado: estadoFinal }).eq('id', existente.id)
        if (error) filasOmitidas.push({ cedula: fila.cedula, motivo: `Error actualizando: ${error.message}` })
        else filasActualizadas++
      } else {
        const { error } = await supabase.from('nomina_programada').insert(registro)
        if (error) filasOmitidas.push({ cedula: fila.cedula, motivo: `Error insertando: ${error.message}` })
        else filasInsertadas++
      }
    } catch (err: any) {
      filasOmitidas.push({ cedula: fila.cedula, motivo: `Error procesando: ${err.message}` })
    }
  }
  return { filasInsertadas, filasActualizadas, filasOmitidas, alertasUgpp }
}
