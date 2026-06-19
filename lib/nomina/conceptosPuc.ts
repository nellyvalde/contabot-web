// lib/nomina/conceptosPuc.ts
//
// Mapeo de conceptos de nómina -> cuenta PUC, y motor de cálculo de
// devengados/deducciones/neto, ajustado a la estructura REAL de tu tabla
// `nomina_programada` (sueldo_base, auxilio_transporte, bonificaciones,
// prima, vacaciones, prestamo, descuento, abono_prima, pension, salud).
//
// ⚠️ Los códigos PUC son una referencia de estructura (catálogo de uso
// general en Colombia), no una verdad legal absoluta: cada empresa puede
// tener su propio plan de cuentas. Verifícalos con tu contador antes de
// usarlos para generar un comprobante contable real.

import { calcularExcesoLey1393, TARIFAS_APORTES } from '@/lib/nomina/calculo'

export const CUENTAS_PUC_NOMINA = {
  basico: '510506', // Sueldos
  transporte: '510527', // Auxilio de transporte
  bonos: '510530', // Auxilios (pagos no constitutivos de salario)
  prima: '514015', // Prima de servicios (prestación social legal)
} as const

export type ResultadoLey1393 = {
  excesoLey1393: number
  alertaRiesgoUgpp: boolean
  porcentajeNoSalarial: number
}

export function evaluarLey1393(sueldoBase: number, bonificaciones: number): ResultadoLey1393 {
  const excesoLey1393 = calcularExcesoLey1393(sueldoBase, bonificaciones)
  const remuneracionTotal = sueldoBase + bonificaciones
  const porcentajeNoSalarial =
    remuneracionTotal > 0 ? Math.round((bonificaciones / remuneracionTotal) * 1000) / 10 : 0

  return {
    excesoLey1393,
    alertaRiesgoUgpp: excesoLey1393 > 0,
    porcentajeNoSalarial,
  }
}

export type ConceptosNomina = {
  sueldoBase: number
  auxilioTransporte: number
  bonificaciones: number
  prima: number
  vacaciones: number
  prestamo: number
  descuento: number
  abonoPrima: number
  cesantias: number
  abonoCesantias: number
  abonoLiquidacion: number
}

export type LiquidacionCalculada = {
  excesoLey1393: number
  alertaRiesgoUgpp: boolean
  totalDevengado: number
  pension: number
  salud: number
  totalDeducciones: number
  netoPagar: number
}

export function calcularLiquidacion(conceptos: ConceptosNomina): LiquidacionCalculada {
  const { excesoLey1393, alertaRiesgoUgpp } = evaluarLey1393(conceptos.sueldoBase, conceptos.bonificaciones)
  const baseAportes = conceptos.sueldoBase + excesoLey1393

  const pension = Math.round(baseAportes * TARIFAS_APORTES.pensionEmpleado * 100) / 100
  const salud = Math.round(baseAportes * TARIFAS_APORTES.saludEmpleado * 100) / 100

  const totalDevengado =
    conceptos.sueldoBase +
    conceptos.auxilioTransporte +
    conceptos.bonificaciones +
    conceptos.prima +
    conceptos.vacaciones +
    conceptos.cesantias

  const totalDeducciones = pension + salud + conceptos.prestamo + conceptos.descuento

  const netoPagar =
    Math.round(
      (totalDevengado + conceptos.abonoPrima + conceptos.abonoCesantias + conceptos.abonoLiquidacion - totalDeducciones) * 100
    ) / 100

  return {
    excesoLey1393,
    alertaRiesgoUgpp,
    totalDevengado,
    pension,
    salud,
    totalDeducciones,
    netoPagar,
  }
}