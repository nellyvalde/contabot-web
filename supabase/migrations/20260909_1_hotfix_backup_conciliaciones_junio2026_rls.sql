-- =====================================================================
-- Migration: hotfix -- habilita RLS en la tabla de respaldo manual
-- public.backup_conciliaciones_junio2026 y revoca sus privilegios de
-- PUBLIC/anon/authenticated. Resuelve la alerta de Supabase
-- "rls_disabled_in_public" reportada en produccion.
--
-- CONTEXTO (ver diagnostico previo, solo lectura, no versionado como
-- migracion): la tabla no fue creada por ninguna migracion de este
-- repositorio ni aparece en ningun commit del historial -- es un
-- respaldo ad-hoc creado manualmente (probablemente en el SQL Editor),
-- sin ninguna referencia en app/ ni lib/, sin vistas, funciones,
-- triggers ni FKs que dependan de ella. Contenia 73 filas, RLS
-- deshabilitado y no forzado, 0 policies, y anon/authenticated con
-- privilegios de tabla efectivos completos.
--
-- ALCANCE -- deliberadamente minimo:
-- * Se habilita RLS. NO se crea ninguna policy: con RLS activo y cero
--   policies, ningun rol sin BYPASSRLS puede leer ni escribir filas --
--   es la denegacion por defecto mas simple y correcta para una tabla
--   que nadie deberia consultar desde la aplicacion.
-- * Se revocan los privilegios de tabla de PUBLIC/anon/authenticated
--   como segunda capa de defensa, independiente de RLS (si en el
--   futuro alguien deshabilita RLS por error, los privilegios de tabla
--   seguirian bloqueando el acceso).
-- * NO se toca la tabla en si: sin DROP, sin TRUNCATE, sin RENAME, sin
--   ALTER de columnas -- se preservan sus 73 filas intactas.
-- * NO se revoca nada de postgres (propietario) ni de service_role
--   (acceso administrativo de backend) -- ninguna sentencia de esta
--   migracion los menciona.
-- * NO se agrega FORCE ROW LEVEL SECURITY -- no fue solicitado y el
--   propietario ya queda fuera del alcance de RLS por defecto; agregarlo
--   seria una restriccion adicional no pedida.
--
-- GUARDA DE EXISTENCIA (critico para CI/reset local/proyecto de pruebas):
-- esta tabla NO fue creada por ninguna migracion de este repositorio --
-- es exclusiva del proyecto de produccion, creada manualmente fuera del
-- flujo versionado. Por lo tanto, en cualquier entorno que reconstruya
-- el esquema desde cero aplicando todas las migraciones en orden
-- (instalacion nueva, CI, `supabase db reset` local, el proyecto de
-- pruebas contabot-rls-test), la tabla simplemente NO va a existir --
-- y eso es exactamente lo esperado, no un error. Se envuelve el cambio
-- en un bloque `DO $$ ... END $$` que comprueba `to_regclass(...)` antes
-- de tocar nada: si la tabla no existe, el bloque no hace nada y la
-- migracion termina exitosamente igual; si existe (unicamente en
-- produccion), aplica el ENABLE + los REVOKE.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.backup_conciliaciones_junio2026') IS NOT NULL THEN
    -- Comandos DDL/utilitarios estaticos -- PL/pgSQL los ejecuta
    -- directamente, sin necesidad de EXECUTE (eso es solo para SQL
    -- dinamico construido como texto, que no es el caso aqui).
    ALTER TABLE public.backup_conciliaciones_junio2026 ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.backup_conciliaciones_junio2026 FROM PUBLIC;
    REVOKE ALL ON TABLE public.backup_conciliaciones_junio2026 FROM anon;
    REVOKE ALL ON TABLE public.backup_conciliaciones_junio2026 FROM authenticated;
  END IF;
END
$$;

COMMIT;

-- ROLLBACK MANUAL -- SOLO SI FUERA NECESARIO REVERTIR (no se aplica
-- automaticamente, queda documentado por si hiciera falta reabrir el
-- acceso por alguna razon operativa; no se espera usarlo):
--
-- BEGIN;
-- GRANT ALL ON TABLE public.backup_conciliaciones_junio2026 TO anon;
-- GRANT ALL ON TABLE public.backup_conciliaciones_junio2026 TO authenticated;
-- ALTER TABLE public.backup_conciliaciones_junio2026 DISABLE ROW LEVEL SECURITY;
-- COMMIT;
