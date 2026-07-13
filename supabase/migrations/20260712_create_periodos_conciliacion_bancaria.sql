-- Migration: create periodos_conciliacion_bancaria for bank reconciliation periods
CREATE TABLE IF NOT EXISTS public.periodos_conciliacion_bancaria (
  id serial PRIMARY KEY,
  empresa_id uuid NOT NULL,
  periodo text NOT NULL,
  cerrado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid,
  UNIQUE (empresa_id, periodo)
);
