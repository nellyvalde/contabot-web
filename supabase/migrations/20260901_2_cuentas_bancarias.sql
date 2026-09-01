-- Migration: PR 9a -- entidad de cuentas bancarias, primer paso del rediseno
-- de importacion bancaria (ver conversacion de PR 9). Alcance deliberadamente
-- acotado: NO incluye importaciones_bancarias, importacion_filas,
-- deteccion de duplicados, hashing de archivos ni cambios al flujo de
-- /bancos -- eso queda para PR 9b/9c, con los defectos ya detectados en el
-- diseno anterior registrados como pendientes (ver seccion "PENDIENTES
-- PARA 9B/9C" al final de este comentario, no se resuelven aqui):
--
-- 1. procesar_lote_importacion (diseno de 9b) usaba SELECT DISTINCT sobre
--    las firmas del lote -- eso colapsaria apariciones repetidas legitimas
--    dentro del mismo archivo antes de procesarlas. Debe recorrer TODAS las
--    filas, no solo las firmas distintas.
-- 2. El ORDER BY 4 propuesto para ese mismo recorrido era invalido (solo se
--    seleccionaban 3 columnas en el SELECT DISTINCT original).
-- 3. importacion_filas_candidatos (diseno de 9b) necesita tambien una FK
--    compuesta (importacion_fila_id, empresa_id) hacia importacion_filas,
--    ademas de la que ya tiene hacia conciliaciones_bancarias -- mismo
--    principio de integridad cross-tenant que se aplica aqui a
--    cuentas_bancarias.
-- 4. El diseno de reversion de una importacion (9c) no puede borrar una
--    conciliacion mientras otras filas de importacion_filas_candidatos
--    todavia la referencien como candidata -- falta ese paso de limpieza
--    antes del DELETE, sin perder la auditoria de que fue candidata.
-- 5. La clave canonica del advisory lock (9b) no debe asumir que chr(31)
--    nunca puede aparecer en un texto ingresado por el usuario (ej. una
--    descripcion bancaria malformada o con bytes de control) -- necesita
--    una representacion mas robusta antes de implementarse.
--
-- Ninguno de estos 5 puntos se toca en esta migracion -- se dejan
-- documentados aqui porque este archivo es el punto de partida sobre el que
-- se construira 9b.
--
-- ALCANCE DE ESTA MIGRACION (PR 9a):
-- * cuentas_bancarias, con soporte real para multiples cuentas del mismo
--   banco por empresa (el motivo explicito de esta tabla, aunque la
--   auditoria de produccion de hoy solo muestre una cuenta av_villas por
--   empresa -- el backfill NO asume que siempre seran exactamente dos).
-- * Una RPC estrecha para que el usuario complete alias/numero_cuenta
--   despues -- nunca una politica UPDATE cruda (RLS no puede restringir
--   columnas; mismo principio ya aplicado en confirmar_cruce_factura).
-- * conciliaciones_bancarias.cuenta_id, agregada nullable, con backfill
--   verificado ANTES de aplicar NOT NULL, y FK compuesta contra
--   cuentas_bancarias(id, empresa_id) para que sea imposible a nivel de
--   base de datos que una conciliacion apunte a una cuenta de otra empresa.
-- * Cero cambios visibles en /bancos -- ningun archivo de app/ ni lib/ se
--   toca en este PR. app/bancos/page.tsx sigue exactamente igual.
-- * Las 92 filas con coincidencia por campos visibles detectadas en la
--   auditoria de solo lectura NO se tocan aqui -- ni se limpian ni se
--   modifican.
--
-- CRITERIO DE NORMALIZACION (explicito, antes de cerrar el diff):
-- * banco: se exige que ya venga sin espacios al inicio/final y no vacio
--   (CHECK banco = trim(banco) AND banco <> ''). NO se fuerza mayusculas
--   ni minusculas -- debe coincidir EXACTAMENTE con los valores ya
--   almacenados en conciliaciones_bancarias.banco hoy (las claves en
--   minuscula de lib/bancos/config.ts: 'av_villas', 'bancolombia',
--   'davivienda'), de lo contrario el backfill por join no encontraria la
--   cuenta legacy correspondiente.
-- * numero_cuenta: se normaliza a mayusculas y se eliminan todos los
--   caracteres que no sean digitos o letras (espacios, guiones, puntos)
--   ANTES de guardarse -- asi "123-456" y "123 456" y "123456" se tratan
--   como la misma cuenta para efectos del indice unico. El CHECK
--   '^[0-9A-Z]+$' rechaza cualquier valor que no llegue ya en esa forma
--   canonica (o NULL, que es el estado legacy sin completar). La
--   normalizacion real ocurre dentro de la RPC de actualizacion, nunca de
--   forma silenciosa en un INSERT directo.
-- * alias: texto libre, sin normalizar mas alla de rechazar cadena vacia
--   (se guarda NULL en ese caso) -- es una etiqueta legible para el
--   usuario, no un identificador que necesite forma canonica.

BEGIN;

CREATE TABLE public.cuentas_bancarias (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  empresa_id uuid NOT NULL REFERENCES public.contabot_empresas(id) ON DELETE CASCADE,
  banco text NOT NULL,
  alias text,
  numero_cuenta text,
  es_legacy boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cuentas_bancarias_pkey PRIMARY KEY (id),
  -- Necesaria para que otras tablas (conciliaciones_bancarias, y en 9b
  -- importaciones_bancarias) puedan usar una FK compuesta (columna, empresa_id)
  -- que garantice a nivel de base de datos que nunca se mezclan empresas.
  CONSTRAINT cuentas_bancarias_id_empresa_unico UNIQUE (id, empresa_id),
  CONSTRAINT cuentas_bancarias_banco_no_vacio CHECK (banco = trim(banco) AND banco <> ''),
  CONSTRAINT cuentas_bancarias_alias_no_vacio CHECK (alias IS NULL OR trim(alias) <> ''),
  CONSTRAINT cuentas_bancarias_numero_cuenta_forma_valida CHECK (numero_cuenta IS NULL OR numero_cuenta ~ '^[0-9A-Z]+$')
);

-- Unico cuando numero_cuenta ya esta completo -- NULL nunca colisiona entre
-- si en un indice unico de Postgres, asi que multiples cuentas sin numero
-- (legacy o nuevas todavia sin completar) pueden coexistir.
CREATE UNIQUE INDEX cuentas_bancarias_empresa_banco_numero_unico
ON public.cuentas_bancarias (empresa_id, banco, numero_cuenta)
WHERE numero_cuenta IS NOT NULL;

-- Impide crear mas de una cuenta legacy SIN numero para la misma
-- empresa+banco -- una vez que una cuenta legacy se completa con un numero
-- real, deja de estar cubierta por este indice y el de arriba toma su lugar.
CREATE UNIQUE INDEX cuentas_bancarias_legacy_unica_por_empresa_banco
ON public.cuentas_bancarias (empresa_id, banco)
WHERE es_legacy = true AND numero_cuenta IS NULL;

ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_bancarias_select_por_empresa" ON public.cuentas_bancarias
  FOR SELECT
  USING (empresa_id IN (SELECT public.mis_empresas()));

CREATE POLICY "cuentas_bancarias_insert_por_empresa" ON public.cuentas_bancarias
  FOR INSERT
  WITH CHECK (empresa_id IN (SELECT public.mis_empresas()));

-- Deliberadamente SIN politica de UPDATE ni DELETE -- RLS no puede
-- restringir columnas (mismo principio que confirmar_cruce_factura en
-- PR 6): completar alias/numero_cuenta va exclusivamente por la RPC de
-- abajo, que nunca permite tocar empresa_id, banco, es_legacy ni activa.

-- No se usa mis_empresas() aqui dentro -- esa funcion no tiene su propio
-- SET search_path (replicada identica a produccion, ver PR 6/8). Con
-- SET search_path = pg_catalog en esta RPC, una funcion anidada sin su
-- propio search_path heredaria el de quien la invoca y "usuarios_empresas"
-- dejaria de resolverse. La membresia se calcula aqui mismo, calificada.
CREATE FUNCTION public.actualizar_cuenta_bancaria(
  p_cuenta_id uuid,
  p_alias text,
  p_numero_cuenta text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_alias text;
  v_numero_cuenta text;
  v_filas int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sin_autenticacion',
      'mensaje', 'Sesión no válida.');
  END IF;

  v_alias := NULLIF(trim(coalesce(p_alias, '')), '');
  -- Normalizacion explicita: mayusculas, solo digitos/letras -- ver
  -- criterio documentado al inicio de este archivo.
  v_numero_cuenta := NULLIF(upper(regexp_replace(trim(coalesce(p_numero_cuenta, '')), '[^0-9A-Za-z]', '', 'g')), '');

  -- Autorizacion y ubicacion de la fila en la MISMA sentencia -- no se
  -- bloquea/lee primero y se verifica membresia despues (mismo principio
  -- que confirmar_cruce_factura).
  UPDATE public.cuentas_bancarias
  SET alias = v_alias, numero_cuenta = v_numero_cuenta, updated_at = now()
  WHERE id = p_cuenta_id
    AND EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid()
        AND ue.activo = true
        AND ue.empresa_id = cuentas_bancarias.empresa_id
    );
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrada_o_sin_permiso',
      'mensaje', 'No se encontró la cuenta o no tienes acceso a ella.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

ALTER FUNCTION public.actualizar_cuenta_bancaria(uuid, text, text) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.actualizar_cuenta_bancaria(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.actualizar_cuenta_bancaria(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_cuenta_bancaria(uuid, text, text) TO authenticated;

-- Backfill 1: una cuenta legacy por cada combinacion empresa+banco que ya
-- existe hoy en conciliaciones_bancarias. Idempotente (ON CONFLICT DO
-- NOTHING contra el indice parcial de arriba) -- reejecutar este bloque no
-- crea duplicados. NO se asume un numero fijo de combinaciones -- se derivan
-- dinamicamente de los datos reales, aunque la auditoria de hoy muestre
-- exactamente dos (una por empresa, ambas av_villas).
INSERT INTO public.cuentas_bancarias (empresa_id, banco, es_legacy, activa)
SELECT DISTINCT empresa_id, banco, true, true
FROM public.conciliaciones_bancarias
WHERE empresa_id IS NOT NULL AND banco IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill 2: agregar cuenta_id NULLABLE primero -- nunca NOT NULL en el
-- mismo paso que el backfill.
ALTER TABLE public.conciliaciones_bancarias ADD COLUMN cuenta_id uuid;

UPDATE public.conciliaciones_bancarias cb
SET cuenta_id = cta.id
FROM public.cuentas_bancarias cta
WHERE cta.empresa_id = cb.empresa_id
  AND cta.banco = cb.banco
  AND cta.es_legacy = true
  AND cb.cuenta_id IS NULL;

-- Verificacion obligatoria ANTES de aplicar NOT NULL -- aborta toda la
-- migracion (ROLLBACK automatico de la transaccion) si alguna fila real
-- quedo sin cuenta_id, en vez de dejar producción con una columna a medio
-- poblar.
DO $$
DECLARE
  v_sin_cuenta int;
BEGIN
  SELECT count(*) INTO v_sin_cuenta
  FROM public.conciliaciones_bancarias
  WHERE cuenta_id IS NULL;

  IF v_sin_cuenta <> 0 THEN
    RAISE EXCEPTION 'Quedaron % fila(s) de conciliaciones_bancarias sin cuenta_id asignado tras el backfill -- abortando antes de aplicar NOT NULL.', v_sin_cuenta;
  END IF;
END $$;

ALTER TABLE public.conciliaciones_bancarias ALTER COLUMN cuenta_id SET NOT NULL;

-- FK compuesta -- garantiza a nivel de base de datos que cuenta_id
-- pertenece a la MISMA empresa que la conciliacion, sin importar ningun
-- error de codigo o de una RPC futura.
ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_cuenta_misma_empresa
  FOREIGN KEY (cuenta_id, empresa_id) REFERENCES public.cuentas_bancarias (id, empresa_id);

COMMIT;

-- ROLLBACK -- SOLO VALIDO EN UN ENTORNO DE PREPRODUCCION SIN DATOS REALES
-- creados por esta migracion (ej. antes de que exista ninguna cuenta usada
-- por una conciliacion real). Una vez en produccion con datos reales, NO
-- se revierte este archivo -- cualquier correccion necesaria se hace con
-- una migracion nueva hacia adelante (forward-fix), nunca destruyendo
-- cuentas_bancarias ni el cuenta_id ya poblado de conciliaciones_bancarias,
-- para no perder trazabilidad.
--
-- BEGIN;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_cuenta_misma_empresa;
-- ALTER TABLE public.conciliaciones_bancarias ALTER COLUMN cuenta_id DROP NOT NULL;
-- ALTER TABLE public.conciliaciones_bancarias DROP COLUMN IF EXISTS cuenta_id;
-- REVOKE EXECUTE ON FUNCTION public.actualizar_cuenta_bancaria(uuid, text, text) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.actualizar_cuenta_bancaria(uuid, text, text);
-- DROP TABLE IF EXISTS public.cuentas_bancarias;
-- COMMIT;
