// lib/bancos/extractoPdf/vigencia.ts
// Fase 1/Fase 2: el periodo del extracto se obtiene EXCLUSIVAMENTE del
// banner "VIGENCIA dd DE <mes> AL dd DE <mes> DE aaaa" -- nunca de la
// fecha mínima/máxima de las filas (el documento puede traer una fila del
// mes anterior como puente de la cadena de saldos) ni del nombre del
// archivo (confirmado no confiable: el archivo de prueba se llamaba
// "julio" y el extracto real era de junio).
import { parseFechaSiValida, fechaMenorOIgual } from './fecha'

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
}

// Espacios flexibles entre tokens (la reconstrucción de línea a partir de
// palabras separadas puede colapsar distinto), pero la FORMA del banner
// (VIGENCIA, DE, AL, DE, DE) es fija y estricta -- no se acepta ninguna
// variante ni abreviatura de mes.
const PATRON_VIGENCIA = /VIGENCIA\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)\s+AL\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)\s+DE\s+(\d{4})/

export type Vigencia = { inicio: string; fin: string }

// Recibe el texto YA reconstruido de una línea (o de varias concatenadas
// con espacio) -- no palabras sueltas. Devuelve null ante cualquier duda:
// mes no reconocido, fecha calendáricamente inválida, o inicio posterior
// al fin. El llamador debe tratar null como "vigencia no determinada" y
// rechazar el documento completo, nunca asumir un valor por defecto.
export function parseVigencia(textoLinea: string): Vigencia | null {
  const m = PATRON_VIGENCIA.exec(textoLinea.toUpperCase())
  if (!m) return null
  const [, diaIniTxt, mesIniNombre, diaFinTxt, mesFinNombre, anioTxt] = m
  const mesIni = MESES[mesIniNombre]
  const mesFin = MESES[mesFinNombre]
  if (!mesIni || !mesFin) return null

  const inicio = parseFechaSiValida(`${anioTxt}/${String(mesIni).padStart(2, '0')}/${diaIniTxt.padStart(2, '0')}`)
  const fin = parseFechaSiValida(`${anioTxt}/${String(mesFin).padStart(2, '0')}/${diaFinTxt.padStart(2, '0')}`)
  if (!inicio || !fin) return null
  if (!fechaMenorOIgual(inicio, fin)) return null

  return { inicio, fin }
}

export function dentroDeVigencia(fecha: string, vigencia: Vigencia): boolean {
  return fechaMenorOIgual(vigencia.inicio, fecha) && fechaMenorOIgual(fecha, vigencia.fin)
}
