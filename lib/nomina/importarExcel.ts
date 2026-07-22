import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase/client'
import { buscarMapeoGuardado, calcularHuellaEncabezados, type CampoContable, type MapeoColumnas } from './mapeoColumnas'

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
}

export type ResultadoImportacion = {
  filasInsertadas: number
  filasActualizadas: number
  filasOmitidas: string[]
  alertasUgpp: Array<{ nombre: string; valor: number }>
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
  }

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
      estado: 'Pendiente de Pago',
      metodo_conciliacion: null,
      referencia_conciliacion: null,
      archivo_url: null,
      user_id: userId,
    }

    if (existente.data?.id) {
      const { error } = await supabase.from('nomina_programada').update(payload).eq('id', existente.data.id)
      if (error) throw new Error(error.message)
      resultado.filasActualizadas += 1
    } else {
      const { error } = await supabase.from('nomina_programada').insert(payload)
      if (error) throw new Error(error.message)
      resultado.filasInsertadas += 1
    }

    if (fila.alertaRiesgoUgpp) {
      resultado.alertasUgpp.push({ nombre: fila.nombreEmpleado, valor: fila.excesoLey1393 })
    }
  }

  return resultado
}
