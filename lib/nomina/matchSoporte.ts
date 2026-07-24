// lib/nomina/matchSoporte.ts
// Version server-side (usa Service Role Key) de la logica de match que ya existia
// en app/documentos/page.tsx (enrutarDocumentoIA), para poder llamarla desde
// el webhook de WhatsApp, que no corre en el navegador.
import { createAdminClient } from '@/lib/supabase/admin'
import type { DatosDocumentoIA } from '@/lib/documentos/clasificarDocumento'

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function obtenerPeriodoDeFecha(fechaStr?: string | null): string {
  if (!fechaStr) return new Date().toISOString().slice(0, 7)
  const m = fechaStr.match(/^(\d{4})[-/.](\d{2})/)
  return m ? `${m[1]}-${m[2]}` : new Date().toISOString().slice(0, 7)
}

export type ResultadoMatchNomina =
  | { match: true; empleadoId: string; nombreEmpleado: string; cedula: string }
  | { match: false; razon: string }

export async function intentarMatchNomina(datos: DatosDocumentoIA, empresaId: string): Promise<ResultadoMatchNomina> {
  const supabase = createAdminClient()
  const periodo = obtenerPeriodoDeFecha(datos.fecha_emision || datos.fecha)

  // Incluye obligaciones ya con un abono parcial: un segundo (o tercer) pago debe poder
  // seguir encontrando a la misma persona hasta completar el valor causado.
  const { data: empData } = await supabase
    .from('nomina_programada')
    .select('id, nombre_empleado, cedula, neto_pagar, valor_causado, saldo_anterior')
    .eq('empresa_id', empresaId)
    .eq('periodo_contable', periodo)
    .in('estado', ['Pendiente de Pago', 'Pago parcial'])

  if (!empData || empData.length === 0) {
    return { match: false, razon: `No hay pagos de nomina pendientes para el periodo ${periodo}.` }
  }

  const { data: aliasData } = await supabase
    .from('alias_terceros')
    .select('cedula, alias')
    .eq('empresa_id', empresaId)

  const aliasesMap: Record<string, string[]> = {}
  for (const row of aliasData ?? []) {
    if (!aliasesMap[row.cedula]) aliasesMap[row.cedula] = []
    aliasesMap[row.cedula].push(row.alias)
  }

  const proveedorNorm = normalizar(datos.proveedor || '')
  const valorDoc = datos.valor_total || datos.valor || 0

  // 1. Coincidencia por Nombre/Alias + Valor (+/- 10)
  for (const emp of empData) {
    const empNombreNorm = normalizar(emp.nombre_empleado)
    const empAliases = aliasesMap[emp.cedula] || []

    let coincideNombre = proveedorNorm.includes(empNombreNorm) || empNombreNorm.includes(proveedorNorm)
    if (!coincideNombre) {
      for (const alias of empAliases) {
        const aliasNorm = normalizar(alias)
        if (aliasNorm && (proveedorNorm.includes(aliasNorm) || aliasNorm.includes(proveedorNorm))) {
          coincideNombre = true
          break
        }
      }
    }

    // El match por nombre/alias NO exige que el valor coincida: puede ser un abono
    // parcial. La cedula/nombre es lo que define al beneficiario, no el monto.
    if (coincideNombre) {
      return { match: true, empleadoId: emp.id, nombreEmpleado: emp.nombre_empleado, cedula: emp.cedula }
    }
  }

  // 2. Coincidencia por Valor Unico (+/- 10), solo cuando no hubo match por nombre.
  const coincidenValor = empData.filter((e) => Math.abs(Number(e.neto_pagar) - Number(valorDoc)) <= 10)
  if (coincidenValor.length === 1) {
    const emp = coincidenValor[0]
    return { match: true, empleadoId: emp.id, nombreEmpleado: emp.nombre_empleado, cedula: emp.cedula }
  }

  if (coincidenValor.length > 1) {
    return { match: false, razon: `Multiples empleados (${coincidenValor.map((e) => e.nombre_empleado).join(', ')}) con el mismo valor. Requiere revision manual.` }
  }

  return { match: false, razon: 'No se encontro coincidencia por nombre ni por valor.' }
}

export async function marcarNominaPagada(empleadoId: string, archivoUrl: string | null, referencia: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('nomina_programada')
    .update({
      estado: 'Pagado',
      metodo_conciliacion: 'automatico_valor',
      referencia_conciliacion: referencia,
      archivo_url: archivoUrl || 'subido',
    })
    .eq('id', empleadoId)

  if (error) throw new Error(error.message)
}

export async function guardarAliasTercero(nombreProveedor: string, cedulaEmpleado: string, empresaId: string, userId?: string) {
  if (!nombreProveedor || !cedulaEmpleado || !empresaId) return
  const aliasLimpio = nombreProveedor.trim()
  if (aliasLimpio.length < 3) return

  const supabase = createAdminClient()
  const { data: existente } = await supabase
    .from('alias_terceros')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('cedula', cedulaEmpleado)
    .eq('alias', aliasLimpio)
    .maybeSingle()

  if (!existente) {
    await supabase.from('alias_terceros').insert({
      user_id: userId ?? null,
      empresa_id: empresaId,
      cedula: cedulaEmpleado,
      alias: aliasLimpio,
      tercero_tipo: 'empleado',
      tercero_nombre: aliasLimpio,
    })
  }
}
