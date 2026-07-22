import { supabase } from '@/lib/supabase/client'

export type CampoContable =
  | 'nombreEmpleado'
  | 'cedula'
  | 'areaCargo'
  | 'salarioBasico'
  | 'auxilioTransporte'
  | 'bonificaciones'
  | 'prestamosAnticipos'
  | 'abonoPrima'
  | 'cesantias'
  | 'netoPagado'
  | 'ignorar'

// Mapeo indexado por POSICION de columna (no por texto de encabezado).
// Evita colisiones cuando el Excel tiene encabezados vacios o duplicados
// (ej. columna "Neto Pagado" sin texto en la celda de encabezado).
// mapeo[i] corresponde al mismo indice que encabezados[i] usado para calcular la huella.
export type MapeoColumnas = CampoContable[]

export const CAMPOS_CONTABLES: { value: CampoContable; label: string }[] = [
  { value: 'nombreEmpleado', label: 'Nombre del empleado' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'areaCargo', label: 'Área/Cargo' },
  { value: 'salarioBasico', label: 'Salario Básico' },
  { value: 'auxilioTransporte', label: 'Auxilio de Transporte' },
  { value: 'bonificaciones', label: 'Bonificaciones' },
  { value: 'prestamosAnticipos', label: 'Préstamos/Anticipos' },
  { value: 'abonoPrima', label: 'Abono/Prima' },
  { value: 'cesantias', label: 'Cesantías' },
  { value: 'netoPagado', label: 'Neto a Pagar' },
  { value: 'ignorar', label: 'Ignorar esta columna' },
]

export function calcularHuellaEncabezados(encabezados: string[]): string {
  return encabezados.join('|')
}

function esMapeoLegacyPorTexto(valor: unknown): valor is Record<string, CampoContable> {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor)
}

export async function buscarMapeoGuardado(
  empresaId: string,
  huellaEncabezados: string
): Promise<MapeoColumnas | null> {
  const { data, error } = await supabase
    .from('mapeos_excel_nomina')
    .select('mapeo')
    .eq('empresa_id', empresaId)
    .eq('huella_encabezados', huellaEncabezados)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.mapeo) return null

  // Compatibilidad hacia atras: mapeos guardados antes del fix (formato { encabezado: campo })
  // no son confiables (colisionan con encabezados vacios/duplicados). Se tratan como inexistentes
  // para forzar un remapeo limpio con el formato nuevo, indexado por posicion.
  if (esMapeoLegacyPorTexto(data.mapeo)) return null

  return data.mapeo as MapeoColumnas
}

export async function guardarMapeoColumnas(
  empresaId: string,
  huellaEncabezados: string,
  mapeo: MapeoColumnas
): Promise<void> {
  const { error } = await supabase
    .from('mapeos_excel_nomina')
    .upsert(
      { empresa_id: empresaId, huella_encabezados: huellaEncabezados, mapeo },
      { onConflict: 'empresa_id,huella_encabezados' }
    )

  if (error) throw new Error(error.message)
}
