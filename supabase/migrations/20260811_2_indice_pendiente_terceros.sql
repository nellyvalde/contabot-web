-- Migration: indice unico parcial para idempotencia de comprobantes de pago
-- a terceros sin coincidencia segura (tipo='pendiente_terceros').
--
-- Sin CONCURRENTLY: documentos tiene 43 filas en produccion (confirmado
-- 2026-08-11), trafico de escritura bajo -- el bloqueo de un CREATE INDEX
-- normal es del orden de milisegundos. Mismo criterio que las migraciones
-- anteriores de este proyecto (A, B, C).
--
-- Sin IF NOT EXISTS a proposito: ya se confirmo por consulta real que este
-- indice no existe en produccion. Si llegara a existir en el momento de
-- aplicar esto, debe fallar con un error visible, no omitirse en silencio.
CREATE UNIQUE INDEX documentos_pendiente_terceros_idempotencia
ON public.documentos (empresa_id, numero_documento)
WHERE tipo = 'pendiente_terceros' AND numero_documento IS NOT NULL;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.documentos_pendiente_terceros_idempotencia;
