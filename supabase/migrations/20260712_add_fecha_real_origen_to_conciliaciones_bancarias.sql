-- Migration: add fecha_real_origen to conciliaciones_bancarias
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
ADD COLUMN IF NOT EXISTS fecha_real_origen date;
