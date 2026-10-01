import { describe, it, expect } from 'vitest'
import { validarYClasificar } from '../validacionFinanciera'
import type { FilaCruda } from '../filas'
import type { Resumen } from '../resumen'
import type { Vigencia } from '../vigencia'

const vigencia: Vigencia = { inicio: '2026/06/01', fin: '2026/06/30' }

const resumenBase: Resumen = {
  saldoInicialCentavos: 100000,
  totalCreditosCentavos: 60000,
  totalDebitosCentavos: 20000,
  saldoFinalCentavos: 140000,
}

const filasBase: FilaCruda[] = [
  { pagina: 1, fecha: '2026/06/01', descripcion: 'PAGO UNO', valorCentavos: 50000, saldoCentavos: 150000, bloqueIndice: 0, filaIndiceEnBloque: 0 },
  { pagina: 1, fecha: '2026/06/02', descripcion: 'PAGO DOS', valorCentavos: 20000, saldoCentavos: 130000, bloqueIndice: 0, filaIndiceEnBloque: 1 },
  { pagina: 1, fecha: '2026/06/03', descripcion: 'PAGO TRES', valorCentavos: 10000, saldoCentavos: 140000, bloqueIndice: 0, filaIndiceEnBloque: 2 },
]

describe('validarYClasificar -- cadena de saldos, sin clasificar nunca por descripción', () => {
  it('cadena correcta: clasifica cada fila y concilia todos los totales', () => {
    const r = validarYClasificar(filasBase, resumenBase, vigencia)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.movimientos.map(m => m.tipo)).toEqual(['credito', 'debito', 'credito'])
      expect(r.movimientos.every(m => m.dentroDeVigencia)).toBe(true)
    }
  })

  it('error en valor: una fila con un valorCentavos que no explica el delta de saldo rompe la cadena', () => {
    const filas = filasBase.map((f, i) => (i === 1 ? { ...f, valorCentavos: 99999 } : f))
    const r = validarYClasificar(filas, resumenBase, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cadena_rota')
  })

  it('error en saldo: una fila con un saldoCentavos que no coincide con ningún delta válido rompe la cadena', () => {
    const filas = filasBase.map((f, i) => (i === 1 ? { ...f, saldoCentavos: 999999 } : f))
    const r = validarYClasificar(filas, resumenBase, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cadena_rota')
  })

  it('resumen discrepante: la cadena y el cierre conciliar, pero la suma de créditos declarada no coincide', () => {
    const resumen = { ...resumenBase, totalCreditosCentavos: 999999 }
    const r = validarYClasificar(filasBase, resumen, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('resumen_no_concilia')
  })

  it('primera fila sin ancla: el saldo inicial declarado no explica el delta de la primera fila', () => {
    const resumen = { ...resumenBase, saldoInicialCentavos: 999999 }
    const r = validarYClasificar(filasBase, resumen, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('ancla_no_concilia')
  })

  it('valor cero: se marca indeterminado y se rechaza el documento completo', () => {
    const filas = filasBase.map((f, i) => (i === 0 ? { ...f, valorCentavos: 0 } : f))
    const r = validarYClasificar(filas, resumenBase, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('valor_cero')
  })

  it('cierre no concilia: la cadena y los totales de créditos/débitos son correctos, pero el saldo final declarado no coincide con el último saldo de la tabla', () => {
    const resumen = { ...resumenBase, saldoFinalCentavos: 999999 }
    const r = validarYClasificar(filasBase, resumen, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cierre_no_concilia')
  })

  it('sin filas: se rechaza como cadena rota, nunca se importa un documento vacío', () => {
    const r = validarYClasificar([], resumenBase, vigencia)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cadena_rota')
  })

  it('una fila puente fuera de vigencia (mes anterior) se clasifica igual y se marca fuera del periodo, sin cambiar la vigencia del documento', () => {
    const filas: FilaCruda[] = [
      { pagina: 1, fecha: '2026/05/30', descripcion: 'PAGO PUENTE', valorCentavos: 50000, saldoCentavos: 150000, bloqueIndice: 0, filaIndiceEnBloque: 0 },
      { pagina: 1, fecha: '2026/06/01', descripcion: 'PAGO DENTRO', valorCentavos: 20000, saldoCentavos: 130000, bloqueIndice: 0, filaIndiceEnBloque: 1 },
    ]
    const resumen: Resumen = { saldoInicialCentavos: 100000, totalCreditosCentavos: 50000, totalDebitosCentavos: 20000, saldoFinalCentavos: 130000 }
    const r = validarYClasificar(filas, resumen, vigencia)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.movimientos[0].dentroDeVigencia).toBe(false)
      expect(r.movimientos[1].dentroDeVigencia).toBe(true)
    }
  })

  it('nunca clasifica por descripción -- dos filas con la misma descripción pueden tener tipos distintos según el saldo', () => {
    const filas: FilaCruda[] = [
      { pagina: 1, fecha: '2026/06/01', descripcion: 'AJUSTE VARIOS', valorCentavos: 1000, saldoCentavos: 101000, bloqueIndice: 0, filaIndiceEnBloque: 0 },
      { pagina: 1, fecha: '2026/06/02', descripcion: 'AJUSTE VARIOS', valorCentavos: 1000, saldoCentavos: 100000, bloqueIndice: 0, filaIndiceEnBloque: 1 },
    ]
    const resumen: Resumen = { saldoInicialCentavos: 100000, totalCreditosCentavos: 1000, totalDebitosCentavos: 1000, saldoFinalCentavos: 100000 }
    const r = validarYClasificar(filas, resumen, vigencia)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.movimientos.map(m => m.tipo)).toEqual(['credito', 'debito'])
  })
})
