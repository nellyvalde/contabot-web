import { describe, it, expect } from 'vitest'
import { reconstruirBloques } from '../filas'
import { linea, lineaEncabezado, lineaFila, lineaFilaColumnas, lineaTexto } from './fixtures'

describe('reconstruirBloques -- cajas sintéticas', () => {
  it('reconstruye un bloque con encabezado y varias filas', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690)),
      linea(1, 680, lineaFila('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', '$8,500.00', 680)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bloques).toHaveLength(1)
      expect(r.bloques[0].filas).toHaveLength(2)
      expect(r.bloques[0].filas[0].descripcion).toBe('PAGO PROVEEDOR UNO')
      expect(r.bloques[0].filas[0].valorCentavos).toBe(100000)
      expect(r.bloques[0].filas[0].saldoCentavos).toBe(900000)
    }
  })

  it('ignora, por estructura, una línea de ruido que no empieza con fecha en la columna correcta (ej. tabla de tasas)', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690)),
      lineaTexto('RANGO TASA TRIMESTRAL TASA DIARIA TASA E.A', 300, 680),
      linea(1, 670, lineaFila('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', '$8,500.00', 670)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bloques[0].filas).toHaveLength(2)
  })

  it('conserva movimientos legítimamente idénticos dentro del mismo bloque', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFila('2026/06/01', 'COMISION SERVICIO', '$1,200.00', '$9,000.00', 690)),
      linea(1, 680, lineaFila('2026/06/01', 'COMISION SERVICIO', '$1,200.00', '$7,800.00', 680)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bloques[0].filas).toHaveLength(2)
  })

  it('rechaza fila_incompleta cuando falta el valor o el saldo', () => {
    const filaSinSaldo = lineaFila('2026/06/01', 'PAGO X', '$1,000.00', '$9,000.00', 690).filter(p => p.texto !== '$9,000.00')
    const lineas = [linea(1, 700, lineaEncabezado(700)), linea(1, 690, filaSinSaldo)]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('fila_incompleta')
  })

  it('rechaza fila_incompleta cuando la descripción queda vacía', () => {
    const lineas = [linea(1, 700, lineaEncabezado(700)), linea(1, 690, lineaFila('2026/06/01', '', '$1,000.00', '$9,000.00', 690).filter(p => p.texto.trim()))]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('fila_incompleta')
  })

  it('maneja varias páginas con encabezados repetidos -- cada uno abre su propio bloque', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700, 1)),
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690, 1)),
      linea(2, 700, lineaEncabezado(700, 2)),
      linea(2, 690, lineaFila('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', '$8,500.00', 690, 2)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bloques).toHaveLength(2)
      expect(r.bloques[0].pagina).toBe(1)
      expect(r.bloques[1].pagina).toBe(2)
    }
  })

  it('rechaza bloque_duplicado cuando dos bloques tienen exactamente la misma secuencia fecha/valor/saldo', () => {
    const bloque = () => [
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690)),
      linea(1, 680, lineaFila('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', '$8,500.00', 680)),
    ]
    const lineas = [linea(1, 700, lineaEncabezado(700)), ...bloque(), linea(1, 660, lineaEncabezado(660)), ...bloque().map(l => ({ ...l, y: l.y - 100 }))]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('bloque_duplicado')
  })

  it('rechaza encabezado_no_reconocido cuando ningún bloque tiene filas de movimiento', () => {
    const lineas = [lineaTexto('EXTRACTO BANCARIO', 50, 700), lineaTexto('CUALQUIER OTRO TEXTO', 50, 690)]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('encabezado_no_reconocido')
  })

  it('ignora texto antes de cualquier encabezado (ej. logo, dirección)', () => {
    const lineas = [
      lineaTexto('BANCO AV VILLAS S.A.', 50, 750),
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bloques[0].filas).toHaveLength(1)
  })
})

describe('reconstruirBloques -- frontera VALOR/SALDO derivada de los datos (no del encabezado)', () => {
  it('bloque con una sola fila candidata: la frontera se deriva igual y clasifica correctamente', () => {
    const lineas = [linea(1, 700, lineaEncabezado(700)), linea(1, 690, lineaFila('2026/06/01', 'PAGO UNICO', '$1,000.00', '$9,000.00', 690))]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bloques[0].filas).toHaveLength(1)
      expect(r.bloques[0].filas[0].valorCentavos).toBe(100000)
      expect(r.bloques[0].filas[0].saldoCentavos).toBe(900000)
    }
  })

  it('encabezado desalineado de los datos reales (como el bug real medido): se acepta igual, porque la frontera no depende del encabezado', () => {
    // La caja de encabezado VALOR/SALDO queda muy lejos de donde están
    // realmente los datos -- esto habría fallado con el diseño anterior
    // (tolerancia fija contra el encabezado); con la frontera derivada de
    // los datos, no importa dónde esté el encabezado.
    const encabezado = lineaEncabezado(700).map(p => (p.texto === 'VALOR' ? { ...p, x0: 300, x1: 330 } : p))
    const lineas = [
      linea(1, 700, encabezado),
      linea(1, 690, lineaFila('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', '$9,000.00', 690)),
      linea(1, 680, lineaFila('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', '$8,500.00', 680)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bloques[0].filas).toHaveLength(2)
  })

  it('rangos de VALOR y SALDO solapados entre dos filas del mismo bloque: rechaza el documento completo', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFilaColumnas('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', 500, '$9,000.00', 600, 690)),
      linea(1, 680, lineaFilaColumnas('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', 450, '$8,500.00', 490, 680)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('fila_incompleta')
  })

  it('dos bloques (páginas distintas) con columnas en posiciones totalmente distintas entre sí: cada uno deriva su propia frontera', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700, 1)),
      linea(1, 690, lineaFilaColumnas('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', 300, '$9,000.00', 340, 690, 1)),
      linea(1, 680, lineaFilaColumnas('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', 300, '$8,500.00', 340, 680, 1)),
      linea(2, 700, lineaEncabezado(700, 2)),
      linea(2, 690, lineaFilaColumnas('2026/06/03', 'PAGO PROVEEDOR TRES', '$700.00', 550, '$7,800.00', 650, 690, 2)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bloques).toHaveLength(2)
      expect(r.bloques[0].filas).toHaveLength(2)
      expect(r.bloques[0].filas[0].valorCentavos).toBe(100000)
      expect(r.bloques[1].filas).toHaveLength(1)
      expect(r.bloques[1].filas[0].valorCentavos).toBe(70000)
    }
  })

  it('varias filas con el mismo monto exacto en VALOR (mismo x1) pero SALDO distinto en cada una: todas bien clasificadas', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700)),
      linea(1, 690, lineaFila('2026/06/01', 'COMISION', '$500.00', '$9,500.00', 690)),
      linea(1, 680, lineaFila('2026/06/02', 'COMISION', '$500.00', '$9,000.00', 680)),
      linea(1, 670, lineaFila('2026/06/03', 'COMISION', '$500.00', '$8,500.00', 670)),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bloques[0].filas).toHaveLength(3)
      expect(r.bloques[0].filas.every(f => f.valorCentavos === 50000)).toBe(true)
      expect(r.bloques[0].filas.map(f => f.saldoCentavos)).toEqual([950000, 900000, 850000])
    }
  })

  it('bloque con problema de frontera seguido de un bloque con problema estructural: se reporta el del primer bloque (orden documental)', () => {
    const lineas = [
      linea(1, 700, lineaEncabezado(700, 1)),
      linea(1, 690, lineaFilaColumnas('2026/06/01', 'PAGO PROVEEDOR UNO', '$1,000.00', 500, '$9,000.00', 600, 690, 1)),
      linea(1, 680, lineaFilaColumnas('2026/06/02', 'PAGO PROVEEDOR DOS', '$500.00', 450, '$8,500.00', 490, 680, 1)),
      linea(2, 700, lineaEncabezado(700, 2)),
      linea(2, 690, lineaFila('2026/06/03', 'PAGO X', '$1,000.00', '$9,000.00', 690, 2).filter(p => p.texto !== '$9,000.00')),
    ]
    const r = reconstruirBloques(lineas)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toBe('fila_incompleta')
      expect(r.detalle).toContain('bloque 0')
      expect(r.detalle).toContain('frontera')
    }
  })
})
