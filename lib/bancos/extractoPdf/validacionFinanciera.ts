// lib/bancos/extractoPdf/validacionFinanciera.ts
// Fase 3: el tipo (débito/crédito) se calcula ÚNICAMENTE mediante la
// variación del saldo entre filas consecutivas -- nunca a partir de la
// descripción. Cualquier contradicción, fila con valor cero, o
// discrepancia contra el resumen declarado rechaza el DOCUMENTO COMPLETO
// -- nunca se importa un tramo parcial.
import type { FilaCruda } from './filas'
import type { Resumen } from './resumen'
import type { Vigencia } from './vigencia'
import { dentroDeVigencia } from './vigencia'
import type { Movimiento, TipoMovimiento } from './tipos'

export type MotivoRechazoFinanciero = 'valor_cero' | 'cadena_rota' | 'resumen_no_concilia' | 'ancla_no_concilia' | 'cierre_no_concilia'

export type ResultadoValidacionFinanciera =
  | { ok: true; movimientos: Movimiento[] }
  | { ok: false; motivo: MotivoRechazoFinanciero; detalle: string }

export function validarYClasificar(filas: FilaCruda[], resumen: Resumen, vigencia: Vigencia): ResultadoValidacionFinanciera {
  if (filas.length === 0) {
    return { ok: false, motivo: 'cadena_rota', detalle: 'no hay filas para validar' }
  }

  // Un valor de $0.00 no permite decidir si el movimiento fue débito o
  // crédito por la variación del saldo (+0 y -0 son indistinguibles) --
  // se marca indeterminado y se rechaza el documento hasta una decisión
  // humana futura, nunca se importa igual.
  for (const f of filas) {
    if (f.valorCentavos === 0) {
      return { ok: false, motivo: 'valor_cero', detalle: `página ${f.pagina}, bloque ${f.bloqueIndice}, fila ${f.filaIndiceEnBloque}` }
    }
  }

  // Ancla: la primera fila de la tabla debe conciliar contra el saldo
  // inicial declarado en el resumen -- validación propia, distinta (y
  // anterior) a la del resto de la cadena.
  const primera = filas[0]
  const deltaAncla = primera.saldoCentavos - resumen.saldoInicialCentavos
  if (deltaAncla !== primera.valorCentavos && deltaAncla !== -primera.valorCentavos) {
    return { ok: false, motivo: 'ancla_no_concilia', detalle: 'la primera fila no concilia con el saldo inicial del resumen' }
  }

  const tipos: TipoMovimiento[] = []
  let saldoAnterior = resumen.saldoInicialCentavos
  for (const f of filas) {
    const delta = f.saldoCentavos - saldoAnterior
    if (delta === f.valorCentavos) tipos.push('credito')
    else if (delta === -f.valorCentavos) tipos.push('debito')
    else return { ok: false, motivo: 'cadena_rota', detalle: `página ${f.pagina}, bloque ${f.bloqueIndice}, fila ${f.filaIndiceEnBloque}` }
    saldoAnterior = f.saldoCentavos
  }

  // Cierre: el saldo de la ÚLTIMA fila de la tabla debe coincidir con el
  // saldo final declarado en el resumen.
  const ultima = filas[filas.length - 1]
  if (ultima.saldoCentavos !== resumen.saldoFinalCentavos) {
    return { ok: false, motivo: 'cierre_no_concilia', detalle: 'el saldo de la última fila no coincide con el saldo final del resumen' }
  }

  const sumaCreditos = filas.reduce((acc, f, i) => acc + (tipos[i] === 'credito' ? f.valorCentavos : 0), 0)
  const sumaDebitos = filas.reduce((acc, f, i) => acc + (tipos[i] === 'debito' ? f.valorCentavos : 0), 0)
  if (sumaCreditos !== resumen.totalCreditosCentavos || sumaDebitos !== resumen.totalDebitosCentavos) {
    return { ok: false, motivo: 'resumen_no_concilia', detalle: 'la suma de créditos o débitos no coincide con el resumen declarado' }
  }

  const movimientos: Movimiento[] = filas.map((f, i) => ({
    fecha: f.fecha,
    descripcion: f.descripcion,
    valorCentavos: f.valorCentavos,
    saldoCentavos: f.saldoCentavos,
    tipo: tipos[i],
    pagina: f.pagina,
    referenciaOrigen: `p${f.pagina}:bloque${f.bloqueIndice}:fila${f.filaIndiceEnBloque}`,
    dentroDeVigencia: dentroDeVigencia(f.fecha, vigencia),
  }))

  return { ok: true, movimientos }
}
