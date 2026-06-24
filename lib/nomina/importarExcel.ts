// lib/nomina/importarExcel.ts
//
// Importación de novedades de nómina desde Excel hacia tu tabla REAL
// `nomina_programada` (sueldo_base, auxilio_transporte, bonificaciones,
// prima, vacaciones, prestamo, descuento, abono_prima, periodo_contable,
// estado, etc.) — ya filtrada por user_id, no por empresa_id.
//
// Requiere la librería 'xlsx' (SheetJS):
//
//   npm install xlsx
//
// Formato de Excel esperado (encabezados en la primera fila, sin importar
// mayúsculas/minúsculas ni acentos). Solo Cedula, Nombre y SueldoBase son
// obligatorios; el resto es opcional y se asume 0 si no viene:
//
//   | Cedula     | Nombre        | Area       | SueldoBase | Transporte | Bonos   | Prima | Vacaciones | Prestamo | Descuento | AbonoPrima | Cesantias | AbonoCesantias | AbonoLiquidacion | DiasTrabajados |
//   |------------|---------------|------------|------------|------------|---------|-------|------------|----------|-----------|------------|-----------|----------------|------------------|----------------|
//   | 1020304050 | Laura Torres  | Contable   | 2500000    | 200000     | 300000  | 0     | 0          | 0        | 0         | 0          | 0         | 0              | 0                | 30             |
//
// ⚠️ Tu tabla no tiene una restricción única (solo primary key por id), así
// que el "upsert" se hace aquí en código: por cada fila del Excel se busca
// si ya existe un registro con la misma cédula + periodo_contable + user_id;
// si existe, se actualiza esa fila por su id; si no, se inserta una nueva.
// Si encuentra MÁS de una coincidencia (datos duplicados de antes), la fila
// se omite y se reporta, en vez de adivinar cuál sobrescribir.

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase/client'
import { CUENTAS_PUC_NOMINA, calcularLiquidacion, type ConceptosNomina } from '@/lib/nomina/conceptosPuc'

type FilaExcelCrudo = Record<string, string | number | undefined>

export type FilaImportada = {
  cedula: string
  nombre: string
  area: string | null
  diasTrabajados: number | null
  conceptos: ConceptosNomina
  netoExplicito: number | null
  observaciones: string | null
}

export type ResultadoImportacion = {
  filasInsertadas: number
  filasActualizadas: number
  filasOmitidas: { cedula: string; motivo: string }[]
  alertasUgpp: { nombre: string; excesoLey1393: number }[]
}

function normalizarEncabezado(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function leerNumero(valor: string | number | undefined): number {
  if (valor === undefined || valor === null || valor === '') return 0
  const limpio = typeof valor === 'string' ? valor.replace(/[^0-9.-]/g, '') : valor
  const num = Number(limpio)
  return Number.isFinite(num) ? num : 0
}

export async function parseExcelNomina(archivo: File): Promise<FilaImportada[]> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filasCrudas: FilaExcelCrudo[] = XLSX.utils.sheet_to_json(hoja, { defval: '' })

  return filasCrudas.map((filaCruda) => {
    const fila: Record<string, string | number | undefined> = {}
    for (const [clave, valor] of Object.entries(filaCruda)) {
      fila[normalizarEncabezado(clave)] = valor
    }

    const cedula = String(fila['cedula'] ?? fila['cc'] ?? '').trim()
    const nombre = String(fila['nombre'] ?? fila['nombreempleado'] ?? fila['empleado'] ?? '').trim()
    const areaCruda = String(fila['area'] ?? '').trim()

    const conceptos: ConceptosNomina = {
      sueldoBase: leerNumero(fila['sueldobase'] ?? fila['basico'] ?? fila['salario'] ?? fila['salariobase']),
      auxilioTransporte: leerNumero(fila['transporte'] ?? fila['auxiliotransporte']),
      bonificaciones: leerNumero(fila['bonos'] ?? fila['bonificaciones'] ?? fila['nosalarial']),
      prima: leerNumero(fila['prima']),
      vacaciones: leerNumero(fila['vacaciones']),
      prestamo: leerNumero(fila['prestamo']),
      descuento: leerNumero(fila['descuento']),
      abonoPrima: leerNumero(fila['abonoprima']),
      cesantias: leerNumero(fila['cesantias']),
      abonoCesantias: leerNumero(fila['abonocesantias']),
      abonoLiquidacion: leerNumero(fila['abonoliquidacion'] ?? fila['liquidacion'] ?? fila['pagoliquidacion']),
    }

    const diasCrudo = fila['diastrabajados'] ?? fila['dias'] ?? fila['diaslaborados'] ?? fila['dias trabajados'] ?? fila['dias laborados'] ?? fila['jornada'] ?? undefined
    const diasTrabajados = diasCrudo !== undefined && diasCrudo !== '' ? leerNumero(diasCrudo) : null

    const netoCrudo = fila['neto'] ?? fila['netopagar'] ?? fila['netopagado'] ?? 
  fila['neto pagado'] ?? fila['valorneto'] ?? fila['netodevengado'] ?? 
  fila['neto devengado'] ?? fila['netoapagar'] ?? fila['neto a pagar'] ?? 
  fila['pagoneto'] ?? fila['pago neto'] ?? fila['totalapagar'] ?? 
  fila['total a pagar'] ?? fila['totalneto'] ?? fila['total neto'] ?? 
  fila['salarioreal'] ?? fila['salario real'] ?? fila['salarioneto'] ?? 
  fila['salario neto'] ?? undefined
    const netoExplicito = netoCrudo !== undefined && netoCrudo !== '' ? leerNumero(netoCrudo) : null

    const observacionesCrudo = String(fila['observaciones'] ?? '').trim()

    return {
      cedula,
      nombre,
      area: areaCruda || null,
      diasTrabajados,
      conceptos,
      netoExplicito,
      observaciones: observacionesCrudo || null,
    }
  })
}

export async function guardarNominaProgramada(
  filas: FilaImportada[],
  userId: string,
  periodoContable: string
): Promise<ResultadoImportacion> {
  type FilaExistente = { id: number; cedula: string }

  const { data: existentes, error: errExistentes } = await supabase
    .from('nomina_programada')
    .select('id, cedula')
    .eq('user_id', userId)
    .eq('periodo_contable', periodoContable)
    .returns<FilaExistente[]>()

  if (errExistentes) {
    throw new Error(`No se pudo revisar qué ya existía para este periodo: ${errExistentes.message}`)
  }

  const idsPorCedula = new Map<string, number[]>()
  for (const fila of existentes ?? []) {
    const lista = idsPorCedula.get(fila.cedula.trim()) ?? []
    lista.push(fila.id)
    idsPorCedula.set(fila.cedula.trim(), lista)
  }

  const filasOmitidas: ResultadoImportacion['filasOmitidas'] = []
  const alertasUgpp: ResultadoImportacion['alertasUgpp'] = []
  let filasInsertadas = 0
  let filasActualizadas = 0

  for (const fila of filas) {
    if (!fila.cedula || !fila.nombre) {
      filasOmitidas.push({ cedula: fila.cedula || '(vacía)', motivo: 'Fila sin cédula o sin nombre' })
      continue
    }

    const liquidacion = calcularLiquidacion(fila.conceptos)
    if (liquidacion.alertaRiesgoUgpp) {
      alertasUgpp.push({ nombre: fila.nombre, excesoLey1393: liquidacion.excesoLey1393 })
    }

    const netoPagar = fila.netoExplicito ?? liquidacion.netoPagar

    const registro = {
      user_id: userId,
      nombre_empleado: fila.nombre,
      cedula: fila.cedula,
      area: fila.area,
      sueldo_base: fila.conceptos.sueldoBase,
      auxilio_transporte: fila.conceptos.auxilioTransporte,
      dias_trabajados: fila.diasTrabajados ?? 30,
      bonificaciones: fila.conceptos.bonificaciones,
      total_devengado: liquidacion.totalDevengado,
      prima: fila.conceptos.prima,
      vacaciones: fila.conceptos.vacaciones,
      prestamo: fila.conceptos.prestamo,
      descuento: fila.conceptos.descuento,
      pension: liquidacion.pension,
      salud: liquidacion.salud,
      total_deducciones: liquidacion.totalDeducciones,
      neto_pagar: netoPagar,
      observaciones: fila.observaciones,
      estado: 'Pendiente de pago',
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
      alerta_riesgo_ugpp: liquidacion.alertaRiesgoUgpp,
    }

    const idsExistentes = idsPorCedula.get(fila.cedula.trim()) ?? []

    if (idsExistentes.length > 1) {
      filasOmitidas.push({
        cedula: fila.cedula,
        motivo: `Ya hay ${idsExistentes.length} registros de esta cédula en este periodo; revísalo manualmente antes de importar`,
      })
      continue
    }

    if (idsExistentes.length === 1) {
      const { error: errUpdate } = await supabase.from('nomina_programada').update(registro).eq('id', idsExistentes[0])
      if (errUpdate) {
        filasOmitidas.push({ cedula: fila.cedula, motivo: `Error actualizando: ${errUpdate.message}` })
        continue
      }
      filasActualizadas++
    } else {
      const { error: errInsert } = await supabase.from('nomina_programada').insert(registro)
      if (errInsert) {
        filasOmitidas.push({ cedula: fila.cedula, motivo: `Error insertando: ${errInsert.message}` })
        continue
      }
      filasInsertadas++
    }
  }

  return { filasInsertadas, filasActualizadas, filasOmitidas, alertasUgpp }
}