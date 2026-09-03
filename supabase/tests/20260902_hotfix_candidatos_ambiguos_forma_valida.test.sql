-- =====================================================================
-- NO EJECUTADO EN PRODUCCION. Pruebas pgTAP para el hotfix:
--   20260902_1_hotfix_candidatos_ambiguos_forma_valida.sql
--
-- Prueba EXCLUSIVAMENTE la funcion viva ya instalada por la migracion --
-- este archivo NUNCA crea, reemplaza ni redefine
-- candidatos_ambiguos_forma_valida. No hay CREATE OR REPLACE FUNCTION ni
-- GRANT aqui: eso pertenece unicamente a la migracion. Esto es
-- deliberado -- una version anterior de este archivo redefinia la
-- funcion dentro del propio test (primero con el cuerpo original, luego
-- con el corregido), lo cual permitia que las 7 pruebas pasaran sin
-- importar si la migracion real habia instalado el hotfix correctamente
-- o no -- el test no probaba nada sobre el estado real de la base.
--
-- PROPIEDAD ESPERADA DE ESTE ARCHIVO: ejecutarlo contra un proyecto
-- donde TODAVIA NO se aplico el hotfix (candidatos_ambiguos_forma_valida
-- sigue con el defecto original) DEBE FALLAR -- especificamente el
-- caso 2 ([{}] -> false) reporta "not ok", porque la funcion original
-- devuelve true para ese caso. Solo despues de aplicar
-- 20260902_1_hotfix_candidatos_ambiguos_forma_valida.sql las 7 pruebas
-- de este archivo deben pasar.
--
-- SOLO PARA ENTORNO DE PRUEBAS. Nunca correr contra produccion. BEGIN/
-- ROLLBACK se usan unicamente para seguir el patron pgTAP ya establecido
-- en este proyecto -- no hay ninguna escritura ni DDL dentro de esta
-- transaccion: solo lecturas (llamadas a la funcion, que es IMMUTABLE y
-- de solo lectura, nunca toca ninguna tabla).
--
-- PRERREQUISITO -- verificar ANTES de correr el resto de este archivo,
-- en su propia consulta separada, en el proyecto de PRUEBAS (nunca
-- produccion):
--
--   select extname, extversion from pg_extension where extname = 'pgtap';
-- =====================================================================

begin;

select set_config('resultados.plan', plan(7)::text, true);

select set_config('resultados.t01', (select is(
  public.candidatos_ambiguos_forma_valida('[]'::jsonb),
  true,
  'array vacio es valido (caso [])'
))::text, true);

select set_config('resultados.t02', (select is(
  public.candidatos_ambiguos_forma_valida('[{}]'::jsonb),
  false,
  'objeto vacio se rechaza -- caso [{}], falla contra la funcion original (devuelve true) y pasa solo despues del hotfix'
))::text, true);

select set_config('resultados.t03', (select is(
  public.candidatos_ambiguos_forma_valida('[1, 2]'::jsonb),
  false,
  'escalares se rechazan (caso [1,2])'
))::text, true);

select set_config('resultados.t04', (select is(
  public.candidatos_ambiguos_forma_valida(
    '[{"factura_id":"x","valor":1,"diferencia":0}]'::jsonb
  ),
  false,
  'objeto con 3 claves (falta fecha) se rechaza'
))::text, true);

select set_config('resultados.t05', (select is(
  public.candidatos_ambiguos_forma_valida(
    '[{"factura_id":"x","valor":1,"diferencia":0,"fecha":"2026-09-02"}]'::jsonb
  ),
  true,
  'objeto con las 4 claves exactas se acepta'
))::text, true);

select set_config('resultados.t06', (select is(
  public.candidatos_ambiguos_forma_valida(
    '[{"factura_id":"x","valor":1,"diferencia":0,"fecha":"2026-09-02","extra":"z"}]'::jsonb
  ),
  false,
  'objeto con 5 claves (una de mas) se rechaza'
))::text, true);

select set_config('resultados.t07', (select is(
  public.candidatos_ambiguos_forma_valida(
    '[{"factura_id":"a","valor":1,"diferencia":0,"fecha":"2026-01-01"},{"factura_id":"b","valor":2,"diferencia":0,"fecha":"2026-01-02"}]'::jsonb
  ),
  true,
  'dos objetos validos en el mismo array se aceptan'
))::text, true);

select set_config(
  'resultados.finish',
  coalesce((select string_agg(x, E'\n') from finish() as x), 'finish: sin errores'),
  true
);

select current_setting('resultados.plan') as resultado
union all select current_setting('resultados.t01')
union all select current_setting('resultados.t02')
union all select current_setting('resultados.t03')
union all select current_setting('resultados.t04')
union all select current_setting('resultados.t05')
union all select current_setting('resultados.t06')
union all select current_setting('resultados.t07')
union all select current_setting('resultados.finish');

rollback;
