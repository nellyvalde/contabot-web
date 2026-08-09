-- Migration: Enable RLS on docs_por_clasificar and nombres_alternos.
-- Revision 2026-08-06: se descubrio que ambas tablas ya tenian politicas
-- creadas directamente en produccion, nunca versionadas en este repo.
-- Esta migracion las captura explicitamente (DROP IF EXISTS + CREATE)
-- para que el resultado sea determinista sin importar el estado previo
-- de la base -- ya no depende de que esas politicas "ya esten ahi".
--
-- Impacto: ninguno sobre el intake de correo (app/api/procesar-email),
-- que usa Service Role Key y bypassa RLS por completo. El unico cambio
-- real es que anon deja de poder leer estas tablas directamente.

ALTER TABLE public.docs_por_clasificar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso_docs_por_clasificar_propio_usuario" ON public.docs_por_clasificar;
CREATE POLICY "acceso_docs_por_clasificar_propio_usuario" ON public.docs_por_clasificar
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.nombres_alternos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso_alternos_por_empresa_select" ON public.nombres_alternos;
CREATE POLICY "acceso_alternos_por_empresa_select" ON public.nombres_alternos
    FOR SELECT
    USING (
        empresa_id IN (
            SELECT usuarios_empresas.empresa_id FROM usuarios_empresas
            WHERE usuarios_empresas.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "acceso_alternos_por_empresa_insert" ON public.nombres_alternos;
CREATE POLICY "acceso_alternos_por_empresa_insert" ON public.nombres_alternos
    FOR INSERT
    WITH CHECK (
        empresa_id IN (
            SELECT usuarios_empresas.empresa_id FROM usuarios_empresas
            WHERE usuarios_empresas.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "acceso_alternos_por_empresa_update" ON public.nombres_alternos;
CREATE POLICY "acceso_alternos_por_empresa_update" ON public.nombres_alternos
    FOR UPDATE
    USING (
        empresa_id IN (
            SELECT usuarios_empresas.empresa_id FROM usuarios_empresas
            WHERE usuarios_empresas.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "acceso_alternos_por_empresa_delete" ON public.nombres_alternos;
CREATE POLICY "acceso_alternos_por_empresa_delete" ON public.nombres_alternos
    FOR DELETE
    USING (
        empresa_id IN (
            SELECT usuarios_empresas.empresa_id FROM usuarios_empresas
            WHERE usuarios_empresas.user_id = auth.uid()
        )
    );
