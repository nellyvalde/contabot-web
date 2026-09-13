// lib/bancos/consultaVigente.ts
// Coordinador generico y puro (sin React) para el patron "descarta una
// respuesta asincrona si ya no es la mas reciente". Reemplaza la
// comparacion manual de un solo string (ej. solo `periodo`) que existia
// antes en app/bancos/page.tsx -- esa comparacion no incluia `empresaId`,
// asi que una respuesta tardia de la empresa anterior podia sobreescribir
// resultados, periodo seleccionado, estado cerrado o mensajes de la
// empresa nueva si el usuario cambiaba de empresa mientras la consulta
// vieja todavia estaba en vuelo.

export function claveConsulta(...partes: Array<string | undefined | null>): string {
  return partes.map(p => p ?? '').join('::')
}

export type EstadoConsultaVigente = {
  obtenerClaveVigente: () => string
  establecerClaveVigente: (clave: string) => void
}

// Marca `clave` como la consulta vigente, ejecuta `tarea`, y solo llama a
// `aplicar` con su resultado si, cuando `tarea` termina, `clave` SIGUE
// siendo la vigente (nadie disparo una consulta mas nueva mientras tanto).
// Si una consulta mas nueva ya cambio la clave vigente, `aplicar` nunca se
// invoca -- el resultado de la consulta vieja se descarta en silencio, sin
// tocar ningun estado.
export async function ejecutarSiVigente<T>(
  estado: EstadoConsultaVigente,
  clave: string,
  tarea: () => Promise<T>,
  aplicar: (resultado: T) => void
): Promise<void> {
  estado.establecerClaveVigente(clave)
  const resultado = await tarea()
  if (estado.obtenerClaveVigente() !== clave) return
  aplicar(resultado)
}
