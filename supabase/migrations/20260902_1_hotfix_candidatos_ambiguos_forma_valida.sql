-- Migration: hotfix independiente -- corrige un defecto confirmado
-- empiricamente en public.candidatos_ambiguos_forma_valida (creada en
-- 20260901_1_conciliaciones_bancarias_requiere_revision.sql, ya en
-- produccion). No se mezcla con PR 9b (importaciones_bancarias).
--
-- DEFECTO CONFIRMADO (probado en el proyecto de pruebas contabot-rls-test,
-- ref gdczjqurhrvphxjsjhrj, nunca en produccion): la funcion original
-- acepta un objeto vacio {} como "forma valida" porque array_agg() sobre
-- 0 filas devuelve NULL, no un array vacio -- "NULL <> ARRAY[...]" evalua
-- a NULL, y una fila con condicion NULL en un WHERE se descarta como si
-- fuera falsa, asi que EXISTS(...) nunca detecta ese elemento como
-- invalido.
--   select public.candidatos_ambiguos_forma_valida('[{}]'::jsonb) -- true
--   (deberia ser false) -- confirmado empiricamente el 2026-09-02.
--
-- AUDITORIA DE PRODUCCION (solo lectura, 2026-09-02, antes de este
-- hotfix): 289 filas totales en conciliaciones_bancarias, 0 filas con
-- candidatos_ambiguos que no sean array, 0 elementos que no sean objeto,
-- 0 objetos con claves incorrectas o incompletas (incluido el caso {}),
-- 0 filas afectadas. El defecto es unicamente latente en la logica de la
-- funcion -- nunca se materializo como dato real corrupto, porque
-- candidatos_ambiguos solo se puebla hoy via el emparejamiento de PR 8
-- (lib/bancos/emparejarMovimientos.ts), que siempre genera candidatos con
-- la forma correcta. Por eso este hotfix es puramente preventivo: no hay
-- ninguna fila que remediar.
--
-- CORRECCION: se envuelve el resultado de jsonb_object_keys() en
-- COALESCE(..., ARRAY[]::text[]) para que un objeto sin claves compare
-- contra un array VACIO (no NULL), haciendo la comparacion siempre
-- determinista. Ademas, se reemplaza el OR de nivel superior por un CASE
-- WHEN/ELSE -- CASE si tiene orden de evaluacion garantizado por Postgres
-- (ver "4.2.14. Expression Evaluation Rules" en la documentacion), a
-- diferencia de AND/OR, cuyo orden NO esta garantizado. Asi, el chequeo
-- de escalares (jsonb_typeof(elem) <> 'object') ya no depende de que el
-- motor decida cortocircuitar un OR antes de evaluar jsonb_object_keys()
-- sobre un valor no-objeto -- aunque se confirmo empiricamente que hoy SI
-- cortocircuita en el proyecto de pruebas, nunca fue una garantia
-- documentada.
--
-- CREATE OR REPLACE FUNCTION preserva el OID de la funcion -- el CHECK
-- conciliaciones_candidatos_ambiguos_forma_valida (ya existente, de
-- 20260901_1) sigue referenciando la misma funcion sin necesidad de
-- ningun ALTER TABLE ni de recrear el CHECK.
--
-- IMPORTANTE -- lo que este hotfix NO hace, deliberadamente:
-- * No revalida retroactivamente las filas ya existentes. Un CHECK
--   constraint basado en funcion NO se re-evalua automaticamente contra
--   filas ya insertadas cuando la funcion cambia -- solo se aplica hacia
--   adelante, en cada INSERT/UPDATE futuro. La auditoria de arriba ya
--   confirma que esto no importa hoy: 0 filas afectadas.
-- * No modifica ninguna fila de ninguna tabla (sin UPDATE ni DELETE).
-- * No toca conciliaciones_candidatos_ambiguos_min_2_si_requiere_revision,
--   conciliaciones_candidatos_ambiguos_vacio_si_no_requiere_revision, ni
--   ningun otro constraint, tabla o funcion -- unicamente reemplaza el
--   cuerpo de esta funcion.

BEGIN;

CREATE OR REPLACE FUNCTION public.candidatos_ambiguos_forma_valida(candidatos jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidatos) AS elem
    WHERE CASE
      WHEN jsonb_typeof(elem) <> 'object' THEN true
      ELSE coalesce(
        (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(elem) AS k),
        ARRAY[]::text[]
      ) <> ARRAY['diferencia', 'factura_id', 'fecha', 'valor']
    END
  );
$$;

GRANT EXECUTE ON FUNCTION public.candidatos_ambiguos_forma_valida(jsonb) TO PUBLIC;

COMMIT;

-- ROLLBACK -- restaura EXACTAMENTE el cuerpo original (con el defecto
-- conocido) si alguna vez hace falta revertir este hotfix especifico:
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.candidatos_ambiguos_forma_valida(candidatos jsonb)
-- RETURNS boolean
-- LANGUAGE sql
-- IMMUTABLE
-- SET search_path = pg_catalog
-- AS $$
--   SELECT NOT EXISTS (
--     SELECT 1 FROM jsonb_array_elements(candidatos) AS elem
--     WHERE jsonb_typeof(elem) <> 'object'
--        OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(elem) AS k)
--           <> ARRAY['diferencia', 'factura_id', 'fecha', 'valor']
--   );
-- $$;
-- GRANT EXECUTE ON FUNCTION public.candidatos_ambiguos_forma_valida(jsonb) TO PUBLIC;
-- COMMIT;
