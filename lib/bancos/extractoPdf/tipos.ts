// lib/bancos/extractoPdf/tipos.ts
// Fase 1: contratos del lector de extractos PDF con texto nativo (AV Villas).
// Módulo nuevo y aislado -- no importa nada de app/bancos, lib/supabase, ni
// del parser XLSX/CSV existente (lib/bancos/parsearExtractoAvVillas.ts),
// que sigue sin modificarse.

export type Pagina = number // 1-indexado

// Una palabra tal como la entrega pdfjs: texto y caja delimitadora en el
// espacio de coordenadas del PDF (origen abajo-izquierda), más la pagina y
// el orden de lectura dentro de esa pagina (indice del item de
// getTextContent -- nunca se reordena por posicion, solo se usa para
// desempatar cuando dos palabras comparten exactamente la misma fila).
export type Palabra = {
  texto: string
  x0: number
  y0: number
  x1: number
  y1: number
  pagina: Pagina
  orden: number
}

export type TipoMovimiento = 'debito' | 'credito' | 'indeterminado'

// Contrato interno de un movimiento ya validado financieramente. Nunca se
// construye una instancia de este tipo para una fila que no paso la
// cadena de saldos -- ver validacionFinanciera.ts.
export type Movimiento = {
  fecha: string // 'AAAA/MM/DD', ya validada calendaricamente
  descripcion: string // exacta, normalizada UNICAMENTE en espacios/unicode -- nunca reinterpretada
  valorCentavos: number
  saldoCentavos: number
  tipo: TipoMovimiento
  pagina: Pagina
  referenciaOrigen: string // trazabilidad hacia el bloque/linea de origen, ej. "p2:bloque1:fila14"
  dentroDeVigencia: boolean
}

// Motivos de rechazo, cerrados y controlados -- nunca se expone al
// llamador un mensaje crudo del parser o de pdfjs. mensajes.ts mapea cada
// uno a un texto fijo en español.
export type MotivoRechazo =
  | 'sin_texto_util'
  | 'cifrado'
  | 'corrupto'
  | 'demasiado_grande'
  | 'demasiadas_paginas'
  | 'texto_superpuesto_conflictivo'
  | 'vigencia_no_determinada'
  | 'encabezado_no_reconocido'
  | 'bloque_duplicado'
  | 'fila_incompleta'
  | 'cadena_rota'
  | 'valor_cero'
  | 'resumen_no_encontrado'
  | 'resumen_no_concilia'
  | 'ancla_no_concilia'
  | 'cierre_no_concilia'

// `detalle` es opcional y, cuando existe, debe limitarse a hechos
// ESTRUCTURALES (número de página, número de bloque, fecha ya validada,
// nombre de columna) -- nunca un monto, una descripción completa, ni el
// texto crudo de una excepción de pdfjs.
export type ResultadoRechazado = { ok: false; motivo: MotivoRechazo; detalle?: string }
