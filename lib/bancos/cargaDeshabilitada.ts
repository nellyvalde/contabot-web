// lib/bancos/cargaDeshabilitada.ts
// Hotfix de seguridad: la carga de extractos bancarios esta temporalmente
// deshabilitada -- el flujo antiguo de app/bancos/page.tsx borraba e
// insertaba directamente en conciliaciones_bancarias sin proveer
// cuenta_id, columna que PR 9a volvio NOT NULL. Se reactivara cuando la
// interfaz se conecte al modelo nuevo (importaciones_bancarias /
// iniciar_o_reintentar_importacion).
//
// No hay un flag de codigo aqui (ej. CARGA_EXTRACTOS_HABILITADA): el
// flujo antiguo fue eliminado por completo de app/bancos/page.tsx, no
// ocultado detras de una condicion. Reactivarlo en el futuro significa
// escribir el flujo nuevo, no voltear un booleano.
export const MENSAJE_CARGA_DESHABILITADA =
  'La importación de extractos está temporalmente deshabilitada mientras actualizamos el módulo bancario. La carga de archivos no modificará tus movimientos existentes.'
