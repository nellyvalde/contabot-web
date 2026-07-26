import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase/client'
import { buscarMapeoGuardado, calcularHuellaEncabezados, type CampoContable, type MapeoColumnas } from './mapeoColumnas'
import { obtenerSaldoPeriodoAnterior, periodoAnteriorDe, registrarAbono } from './abonos'

export type FilaNominaImportada = {
  nombreEmpleado: string
  cedula: string
  area: string | null
  sueldoBase: number
  auxilioTransporte: number
  bonificaciones: number
  prima: number
  cesantias: number
  netoPagar: number
  excesoLey1393: number
  alertaRiesgoUgpp: boolean
  // Campos opcionales del flujo de "abonos parciales" (turnos, servicios, contratistas).
  // Si valorCausado no viene, la fila sigue el flujo tradicional de nomina de salario fijo.
  valorCausado: number | null
  valorAbonado: number
  receptorPago: string | null
  observaciones: string | null
}

export type ResultadoImportacion = {
  filasInsertadas: number
  filasActualizadas: number
  filasOmitidas: string[]
  alertasUgpp: Array<{ nombre: string; valor: number }>
  abonosRegistrados: number
  abonosDuplicados: number
}

function normalizarTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number') return String(valor)
  return ''
}

function normalizarCabecera(valor: unknown): string {
  return normalizarTexto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Saneamiento de montos en formato moneda colombiana: "$ 1.500.000,00", "#N/A", null, etc.
function limpiarMontoMoneda(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const texto = String(valor).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const numero = parseFloat(texto)
  return Number.isFinite(numero) ? numero : 0
}

// Evita cedulas del tipo "1018234567.0" que Excel genera al tratar el campo como numero.
function limpiarCedula(valor: unknown): string {
  if (!valor) return ''
  const texto = String(valor).trim()
  if (texto.includes('.')) return texto.split('.')[0]
  return texto.replace(/[^0-9kK]/g, '')
}

function esFilaTotalOFirma(fila: unknown[]): boolean {
  const textoFila = normalizarCabecera(fila.map((c) => normalizarTexto(c)).join(' '))
  return (
    textoFila.includes('total') ||
    textoFila.includes('elaborad') ||
    textoFila.includes('revisad') ||
    textoFila.includes('aprobad') ||
    textoFila.includes('firma')
  )
}

// Calculo real de Ley 1393 de 2010: los pagos no constitutivos de salario (bonificaciones)
// no pueden superar el 40% del total devengado. El exceso sí genera base de aportes a
// seguridad social y por lo tanto riesgo de fiscalizacion UGPP si no se aporta sobre el.
function calcularLey1393(sueldoBase: number, bonificaciones: number): { excesoLey1393: number; alertaRiesgoUgpp: boolean } {
  const devengadoSinTransporte = sueldoBase + bonificaciones
  const tope40 = devengadoSinTransporte * 0.4
  const excesoLey1393 = Math.max(0, bonificaciones - tope40)
  return { excesoLey1393, alertaRiesgoUgpp: excesoLey1393 > 0 }
}

function obtenerValorFila(fila: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const aliasNormalizado = normalizarCabecera(alias)
    const clave = Object.keys(fila).find((key) => {
      const claveNormalizada = normalizarCabecera(key)
      if (!claveNormalizada) return false
      if (claveNormalizada.length < 4 || aliasNormalizado.length < 4) {
        return claveNormalizada === aliasNormalizado
      }
      return claveNormalizada.includes(aliasNormalizado)
    })
    if (clave !== undefined) return normalizarTexto(fila[clave])
  }
  return ''
}

function leerNumeroFila(fila: Record<string, unknown>, aliases: string[]): number {
  return limpiarMontoMoneda(obtenerValorFila(fila, aliases))
}

const KEYWORDS_ENCABEZADO = [
  'nombre', 'empleado', 'nombreempleado', 'nombrecompleto', 'nombres', 'colaborador', 'trabajador',
  'cedula', 'cc', 'documento', 'identificacion', 'identificacionempleado',
  'area', 'departamento', 'cargo', 'centrodecosto',
  'salario', 'salariobase', 'sueldo', 'basico', 'salariobasemensual',
  'auxiliotransporte', 'transporte',
  'bonificaciones', 'bono', 'comisiones', 'otrosdevengados',
  'prima',
  'cesantias',
  'neto', 'netopagado', 'netoapagar', 'valorpagar', 'pagar', 'saldoapagar',
  'excesoley1393', 'exceso', 'riesgo',
].map((palabra) => normalizarCabecera(palabra))

function detectarFilaEncabezado(filas: unknown[][]): number {
  const limite = Math.min(15, filas.length)
  let mejorIndice = 0
  let mejorPuntaje = -1

  for (let i = 0; i < limite; i++) {
    const fila = filas[i] ?? []
    let puntaje = 0
    for (const celda of fila) {
      const normalizada = normalizarCabecera(celda)
      if (!normalizada) continue
      const coincide = KEYWORDS_ENCABEZADO.some(
        (palabra) => normalizada.includes(palabra) || palabra.includes(normalizada)
      )
      if (coincide) puntaje += 1
    }
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje
      mejorIndice = i
    }
  }

  return mejorIndice
}

export async function detectarEncabezadosCrudos(archivo: File): Promise<string[]> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' }) as unknown[][]
  const indiceEncabezado = detectarFilaEncabezado(filasCrudas)
  return (filasCrudas[indiceEncabezado] ?? []).map((valor) => normalizarTexto(valor))
}

// PASO 3-5 del pipeline cuando SI existe un mapeo manual guardado para esta empresa/plantilla:
// saneamiento + construccion de la fila usando la posicion de columna, no el texto del encabezado.
function construirFilaPorPosicion(filaCruda: unknown[], mapeo: MapeoColumnas): FilaNominaImportada {
  const valores: Partial<Record<CampoContable, unknown>> = {}
  mapeo.forEach((campo, indice) => {
    if (campo === 'ignorar') return
    valores[campo] = filaCruda[indice]
  })

  const sueldoBase = limpiarMontoMoneda(valores.salarioBasico)
  const bonificaciones = limpiarMontoMoneda(valores.bonificaciones)
  const { excesoLey1393, alertaRiesgoUgpp } = calcularLey1393(sueldoBase, bonificaciones)
  const auxilioTransporte = limpiarMontoMoneda(valores.auxilioTransporte)
  const prima = limpiarMontoMoneda(valores.abonoPrima)
  const cesantias = limpiarMontoMoneda(valores.cesantias)
  const netoPagarLeido = limpiarMontoMoneda(valores.netoPagado)
  const valorCausadoLeido = valores.valorCausado !== undefined ? limpiarMontoMoneda(valores.valorCausado) : 0
  const valorAbonado = limpiarMontoMoneda(valores.valorAbonado)
  const observaciones = normalizarTexto(valores.observacionesAbono) || null
  const receptorPago = normalizarTexto(valores.receptorPago) || null

  return {
    nombreEmpleado: normalizarTexto(valores.nombreEmpleado),
    cedula: limpiarCedula(valores.cedula),
    area: normalizarTexto(valores.areaCargo) || null,
    sueldoBase,
    auxilioTransporte,
    bonificaciones,
    prima,
    cesantias,
    netoPagar: netoPagarLeido || sueldoBase + auxilioTransporte + bonificaciones + prima + cesantias,
    excesoLey1393,
    alertaRiesgoUgpp,
    valorCausado: valorCausadoLeido > 0 ? valorCausadoLeido : null,
    valorAbonado,
    receptorPago,
    observaciones,
  }
}

// Ruta de respaldo (sin mapeo guardado aun): deteccion difusa por alias de texto.
function construirFilaDesdeRegistro(fila: Record<string, unknown>): FilaNominaImportada {
  const name = obtenerValorFila(fila, ['nombre', 'empleado', 'nombreempleado', 'nombrecompleto', 'nombres', 'colaborador', 'trabajador'])
  const cedula = obtenerValorFila(fila, ['cedula', 'cc', 'documento', 'identificacion', 'identificacionempleado'])
  const area = obtenerValorFila(fila, ['area', 'departamento', 'cargo', 'centro de costo']) || null
  const sueldoBase = leerNumeroFila(fila, ['salario', 'salario_base', 'sueldo', 'basico', 'salario_base_mensual'])
  const auxilioTransporte = leerNumeroFila(fila, ['auxilio_transporte', 'auxiliotransporte', 'transporte'])
  const bonificaciones = leerNumeroFila(fila, ['bonificaciones', 'bono', 'comisiones', 'otros devengados'])
  const prima = leerNumeroFila(fila, ['prima'])
  const cesantias = leerNumeroFila(fila, ['cesantias'])
  const netoPagarLeido = leerNumeroFila(fila, ['netopagado', 'neto_pagado', 'netoapagar', 'valorpagar', 'pagar', 'saldo a pagar'])
  const valorCausadoLeido = leerNumeroFila(fila, ['valorcausado', 'valor_causado', 'causado', 'valorturnos'])
  const valorAbonado = leerNumeroFila(fila, ['valorabonado', 'valor_abonado', 'abono', 'abonado'])
  const observaciones = obtenerValorFila(fila, ['observaciones', 'observacion', 'notas', 'nota']) || null
  const receptorPago = obtenerValorFila(fila, ['receptordelpago', 'receptor_pago', 'receptor', 'nombrereceptor']) || null
  const { excesoLey1393, alertaRiesgoUgpp } = calcularLey1393(sueldoBase, bonificaciones)

  return {
    nombreEmpleado: name.trim(),
    cedula: limpiarCedula(cedula),
    area,
    sueldoBase,
    auxilioTransporte,
    bonificaciones,
    prima,
    cesantias,
    netoPagar: netoPagarLeido || sueldoBase + auxilioTransporte + bonificaciones + prima + cesantias,
    excesoLey1393,
    alertaRiesgoUgpp,
    valorCausado: valorCausadoLeido > 0 ? valorCausadoLeido : null,
    valorAbonado,
    receptorPago,
    observaciones,
  }
}

/**
 * Pipeline de importacion: [Excel crudo] -> deteccion de encabezado -> mapeo guardado
 * (si existe para esta empresa/plantilla) o deteccion difusa de respaldo -> saneamiento
 * de celdas -> filtro de totales/firmas -> [FilaNominaImportada[]]
 */
export async function parseExcelNomina(archivo: File, empresaId: string): Promise<FilaNominaImportada[]> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' }) as unknown[][]
  const indiceEncabezado = detectarFilaEncabezado(filasCrudas)
  const encabezados = (filasCrudas[indiceEncabezado] ?? []).map((valor) => normalizarTexto(valor))
  const huella = calcularHuellaEncabezados(encabezados)

  const filasDatos = filasCrudas
    .slice(indiceEncabezado + 1)
    .filter((fila) => Array.isArray(fila) && fila.length > 0 && !esFilaTotalOFirma(fila))

  const mapeoGuardado = await buscarMapeoGuardado(empresaId, huella)

  let resultados: FilaNominaImportada[]

  if (mapeoGuardado) {
    resultados = filasDatos.map((fila) => construirFilaPorPosicion(fila, mapeoGuardado))
  } else {
    const registros = filasDatos.map((filaCruda) => {
      const registro: Record<string, unknown> = {}
      encabezados.forEach((encabezado, indice) => {
        if (encabezado) registro[encabezado] = filaCruda[indice] ?? ''
      })
      return registro
    })
    resultados = registros.map((fila) => construirFilaDesdeRegistro(fila))
  }

  return resultados.filter((fila) => Boolean(fila.nombreEmpleado && fila.cedula))
}

export async function guardarNominaProgramada(
  filas: FilaNominaImportada[],
  userId: string,
  periodoContable: string,
  empresaId: string
): Promise<ResultadoImportacion> {
  const resultado: ResultadoImportacion = {
    filasInsertadas: 0,
    filasActualizadas: 0,
    filasOmitidas: [],
    alertasUgpp: [],
    abonosRegistrados: 0,
    abonosDuplicados: 0,
  }

  const periodoAnterior = periodoAnteriorDe(periodoContable)

  for (const fila of filas) {
    if (!fila.nombreEmpleado || !fila.cedula) {
      resultado.filasOmitidas.push('Fila incompleta')
      continue
    }

    const existente = await supabase
      .from('nomina_programada')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('periodo_contable', periodoContable)
      .eq('cedula', fila.cedula)
      .maybeSingle()

    if (existente.error) {
      throw new Error(existente.error.message)
    }

    // Si la fila usa el flujo de "abonos" (valorCausado presente), se arrastra el saldo
    // pendiente del periodo anterior SIN mezclarlo con los turnos/valor causado nuevo:
    // quedan en columnas separadas (saldo_anterior vs valor_causado).
    const saldoAnterior =
      fila.valorCausado !== null ? await obtenerSaldoPeriodoAnterior(empresaId, fila.cedula, periodoAnterior) : 0

    const payload = {
      empresa_id: empresaId,
      periodo_contable: periodoContable,
      nombre_empleado: fila.nombreEmpleado,
      cedula: fila.cedula,
      area: fila.area,
      sueldo_base: fila.sueldoBase,
      auxilio_transporte: fila.auxilioTransporte,
      bonificaciones: fila.bonificaciones,
      prima: fila.prima,
      cesantias: fila.cesantias,
      neto_pagar: fila.netoPagar,
      exceso_ley_1393: fila.excesoLey1393,
      alerta_riesgo_ugpp: fila.alertaRiesgoUgpp,
      valor_causado: fila.valorCausado,
      saldo_anterior: saldoAnterior,
      observaciones: fila.observaciones,
      estado: 'Pendiente de Pago',
      metodo_conciliacion: null,
      referencia_conciliacion: null,
      archivo_url: null,
      user_id: userId,
    }

    let obligacionId: number | null = existente.data?.id ?? null

    if (obligacionId) {
      const { error } = await supabase.from('nomina_programada').update(payload).eq('id', obligacionId)
      if (error) throw new Error(error.message)
      resultado.filasActualizadas += 1
    } else {
      const { data, error } = await supabase.from('nomina_programada').insert(payload).select('id').single()
      if (error) throw new Error(error.message)
      obligacionId = data.id
      resultado.filasInsertadas += 1
    }

    // Si el Excel trae un valor abonado, se registra como abono (no como gasto nuevo)
    // y el saldo pendiente se recalcula sumando todos los abonos de esta obligacion.
    if (fila.valorAbonado > 0 && obligacionId) {
      // Referencia estable para esta fila+importacion: evita contar el mismo comprobante
      // dos veces si el mismo Excel se vuelve a importar.
      const referencia = `excel:${empresaId}:${periodoContable}:${fila.cedula}:${fila.valorAbonado}:${fila.observaciones ?? ''}`
      const resultadoAbono = await registrarAbono({
        empresaId,
        obligacionId,
        valorAbonado: fila.valorAbonado,
        referencia,
        receptorPago: fila.receptorPago,
        observaciones: fila.observaciones,
        origen: 'excel',
      })
      if (resultadoAbono.ok && resultadoAbono.duplicado) {
        resultado.abonosDuplicados += 1
      } else if (resultadoAbono.ok) {
        resultado.abonosRegistrados += 1
      }
    }

    if (fila.alertaRiesgoUgpp) {
      resultado.alertasUgpp.push({ nombre: fila.nombreEmpleado, valor: fila.excesoLey1393 })
    }
  }

  return resultado
}
