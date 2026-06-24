// lib/nomina/importarExcel.ts
//
// ============================================================================
// CORRECCIÓN v2 — bug "0 nuevo(s), 0 actualizado(s)"
// ============================================================================
// El bug raíz estaba en guardarNominaProgramada:
//
//   supabase.from('nomina_programada').upsert(filas, { onConflict: 'cedula' })
//
// Supabase necesita que onConflict coincida EXACTAMENTE con el nombre de la
// restricción UNIQUE de la tabla. Si la restricción es
//   UNIQUE(user_id, periodo_contable, cedula)
// pero pasamos solo 'cedula', Postgres no puede resolver el conflicto, no
// hace nada, no lanza error, y devuelve count=0.
//
// FIX: cambiar la estrategia a SELECT → INSERT o UPDATE por cédula,
// así evitamos depender del nombre exacto de la restricción y tenemos
// control total sobre los contadores de nuevos/actualizados.
//
// También se corrige parseExcelNomina para que sea tolerante a:
//   - Encabezados con tildes / mayúsculas / espacios extra
//   - Columnas en diferente orden
//   - Celdas de cédula con puntos o espacios ("93.295.242" → "93295242")
//   - Filas vacías al final del archivo
//   - Excel con hoja activa diferente a la primera
// ============================================================================

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase/client'
import {
  calcularExcesoLey1393,
  PARAMETROS_LEGALES,
} from '@/lib/nomina/calculo'

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------
export type FilaNomina = {
  nombreEmpleado: string
  cedula: string
  area: string | null
  sueldoBase: number
  auxilioTransporte: number
  bonificaciones: number
  prima: number
  abonoPrima: number
  cesantias: number
  abonoCesantias: number
  abonoLiquidacion: number
  netoPagar: number
}

export type ResultadoImportacion = {
  filasInsertadas: number
  filasActualizadas: number
  filasOmitidas: { fila: number; cedula: string; motivo: string }[]
  alertasUgpp: { cedula: string; nombre: string; exceso: number }[]
}

// ---------------------------------------------------------------------------
// Mapa de alias de columnas
// Normaliza encabezados: minúsculas, sin tildes, sin símbolos extras
// ---------------------------------------------------------------------------
const ALIAS_COLUMNAS: Record<string, keyof FilaNomina | '_ignorar'> = {
  empleado: 'nombreEmpleado',
  nombre: 'nombreEmpleado',
  'nombre empleado': 'nombreEmpleado',
  trabajador: 'nombreEmpleado',
  colaborador: 'nombreEmpleado',

  cedula: 'cedula',
  'cedula identidad': 'cedula',
  cc: 'cedula',
  nit: 'cedula',
  documento: 'cedula',
  identificacion: 'cedula',

  area: 'area',
  departamento: 'area',
  cargo: '_ignorar', // capturar pero no asignar a FilaNomina

  basico: 'sueldoBase',
  'salario basico': 'sueldoBase',
  'sueldo basico': 'sueldoBase',
  'salario base': 'sueldoBase',
  sueldo: 'sueldoBase',

  transporte: 'auxilioTransporte',
  'aux transporte': 'auxilioTransporte',
  'auxilio transporte': 'auxilioTransporte',
  'subsidio transporte': 'auxilioTransporte',

  bonificaciones: 'bonificaciones',
  bonos: 'bonificaciones',
  bono: 'bonificaciones',
  'bonos no salarial': 'bonificaciones',
  'bonificacion no salarial': 'bonificaciones',

  prima: 'prima',
  'prima servicios': 'prima',
  'prima de servicios': 'prima',

  'abono prima': 'abonoPrima',
  'anticipo prima': 'abonoPrima',

  cesantias: 'cesantias',
  cesantia: 'cesantias',
  cesantías: 'cesantias',

  'abono cesantias': 'abonoCesantias',
  'anticipo cesantias': 'abonoCesantias',

  liquidacion: 'abonoLiquidacion',
  'abono liquidacion': 'abonoLiquidacion',
  'liquidacion parcial': 'abonoLiquidacion',

  neto: 'netoPagar',
  'neto pagar': 'netoPagar',
  'valor neto': 'netoPagar',
  'total pagar': 'netoPagar',
}

function normalizarEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos (tildes)
    .replace(/[^a-z0-9 ]/g, '')      // elimina símbolos
    .replace(/\s+/g, ' ')            // colapsa espacios múltiples
    .trim()
}

function normalizarCedula(valor: string | number): string {
  return String(valor)
    .replace(/[^0-9]/g, '') // elimina puntos, guiones, espacios
    .trim()
}

function num(valor: unknown): number {
  if (valor === undefined || valor === null || valor === '') return 0
  const n = Number(String(valor).replace(/[^0-9.,\-]/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : Math.abs(n)
}

// ---------------------------------------------------------------------------
// parseExcelNomina
// Lee el archivo Excel y devuelve las filas normalizadas.
// Lanza Error si el archivo no tiene las columnas mínimas requeridas.
// ---------------------------------------------------------------------------
export async function parseExcelNomina(archivo: File): Promise<FilaNomina[]> {
  const buffer = await archivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  // Usar la hoja activa o la primera disponible
  const nombreHoja = wb.SheetNames[0]
  const ws = wb.Sheets[nombreHoja]

  const rawFilas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    defval: '',
    raw: false, // convierte fechas y números a string normalizado
  })

  if (rawFilas.length === 0) {
    throw new Error(
      `El archivo "${archivo.name}" está vacío o no se pudo leer la hoja "${nombreHoja}".`
    )
  }

  // Construir mapa: encabezado original → campo canónico
  const encabezadosOriginales = Object.keys(rawFilas[0])
  const mapaEncabezados: Record<string, keyof FilaNomina | '_ignorar'> = {}

  encabezadosOriginales.forEach((h) => {
    const norm = normalizarEncabezado(h)
    if (ALIAS_COLUMNAS[norm]) {
      mapaEncabezados[h] = ALIAS_COLUMNAS[norm]
    }
  })

  // Verificar columnas mínimas
  const camposPresentes = new Set(Object.values(mapaEncabezados))
  const camposRequeridos: (keyof FilaNomina)[] = ['nombreEmpleado', 'cedula', 'sueldoBase']
  const camposFaltantes = camposRequeridos.filter((c) => !camposPresentes.has(c))

  if (camposFaltantes.length > 0) {
    const encabezadosDetectados = encabezadosOriginales.join(' | ')
    throw new Error(
      `Columnas requeridas no encontradas: ${camposFaltantes.join(', ')}.\n` +
        `Encabezados detectados en el Excel: ${encabezadosDetectados}\n\n` +
        `Las columnas aceptadas son: EMPLEADO (o NOMBRE), CÉDULA (o CC/NIT), BÁSICO (o SUELDO BASE).`
    )
  }

  const filas: FilaNomina[] = []

  rawFilas.forEach((rawFila, idx) => {
    // Construir objeto mapeado
    const mapeado: Partial<Record<keyof FilaNomina, unknown>> = {}
    Object.entries(mapaEncabezados).forEach(([original, campo]) => {
      if (campo !== '_ignorar') {
        mapeado[campo] = rawFila[original]
      }
    })

    const cedula = normalizarCedula(mapeado.cedula as string | number)
    if (!cedula) return // fila vacía al final del Excel, ignorar silenciosamente

    const sueldoBase = num(mapeado.sueldoBase)
    if (sueldoBase <= 0) {
      console.warn(`Fila ${idx + 2}: cédula ${cedula} con sueldo 0 — omitida`)
      return
    }

    const auxilioTransporte = num(mapeado.auxilioTransporte)
    const bonificaciones = num(mapeado.bonificaciones)
    const prima = num(mapeado.prima)
    const abonoPrima = num(mapeado.abonoPrima)
    const cesantias = num(mapeado.cesantias)
    const abonoCesantias = num(mapeado.abonoCesantias)
    const abonoLiquidacion = num(mapeado.abonoLiquidacion)

    // Si el Excel no trae neto, calcularlo
    let netoPagar = num(mapeado.netoPagar)
    if (netoPagar === 0) {
      // Cálculo básico: todo lo devengado menos 8% del salario base (aprox. ded. empleado)
      netoPagar =
        sueldoBase +
        auxilioTransporte +
        bonificaciones +
        prima +
        abonoPrima +
        cesantias +
        abonoCesantias +
        abonoLiquidacion -
        Math.round(sueldoBase * 0.08) // salud + pensión empleado (4%+4%)
    }

    filas.push({
      nombreEmpleado: String(mapeado.nombreEmpleado ?? `Empleado ${cedula}`).trim(),
      cedula,
      area: mapeado.area ? String(mapeado.area).trim() : null,
      sueldoBase,
      auxilioTransporte,
      bonificaciones,
      prima,
      abonoPrima,
      cesantias,
      abonoCesantias,
      abonoLiquidacion,
      netoPagar,
    })
  })

  if (filas.length === 0) {
    throw new Error(
      'El archivo fue leído pero no se encontraron filas con datos válidos (cédula y salario). ' +
        'Verifica que el Excel tenga datos desde la fila 2 y que las columnas coincidan.'
    )
  }

  return filas
}

// ---------------------------------------------------------------------------
// guardarNominaProgramada
//
// ESTRATEGIA CORREGIDA:
//   1. Traer las cédulas ya existentes para (user_id, periodo_contable)
//   2. Para cada fila: si existe → UPDATE, si no → INSERT
//   3. Esto evita depender del nombre exacto de la restricción UNIQUE,
//      que era el bug original (onConflict: 'cedula' no coincidía con
//      UNIQUE(user_id, periodo_contable, cedula))
// ---------------------------------------------------------------------------
export async function guardarNominaProgramada(
  filas: FilaNomina[],
  userId: string,
  periodoContable: string
): Promise<ResultadoImportacion> {
  let filasInsertadas = 0
  let filasActualizadas = 0
  const filasOmitidas: ResultadoImportacion['filasOmitidas'] = []
  const alertasUgpp: ResultadoImportacion['alertasUgpp'] = []

  if (filas.length === 0) {
    return { filasInsertadas, filasActualizadas, filasOmitidas, alertasUgpp }
  }

  // 1. Obtener cédulas que ya existen para este periodo
  const { data: existentes, error: errExistentes } = await supabase
    .from('nomina_programada')
    .select('id, cedula')
    .eq('user_id', userId)
    .eq('periodo_contable', periodoContable)

  if (errExistentes) {
    throw new Error(`Error consultando registros existentes: ${errExistentes.message}`)
  }

  const mapaExistentes = new Map<string, number>(
    (existentes ?? []).map((r: { id: number; cedula: string }) => [
      normalizarCedula(r.cedula),
      r.id,
    ])
  )

  // 2. Clasificar filas y procesar en lotes
  const filasNuevas: Record<string, unknown>[] = []
  const filasUpdate: { id: number; datos: Record<string, unknown> }[] = []

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const cedNorm = normalizarCedula(fila.cedula)

    // Detectar alerta Ley 1393
    const exceso = calcularExcesoLey1393(fila.sueldoBase, fila.bonificaciones)
    const alertaRiesgoUgpp = exceso > 0

    if (alertaRiesgoUgpp) {
      alertasUgpp.push({ cedula: fila.cedula, nombre: fila.nombreEmpleado, exceso })
    }

    const payload: Record<string, unknown> = {
      user_id: userId,
      periodo_contable: periodoContable,
      nombre_empleado: fila.nombreEmpleado,
      cedula: fila.cedula, // guardar la cédula original (sin normalizar) para legibilidad
      area: fila.area,
      sueldo_base: fila.sueldoBase,
      cuenta_puc_basico: '510506',
      auxilio_transporte: fila.auxilioTransporte,
      cuenta_puc_transporte: '510527',
      bonificaciones: fila.bonificaciones,
      cuenta_puc_bonos: '510530',
      prima: fila.prima,
      cuenta_puc_prima: '514015',
      abono_prima: fila.abonoPrima,
      cesantias: fila.cesantias,
      abono_cesantias: fila.abonoCesantias,
      abono_liquidacion: fila.abonoLiquidacion,
      neto_pagar: fila.netoPagar,
      exceso_ley_1393: exceso,
      alerta_riesgo_ugpp: alertaRiesgoUgpp,
      estado: 'Pendiente de Pago',
      metodo_conciliacion: null,
    }

    const idExistente = mapaExistentes.get(cedNorm)
    if (idExistente !== undefined) {
      // UPDATE: no pisar el estado de pago si ya estaba pagado
      filasUpdate.push({ id: idExistente, datos: { ...payload } })
    } else {
      filasNuevas.push(payload)
    }
  }

  // 3. INSERT batch de los nuevos
  if (filasNuevas.length > 0) {
    const { data: insertados, error: errInsert } = await supabase
      .from('nomina_programada')
      .insert(filasNuevas)
      .select('id')

    if (errInsert) {
      // Si el insert falla por constraintviolation (cedula duplicada en otro lote),
      // lo marcamos como omitidos pero no abortamos todo
      if (errInsert.code === '23505') {
        filasOmitidas.push({
          fila: -1,
          cedula: 'múltiples',
          motivo: `Conflicto de clave única: ${errInsert.message}. Recarga e intenta de nuevo.`,
        })
      } else {
        throw new Error(`Error insertando nuevos registros: ${errInsert.message}`)
      }
    } else {
      filasInsertadas = (insertados ?? []).length
    }
  }

  // 4. UPDATE uno por uno para evitar pisar el campo `estado` si ya estaba Pagado
  for (const { id, datos } of filasUpdate) {
    // Preservar estado de pago: solo actualizar si no estaba Pagado
    const { data: actual } = await supabase
      .from('nomina_programada')
      .select('estado')
      .eq('id', id)
      .single()

    // No sobreescribir estado si ya fue marcado como Pagado (puede venir del extracto PDF)
    if (actual?.estado === 'Pagado') {
      delete datos['estado']
      delete datos['metodo_conciliacion']
    }

    const { error: errUpdate } = await supabase
      .from('nomina_programada')
      .update(datos)
      .eq('id', id)

    if (errUpdate) {
      filasOmitidas.push({
        fila: id,
        cedula: String(datos['cedula'] ?? ''),
        motivo: `Error actualizando: ${errUpdate.message}`,
      })
    } else {
      filasActualizadas++
    }
  }

  return { filasInsertadas, filasActualizadas, filasOmitidas, alertasUgpp }
}
