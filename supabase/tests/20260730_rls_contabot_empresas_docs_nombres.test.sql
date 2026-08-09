-- =====================================================================
-- NO EJECUTADO. Pruebas pgTAP para las 3 migraciones de seguridad:
--   20260730_1_rls_docs_por_clasificar_nombres_alternos.sql
--   20260730_2_rpc_crear_empresa_y_vincular_usuario.sql
--   20260730_3_rls_contabot_empresas.sql
--
-- NOTA sobre esta version: el SQL Editor de Supabase solo muestra el
-- resultado de la ULTIMA sentencia cuando se corren varias juntas. Un
-- intento anterior de guardar los resultados en una tabla temporal dio
-- "relation does not exist" en sentencias posteriores (posible cuestion
-- de como Supabase enruta las conexiones). En su lugar, cada resultado
-- se guarda con set_config() -- la misma función que ya usa este mismo
-- archivo para request.jwt.claims, y que sí persiste de forma
-- confiable entre sentencias y cambios de rol dentro de la misma
-- transacción. Es solo un cambio de presentación, ninguna aserción
-- cambió de lógica.
-- =====================================================================

begin;

select set_config('resultados.plan', plan(14)::text, true);

insert into public.contabot_empresas (id, nit, razon_social, correo) values
  ('11111111-1111-1111-1111-111111111111', '999900001', 'EMPRESA A DE PRUEBA', 'a@prueba.test'),
  ('22222222-2222-2222-2222-222222222222', '900000002', 'EMPRESA B DE PRUEBA', 'b@prueba.test'),
  ('44444444-4444-4444-4444-444444444444', '999900004', 'EMPRESA D INACTIVA', 'd@prueba.test');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usuario_a@prueba.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'usuario_b@prueba.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin@prueba.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'usuario_d@prueba.test')
on conflict (id) do nothing;

insert into public.usuarios_empresas (user_id, empresa_id, rol, activo) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'admin', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'admin', false);

insert into public.admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');

set local role anon;
select set_config('request.jwt.claims', '', true);

select set_config('resultados.t01', (select is(
  (select count(*)::int from public.contabot_empresas),
  0,
  'anon no debe ver ninguna fila de contabot_empresas'
))::text, true);

select set_config('resultados.t02', (select is(
  (select count(*)::int from public.docs_por_clasificar),
  0,
  'anon no debe ver ninguna fila de docs_por_clasificar (política real: auth.uid()=user_id, nunca coincide con anon)'
))::text, true);

select set_config('resultados.t03', (select is(
  (select count(*)::int from public.nombres_alternos),
  0,
  'anon no debe ver ninguna fila de nombres_alternos (política real por empresa, ninguna fila de prueba insertada aquí)'
))::text, true);

select set_config('resultados.t04', (select throws_ok(
  $$ select public.crear_empresa_y_vincular_usuario('900099999', 'EMPRESA SIN SESION') $$,
  '42501'::character(5),
  NULL,
  'la RPC debe rechazar a anon con SQLSTATE 42501 (permission denied) por falta de EXECUTE'
))::text, true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t05', (select lives_ok(
  $$ select public.crear_empresa_y_vincular_usuario('999912345', 'EMPRESA NUEVA DE A') $$,
  'un usuario autenticado puede crear una empresa vía RPC'
))::text, true);

select set_config('resultados.t06', (select is(
  (select count(*)::int from public.usuarios_empresas
     where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and empresa_id = (select id from public.contabot_empresas where nit = '999912345')),
  1,
  'la empresa nueva y el vínculo en usuarios_empresas deben existir juntos, en una sola operación'
))::text, true);

select set_config('resultados.t07', (select is(
  (select count(*)::int from public.docs_por_clasificar),
  0,
  'usuario autenticado (con empresa propia) no ve docs_por_clasificar porque no hay ninguna fila con su user_id'
))::text, true);

select set_config('resultados.t08', (select is(
  (select count(*)::int from public.nombres_alternos),
  0,
  'usuario autenticado (con empresa propia) no ve nombres_alternos porque no se insertó ninguna fila de prueba ahí'
))::text, true);

select set_config('resultados.t09', (select throws_ok(
  $$ select public.crear_empresa_y_vincular_usuario('', '') $$,
  'NIT y razón social son obligatorios.',
  'la RPC debe rechazar datos vacíos antes de insertar nada'
))::text, true);

select set_config('resultados.t10', (select is(
  (select count(*)::int from public.contabot_empresas where nit = ''),
  0,
  'un fallo de validación no debe dejar ninguna fila en contabot_empresas'
))::text, true);

select set_config('resultados.t11', (select is(
  (select count(*)::int from public.contabot_empresas where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'usuario de Empresa A no debe poder leer la fila de Empresa B'
))::text, true);

select set_config('resultados.t12', (select is(
  (select count(*)::int from public.contabot_empresas where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'usuario de Empresa A sí debe ver su propia empresa'
))::text, true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t13', (select cmp_ok(
  (select count(*)::int from public.contabot_empresas),
  '>=',
  2,
  'un administrador debe ver todas las empresas, no solo la suya'
))::text, true);

-- ---------------------------------------------------------------------
-- 7) Usuario D, con membresía INACTIVA (activo = false) en Empresa D:
--    no debe verla, aunque el vínculo exista en usuarios_empresas.
--    Esto prueba que la política respeta activo=true, no solo la
--    existencia del vínculo.
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t14', (select is(
  (select count(*)::int from public.contabot_empresas where id = '44444444-4444-4444-4444-444444444444'),
  0,
  'usuario con membresía inactiva (activo=false) no debe ver esa empresa'
))::text, true);

reset role;
select set_config('resultados.finish', (select string_agg(x, E'\n') from finish() as x), true);

select current_setting('resultados.plan') as resultado
union all select current_setting('resultados.t01')
union all select current_setting('resultados.t02')
union all select current_setting('resultados.t03')
union all select current_setting('resultados.t04')
union all select current_setting('resultados.t05')
union all select current_setting('resultados.t06')
union all select current_setting('resultados.t07')
union all select current_setting('resultados.t08')
union all select current_setting('resultados.t09')
union all select current_setting('resultados.t10')
union all select current_setting('resultados.t11')
union all select current_setting('resultados.t12')
union all select current_setting('resultados.t13')
union all select current_setting('resultados.t14')
union all select current_setting('resultados.finish');

rollback;
