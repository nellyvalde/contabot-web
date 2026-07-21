import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase/client'

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

function parseNumber(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d,.-]/g, '').trim()
    if (!limpio) return 0
    const normalizado = limpio.replace(/\./g, '').replace(/,/, '.')
    const numero = Number(normalizado)
    return Number.isFinite(numero) ? numero : 0
  }
  return 0
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
  return parseNumber(obtenerValorFila(fila, aliases))
}

const KEYWORDS_ENCABEZADO = [
  'nombre', 'empleado', 'nombreempleado', 'nombrecompleto', 'nombres',
  'cedula', 'cc', 'documento', 'identificacion', 'identificacionempleado',
  'area', 'departamento', 'cargo',
  'salario', 'salariobase', 'sueldo', 'basico', 'salariobasemensual',
  'auxiliotransporte', 'transporte',
  'bonificaciones', 'bono',
  'prima',
  'cesantias',
  'neto', 'netopagado', 'netoapagar', 'valorpagar', 'pagar',
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

function construirFilaDesdeRegistro(fila: Record<string, unknown>): FilaNominaImportada {
  const name = obtenerValorFila(fila, ['nombre', 'empleado', 'nombreempleado', 'nombrecompleto', 'nombres'])
  const cedula = obtenerValorFila(fila, ['cedula', 'cc', 'documento', 'identificacion', 'identificacionempleado'])
  const area = obtenerValorFila(fila, ['area', 'departamento', 'cargo']) || null
  const sueldoBase = leerNumeroFila(fila, ['salario', 'salario_base', 'sueldo', 'basico', 'salario_base_mensual'])
  const auxilioTransporte = leerNumeroFila(fila, ['auxilio_transporte', 'auxiliotransporte', 'transporte'])
  const bonificaciones = leerNumeroFila(fila, ['bonificaciones', 'bono'])
  const prima = leerNumeroFila(fila, ['prima'])
  const cesantias = leerNumeroFila(fila, ['cesantias'])
  const netoPagar = leerNumeroFila(fila, ['netopagado', 'neto_pagado', 'netoapagar', 'valorpagar', 'pagar']) || sueldoBase + auxilioTransporte + bonificaciones + prima + cesantias
  const excesoLey1393 = leerNumeroFila(fila, ['excesoley1393', 'exceso', 'riesgo'])

  return {
    nombreEmpleado: name.trim(),
    cedula: cedula.trim(),
    area,
    sueldoBase,
    auxilioTransporte,
    bonificaciones,
    prima,
    cesantias,
    netoPagar,
    excesoLey1393,
    alertaRiesgoUgpp: excesoLey1393 > 0,
  }
}

export async function parseExcelNomina(archivo: File): Promise<FilaNominaImportada[]> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' }) as unknown[][]
  const indiceEncabezado = detectarFilaEncabezado(filasCrudas)
  const encabezados = (filasCrudas[indiceEncabezado] ?? []).map((valor) => normalizarTexto(valor))
  const filas = filasCrudas.slice(indiceEncabezado + 1).map((filaCruda) => {
    const registro: Record<string, unknown> = {}
    encabezados.forEach((encabezado, indice) => {
      if (encabezado) registro[encabezado] = filaCruda[indice] ?? ''
    })
    return registro
  })

  return filas.map((fila) => construirFilaDesdeRegistro(fila)).filter((fila) => Boolean(fila.nombreEmpleado && fila.cedula))
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
