-- Migration: versionar la estructura existente de conciliaciones_bancarias,
-- que existe en produccion desde antes de este repo pero nunca tuvo un
-- CREATE TABLE versionado (a diferencia de periodos_conciliacion_bancaria,
-- que si lo tiene en 20260712_create_periodos_conciliacion_bancaria.sql).
--
-- Se reproduce EXACTAMENTE la estructura confirmada en produccion por
-- introspeccion directa (information_schema.columns, pg_get_constraintdef):
-- 15 columnas, PK sobre id, CHECK sobre estado, FK de empresa_id hacia
-- contabot_empresas ON DELETE CASCADE. No se agrega ningun indice ni
-- columna nueva -- deliberadamente, para no modificar produccion.
--
-- Se usa extensions.uuid_generate_v4() en vez de uuid_generate_v4() sin
-- calificar, para no depender de que "extensions" este en el search_path
-- si esta migracion alguna vez se corre contra una base reconstruida desde
-- cero.
--
-- Los GRANT reproducen exactamente lo confirmado en produccion via
-- information_schema.table_privileges: anon, authenticated y service_role
-- tienen los 7 privilegios completos (DELETE, INSERT, REFERENCES, SELECT,
-- TRIGGER, TRUNCATE, UPDATE) -- el aislamiento real lo hace RLS, no el
-- GRANT (mismo patron ya usado en las demas tablas de este esquema).
--
-- ENABLE ROW LEVEL SECURITY se declara aqui Y de nuevo en
-- 20260820_2_rls_bancos_mis_empresas.sql. La repeticion es deliberada: este
-- archivo deja la tabla protegida por si sola si la migracion de politicas
-- no llega a ejecutarse; el archivo de politicas garantiza el mismo estado
-- en producción y en cualquier reconstruccion futura del esquema.
CREATE TABLE IF NOT EXISTS public.conciliaciones_bancarias (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL,
  banco text NOT NULL,
  fecha_extracto date,
  fecha_carga timestamptz NOT NULL DEFAULT now(),
  movimiento_fecha text NOT NULL,
  movimiento_descripcion text NOT NULL,
  movimiento_valor numeric(14,2) NOT NULL,
  documento_id uuid,
  nomina_id bigint,
  estado text NOT NULL DEFAULT 'no_encontrado',
  periodo text,
  empresa_id uuid REFERENCES public.contabot_empresas(id) ON DELETE CASCADE,
  fecha_real_origen date,
  periodo_contable text,
  CONSTRAINT conciliaciones_bancarias_pkey PRIMARY KEY (id),
  CONSTRAINT conciliaciones_bancarias_estado_check
    CHECK (estado IN ('encontrado', 'no_encontrado', 'confirmado', 'extemporaneo_pendiente'))
);

ALTER TABLE public.conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.conciliaciones_bancarias TO anon, authenticated, service_role;

-- ROLLBACK -- SIN ACCION NECESARIA.
-- La tabla ya existia en produccion con esta misma estructura ANTES de esta
-- migracion (CREATE TABLE IF NOT EXISTS es no-op contra produccion). Un
-- DROP TABLE aqui destruiria datos reales, dejando produccion en un estado
-- peor que el original. Verificacion:
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='conciliaciones_bancarias'
-- order by ordinal_position;
--
-- select grantee, privilege_type from information_schema.table_privileges
-- where table_schema='public' and table_name='conciliaciones_bancarias'
-- and grantee in ('anon','authenticated','service_role');
