// lib/bancos/estadoVista.ts
// Logica pura para decidir si el area principal de /bancos debe mostrar
// la tabla de resultados o el estado vacio. Se extrae como funcion pura
// (sin React, sin Supabase) para poder probar el invariante "el area
// principal nunca queda completamente vacia" sin necesitar
// react-testing-library / jsdom, que este repositorio no tiene
// configurado.
//
// Antes de este hotfix, page.tsx decidia que renderizar con DOS
// condiciones `&&` independientes ((paso==='subir'||mostrarSubida) por un
// lado, (paso==='revisar'&&resultados.length>0) por el otro) que podian
// ser AMBAS falsas a la vez -- eso dejaba el area principal en blanco
// (el bug reportado). Usar un booleano unico en un ternario en el JSX
// hace estructuralmente imposible que ninguna rama renderice.
export function hayResultadosParaMostrar(cantidadResultados: number): boolean {
  return cantidadResultados > 0
}
