-- Agrega el soporte minimo para "abonos parciales" sobre nomina_programada:
-- valor_causado: lo que se debe por el periodo (turnos, servicios, etc.), separado del neto_pagar
--                tradicional (que sigue existiendo para nomina de salario fijo).
-- saldo_anterior: saldo pendiente arrastrado del periodo anterior para la misma persona/empresa.
-- observaciones: nota libre del periodo (ej. quien recibio el pago, si fue distinto al beneficiario).
-- El saldo pendiente NUNCA se guarda: se calcula siempre como
--   valor_causado + saldo_anterior - SUM(abonos_nomina.valor_abonado)
-- (ver lib/nomina/abonos.ts).
ALTER TABLE public.nomina_programada
    ADD COLUMN IF NOT EXISTS valor_causado NUMERIC,
    ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS observaciones TEXT;
