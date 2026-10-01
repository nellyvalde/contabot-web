// lib/bancos/extractoPdf/mensajes.ts
// Mensajes controlados por motivo de rechazo -- nunca se muestra al
// usuario el texto crudo de una excepción de pdfjs ni un detalle interno
// del parser. El mensaje de 'sin_texto_util' reproduce EXACTAMENTE el
// texto aprobado.
import type { MotivoRechazo } from './tipos'

const MENSAJES: Record<MotivoRechazo, string> = {
  sin_texto_util:
    'Este PDF no contiene texto legible. Descarga el extracto original directamente del banco; no uses fotografías, capturas de pantalla ni documentos convertidos en Word.',
  cifrado: 'Este PDF está protegido con contraseña. Descárgalo de nuevo sin protección antes de importarlo.',
  corrupto: 'No se pudo leer este archivo. Verifica que sea un PDF válido, exportado directamente del banco.',
  demasiado_grande: 'El archivo supera el tamaño máximo permitido (10 MB).',
  demasiadas_paginas: 'El archivo supera el número máximo de páginas permitido (10).',
  texto_superpuesto_conflictivo:
    'Este PDF contiene texto superpuesto que no se puede interpretar de forma segura. Revísalo manualmente antes de continuar.',
  vigencia_no_determinada:
    'No se pudo determinar con seguridad el periodo (vigencia) de este extracto. Revísalo manualmente antes de continuar.',
  encabezado_no_reconocido: 'No se reconocieron las columnas esperadas (FECHA, DESCRIPCIÓN, VALOR, SALDO) en este extracto.',
  bloque_duplicado: 'Este extracto contiene un bloque de movimientos duplicado. Revísalo manualmente antes de continuar.',
  fila_incompleta: 'Este extracto contiene una fila de movimiento incompleta o inconsistente. Revísalo manualmente antes de continuar.',
  cadena_rota:
    'Los saldos de este extracto no forman una cadena consistente entre movimientos consecutivos. Revísalo manualmente antes de continuar.',
  valor_cero: 'Este extracto contiene un movimiento con valor cero, que no se puede clasificar como débito o crédito de forma segura.',
  resumen_no_encontrado: 'No se encontró el resumen del período (saldo inicial, créditos, débitos, saldo final) en este extracto.',
  resumen_no_concilia: 'Los créditos o débitos calculados no coinciden con los totales declarados en el resumen del extracto.',
  ancla_no_concilia: 'El primer movimiento de este extracto no concilia con el saldo inicial declarado.',
  cierre_no_concilia: 'El saldo final de este extracto no concilia con el saldo del último movimiento.',
}

export function mensajeControladoPdf(motivo: MotivoRechazo): string {
  return MENSAJES[motivo]
}
