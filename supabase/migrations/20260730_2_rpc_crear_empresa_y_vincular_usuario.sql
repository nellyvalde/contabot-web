-- Migration: crear_empresa_y_vincular_usuario (RPC atomica)
-- Contexto: el flujo "Agregar empresa" (components/SelectorEmpresa.tsx)
-- hacia dos INSERT separados desde el navegador (contabot_empresas y
-- luego usuarios_empresas). Se verifico que, al activar RLS con la
-- policy de SELECT restrictiva en contabot_empresas (ver la siguiente
-- migracion), el .select().single() que sigue al primer INSERT dejaria
-- de poder devolver la fila -- el vinculo en usuarios_empresas todavia
-- no existe en ese instante -- rompiendo el flujo y dejando una empresa
-- creada sin ningun usuario vinculado (estado huerfano/incompleto).
--
-- Esta funcion hace ambos INSERT en una sola transaccion real (una
-- llamada a funcion = una transaccion): si el segundo INSERT falla, el
-- primero se revierte automaticamente. Nunca puede quedar una empresa
-- huerfana por esta via.
--
-- SECURITY DEFINER + dueno con BYPASSRLS (el rol que aplique esta
-- migracion, tipicamente 'postgres' en Supabase) hace que sus consultas
-- internas no dependan de las policies de contabot_empresas ni de
-- usuarios_empresas, y que el valor de RETURN no se filtre por RLS del
-- usuario que llama -- por eso la fila recien creada siempre se puede
-- devolver a la UI, aunque el usuario todavia no tenga (fuera de esta
-- funcion) ningun vinculo visible en usuarios_empresas.
--
-- Verificado (sesion 2026-07-30): las policies de usuarios_empresas y
-- admins usan unicamente user_id = auth.uid(), sin referenciar
-- contabot_empresas -- no hay recursion de RLS posible con este diseno.
CREATE OR REPLACE FUNCTION public.crear_empresa_y_vincular_usuario(
    p_nit text,
    p_razon_social text
)
RETURNS TABLE (id uuid, nit text, razon_social text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_empresa_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No hay sesión activa.';
    END IF;

    IF p_nit IS NULL OR trim(p_nit) = '' OR p_razon_social IS NULL OR trim(p_razon_social) = '' THEN
        RAISE EXCEPTION 'NIT y razón social son obligatorios.';
    END IF;

    INSERT INTO public.contabot_empresas (nit, razon_social, aplica_exoneracion_parafiscales)
    VALUES (trim(p_nit), trim(p_razon_social), false)
    RETURNING contabot_empresas.id INTO v_empresa_id;

    INSERT INTO public.usuarios_empresas (user_id, empresa_id, rol)
    VALUES (v_user_id, v_empresa_id, 'admin');

    RETURN QUERY
        SELECT contabot_empresas.id, contabot_empresas.nit, contabot_empresas.razon_social
        FROM public.contabot_empresas
        WHERE contabot_empresas.id = v_empresa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_empresa_y_vincular_usuario(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empresa_y_vincular_usuario(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.crear_empresa_y_vincular_usuario(text, text) TO authenticated;
