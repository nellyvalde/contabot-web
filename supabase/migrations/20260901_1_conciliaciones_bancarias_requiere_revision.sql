-- Migration: agrega el estado 'requiere_revision' y la columna
-- candidatos_ambiguos para el emparejamiento uno-a-uno movimiento<->factura
-- (ver lib/bancos/emparejarMovimientos.ts), mas el indice unico parcial que
-- impide que una factura activa (encontrado/confirmado) quede referenciada
-- por mas de una conciliacion.
--
-- Este archivo reproduce EXACTAMENTE el script ya aplicado y verificado en
-- produccion (proyecto contabot, project_ref wuvckixocqetjcjdhiwn) tras la
-- remediacion manual de 27 filas con duplicados/falsos positivos detectados
-- en una auditoria de solo lectura previa (documentada en la conversacion
-- de este PR, no versionada aqui porque fue una limpieza de datos puntual,
-- no un cambio de esquema repetible). Aplicar este archivo con
-- `supabase db push`/`migration up` contra un entorno donde el esquema
-- descrito aqui YA existe (como produccion, donde se aplico manualmente por
-- SQL Editor) fallara con "already exists" -- es el mismo patron ya visto
-- con las migraciones anteriores de este proyecto que documentan un cambio
-- ya aplicado a mano.
--
-- candidatos_ambiguos guarda unicamente lo minimo para revision humana:
-- factura_id, valor, diferencia y fecha de cada candidata. Nunca contenido
-- de documentos ni datos personales del proveedor.
--
-- Postgres no permite un subquery directo dentro de un CHECK constraint
-- (error 0A000 "cannot use subquery in check constraint", confirmado
-- empiricamente al aplicar el primer intento de este script contra
-- produccion). Se envuelve la validacion de forma del array en una funcion
-- IMMUTABLE pura -- Postgres si permite llamar funciones dentro de un
-- CHECK, y la funcion puede usar subqueries libremente en su interior.
--
-- Una fila 'requiere_revision' no puede apuntar a una sola factura (deja de
-- ser "ambigua" si lo hiciera) -- de ahi el constraint
-- conciliaciones_requiere_revision_sin_documento.

BEGIN;

ALTER TABLE public.conciliaciones_bancarias
  DROP CONSTRAINT conciliaciones_bancarias_estado_check;

ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_bancarias_estado_check
  CHECK (estado IN ('encontrado', 'no_encontrado', 'confirmado', 'extemporaneo_pendiente', 'requiere_revision'));

-- DEFAULT constante -> operacion de metadatos, sin reescribir la tabla
-- completa (Postgres 11+).
ALTER TABLE public.conciliaciones_bancarias
  ADD COLUMN candidatos_ambiguos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_candidatos_ambiguos_es_array
  CHECK (jsonb_typeof(candidatos_ambiguos) = 'array');

CREATE FUNCTION public.candidatos_ambiguos_forma_valida(candidatos jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(candidatos) AS elem
    WHERE jsonb_typeof(elem) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(elem) AS k)
          <> ARRAY['diferencia', 'factura_id', 'fecha', 'valor']
  );
$$;

GRANT EXECUTE ON FUNCTION public.candidatos_ambiguos_forma_valida(jsonb) TO PUBLIC;

-- Cada elemento debe ser un objeto con EXACTAMENTE estas 4 claves, ni mas ni
-- menos -- bloquea que se cuele el documento completo, nombre de proveedor,
-- o cualquier otro campo no autorizado.
ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_candidatos_ambiguos_forma_valida
  CHECK (public.candidatos_ambiguos_forma_valida(candidatos_ambiguos));

ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_candidatos_ambiguos_min_2_si_requiere_revision
  CHECK (estado <> 'requiere_revision' OR jsonb_array_length(candidatos_ambiguos) >= 2);

ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_candidatos_ambiguos_vacio_si_no_requiere_revision
  CHECK (estado = 'requiere_revision' OR candidatos_ambiguos = '[]'::jsonb);

ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_requiere_revision_sin_documento
  CHECK (estado <> 'requiere_revision' OR documento_id IS NULL);

CREATE UNIQUE INDEX conciliaciones_documento_activo_unico
ON public.conciliaciones_bancarias (documento_id)
WHERE documento_id IS NOT NULL AND estado IN ('encontrado', 'confirmado');

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP INDEX IF EXISTS public.conciliaciones_documento_activo_unico;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_requiere_revision_sin_documento;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_candidatos_ambiguos_vacio_si_no_requiere_revision;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_candidatos_ambiguos_min_2_si_requiere_revision;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_candidatos_ambiguos_forma_valida;
-- DROP FUNCTION IF EXISTS public.candidatos_ambiguos_forma_valida(jsonb);
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_candidatos_ambiguos_es_array;
-- ALTER TABLE public.conciliaciones_bancarias DROP COLUMN IF EXISTS candidatos_ambiguos;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT conciliaciones_bancarias_estado_check;
-- ALTER TABLE public.conciliaciones_bancarias ADD CONSTRAINT conciliaciones_bancarias_estado_check
--   CHECK (estado IN ('encontrado', 'no_encontrado', 'confirmado', 'extemporaneo_pendiente'));
-- COMMIT;
