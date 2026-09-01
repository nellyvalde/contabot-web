import { describe, it, expect } from 'vitest'
import {
  calcularTolerancia,
  filtrarFacturasValidas,
  excluirFacturasReclamadas,
  emparejarMovimiento,
  emparejarLote,
  interpretarErrorInsercion,
  type FacturaCruda,
  type FacturaCandidata,
} from '../emparejarMovimientos'

const factura = (over: Partial<FacturaCandidata> & { id: string }): FacturaCandidata => ({
  valor: 0,
  fecha: '2026-06-01',
  ...over,
})

describe('calcularTolerancia', () => {
  it('aplica el piso de $100 para facturas de valor bajo', () => {
    expect(calcularTolerancia(1200)).toBe(100)
  })

  it('aplica el tope de $1000 para facturas de valor alto', () => {
    expect(calcularTolerancia(5_000_000)).toBe(1000)
  })

  it('es proporcional (0.1%) entre los dos limites', () => {
    expect(calcularTolerancia(500_000)).toBe(500)
  })
})

describe('emparejarMovimiento', () => {
  it('coincidencia exacta: un unico candidato con el mismo valor gana', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' })]
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado).toEqual({ tipo: 'encontrado', factura: candidatas[0] })
  })

  it('coincidencia aproximada unica: dentro de tolerancia, sin exacta, un solo candidato gana', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' })]
    // Δ=85, tolerancia(1200)=100 -> dentro de tolerancia
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1285 }, candidatas)
    expect(resultado).toEqual({ tipo: 'encontrado', factura: candidatas[0] })
  })

  it('multiples candidatos exactos: requiere_revision, no elige ninguno arbitrariamente', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' }),
      factura({ id: 'f2', valor: 1200, fecha: '2026-06-02' }),
    ]
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado.tipo).toBe('requiere_revision')
    if (resultado.tipo === 'requiere_revision') {
      expect(resultado.candidatos).toHaveLength(2)
      expect(resultado.candidatos.map(c => c.factura_id).sort()).toEqual(['f1', 'f2'])
    }
  })

  it('multiples candidatos aproximados (sin exacta): tambien requiere_revision', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1210, fecha: '2026-06-01' }),
      factura({ id: 'f2', valor: 1290, fecha: '2026-06-01' }),
    ]
    // mov=1200: Δ contra f1=10 (tolerancia 100 -> dentro), Δ contra f2=90 (tolerancia 100 -> dentro)
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado.tipo).toBe('requiere_revision')
  })

  it('coincidencia exacta prioritaria sobre una aproximada distinta: solo se considera la etapa exacta', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' }), // exacta
      factura({ id: 'f2', valor: 1250, fecha: '2026-06-01' }), // aproximada, pero no participa porque hubo exacta
    ]
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado).toEqual({ tipo: 'encontrado', factura: candidatas[0] })
  })

  it('fuera de tolerancia: no_encontrado', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' })]
    // Δ=500, tolerancia(1200)=100 -> fuera de rango
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1700 }, candidatas)
    expect(resultado).toEqual({ tipo: 'no_encontrado' })
  })

  it('fuera de ventana de fecha: no_encontrado aunque el valor sea exacto', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200, fecha: '2026-05-01' })]
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado).toEqual({ tipo: 'no_encontrado' })
  })

  it('JSON de candidatos_ambiguos contiene unicamente factura_id, valor, diferencia y fecha', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' }),
      factura({ id: 'f2', valor: 1200, fecha: '2026-06-02' }),
    ]
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado.tipo).toBe('requiere_revision')
    if (resultado.tipo === 'requiere_revision') {
      for (const candidato of resultado.candidatos) {
        expect(Object.keys(candidato).sort()).toEqual(['diferencia', 'factura_id', 'fecha', 'valor'])
      }
    }
  })
})

describe('emparejarLote', () => {
  it('impide que la misma factura sea reclamada dos veces dentro del mismo archivo', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' })]
    const movimientos = [
      { fecha: '2026-06-01', valor: 1200 },
      { fecha: '2026-06-01', valor: 1200 },
    ]
    const [primero, segundo] = emparejarLote(movimientos, candidatas)
    expect(primero).toEqual({ tipo: 'encontrado', factura: candidatas[0] })
    expect(segundo).toEqual({ tipo: 'no_encontrado' })
  })

  it('cada movimiento se empareja con una factura distinta cuando ambas estan disponibles', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1200, fecha: '2026-06-01' }),
      factura({ id: 'f2', valor: 2400, fecha: '2026-06-01' }),
    ]
    const movimientos = [
      { fecha: '2026-06-01', valor: 1200 },
      { fecha: '2026-06-01', valor: 2400 },
    ]
    const resultados = emparejarLote(movimientos, candidatas)
    expect(resultados[0]).toEqual({ tipo: 'encontrado', factura: candidatas[0] })
    expect(resultados[1]).toEqual({ tipo: 'encontrado', factura: candidatas[1] })
  })
})

describe('filtrarFacturasValidas', () => {
  it('excluye facturas con valor NULL', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: null, fecha: '2026-06-01', estado: 'Pendiente' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })

  it('excluye facturas con valor 0 o negativo', () => {
    const crudas: FacturaCruda[] = [
      { id: 'f1', valor: 0, fecha: '2026-06-01', estado: 'Pendiente' },
      { id: 'f2', valor: -100, fecha: '2026-06-01', estado: 'Pendiente' },
    ]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })

  it('incluye facturas en estado Pendiente', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: 1200, fecha: '2026-06-01', estado: 'Pendiente' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([{ id: 'f1', valor: 1200, fecha: '2026-06-01' }])
  })

  it('incluye facturas en estado Vencido', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: 1200, fecha: '2026-06-01', estado: 'Vencido' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([{ id: 'f1', valor: 1200, fecha: '2026-06-01' }])
  })

  it('valor numerico valido sigue funcionando exactamente igual', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: 23000, fecha: '2026-06-01', estado: 'Pendiente' }]
    const resultado = filtrarFacturasValidas(crudas)
    expect(resultado).toEqual([{ id: 'f1', valor: 23000, fecha: '2026-06-01' }])
    expect(typeof resultado[0].valor).toBe('number')
  })

  it('string numerico "23000.00" se acepta y queda normalizado como number', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: '23000.00', fecha: '2026-06-01', estado: 'Pendiente' }]
    const resultado = filtrarFacturasValidas(crudas)
    expect(resultado).toEqual([{ id: 'f1', valor: 23000, fecha: '2026-06-01' }])
    expect(typeof resultado[0].valor).toBe('number')
  })

  it('string vacio se excluye', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: '', fecha: '2026-06-01', estado: 'Pendiente' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })

  it('texto no numerico se excluye', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: 'no es un numero', fecha: '2026-06-01', estado: 'Pendiente' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })

  it('NaN e Infinity se excluyen', () => {
    const crudas: FacturaCruda[] = [
      { id: 'f1', valor: NaN, fecha: '2026-06-01', estado: 'Pendiente' },
      { id: 'f2', valor: Infinity, fecha: '2026-06-01', estado: 'Pendiente' },
      { id: 'f3', valor: -Infinity, fecha: '2026-06-01', estado: 'Pendiente' },
    ]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })

  it('candidatos_ambiguos siempre contiene valor como number, incluso si la factura llego como string', () => {
    const crudas: FacturaCruda[] = [
      { id: 'f1', valor: '1200', fecha: '2026-06-01', estado: 'Pendiente' },
      { id: 'f2', valor: '1200', fecha: '2026-06-01', estado: 'Pendiente' },
    ]
    const candidatas = filtrarFacturasValidas(crudas)
    const resultado = emparejarMovimiento({ fecha: '2026-06-01', valor: 1200 }, candidatas)
    expect(resultado.tipo).toBe('requiere_revision')
    if (resultado.tipo === 'requiere_revision') {
      for (const candidato of resultado.candidatos) {
        expect(typeof candidato.valor).toBe('number')
        expect(typeof candidato.diferencia).toBe('number')
      }
    }
  })

  it('excluye facturas en estado Pagado', () => {
    const crudas: FacturaCruda[] = [{ id: 'f1', valor: 1200, fecha: '2026-06-01', estado: 'Pagado' }]
    expect(filtrarFacturasValidas(crudas)).toEqual([])
  })
})

describe('excluirFacturasReclamadas', () => {
  it('excluye una factura ya utilizada por una conciliacion existente en otro periodo', () => {
    const candidatas = [
      factura({ id: 'f1', valor: 1200 }),
      factura({ id: 'f2', valor: 2400 }),
    ]
    const resultado = excluirFacturasReclamadas(candidatas, new Set(['f1']))
    expect(resultado).toEqual([candidatas[1]])
  })

  it('no excluye nada si el conjunto de reclamadas esta vacio', () => {
    const candidatas = [factura({ id: 'f1', valor: 1200 })]
    expect(excluirFacturasReclamadas(candidatas, new Set())).toEqual(candidatas)
  })
})

describe('interpretarErrorInsercion', () => {
  it('error 23505 (violacion del indice unico): mensaje especifico de conflicto de concurrencia', () => {
    const mensaje = interpretarErrorInsercion({ code: '23505', message: 'duplicate key value violates unique constraint' })
    expect(mensaje).toMatch(/otra sesión/)
  })

  it('otro codigo de error: mensaje generico con el detalle original', () => {
    const mensaje = interpretarErrorInsercion({ code: '23502', message: 'null value in column violates not-null constraint' })
    expect(mensaje).toBe('Error guardando la conciliación: null value in column violates not-null constraint')
  })
})
