// lib/bancos/accionExclusiva.ts
// Envuelve una accion async para que, mientras una ejecucion esta en
// curso, una invocacion nueva NO dispare una segunda llamada real. Nace
// del hotfix de "Cerrar periodo" (incidente de julio 2026: un solo clic
// cerro el periodo sin confirmacion), pero es generico porque un guard
// hecho solo con un booleano de React (`disabled={enCurso}`) no alcanza
// por si solo: dos clics disparados en el mismo tick, ANTES de que React
// vuelva a renderizar y aplique `disabled`, pueden ambos leer el mismo
// estado "no esta en curso" y ambos iniciar la escritura. Aqui la
// exclusion se hace con una variable capturada en el cierre, mutada
// SINCRONICAMENTE antes de cualquier await -- no con estado de React --
// asi que es inmune a esa ventana entre el clic y el siguiente render.
export function crearAccionExclusiva<A extends unknown[], R>(
  accion: (...args: A) => Promise<R>,
  alCambiarEnCurso: (enCurso: boolean) => void
): (...args: A) => Promise<R | undefined> {
  let enCurso = false

  return async (...args: A) => {
    if (enCurso) return undefined

    enCurso = true
    alCambiarEnCurso(true)
    try {
      return await accion(...args)
    } finally {
      enCurso = false
      alCambiarEnCurso(false)
    }
  }
}
