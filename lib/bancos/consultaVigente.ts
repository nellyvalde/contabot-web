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
// `aplicar` con su resultado si se cumplen DOS condiciones simultaneamente:
//
//   1. `clave` sigue siendo la vigente para ESTE tipo de consulta (nadie
//      disparo una consulta mas nueva DEL MISMO TIPO mientras tanto).
//   2. `siguesSiendoVigente()` (opcional) sigue devolviendo true -- pensado
//      para una identidad INDEPENDIENTE del ciclo de vida de la consulta,
//      tipicamente "el empresaId (y opcionalmente periodo) capturados al
//      iniciar siguen siendo los actualmente renderizados". Este segundo
//      chequeo existe porque el (1) por si solo tiene un hueco real: si la
//      empresa activa cambia (o pasa a undefined) pero TODAVIA no se disparo
//      ninguna consulta nueva de este tipo (el efecto que la dispararia
//      puede no haber corrido todavia), la clave vigente de (1) sigue
//      siendo la vieja -- nada la reemplazo -- asi que (1) solo, de forma
//      aislada, dejaria pasar una respuesta que ya no corresponde a nada
//      visible en pantalla. `siguesSiendoVigente` debe leer una referencia
//      que se actualiza en CADA render (no solo cuando arranca una
//      consulta) para cerrar ese hueco.
//
// Si cualquiera de las dos falla, `aplicar` nunca se invoca -- el resultado
// se descarta en silencio, sin tocar ningun estado.
export async function ejecutarSiVigente<T>(
  estado: EstadoConsultaVigente,
  clave: string,
  tarea: () => Promise<T>,
  aplicar: (resultado: T) => void,
  siguesSiendoVigente: () => boolean = () => true
): Promise<void> {
  estado.establecerClaveVigente(clave)
  const resultado = await tarea()
  if (estado.obtenerClaveVigente() !== clave) return
  if (!siguesSiendoVigente()) return
  aplicar(resultado)
}
