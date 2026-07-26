import { describe, it, expect } from 'vitest'
import { calcularEstadoAbono, sumarAbonos, esAbonoDuplicado, periodoAnteriorDe } from '../abonos'

describe('calcularEstadoAbono', () => {
  it('1. causado $800.000, abonado $300.000 -> saldo $500.000, Pago parcial', () => {
    const { saldoPendiente, estado } = calcularEstadoAbono(800000, 0, 300000)
    expect(saldoPendiente).toBe(500000)
    expect(estado).toBe('Pago parcial')
  })

  it('2. dos abonos completan la obligacion (300k + 500k = 800k) -> Pagado, saldo 0', () => {
    const totalAbonado = sumarAbonos([{ valorAbonado: 300000 }, { valorAbonado: 500000 }])
    const { saldoPendiente, estado } = calcularEstadoAbono(800000, 0, totalAbonado)
    expect(totalAbonado).toBe(800000)
    expect(saldoPendiente).toBe(0)
    expect(estado).toBe('Pagado')
  })

  it('3. saldo anterior se suma al valor causado nuevo sin confundirse (julio: saldo 500k + turnos nuevos 600k)', () => {
    const saldoAnteriorJunio = calcularEstadoAbono(800000, 0, 300000).saldoPendiente // 500.000
    const { saldoPendiente, estado } = calcularEstadoAbono(600000, saldoAnteriorJunio, 0)
    expect(saldoAnteriorJunio).toBe(500000)
    expect(saldoPendiente).toBe(1100000) // 500.000 + 600.000, tal como el ejemplo de Nelly
    expect(estado).toBe('Pendiente de Pago')
  })

  it('4. pago mayor al causado no deja saldo negativo', () => {
    const { saldoPendiente, estado } = calcularEstadoAbono(800000, 0, 900000)
    expect(saldoPendiente).toBe(0)
    expect(estado).toBe('Pagado')
  })

  it('5. sin abonos, el estado es Pendiente de Pago y el saldo es el valor causado completo', () => {
    const { saldoPendiente, estado } = calcularEstadoAbono(800000, 0, 0)
    expect(saldoPendiente).toBe(800000)
    expect(estado).toBe('Pendiente de Pago')
  })
})

describe('sumarAbonos', () => {
  it('suma correctamente una lista de abonos', () => {
    expect(sumarAbonos([{ valorAbonado: 100 }, { valorAbonado: 200 }, { valorAbonado: 50 }])).toBe(350)
  })

  it('devuelve 0 para una lista vacia', () => {
    expect(sumarAbonos([])).toBe(0)
  })
})

describe('esAbonoDuplicado', () => {
  it('6. un comprobante con la misma referencia no se debe contabilizar dos veces', () => {
    const existentes = [{ referencia: 'whatsapp:media123' }, { referencia: 'whatsapp:media456' }]
    expect(esAbonoDuplicado(existentes, 'whatsapp:media123')).toBe(true)
  })

  it('una referencia nueva no se marca como duplicada', () => {
    const existentes = [{ referencia: 'whatsapp:media123' }]
    expect(esAbonoDuplicado(existentes, 'whatsapp:media999')).toBe(false)
  })

  it('sin referencia (pago manual sin comprobante) nunca se marca como duplicado', () => {
    const existentes = [{ referencia: null }, { referencia: undefined }]
    expect(esAbonoDuplicado(existentes, null)).toBe(false)
  })
})

describe('periodoAnteriorDe', () => {
  it('7. calcula el mes anterior dentro del mismo anio', () => {
    expect(periodoAnteriorDe('2026-07')).toBe('2026-06')
  })

  it('8. hace el rollover de anio correctamente (enero -> diciembre del anio anterior)', () => {
    expect(periodoAnteriorDe('2026-01')).toBe('2025-12')
  })
})
