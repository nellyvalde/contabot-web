-- =====================================================================
-- NO EJECUTADO. Pruebas pgTAP para las 3 migraciones de seguridad:
--   20260730_1_rls_docs_por_clasificar_nombres_alternos.sql
--   20260730_2_rpc_crear_empresa_y_vincular_usuario.sql
--   20260730_3_rls_contabot_empresas.sql
--
-- Cómo correrlas (SOLO contra una base de PRUEBA/local, nunca contra el
-- proyecto real):
--   1. Requiere las 3 migraciones ya aplicadas y la extensión pgtap
--      habilitada (`create extension if not exists pgtap;`).
--   2. `supabase test db` (Supabase CLI local), o
--      `psql -f este_archivo` contra una base de prueba con pgtap.
--
-- Todo corre dentro de una transacción con ROLLBACK al final: no deja
-- ningún rastro en la base donde se ejecute, sin importar el resultado.
--
-- Este archivo es una plantilla razonada, escrita para revisión humana
-- antes de ejecutarse — no fue corrida contra una base real en esta
-- sesión (no hay credenciales de base de datos disponibles aquí), así
-- que confirma la sintaxis exacta de pgtap/auth.uid() de tu entorno
-- antes de usarla como base de un pipeline de CI.
-- =====================================================================

begin;
select plan(13);

-- --- Datos de prueba (dentro de la transacción, se revierten al final) ---
insert into public.contabot_empresas (id, nit, razon_social, correo) values
  ('11111111-1111-1111-1111-111111111111', '900000001', 'EMPRESA A DE PRUEBA', 'a@prueba.test'),
  ('22222222-2222-2222-2222-222222222222', '900000002', 'EMPRESA B DE PRUEBA', 'b@prueba.test');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usuario_a@prueba.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'usuario_b@prueba.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin@prueba.test')
on conflict (id) do nothing;

insert into public.usuarios_empresas (user_id, empresa_id, rol) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'admin');

insert into public.admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- ---------------------------------------------------------------------
-- 1) Usuario SIN sesión (anon): no puede leer contabot_empresas
-- ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.contabot_empresas),
  0,
  'anon no debe ver ninguna fila de contabot_empresas'
);

-- ---------------------------------------------------------------------
-- 1b) Usuario SIN sesión (anon): docs_por_clasificar y nombres_alternos
--     quedan totalmente cerradas (ENABLE RLS sin ninguna policy) desde
--     que se quitó la policy "por empresa" de nombres_alternos -- hoy
--     ningún flujo de navegador las necesita, así que se deniega todo.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.docs_por_clasificar),
  0,
  'anon no debe ver ninguna fila de docs_por_clasificar (sin policy)'
);

select is(
  (select count(*)::int from public.nombres_alternos),
  0,
  'anon no debe ver ninguna fila de nombres_alternos (sin policy)'
);

-- ---------------------------------------------------------------------
-- 2) Usuario SIN sesión (anon): la RPC rechaza sin auth.uid()
-- ---------------------------------------------------------------------
select throws_ok(
  $$ select public.crear_empresa_y_vincular_usuario('900099999', 'EMPRESA SIN SESION') $$,
  'No hay sesión activa.',
  'la RPC debe rechazar cuando no hay usuario autenticado'
);

-- ---------------------------------------------------------------------
-- 3) Usuario autenticado (Usuario A) creando una empresa nueva por RPC
--    -> "empresa y vínculo creados juntos"
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.crear_empresa_y_vincular_usuario('900012345', 'EMPRESA NUEVA DE A') $$,
  'un usuario autenticado puede crear una empresa vía RPC'
);

select is(
  (select count(*)::int from public.usuarios_empresas
     where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and empresa_id = (select id from public.contabot_empresas where nit = '900012345')),
  1,
  'la empresa nueva y el vínculo en usuarios_empresas deben existir juntos, en una sola operación'
);

-- ---------------------------------------------------------------------
-- 3b) Usuario A AUTENTICADO (con empresa propia y membresía real) sigue
--     sin poder leer docs_por_clasificar ni nombres_alternos -- el
--     cierre es total, no depende de si el usuario tiene o no una
--     empresa vinculada, porque no existe ninguna policy que lo permita.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.docs_por_clasificar),
  0,
  'usuario autenticado (con empresa propia) tampoco debe ver docs_por_clasificar'
);

select is(
  (select count(*)::int from public.nombres_alternos),
  0,
  'usuario autenticado (con empresa propia) tampoco debe ver nombres_alternos'
);

-- ---------------------------------------------------------------------
-- 4) Fallo de validación de la RPC no debe dejar empresa huérfana
-- ---------------------------------------------------------------------
select throws_ok(
  $$ select public.crear_empresa_y_vincular_usuario('', '') $$,
  'NIT y razón social son obligatorios.',
  'la RPC debe rechazar datos vacíos antes de insertar nada'
);

select is(
  (select count(*)::int from public.contabot_empresas where nit = ''),
  0,
  'un fallo de validación no debe dejar ninguna fila en contabot_empresas'
);

-- ---------------------------------------------------------------------
-- 5) Usuario de Empresa A no debe ver Empresa B (pero sí la suya)
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.contabot_empresas where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'usuario de Empresa A no debe poder leer la fila de Empresa B'
);

select is(
  (select count(*)::int from public.contabot_empresas where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'usuario de Empresa A sí debe ver su propia empresa'
);

-- ---------------------------------------------------------------------
-- 6) Administrador (tabla admins) ve todas las empresas
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'role', 'authenticated')::text,
  true
);

select cmp_ok(
  (select count(*)::int from public.contabot_empresas),
  '>=',
  2,
  'un administrador debe ver todas las empresas, no solo la suya'
);

select * from finish();
rollback;
