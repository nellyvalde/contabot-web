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

export type MapeoColumnas = Record<string, CampoContable>

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
  { value: 'netoPagado', label: 'Neto Pagado' },
  { value: 'ignorar', label: 'Ignorar esta columna' },
]

export function calcularHuellaEncabezados(encabezados: string[]): string {
  return encabezados.join('|')
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
  return (data?.mapeo as MapeoColumnas | undefined) ?? null
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
