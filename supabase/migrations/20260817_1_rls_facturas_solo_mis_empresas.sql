-- Migration: aislar facturas por empresa (RLS), reemplazando la politica
-- original basada en user_id individual por una basada en membresia
-- activa de empresa, usando la misma funcion mis_empresas() ya versionada
-- para documentos (20260811_1_mis_empresas_y_politica_documentos.sql).
--
-- Contexto: la politica original ("Users can manage their own facturas",
-- USING auth.uid() = user_id) no es compatible con el modelo multiempresa
-- -- dos personas de la misma empresa no se veian las facturas entre si.
-- Verificado contra produccion: 55 facturas totales, 48 cuyo creador
-- conserva membresia activa en la empresa de la factura, 7 cuyo creador no
-- tiene ningun vinculo (ni activo ni inactivo) con esa empresa -- sin
-- archivo adjunto ni numero de factura, capturadas en una sola rafaga del
-- 1 al 4 de junio de 2026, posible dato de prueba.
--
-- Importante: bajo la politica nueva la visibilidad de cada factura depende
-- de si el USUARIO QUE CONSULTA tiene membresia activa en empresa_id, no de
-- quien la creo -- asi que esas 7 podrian seguir siendo visibles para otro
-- miembro activo de esa misma empresa, si lo hay (no verificado todavia).
-- Se descarto deliberadamente una excepcion OR auth.uid()=user_id:
-- debilitaria el aislamiento para cualquier caso futuro de membresia
-- revocada.
--
-- Probado exhaustivamente en contabot-rls-test (BEGIN...ROLLBACK, datos
-- 100% sinteticos): miembro activo (ve y modifica), miembro inactivo (no
-- ve), usuario de otra empresa (no ve), anon (no ve), insercion con
-- empresa ajena (rechazada por WITH CHECK), factura huerfana (invisible
-- incluso para su propio user_id) -- los 6 casos aprobados.

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own facturas" ON public.facturas;
DROP POLICY IF EXISTS "facturas_solo_mis_empresas" ON public.facturas;

CREATE POLICY "facturas_solo_mis_empresas" ON public.facturas
    FOR ALL
    USING (empresa_id IN (SELECT public.mis_empresas()))
    WITH CHECK (empresa_id IN (SELECT public.mis_empresas()));
