-- Migration: reemplazar las politicas RLS de conciliaciones_bancarias y
-- periodos_conciliacion_bancaria (basadas en un subquery inline a
-- usuarios_empresas) por la misma funcion mis_empresas() ya usada en
-- documentos (20260811_1) y facturas (20260817_1).
--
-- Se conservan exactamente los mismos comandos que existen hoy: SELECT,
-- INSERT, DELETE en conciliaciones_bancarias; SELECT, INSERT, UPDATE en
-- periodos_conciliacion_bancaria. No se agrega politica de UPDATE a
-- conciliaciones_bancarias -- esa tabla deliberadamente no tiene una hoy.
-- periodos_conciliacion_update_por_empresa si incluye WITH CHECK ademas de
-- USING -- esa fue la definicion exacta sometida a las 65 pruebas en
-- contabot-rls-test, aunque la politica UPDATE anterior no tenia WITH CHECK
-- explicito (Postgres usaba USING como CHECK implicito por defecto).
--
-- ENABLE ROW LEVEL SECURITY se repite aqui para ambas tablas aunque
-- conciliaciones_bancarias ya lo declara en
-- 20260820_1_conciliaciones_bancarias_estructura.sql -- la repeticion es
-- deliberada: este archivo garantiza el estado requerido en produccion y
-- en reconstrucciones futuras del esquema, incluso si por algun motivo el
-- archivo de estructura no llegara a aplicarse antes que este.
--
-- Hallazgo relevante confirmado contra produccion antes de escribir esta
-- migracion: ninguna de las seis politicas actuales filtra por
-- usuarios_empresas.activo -- un miembro inactivo de la empresa conserva
-- acceso hoy. mis_empresas() si filtra WHERE activo = true, asi que esta
-- migracion tambien cierra ese hueco.
--
-- Probado exhaustivamente en contabot-rls-test (BEGIN...ROLLBACK, datos
-- 100% sinteticos, 65 casos: miembro activo CRUD completo + denegacion
-- cruzada, miembro inactivo denegado en las 2 tablas, usuario sin
-- membresia denegado, anon denegado, miembro multiempresa ve ambas propias
-- y NO ve una tercera sin membresia, upsert preserva id, comportamiento de
-- secuencia). 65/65 aprobadas, 0 fallidas, 0 residuos.

ALTER TABLE public.conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos_conciliacion_bancaria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conciliaciones_delete_por_empresa" ON public.conciliaciones_bancarias;
DROP POLICY IF EXISTS "conciliaciones_insert_por_empresa" ON public.conciliaciones_bancarias;
DROP POLICY IF EXISTS "conciliaciones_select_por_empresa" ON public.conciliaciones_bancarias;

CREATE POLICY "conciliaciones_select_por_empresa" ON public.conciliaciones_bancarias
    FOR SELECT
    USING (empresa_id IN (SELECT public.mis_empresas()));

CREATE POLICY "conciliaciones_insert_por_empresa" ON public.conciliaciones_bancarias
    FOR INSERT
    WITH CHECK (empresa_id IN (SELECT public.mis_empresas()));

CREATE POLICY "conciliaciones_delete_por_empresa" ON public.conciliaciones_bancarias
    FOR DELETE
    USING (empresa_id IN (SELECT public.mis_empresas()));

DROP POLICY IF EXISTS "periodos_conciliacion_insert_por_empresa" ON public.periodos_conciliacion_bancaria;
DROP POLICY IF EXISTS "periodos_conciliacion_select_por_empresa" ON public.periodos_conciliacion_bancaria;
DROP POLICY IF EXISTS "periodos_conciliacion_update_por_empresa" ON public.periodos_conciliacion_bancaria;

CREATE POLICY "periodos_conciliacion_select_por_empresa" ON public.periodos_conciliacion_bancaria
    FOR SELECT
    USING (empresa_id IN (SELECT public.mis_empresas()));

CREATE POLICY "periodos_conciliacion_insert_por_empresa" ON public.periodos_conciliacion_bancaria
    FOR INSERT
    WITH CHECK (empresa_id IN (SELECT public.mis_empresas()));

CREATE POLICY "periodos_conciliacion_update_por_empresa" ON public.periodos_conciliacion_bancaria
    FOR UPDATE
    USING (empresa_id IN (SELECT public.mis_empresas()))
    WITH CHECK (empresa_id IN (SELECT public.mis_empresas()));

-- ROLLBACK -- restaura exactamente las seis politicas anteriores, texto
-- literal confirmado byte a byte contra produccion (regexp_replace + '='
-- sobre pg_policies.qual/with_check, no transcripcion manual). No
-- desactiva RLS -- ya estaba activo en produccion antes de esta migracion
-- en conciliaciones_bancarias; para periodos_conciliacion_bancaria no
-- estaba versionado pero tampoco se desactiva, por la misma razon que en
-- el archivo de estructura: revertir RLS activo dejaria produccion en un
-- estado peor que el original si en algun momento se activo fuera de este
-- repo.

-- DROP POLICY IF EXISTS "conciliaciones_delete_por_empresa" ON public.conciliaciones_bancarias;
-- DROP POLICY IF EXISTS "conciliaciones_insert_por_empresa" ON public.conciliaciones_bancarias;
-- DROP POLICY IF EXISTS "conciliaciones_select_por_empresa" ON public.conciliaciones_bancarias;
--
-- CREATE POLICY "conciliaciones_select_por_empresa" ON public.conciliaciones_bancarias
--     FOR SELECT
--     USING (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
--
-- CREATE POLICY "conciliaciones_insert_por_empresa" ON public.conciliaciones_bancarias
--     FOR INSERT
--     WITH CHECK (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
--
-- CREATE POLICY "conciliaciones_delete_por_empresa" ON public.conciliaciones_bancarias
--     FOR DELETE
--     USING (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
--
-- DROP POLICY IF EXISTS "periodos_conciliacion_insert_por_empresa" ON public.periodos_conciliacion_bancaria;
-- DROP POLICY IF EXISTS "periodos_conciliacion_select_por_empresa" ON public.periodos_conciliacion_bancaria;
-- DROP POLICY IF EXISTS "periodos_conciliacion_update_por_empresa" ON public.periodos_conciliacion_bancaria;
--
-- CREATE POLICY "periodos_conciliacion_select_por_empresa" ON public.periodos_conciliacion_bancaria
--     FOR SELECT
--     USING (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
--
-- CREATE POLICY "periodos_conciliacion_insert_por_empresa" ON public.periodos_conciliacion_bancaria
--     FOR INSERT
--     WITH CHECK (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
--
-- CREATE POLICY "periodos_conciliacion_update_por_empresa" ON public.periodos_conciliacion_bancaria
--     FOR UPDATE
--     USING (empresa_id IN ( SELECT usuarios_empresas.empresa_id
--       FROM usuarios_empresas
--       WHERE (usuarios_empresas.user_id = auth.uid())));
