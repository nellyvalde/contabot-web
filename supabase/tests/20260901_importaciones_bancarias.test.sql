-- =====================================================================
-- NO EJECUTADO EN PRODUCCION. Pruebas pgTAP para PR 9b:
--   20260901_3_importaciones_bancarias.sql
--
-- SOLO PARA ENTORNO DE PRUEBAS. Nunca correr este archivo contra
-- produccion -- inserta filas sinteticas (aunque todo dentro de
-- begin;...rollback;, sin dejar nada persistido) y llama la RPC real. En
-- produccion solo se usan el pre-flight y el post-flight de solo lectura
-- que acompanan a la migracion, nunca este archivo.
--
-- PRERREQUISITO -- verificar ANTES de correr el resto de este archivo,
-- en su propia consulta separada, en el proyecto de PRUEBAS (nunca
-- produccion):
--
--   select extname, extversion from pg_extension where extname = 'pgtap';
--
-- Si no devuelve ninguna fila, pgTAP no esta instalado en ese proyecto y
-- hay que instalarlo primero (create extension pgtap;) -- no asumir que
-- existe solo porque el archivo de pruebas anterior
-- (20260730_rls_contabot_empresas_docs_nombres.test.sql) lo uso con
-- exito alguna vez; el estado de las extensiones puede haber cambiado
-- entre entornos o desde entonces.
--
-- Todo corre dentro de begin;...rollback; -- ninguna fila de prueba queda
-- persistida, consistente con "no agregar todavia filas reales" (PR 9b) y
-- con "no insertar ni modificar conciliaciones_bancarias" (las 2 filas
-- sinteticas insertadas alli mas abajo, necesarias solo para satisfacer la
-- FK de importacion_filas_candidatos, se eliminan explicitamente ANTES de
-- comparar contra el baseline -- ver seccion final -- y ademas quedan
-- deshechas de todas formas por el rollback).
-- =====================================================================

begin;

select set_config('resultados.plan', plan(47)::text, true);

-- Baseline: conciliaciones_bancarias no debe quedar con un conteo distinto
-- al final de este archivo (punto 8 de la revision).
select set_config('vars.baseline_conciliaciones',
  (select count(*)::text from public.conciliaciones_bancarias), true);

-- ---------------------------------------------------------------------
-- Fixtures base (empresas, usuarios, cuentas).
-- ---------------------------------------------------------------------
insert into public.contabot_empresas (id, nit, razon_social, correo) values
  ('11111111-1111-1111-1111-111111111111', '999900201', 'EMPRESA A 9B', 'a9b2@prueba.test'),
  ('22222222-2222-2222-2222-222222222222', '999900202', 'EMPRESA B 9B', 'b9b2@prueba.test');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usuario_a_9b2@prueba.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'usuario_b_9b2@prueba.test')
on conflict (id) do nothing;

insert into public.usuarios_empresas (user_id, empresa_id, rol, activo) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'admin', true);

insert into public.cuentas_bancarias (id, empresa_id, banco, es_legacy, activa) values
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'bancolombia', false, true),
  ('c1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'davivienda', false, true),
  ('c2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'bancolombia', false, true);

-- ---------------------------------------------------------------------
-- Fixtures no vacuos para las pruebas de RLS (punto 6 de la revision):
-- una importacion + una fila + una conciliacion + un candidato por cada
-- empresa, insertados como postgres (bypass RLS por ser el dueno de las
-- tablas) ANTES de que anon/authenticated consulten nada.
-- ---------------------------------------------------------------------
insert into public.importaciones_bancarias (
  id, empresa_id, cuenta_id, usuario_id, nombre_archivo, tamano_bytes, hash_archivo, estado
) values
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'fixture_rls_a.pdf', 1000, repeat('1', 64), 'procesando'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'fixture_rls_b.pdf', 1000, repeat('2', 64), 'procesando');

insert into public.importacion_filas (
  id, importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
  movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
) values
  ('e1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 1,
   current_date, 100.00, 'PAGO FIXTURE A', 'PAGO FIXTURE A', 'pendiente_procesamiento'),
  ('e2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 1,
   current_date, 200.00, 'PAGO FIXTURE B', 'PAGO FIXTURE B', 'pendiente_procesamiento');

insert into public.conciliaciones_bancarias (
  id, user_id, banco, movimiento_fecha, movimiento_descripcion, movimiento_valor, empresa_id, cuenta_id
) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bancolombia',
   to_char(current_date, 'YYYY/MM/DD'), 'CONCILIACION FIXTURE A', 100.00,
   '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111'),
  ('f2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bancolombia',
   to_char(current_date, 'YYYY/MM/DD'), 'CONCILIACION FIXTURE B', 200.00,
   '22222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222');

insert into public.importacion_filas_candidatos (
  id, importacion_fila_id, empresa_id, conciliacion_id
) values
  ('91111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111'),
  ('92222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222');

-- ---------------------------------------------------------------------
-- Bloque anon (punto 7 de la revision: permisos; y RLS ya NO vacua,
-- punto 6 -- ahora hay 2 filas reales en cada tabla y anon debe seguir
-- viendo 0).
-- ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select set_config('resultados.t01', (select is(
  (select count(*)::int from public.importaciones_bancarias),
  0,
  'anon no debe ver ninguna fila de importaciones_bancarias (existiendo 2 filas reales)'
))::text, true);

select set_config('resultados.t02', (select is(
  (select count(*)::int from public.importacion_filas),
  0,
  'anon no debe ver ninguna fila de importacion_filas (existiendo 2 filas reales)'
))::text, true);

select set_config('resultados.t03', (select is(
  (select count(*)::int from public.importacion_filas_candidatos),
  0,
  'anon no debe ver ninguna fila de importacion_filas_candidatos (existiendo 2 filas reales)'
))::text, true);

select set_config('resultados.t04', (select throws_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'archivo.pdf', 1000
     ) $$,
  '42501'::character(5),
  NULL,
  'anon debe ser rechazado con 42501 por falta de EXECUTE'
))::text, true);

-- ---------------------------------------------------------------------
-- Bloque authenticated (usuario A, empresa A) -- escenarios de la RPC.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

-- Escenario 1 (hash_x): creacion + bloqueo procesando + bloqueo completada.
select set_config('resultados.t05', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'extracto_enero.pdf', 1000
     ) $$,
  'primera llamada crea la importacion sin lanzar excepcion'
))::text, true);

select set_config('resultados.t06', (select is(
  (select estado from public.importaciones_bancarias
     where empresa_id = '11111111-1111-1111-1111-111111111111'
       and cuenta_id = 'c1111111-1111-1111-1111-111111111111'
       and hash_archivo = repeat('a',64)),
  'procesando',
  'la importacion creada queda en estado procesando'
))::text, true);

select set_config('resultados.t07', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'extracto_enero.pdf', 1000
   ) ->> 'codigo'),
  'importacion_en_curso',
  'una segunda llamada con el mismo hash mientras esta procesando (vigente) se rechaza'
))::text, true);

reset role;
update public.importaciones_bancarias set estado = 'completada'
  where empresa_id = '11111111-1111-1111-1111-111111111111'
    and cuenta_id = 'c1111111-1111-1111-1111-111111111111'
    and hash_archivo = repeat('a',64);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t08', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'extracto_enero.pdf', 1000
   ) ->> 'codigo'),
  'ya_importado',
  'una importacion completada bloquea permanentemente el mismo hash'
))::text, true);

-- Escenario 2 (hash_y): reintento tras fallida.
select set_config('resultados.t09', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('b',64), 'extracto_febrero.pdf', 1000
     ) $$,
  'crea la importacion del escenario de reintento tras fallida'
))::text, true);

reset role;
update public.importaciones_bancarias set estado = 'fallida', actualizado_en = now()
  where empresa_id = '11111111-1111-1111-1111-111111111111'
    and cuenta_id = 'c1111111-1111-1111-1111-111111111111'
    and hash_archivo = repeat('b',64);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t10', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('b',64), 'extracto_febrero.pdf', 1000
     ) $$,
  'una importacion fallida SI permite reintentar el mismo hash'
))::text, true);

select set_config('resultados.t11', (select is(
  (select count(*)::int from public.importaciones_bancarias
     where empresa_id = '11111111-1111-1111-1111-111111111111'
       and hash_archivo = repeat('b',64) and estado = 'fallida'),
  1,
  'la fila fallida original se conserva integra tras el reintento (auditoria)'
))::text, true);

-- Escenario 3 (hash_z): reintento tras revertida.
select set_config('resultados.t12', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('c',64), 'extracto_marzo.pdf', 1000
     ) $$,
  'crea la importacion del escenario de reintento tras revertida'
))::text, true);

reset role;
update public.importaciones_bancarias
  set estado = 'revertida', revertida_en = now(), revertida_por = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  where empresa_id = '11111111-1111-1111-1111-111111111111'
    and cuenta_id = 'c1111111-1111-1111-1111-111111111111'
    and hash_archivo = repeat('c',64);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t13', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('c',64), 'extracto_marzo.pdf', 1000
     ) $$,
  'una importacion revertida SI permite reintentar el mismo hash'
))::text, true);

-- Escenario 4 (hash_w): recuperacion de procesando abandonada (>15 min).
reset role;
insert into public.importaciones_bancarias (
  empresa_id, cuenta_id, usuario_id, nombre_archivo, tamano_bytes,
  hash_archivo, estado, subido_en, actualizado_en
) values (
  '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extracto_abandonado.pdf', 1000,
  repeat('d',64), 'procesando', now() - interval '20 minutes', now() - interval '20 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t14', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('d',64), 'extracto_abandonado.pdf', 1000
     ) $$,
  'una importacion procesando abandonada (>15 min) permite reintentar'
))::text, true);

select set_config('resultados.t15', (select is(
  (select count(*)::int from public.importaciones_bancarias
     where empresa_id = '11111111-1111-1111-1111-111111111111'
       and hash_archivo = repeat('d',64) and estado = 'fallida'),
  1,
  'la fila abandonada se marca automaticamente fallida al recuperarse'
))::text, true);

select set_config('resultados.t16', (select is(
  (select count(*)::int from public.importaciones_bancarias
     where empresa_id = '11111111-1111-1111-1111-111111111111'
       and hash_archivo = repeat('d',64) and estado = 'procesando'),
  1,
  'existe exactamente una nueva fila procesando tras la recuperacion'
))::text, true);

-- Escenario 5 (hash_v): simulacion verificable del 23505 (concurrencia).
select set_config('resultados.t17', (select lives_ok(
  $$ select public.iniciar_o_reintentar_importacion(
       'c1111111-1111-1111-1111-111111111111'::uuid, repeat('e',64), 'extracto_concurrencia.pdf', 1000
     ) $$,
  'crea la importacion del escenario de concurrencia'
))::text, true);

reset role;
select set_config('resultados.t18', (select throws_ok(
  $$ insert into public.importaciones_bancarias (
       empresa_id, cuenta_id, usuario_id, nombre_archivo, tamano_bytes, hash_archivo, estado
     ) values (
       '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'otro_nombre.pdf', 2000,
       repeat('e',64), 'procesando'
     ) $$,
  '23505'::character(5),
  NULL,
  'el indice parcial rechaza un segundo procesando/completada activo con el mismo hash, incluso sin pasar por la RPC -- esto es lo que el EXCEPTION de la RPC captura ante una carrera real'
))::text, true);

-- ---------------------------------------------------------------------
-- Validaciones de entrada.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t19', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, 'hash-no-hexadecimal', 'archivo.pdf', 1000
   ) ->> 'codigo'),
  'hash_invalido',
  'un hash con formato invalido se rechaza antes de tocar ninguna tabla'
))::text, true);

select set_config('resultados.t20', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'archivo.pdf', 0
   ) ->> 'codigo'),
  'tamano_invalido',
  'un tamano de 0 bytes se rechaza'
))::text, true);

select set_config('resultados.t21', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), 'archivo.pdf', 10485761
   ) ->> 'codigo'),
  'tamano_invalido',
  'un tamano mayor a 10 MB se rechaza'
))::text, true);

select set_config('resultados.t22', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), '', 1000
   ) ->> 'codigo'),
  'nombre_invalido',
  'un nombre de archivo vacio se rechaza'
))::text, true);

select set_config('resultados.t23', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c1111111-1111-1111-1111-111111111111'::uuid, repeat('a',64), repeat('n', 256), 1000
   ) ->> 'codigo'),
  'nombre_demasiado_largo',
  'un nombre de archivo de 256 caracteres se rechaza antes del INSERT'
))::text, true);

-- ---------------------------------------------------------------------
-- Cuenta de otra empresa.
-- ---------------------------------------------------------------------
select set_config('resultados.t24', (select is(
  (select public.iniciar_o_reintentar_importacion(
     'c2222222-2222-2222-2222-222222222222'::uuid, repeat('f',64), 'archivo.pdf', 1000
   ) ->> 'codigo'),
  'cuenta_no_encontrada_o_sin_permiso',
  'usuario A no puede iniciar una importacion sobre una cuenta de la empresa B'
))::text, true);

-- ---------------------------------------------------------------------
-- RLS entre dos empresas -- sobre datos NO vacuos (los fixtures d1/d2,
-- e1/e2, g1/g2 insertados al inicio), en las 3 tablas.
-- ---------------------------------------------------------------------
select set_config('resultados.t25', (select is(
  (select count(*)::int from public.importaciones_bancarias where empresa_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'usuario A no debe ver ninguna importacion de la empresa B'
))::text, true);

select set_config('resultados.t26', (select is(
  (select count(*)::int from public.importacion_filas where empresa_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'usuario A no debe ver ninguna fila de importacion de la empresa B'
))::text, true);

select set_config('resultados.t27', (select is(
  (select count(*)::int from public.importacion_filas_candidatos where empresa_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'usuario A no debe ver ningun candidato de la empresa B'
))::text, true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text,
  true
);

select set_config('resultados.t28', (select is(
  (select count(*)::int from public.importaciones_bancarias where empresa_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'usuario B no debe ver ninguna importacion de la empresa A'
))::text, true);

select set_config('resultados.t29', (select is(
  (select count(*)::int from public.importacion_filas where empresa_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'usuario B no debe ver ninguna fila de importacion de la empresa A'
))::text, true);

select set_config('resultados.t30', (select is(
  (select count(*)::int from public.importacion_filas_candidatos where empresa_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'usuario B no debe ver ningun candidato de la empresa A'
))::text, true);

select set_config('resultados.t31', (select cmp_ok(
  (select count(*)::int from public.importaciones_bancarias where empresa_id = '22222222-2222-2222-2222-222222222222'),
  '>=', 1,
  'usuario B si debe ver la importacion de su propia empresa'
))::text, true);

select set_config('resultados.t32', (select cmp_ok(
  (select count(*)::int from public.importacion_filas where empresa_id = '22222222-2222-2222-2222-222222222222'),
  '>=', 1,
  'usuario B si debe ver la fila de importacion de su propia empresa'
))::text, true);

select set_config('resultados.t33', (select cmp_ok(
  (select count(*)::int from public.importacion_filas_candidatos where empresa_id = '22222222-2222-2222-2222-222222222222'),
  '>=', 1,
  'usuario B si debe ver el candidato de su propia empresa'
))::text, true);

-- ---------------------------------------------------------------------
-- Integridad estructural (probada directamente, sin RPC -- nada en 9b
-- escribe todavia en importacion_filas, asi que es la unica forma de
-- ejercitar estas constraints antes de 9c).
-- ---------------------------------------------------------------------
reset role;

select set_config('resultados.t34', (select throws_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
     ) values (
       'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
       'c1111111-1111-1111-1111-111111111111', 0,
       current_date, 50.00, 'PRUEBA POSICION CERO', 'PRUEBA POSICION CERO', 'pendiente_procesamiento'
     ) $$,
  '23514'::character(5),
  NULL,
  'posicion_en_archivo = 0 se rechaza (debe ser > 0)'
))::text, true);

select set_config('resultados.t35', (select throws_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
     ) values (
       'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
       'c1111111-1111-1111-1111-111111111111', 1,
       current_date, 50.00, 'PRUEBA POSICION DUPLICADA', 'PRUEBA POSICION DUPLICADA', 'pendiente_procesamiento'
     ) $$,
  '23505'::character(5),
  NULL,
  'una posicion_en_archivo repetida dentro de la misma importacion se rechaza (fixture e1 ya usa la posicion 1 de d1)'
))::text, true);

select set_config('resultados.t36', (select throws_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
     ) values (
       'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
       'c1111111-1111-1111-1111-111111111112', 2,
       current_date, 50.00, 'PRUEBA CUENTA DISTINTA', 'PRUEBA CUENTA DISTINTA', 'pendiente_procesamiento'
     ) $$,
  '23503'::character(5),
  NULL,
  'una fila no puede declarar una cuenta distinta a la de su propia importacion (misma empresa, cuenta c...112 en vez de c...111) -- correccion 1'
))::text, true);

select set_config('resultados.t37', (select throws_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
     ) values (
       'd1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
       'c1111111-1111-1111-1111-111111111111', 3,
       current_date, 50.00, 'PRUEBA EMPRESA CRUZADA', 'PRUEBA EMPRESA CRUZADA', 'pendiente_procesamiento'
     ) $$,
  '23503'::character(5),
  NULL,
  'una fila no puede declarar una empresa distinta a la de su propia importacion'
))::text, true);

select set_config('resultados.t38', (select throws_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado,
       conciliacion_id, resuelto_por, resuelto_en
     ) values (
       'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
       'c1111111-1111-1111-1111-111111111111', 4,
       current_date, 50.00, 'PRUEBA CHECK RESOLUCION', 'PRUEBA CHECK RESOLUCION', 'vinculada_existente',
       'f1111111-1111-1111-1111-111111111111', NULL, NULL
     ) $$,
  '23514'::character(5),
  NULL,
  'vinculada_existente exige resuelto_por y resuelto_en NOT NULL -- el CHECK de resolucion lo rechaza'
))::text, true);

select set_config('resultados.t39', (select lives_ok(
  $$ insert into public.importacion_filas (
       importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
       movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado,
       conciliacion_id, resuelto_por, resuelto_en
     ) values (
       'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
       'c1111111-1111-1111-1111-111111111111', 5,
       current_date, 50.00, 'PRUEBA CHECK RESOLUCION OK', 'PRUEBA CHECK RESOLUCION OK', 'vinculada_existente',
       'f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()
     ) $$,
  'vinculada_existente con conciliacion_id + resuelto_por + resuelto_en, todos presentes, es una combinacion valida (control positivo)'
))::text, true);

-- ---------------------------------------------------------------------
-- Limpieza de los fixtures de conciliaciones_bancarias (candidatos
-- primero, por el ON DELETE RESTRICT implicito) y verificacion final de
-- que el conteo vuelve exactamente al baseline -- dentro de la misma
-- transaccion, sin depender unicamente del rollback.
-- ---------------------------------------------------------------------
delete from public.importacion_filas_candidatos
  where id in ('91111111-1111-1111-1111-111111111111', '92222222-2222-2222-2222-222222222222');

delete from public.importacion_filas
  where conciliacion_id in (
    'f1111111-1111-1111-1111-111111111111',
    'f2222222-2222-2222-2222-222222222222'
  );

delete from public.conciliaciones_bancarias
  where id in ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222');

select set_config('resultados.t40', (select is(
  (select count(*)::text from public.conciliaciones_bancarias),
  current_setting('vars.baseline_conciliaciones'),
  'conciliaciones_bancarias vuelve exactamente al baseline tras limpiar los 2 fixtures temporales usados solo para satisfacer la FK de candidatos'
))::text, true);

-- ---------------------------------------------------------------------
-- Borrado de empresa (hallazgo de revision B): confirma que las 2 rutas
-- CASCADE independientes (contabot_empresas -> importaciones_bancarias
-- directamente, y contabot_empresas -> importacion_filas directamente,
-- ademas de contabot_empresas -> cuentas_bancarias y -> conciliaciones_
-- bancarias) mas la FK NO ACTION intermedia (importacion_filas ->
-- importaciones_bancarias) resuelven correctamente dentro del mismo
-- DELETE, sin que la FK NO ACTION bloquee el borrado por una
-- comprobacion prematura -- Postgres valida las FK NO ACTION al final
-- del statement, despues de que todos los CASCADE del mismo DELETE ya se
-- aplicaron. Empresa dedicada (C), fuera de las usadas en el resto de
-- este archivo, para no interferir con ninguna otra prueba.
-- ---------------------------------------------------------------------
insert into public.contabot_empresas (id, nit, razon_social, correo) values
  ('33333333-3333-3333-3333-333333333333', '999900203', 'EMPRESA C 9B BORRADO', 'c9b2@prueba.test');

insert into public.cuentas_bancarias (id, empresa_id, banco, es_legacy, activa) values
  ('c3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'bancolombia', false, true);

insert into public.importaciones_bancarias (
  id, empresa_id, cuenta_id, usuario_id, nombre_archivo, tamano_bytes, hash_archivo, estado
) values (
  'd3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
  'c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'fixture_borrado_c.pdf', 1000, repeat('3', 64), 'procesando'
);

insert into public.importacion_filas (
  id, importacion_id, empresa_id, cuenta_id, posicion_en_archivo,
  movimiento_fecha, movimiento_valor, movimiento_descripcion, descripcion_normalizada, estado
) values (
  'e3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 1,
  current_date, 300.00, 'PAGO FIXTURE C', 'PAGO FIXTURE C', 'pendiente_procesamiento'
);

insert into public.conciliaciones_bancarias (
  id, user_id, banco, movimiento_fecha, movimiento_descripcion, movimiento_valor, empresa_id, cuenta_id
) values (
  'f3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bancolombia',
  to_char(current_date, 'YYYY/MM/DD'), 'CONCILIACION FIXTURE C', 300.00,
  '33333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333'
);

insert into public.importacion_filas_candidatos (
  id, importacion_fila_id, empresa_id, conciliacion_id
) values (
  '93333333-3333-3333-3333-333333333333', 'e3333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333', 'f3333333-3333-3333-3333-333333333333'
);

select set_config('resultados.t41', (select lives_ok(
  $$ delete from public.contabot_empresas where id = '33333333-3333-3333-3333-333333333333' $$,
  'borrar la empresa C no lanza excepcion -- las rutas CASCADE y la FK NO ACTION intermedia resuelven en el mismo statement'
))::text, true);

select set_config('resultados.t42', (select is(
  (select count(*)::int from public.contabot_empresas where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'la empresa C ya no existe'
))::text, true);

select set_config('resultados.t43', (select is(
  (select count(*)::int from public.cuentas_bancarias where empresa_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'no quedan cuentas bancarias huerfanas de la empresa C'
))::text, true);

select set_config('resultados.t44', (select is(
  (select count(*)::int from public.importaciones_bancarias where empresa_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'no quedan importaciones huerfanas de la empresa C'
))::text, true);

select set_config('resultados.t45', (select is(
  (select count(*)::int from public.importacion_filas where empresa_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'no quedan filas de importacion huerfanas de la empresa C'
))::text, true);

select set_config('resultados.t46', (select is(
  (select count(*)::int from public.importacion_filas_candidatos where empresa_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'no quedan candidatos huerfanos de la empresa C'
))::text, true);

select set_config('resultados.t47', (select is(
  (select count(*)::int from public.conciliaciones_bancarias where empresa_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'no quedan conciliaciones huerfanas de la empresa C'
))::text, true);

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
union all select current_setting('resultados.t15')
union all select current_setting('resultados.t16')
union all select current_setting('resultados.t17')
union all select current_setting('resultados.t18')
union all select current_setting('resultados.t19')
union all select current_setting('resultados.t20')
union all select current_setting('resultados.t21')
union all select current_setting('resultados.t22')
union all select current_setting('resultados.t23')
union all select current_setting('resultados.t24')
union all select current_setting('resultados.t25')
union all select current_setting('resultados.t26')
union all select current_setting('resultados.t27')
union all select current_setting('resultados.t28')
union all select current_setting('resultados.t29')
union all select current_setting('resultados.t30')
union all select current_setting('resultados.t31')
union all select current_setting('resultados.t32')
union all select current_setting('resultados.t33')
union all select current_setting('resultados.t34')
union all select current_setting('resultados.t35')
union all select current_setting('resultados.t36')
union all select current_setting('resultados.t37')
union all select current_setting('resultados.t38')
union all select current_setting('resultados.t39')
union all select current_setting('resultados.t40')
union all select current_setting('resultados.t41')
union all select current_setting('resultados.t42')
union all select current_setting('resultados.t43')
union all select current_setting('resultados.t44')
union all select current_setting('resultados.t45')
union all select current_setting('resultados.t46')
union all select current_setting('resultados.t47')
union all select current_setting('resultados.finish');

rollback;

-- =====================================================================
-- VERIFICACION MANUAL POST-EJECUCION (correr en una consulta NUEVA, en
-- el mismo proyecto de pruebas, DESPUES de que el bloque de arriba
-- termine con "rollback;"). No puede probarse dentro de la misma
-- transaccion -- point 8 "las tablas nuevas quedan vacias despues del
-- ROLLBACK" solo tiene sentido una vez que la transaccion de prueba ya
-- termino de verdad:
--
-- select 'importaciones_bancarias' as tabla, count(*) from public.importaciones_bancarias
-- union all select 'importacion_filas', count(*) from public.importacion_filas
-- union all select 'importacion_filas_candidatos', count(*) from public.importacion_filas_candidatos;
-- -- las 3 filas deben mostrar count = 0.
-- =====================================================================
