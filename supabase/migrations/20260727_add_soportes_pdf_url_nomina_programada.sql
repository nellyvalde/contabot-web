-- Agrega una columna para guardar el link a un PDF combinado con TODOS los
-- comprobantes (abonos_nomina.archivo_url) de una obligacion de nomina, en el
-- orden en que se fueron registrando. Se regenera automaticamente cada vez que
-- se registra un abono nuevo (ver lib/nomina/soportesPdf.ts), asi que siempre
-- queda un unico link con el historial completo de soportes para revision.
ALTER TABLE public.nomina_programada
    ADD COLUMN IF NOT EXISTS soportes_pdf_url TEXT;
