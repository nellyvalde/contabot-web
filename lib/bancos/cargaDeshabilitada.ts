// lib/bancos/cargaDeshabilitada.ts
// Hotfix de seguridad (incidente de julio 2026): la carga de extractos
// bancarios queda temporalmente deshabilitada porque el flujo antiguo de
// app/bancos/page.tsx borraba e insertaba directamente en
// conciliaciones_bancarias sin proveer cuenta_id, columna que PR 9a volvio
// NOT NULL -- eso hacia fallar el INSERT despues de que el DELETE ya se
// habia aplicado. Se reactivara cuando la interfaz se conecte al modelo
// nuevo (importaciones_bancarias / iniciar_o_reintentar_importacion).
export const CARGA_EXTRACTOS_HABILITADA = false

export const MENSAJE_CARGA_DESHABILITADA =
  'La importación de extractos está temporalmente deshabilitada mientras actualizamos el módulo bancario. Tus movimientos existentes no serán modificados.'
