-- Migration: versionar mis_empresas() y la politica docs_solo_mis_empresas de
-- documentos, que existian en produccion pero nunca se habian versionado en
-- este repo. Sin esto, reconstruir el esquema desde las migraciones no
-- reproduciria correctamente el aislamiento por empresa de esta tabla.
--
-- Esta funcion se reproduce EXACTAMENTE como existe hoy en produccion
-- (confirmado por hash MD5 identico entre produccion y el proyecto de
-- pruebas). No se modifica su comportamiento ni se le agrega search_path ni
-- se tocan sus permisos -- el endurecimiento (SET search_path, REVOKE de
-- PUBLIC/anon) queda deliberadamente fuera de esta migracion.
CREATE OR REPLACE FUNCTION public.mis_empresas()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  select empresa_id
  from usuarios_empresas
  where user_id = auth.uid()
  and activo = true
$function$;

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_solo_mis_empresas" ON public.documentos;
CREATE POLICY "docs_solo_mis_empresas" ON public.documentos
    FOR ALL
    USING (empresa_id IN (SELECT mis_empresas()))
    WITH CHECK (empresa_id IN (SELECT mis_empresas()));

-- ROLLBACK -- SIN ACCION NECESARIA.
-- La funcion mis_empresas(), RLS activo y la politica docs_solo_mis_empresas
-- ya existian en produccion con esta misma definicion ANTES de esta
-- migracion. Revertir (ej. DROP POLICY) dejaria produccion en un estado
-- peor que el original, no en el estado original. Si alguna vez se necesita
-- confirmar que nada cambio, usar esta consulta de verificacion:
--
-- select relrowsecurity from pg_class
-- where relname = 'documentos' and relnamespace = (select oid from pg_namespace where nspname = 'public');
--
-- select policyname, cmd, roles, qual as usando, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'documentos';
