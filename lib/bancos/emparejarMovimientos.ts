// lib/bancos/emparejarMovimientos.ts
// Logica pura de emparejamiento uno-a-uno entre movimientos bancarios y
// facturas (Compras/Gastos). Reemplaza el uso de Array.prototype.find() en
// app/bancos/page.tsx, que elegia arbitrariamente la primera factura
// candidata sin detectar ambiguedad ni evitar que la misma factura fuera
// reclamada por dos movimientos distintos del mismo extracto.
//
// No conoce Supabase ni React -- recibe arreglos ya cargados y devuelve
// resultados puros, para poder probarse sin mocks de red.

// valor admite string porque PostgREST puede serializar una columna numeric
// como string segun el driver/config -- se normaliza en filtrarFacturasValidas,
// nunca se asume ya numerica.
export type FacturaCruda = { id: string; valor: number | string | null; fecha: string; estado: string }
export type FacturaCandidata = { id: string; valor: number; fecha: string }
export type MovimientoParaEmparejar = { fecha: string; valor: number }

export type CandidatoAmbiguo = { factura_id: string; valor: number; diferencia: number; fecha: string }

export type ResultadoEmparejamientoMovimiento =
  | { tipo: 'encontrado'; factura: FacturaCandidata }
  | { tipo: 'requiere_revision'; candidatos: CandidatoAmbiguo[] }
  | { tipo: 'no_encontrado' }

// No usar Date para restar fechas 'YYYY-MM-DD' en horario local -- Date.parse
// de un string sin hora se interpreta como UTC medianoche, y como ambas
// fechas se parsean igual, la diferencia en milisegundos es exacta sin
// importar el timezone del navegador.
function diferenciaDias(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1)
  const d2 = new Date(fecha2)
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

// LEAST(1000, GREATEST(100, valor * 0.001)) -- para facturas de valor bajo
// (ej. $1.200) un piso fijo de $100 evita que comisiones bancarias
// cualquiera calcen por una tolerancia proporcional demasiado laxa; para
// facturas grandes, el tope de $1000 evita exigir coincidencia al peso.
export function calcularTolerancia(valor: number): number {
  return Math.min(1000, Math.max(100, valor * 0.001))
}

// Candidatas validas: valor positivo y finito (excluye NULL, '', texto no
// numerico, NaN, Infinity, 0 y negativos -- ver caso real de una factura con
// valor=0 y proveedor="No es una factura electronica DIAN" que actuaba como
// iman de falsos positivos) y estado Pendiente o Vencido (una factura
// Vencido puede pagarse legitimamente, decision de negocio confirmada;
// Pagado/otros quedan excluidas aunque la consulta SQL que las trae ya
// deberia filtrarlas -- defensa en profundidad).
//
// Number(f.valor) normaliza tanto number como string numerico (ej. la
// columna numeric podria llegar como "23000.00" segun el driver) a un
// number real -- la candidata devuelta SIEMPRE lleva valor ya normalizado,
// nunca el string original, para que el resto del modulo pueda asumir
// aritmetica segura sin volver a convertir en cada uso.
export function filtrarFacturasValidas(facturas: FacturaCruda[]): FacturaCandidata[] {
  const candidatas: FacturaCandidata[] = []
  for (const f of facturas) {
    if (f.estado !== 'Pendiente' && f.estado !== 'Vencido') continue
    const valorNormalizado = Number(f.valor)
    if (!Number.isFinite(valorNormalizado) || valorNormalizado <= 0) continue
    candidatas.push({ id: f.id, valor: valorNormalizado, fecha: f.fecha })
  }
  return candidatas
}

// Excluye facturas ya reclamadas por una conciliacion activa (encontrado o
// confirmado) en CUALQUIER periodo -- sin esto, una factura emparejada en
// un periodo pero no confirmada todavia podia volver a emparejarse en un
// periodo distinto o en una recarga del mismo extracto.
export function excluirFacturasReclamadas(
  facturas: FacturaCandidata[],
  idsReclamados: ReadonlySet<string>
): FacturaCandidata[] {
  return facturas.filter(f => !idsReclamados.has(f.id))
}

// Empareja UN movimiento contra el pool de candidatas disponible. Prioriza
// coincidencia exacta de valor; solo baja a coincidencia aproximada (dentro
// de tolerancia) si no hubo ninguna exacta. En cualquiera de las dos etapas,
// mas de un candidato valido es ambiguedad real -- se reporta para revision
// humana en vez de elegir arbitrariamente (el problema original de .find()).
export function emparejarMovimiento(
  mov: MovimientoParaEmparejar,
  facturasDisponibles: FacturaCandidata[],
  ventanaDias = 5
): ResultadoEmparejamientoMovimiento {
  const enVentanaFecha = facturasDisponibles.filter(f => diferenciaDias(f.fecha, mov.fecha) <= ventanaDias)

  const aCandidato = (f: FacturaCandidata): CandidatoAmbiguo => ({
    factura_id: f.id,
    valor: f.valor,
    diferencia: Math.abs(f.valor - mov.valor),
    fecha: f.fecha,
  })

  const exactas = enVentanaFecha.filter(f => f.valor === mov.valor)
  if (exactas.length === 1) return { tipo: 'encontrado', factura: exactas[0] }
  if (exactas.length > 1) return { tipo: 'requiere_revision', candidatos: exactas.map(aCandidato) }

  const aproximadas = enVentanaFecha.filter(f => Math.abs(f.valor - mov.valor) <= calcularTolerancia(f.valor))
  if (aproximadas.length === 1) return { tipo: 'encontrado', factura: aproximadas[0] }
  if (aproximadas.length > 1) return { tipo: 'requiere_revision', candidatos: aproximadas.map(aCandidato) }

  return { tipo: 'no_encontrado' }
}

// Empareja una lista completa de movimientos (un extracto), consumiendo del
// pool cada factura asignada -- impide que dos movimientos del MISMO
// archivo reclamen la misma factura. El orden del arreglo de entrada decide
// cual movimiento se queda con una factura en caso de que varios la
// hubieran podido reclamar de forma no ambigua cada uno por separado.
export function emparejarLote(
  movimientos: MovimientoParaEmparejar[],
  facturasDisponibles: FacturaCandidata[],
  ventanaDias = 5
): ResultadoEmparejamientoMovimiento[] {
  let pool = facturasDisponibles
  return movimientos.map(mov => {
    const resultado = emparejarMovimiento(mov, pool, ventanaDias)
    if (resultado.tipo === 'encontrado') {
      pool = pool.filter(f => f.id !== resultado.factura.id)
    }
    return resultado
  })
}

// Traduce el error de un INSERT fallido a un mensaje para el usuario. El
// codigo 23505 es una violacion del indice unico parcial
// conciliaciones_documento_activo_unico -- significa que otra pestana/sesion
// ya reclamo esa factura entre que este extracto se calculo y se guardo.
export function interpretarErrorInsercion(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Una de las facturas ya fue emparejada por otra sesión mientras guardabas este cruce. Vuelve a subir el extracto para recalcular.'
  }
  return 'Error guardando la conciliación: ' + error.message
}
