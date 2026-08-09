-- Migration: Enable RLS on contabot_empresas with a SELECT-only policy.
-- Contexto: contabot_empresas resulto legible sin autenticacion (anon
-- key) en una auditoria de seguridad (2026-07-30) -- cualquiera podia
-- listar todas las empresas registradas (NIT, razon social, correo) sin
-- iniciar sesion. Se cierra con RLS.
--
-- Revision 2026-08-06: se descubrio que contabot_empresas ya tenia una
-- policy de SELECT en produccion ("empresas_solo_las_mias", nunca
-- versionada en este repo), que usaba una funcion mis_empresas() y
-- respetaba una bandera activo=true en usuarios_empresas -- algo que la
-- version anterior de esta migracion no verificaba. Esta version
-- reemplaza esa policy explicitamente (DROP IF EXISTS + CREATE) por una
-- unica policy autocontenida que conserva la verificacion de
-- activo=true, agrega la rama de administrador, y no depende de ninguna
-- funcion externa ni de que otra migracion se haya aplicado antes.
--
-- No se agrega ninguna policy de INSERT/UPDATE/DELETE para
-- authenticated/anon a proposito: toda alta de empresa debe pasar por
-- la funcion crear_empresa_y_vincular_usuario() (migracion anterior,
-- SECURITY DEFINER, no depende de estas policies) o por
-- /api/crear-empresa (usa Service Role Key, que ignora RLS). Sin
-- policy de escritura, Postgres deniega el INSERT directo desde el
-- navegador por defecto -- cierra la superficie de abuso de creacion
-- arbitraria de empresas fuera del flujo controlado.
--
-- Verificado (sesion 2026-07-30): las policies de usuarios_empresas y
-- admins usan unicamente user_id = auth.uid(), sin referenciar
-- contabot_empresas -- no hay recursion posible con la policy de abajo.
ALTER TABLE public.contabot_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresas_solo_las_mias" ON public.contabot_empresas;
DROP POLICY IF EXISTS "select_miembro_o_admin" ON public.contabot_empresas;

CREATE POLICY "select_miembro_o_admin" ON public.contabot_empresas
    FOR SELECT
    USING (
        id IN (
            SELECT empresa_id FROM public.usuarios_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
        OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
    );

-- IMPORTANTE -- orden de despliegue:
-- Esta migracion debe aplicarse en el MISMO despliegue que el cambio de
-- components/SelectorEmpresa.tsx (uso de la RPC crear_empresa_y_vincular_usuario
-- en vez de dos INSERT directos). Si esta policy se activa sin haber
-- desplegado antes ese cambio de codigo, el flujo "Agregar empresa" con
-- el codigo viejo (INSERT directo a contabot_empresas) empezara a fallar
-- de inmediato para cualquier usuario, porque ya no habria ninguna
-- policy de INSERT que lo permita.
