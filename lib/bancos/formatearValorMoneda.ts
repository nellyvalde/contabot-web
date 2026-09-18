// lib/bancos/formatearValorMoneda.ts
// Formateador puro para mostrar valores monetarios en la previsualizacion
// de Bloque B con formato colombiano (punto de miles, coma decimal) y
// EXACTAMENTE dos decimales -- nunca redondeado a pesos enteros. La
// previsualizacion usaba antes Math.round(valor).toLocaleString(), que
// descartaba los centavos en silencio (ej. 150000.50 se mostraba como
// "$150.001" -- un valor DISTINTO al realmente parseado, sin que el
// usuario lo notara en la previsualizacion).
//
// Se usa Intl.NumberFormat con `style: 'decimal'` (no 'currency') y el
// simbolo '$' se antepone a mano: el estilo 'currency' con currency:'COP'
// intercala un espacio entre el simbolo y la cifra segun el motor ICU
// (confirmado empiricamente: "$ 150.000,50", CON espacio) -- un detalle
// que puede variar entre versiones/entornos de Node y que no se quiere
// que la presentacion dependa de el. El signo negativo se antepone al
// simbolo de moneda (-$150.000,50), no despues de el.
const FORMATEADOR_DECIMAL_COP = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatearValorMoneda(valor: number): string {
  const negativo = valor < 0
  const formateado = FORMATEADOR_DECIMAL_COP.format(Math.abs(valor))
  return `${negativo ? '-$' : '$'}${formateado}`
}
