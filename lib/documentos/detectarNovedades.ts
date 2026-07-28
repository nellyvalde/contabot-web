type DocumentoBase = {
  id: string
  numero_documento: string | null
  proveedor_cliente: string | null
  valor: number | null
  fecha_emision: string | null
  cuenta_puc: string | null
  archivo_url?: string | null
}

type FacturaBanco = {
  proveedor: string | null
  fecha: string | null
  valor: number | null
}

const REGEX_PUC = /^\d{6}$/

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function detectarNovedades(
  doc: DocumentoBase,
  todosLosDocumentos: DocumentoBase[],
  facturasBanco: FacturaBanco[] = []
): string[] {
  const novedades: string[] = []

  if (!doc.numero_documento || !doc.proveedor_cliente || !doc.valor || !doc.fecha_emision || !doc.cuenta_puc) {
    novedades.push('Datos incompletos')
  }

  if (!doc.cuenta_puc || !REGEX_PUC.test(doc.cuenta_puc.trim())) {
    novedades.push('Cuenta PUC dudosa')
  }

  if (doc.proveedor_cliente && doc.valor && doc.fecha_emision) {
    const proveedorNorm = normalizarTexto(doc.proveedor_cliente)
    const posibleDuplicado = todosLosDocumentos.some(otro =>
      otro.id !== doc.id &&
      otro.proveedor_cliente &&
      normalizarTexto(otro.proveedor_cliente) === proveedorNorm &&
      Number(otro.valor) === Number(doc.valor) &&
      otro.fecha_emision === doc.fecha_emision
    )
    if (posibleDuplicado) novedades.push('Posible duplicado')
  }

  if (!doc.archivo_url) {
    novedades.push('Falta de soporte')
  }

  if (doc.proveedor_cliente && doc.valor && doc.fecha_emision && facturasBanco.length > 0) {
    const proveedorNorm = normalizarTexto(doc.proveedor_cliente)
    const coincidenciaBanco = facturasBanco.find(f =>
      f.proveedor &&
      normalizarTexto(f.proveedor) === proveedorNorm &&
      f.fecha === doc.fecha_emision
    )
    if (coincidenciaBanco && Number(coincidenciaBanco.valor) !== Number(doc.valor)) {
      novedades.push('Diferencia con el banco')
    }
  }

  return novedades
}
