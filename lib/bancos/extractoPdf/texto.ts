// lib/bancos/extractoPdf/texto.ts
// Fase 1: normalización estricta de espacios y Unicode. Nunca corrige ni
// reinterpreta el contenido -- solo canonicaliza la representación
// (NFC: compone caracteres con diacríticos en un solo punto de código,
// para que "é" comparado por igualdad de cadenas no dependa de si pdfjs
// lo entregó precompuesto o como e + acento combinante) y colapsa
// espacios en blanco repetidos o de distinta clase (tab, nbsp) a un solo
// espacio simple.
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFC').replace(/\s+/g, ' ').trim()
}
