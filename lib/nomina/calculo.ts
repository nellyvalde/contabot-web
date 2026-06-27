// lib/nomina/calculo.ts

export const PARAMETROS_LEGALES = {
  SMMLV: 1_423_500,
  AUXILIO_TRANSPORTE: 200_000,
  TOPE_AUX_TRANSPORTE_EN_SMMLV: 2,
  TOPE_EXONERACION_PARAFISCALES_EN_SMMLV: 10,
} as const

export const TARIFAS_APORTES = {
  saludEmpleado: 0.04,
  pensionEmpleado: 0.04,
  saludEmpleador: 0.085,
  pensionEmpleador: 0.12,
  sena: 0.02,
  icbf: 0.03,
  cajaCompensacion: 0.04,
} as const

export type RiesgoARL = 'I' | 'II' | 'III' | 'IV' | 'V'

export const TARIFAS_ARL: Record<RiesgoARL, number> = {
  I: 0.00522,
  II: 0.01044,
  III: 0.02436,
  IV: 0.04350,
  V: 0.06960,
}

export type EntradaLiquidacion = {
  salarioBase: number
  pagosNoSalariales: number
  riesgoARL: RiesgoARL
  empresaExoneradaParafiscales: boolean
}

export type ResultadoLiquidacion = {
  salarioBase: number
  pagosNoSalariales: number
  excesoLey1393: number
  baseAportes: number
  auxilioTransporte: number
  aporteSaludEmpleado: number
  aportePensionEmpleado: number
  aporteSaludEmpleador: number
  aportePensionEmpleador: number
  aporteArl: number
  sena: number
  icbf: number
  cajaCompensacion: number
  totalDeducciones: number
  netoAPagar: number
}

export function calcularExcesoLey1393(salarioBase: number, pagosNoSalariales: number): number {
  if (pagosNoSalariales <= 0) return 0
  const remuneracionTotal = salarioBase + pagosNoSalariales
  const limitePermitido = remuneracionTotal * 0.4
  const exceso = pagosNoSalariales - limitePermitido
  return exceso > 0 ? Math.round(exceso) : 0
}

function calcularAuxilioTransporte(salarioBase: number): number {
  const tope = PARAMETROS_LEGALES.SMMLV * PARAMETROS_LEGALES.TOPE_AUX_TRANSPORTE_EN_SMMLV
  return salarioBase <= tope ? PARAMETROS_LEGALES.AUXILIO_TRANSPORTE : 0
}

function empleadoHabilitaExoneracion(salarioBase: number, empresaExonerada: boolean): boolean {
  if (!empresaExonerada) return false
  const tope = PARAMETROS_LEGALES.SMMLV * PARAMETROS_LEGALES.TOPE_EXONERACION_PARAFISCALES_EN_SMMLV
  return salarioBase < tope
}

export function liquidarNomina(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  const { salarioBase, pagosNoSalariales, riesgoARL, empresaExoneradaParafiscales } = entrada

  const excesoLey1393 = calcularExcesoLey1393(salarioBase, pagosNoSalariales)
  const baseAportes = salarioBase + excesoLey1393
  const auxilioTransporte = calcularAuxilioTransporte(salarioBase)
  const exonerado = empleadoHabilitaExoneracion(salarioBase, empresaExoneradaParafiscales)

  const aporteSaludEmpleado = round2(baseAportes * TARIFAS_APORTES.saludEmpleado)
  const aportePensionEmpleado = round2(baseAportes * TARIFAS_APORTES.pensionEmpleado)
  const aporteSaludEmpleador = exonerado ? 0 : round2(baseAportes * TARIFAS_APORTES.saludEmpleador)
  const aportePensionEmpleador = round2(baseAportes * TARIFAS_APORTES.pensionEmpleador)
  const aporteArl = round2(baseAportes * TARIFAS_ARL[riesgoARL])
  const sena = exonerado ? 0 : round2(baseAportes * TARIFAS_APORTES.sena)
  const icbf = exonerado ? 0 : round2(baseAportes * TARIFAS_APORTES.icbf)
  const cajaCompensacion = round2(baseAportes * TARIFAS_APORTES.cajaCompensacion)

  const totalDeducciones = aporteSaludEmpleado + aportePensionEmpleado
  const netoAPagar = round2(salarioBase + pagosNoSalariales + auxilioTransporte - totalDeducciones)

  return {
    salarioBase,
    pagosNoSalariales,
    excesoLey1393,
    baseAportes,
    auxilioTransporte,
    aporteSaludEmpleado,
    aportePensionEmpleado,
    aporteSaludEmpleador,
    aportePensionEmpleador,
    aporteArl,
    sena,
    icbf,
    cajaCompensacion,
    totalDeducciones,
    netoAPagar,
  }
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100
}dir lib\nomina