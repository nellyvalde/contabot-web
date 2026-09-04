-- Migration: PR 9b -- infraestructura inactiva de importaciones bancarias
-- (importaciones_bancarias, importacion_filas, importacion_filas_candidatos)
-- y unicamente la RPC de inicio/reintento de una importacion. Continua el
-- rediseno de PR 9 (ver PR 9a: cuentas_bancarias, migracion
-- 20260901_2_cuentas_bancarias.sql).
--
-- ALCANCE:
-- * Se crean las 3 tablas nuevas, sus constraints, indices e integridad
--   cross-tenant (FK compuestas), y RLS de solo SELECT por empresa.
-- * Se crea UNICAMENTE iniciar_o_reintentar_importacion -- valida
--   auth/membresia/hash/nombre/tamano, deriva empresa_id desde cuenta_id, y
--   crea o reintenta el registro en importaciones_bancarias. No recibe
--   movimientos ni crea ninguna fila en importacion_filas.
-- * NO se crea procesar_lote_importacion en esta migracion. El flujo actual
--   de app/bancos/page.tsx determina periodo, periodo_cerrado,
--   extemporaneo_pendiente, matching contra facturas, requiere_revision,
--   ruta de nomina, documento_id y el resto de columnas obligatorias de
--   conciliaciones_bancarias -- reproducir ese flujo dentro de una RPC nueva
--   es un diseno propio que se hace en su propia migracion (9c).
-- * NO se inserta ni modifica NINGUNA fila de conciliaciones_bancarias, mas
--   alla de agregarle la constraint UNIQUE(id, empresa_id) del paso 0.
-- * NO se agrega ninguna fila real a las tablas nuevas -- quedan vacias
--   despues de esta migracion.
-- * Cero archivos de app/ o lib/ -- nada en el codigo llama estas tablas ni
--   esta RPC todavia. No hace falta ninguna feature flag: sin consumidores,
--   no hay ningun comportamiento visible que gatear.
-- * Cero cambios en Nomina. Sin remediacion de las 92 filas historicas.
--
-- CORRECCIONES aplicadas tras revision (respecto de la version anterior de
-- este diseno):
--
-- 1. INTEGRIDAD IMPORTACION-CUENTA: la FK original (importacion_id,
--    empresa_id) -> importaciones_bancarias(id, empresa_id) solo garantizaba
--    la misma empresa, no la misma cuenta -- una fila de staging podia
--    apuntar a una importacion de la cuenta X pero declarar cuenta_id de la
--    cuenta Y (misma empresa, cuenta distinta). Se reemplaza por una FK de
--    3 columnas: importaciones_bancarias gana la clave candidata
--    UNIQUE(id, cuenta_id, empresa_id) (reemplaza a la UNIQUE(id, empresa_id)
--    anterior, que queda subsumida y sin ningun otro FK que la use), y
--    importacion_filas referencia (importacion_id, cuenta_id, empresa_id)
--    contra esa clave de 3 columnas. Ahora es estructuralmente imposible que
--    una fila declare una cuenta distinta a la de su propia importacion.
--    Se conserva ademas, como segunda capa independiente (defensa en
--    profundidad, ya redundante por transitividad con la FK de 3 columnas
--    pero barata de mantener), la FK directa cuenta_id/empresa_id contra
--    cuentas_bancarias.
--
-- 2. COLUMNA banco ELIMINADA de importaciones_bancarias: era una segunda
--    fuente de verdad -- ya se deriva sin ambiguedad de cuenta_id via
--    cuentas_bancarias.banco (JOIN), y esa tabla es la unica autoridad sobre
--    que banco tiene una cuenta. Se elimina la columna en vez de mantenerla
--    como snapshot con una constraint de sincronizacion adicional.
--
-- 3. posicion_en_archivo pasa a NOT NULL, CHECK > 0, y
--    UNIQUE(importacion_id, posicion_en_archivo) -- impide registrar dos
--    veces la misma fila del mismo archivo y preserva el orden real de
--    lectura para auditoria. Explicitamente NO es una clave de identidad
--    bancaria (eso sigue siendo fecha+valor+descripcion normalizada +
--    referencia futura) -- ver PENDIENTE PARA 9C mas abajo.
--
-- 4. LIMITES DE TEXTO (tabla + RPC):
--    * nombre_archivo <= 255 caracteres -- limite estandar de nombre de
--      archivo en la mayoria de sistemas de archivos y de subida; la RPC lo
--      rechaza ANTES del INSERT con codigo 'nombre_demasiado_largo'.
--    * movimiento_descripcion y descripcion_normalizada <= 500 caracteres --
--      conciliaciones_bancarias.movimiento_descripcion (produccion, ver
--      20260820_1_conciliaciones_bancarias_estructura.sql) es texto sin
--      limite y en la practica una sola linea de extracto bancario (columnas
--      como "DESCRIPCIÓN TRANSACCIÓN" en lib/bancos/config.ts, tipicamente
--      bajo 100 caracteres); 500 da margen amplio sobre cualquier caso real
--      observado sin dejar la columna sin cota ante datos malformados.
--      descripcion_normalizada se deriva de movimiento_descripcion por
--      colapso de espacios/mayusculas, por lo que nunca puede ser mas larga
--      -- misma cota por consistencia. Ambas ademas NOT NULL y no vacias.
--    * referencia_bancaria <= 100 caracteres -- columna reservada para el
--      futuro (todavia siempre NULL), pero un codigo de referencia bancaria
--      real (CUS, codigo ACH, etc.) nunca se acerca a 100 caracteres.
--
-- 5. COHERENCIA DE RESOLUCION (resuelto_por/resuelto_en): se agrega
--    filas_resolucion_coherente -- pendiente_procesamiento y
--    posible_duplicado exigen ambos NULL; vinculada_existente,
--    aceptada_como_nueva y rechazada exigen ambos NOT NULL. El estado
--    'revertida' se APLAZA por completo (no se incluye todavia en
--    filas_estado_valido) -- su semantica de resolucion depende del diseno
--    de revertir_importacion (9c, que tambien decide si reutiliza
--    resuelto_por/resuelto_en o columnas propias tipo reversion_en/
--    reversion_por), y dejarlo aqui con una combinacion inventada seria
--    peor que no tenerlo. Se agrega en la migracion de 9c que lo defina.
--
-- Prerrequisito: conciliaciones_bancarias no tenia UNIQUE(id, empresa_id) --
-- PR 9a solo lo agrego a cuentas_bancarias. id ya es PRIMARY KEY (por lo
-- tanto ya unico globalmente), asi que agregar UNIQUE(id, empresa_id) no
-- puede violarse con las 289 filas existentes sin importar que empresa_id
-- sea nullable en esa tabla -- cada fila ya se distingue por su propio id.
-- ALTER TABLE ... ADD CONSTRAINT ... UNIQUE toma ACCESS EXCLUSIVE solo
-- mientras construye el indice; con 289 filas eso es de milisegundos.
--
-- NOTA para 9c (no se resuelve aqui, solo se deja registrado): en
-- conciliaciones_bancarias, movimiento_fecha es TEXT, no DATE (asi existe en
-- produccion). importacion_filas.movimiento_fecha aqui es DATE -- el disenio
-- que compare/empareje candidatos entre ambas tablas en 9c debera hacer un
-- CAST explicito, no asumir que los tipos ya coinciden.
--
-- PENDIENTE PARA 9C (no se resuelve aqui):
-- * procesar_lote_importacion (o su reemplazo), con el flujo contable
--   completo -- periodo, requiere_revision, matching de facturas, ruta de
--   nomina, documento_id.
-- * La clave canonica del advisory lock que esa RPC necesitara -- se evalua
--   junto con ella. Esta migracion no usa pg_advisory_xact_lock: sin
--   procesamiento de filas, no hay ninguna carrera de firma_base que
--   proteger todavia.
-- * resolver_fila_importacion (vincular_existente/aceptar_como_nueva/
--   rechazar) y revertir_importacion, junto con el estado 'revertida' de
--   importacion_filas y su propia coherencia de resolucion.
-- * La UI completa y la feature flag que la gatee.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Prerrequisito para FKs compuestas futuras.
-- ---------------------------------------------------------------------
ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT conciliaciones_id_empresa_unico UNIQUE (id, empresa_id);

-- ---------------------------------------------------------------------
-- 1. importaciones_bancarias
-- ---------------------------------------------------------------------
CREATE TABLE public.importaciones_bancarias (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  empresa_id uuid NOT NULL REFERENCES public.contabot_empresas(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  nombre_archivo text NOT NULL,
  tamano_bytes bigint NOT NULL,
  hash_archivo text NOT NULL,
  subido_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL DEFAULT 'procesando',
  cantidad_filas_leidas int NOT NULL DEFAULT 0,
  cantidad_nuevas int NOT NULL DEFAULT 0,
  cantidad_posibles_duplicados int NOT NULL DEFAULT 0,
  revertida_en timestamptz,
  revertida_por uuid,
  CONSTRAINT importaciones_pkey PRIMARY KEY (id),
  -- Clave candidata de 3 columnas -- unica forma de que importacion_filas
  -- pueda referenciar (importacion, cuenta, empresa) a la vez y que
  -- Postgres impida estructuralmente una fila con la cuenta equivocada.
  CONSTRAINT importaciones_id_cuenta_empresa_unico UNIQUE (id, cuenta_id, empresa_id),
  CONSTRAINT importaciones_cuenta_misma_empresa
    FOREIGN KEY (cuenta_id, empresa_id) REFERENCES public.cuentas_bancarias (id, empresa_id),
  CONSTRAINT importaciones_estado_valido
    CHECK (estado IN ('procesando','completada','fallida','revertida')),
  CONSTRAINT importaciones_hash_forma_valida
    CHECK (hash_archivo ~ '^[0-9a-f]{64}$'),
  CONSTRAINT importaciones_nombre_no_vacio
    CHECK (nombre_archivo = trim(nombre_archivo) AND nombre_archivo <> ''),
  CONSTRAINT importaciones_nombre_longitud_valida
    CHECK (char_length(nombre_archivo) <= 255),
  CONSTRAINT importaciones_tamano_valido
    CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  CONSTRAINT importaciones_contadores_no_negativos
    CHECK (cantidad_filas_leidas >= 0 AND cantidad_nuevas >= 0 AND cantidad_posibles_duplicados >= 0),
  CONSTRAINT importaciones_reversion_coherente
    CHECK (
      (estado = 'revertida' AND revertida_en IS NOT NULL AND revertida_por IS NOT NULL)
      OR (estado <> 'revertida' AND revertida_en IS NULL AND revertida_por IS NULL)
    )
);

-- Bloqueo del archivo exacto -- solo mientras la importacion esta vigente
-- (procesando/completada). fallida/revertida quedan fuera del indice, asi
-- que nunca bloquean un reintento del mismo archivo.
CREATE UNIQUE INDEX importaciones_hash_activo_unico
ON public.importaciones_bancarias (empresa_id, cuenta_id, hash_archivo)
WHERE estado IN ('procesando', 'completada');

ALTER TABLE public.importaciones_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "importaciones_select_por_empresa" ON public.importaciones_bancarias
  FOR SELECT
  USING (empresa_id IN (SELECT public.mis_empresas()));

-- Deliberadamente SIN politica de INSERT/UPDATE/DELETE -- toda escritura
-- pasa por iniciar_o_reintentar_importacion (SECURITY DEFINER, mas abajo).

-- ---------------------------------------------------------------------
-- 2. importacion_filas -- staging auditable. Esta migracion crea la tabla
--    pero no inserta ninguna fila real: solo procesar_lote_importacion
--    (9c) escribira aqui.
-- ---------------------------------------------------------------------
CREATE TABLE public.importacion_filas (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  importacion_id uuid NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.contabot_empresas(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL,
  posicion_en_archivo int NOT NULL, -- orden de lectura para auditoria; NUNCA identidad bancaria
  movimiento_fecha date NOT NULL,
  movimiento_valor numeric(14,2) NOT NULL,
  movimiento_descripcion text NOT NULL,
  descripcion_normalizada text NOT NULL,
  referencia_bancaria text, -- NULL hoy, listo para el futuro
  estado text NOT NULL DEFAULT 'pendiente_procesamiento',
  conciliacion_id uuid,
  resuelto_por uuid,
  resuelto_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filas_pkey PRIMARY KEY (id),
  CONSTRAINT filas_id_empresa_unico UNIQUE (id, empresa_id),
  -- FK de 3 columnas -- ver correccion 1 en el encabezado. Reemplaza la FK
  -- de 2 columnas (importacion_id, empresa_id) que solo protegia la empresa.
  CONSTRAINT filas_importacion_misma_cuenta_empresa
    FOREIGN KEY (importacion_id, cuenta_id, empresa_id)
    REFERENCES public.importaciones_bancarias (id, cuenta_id, empresa_id),
  -- Redundante por transitividad con la FK de arriba (cuenta_id ya queda
  -- fijado a la cuenta de la importacion, que a su vez ya esta validada
  -- contra cuentas_bancarias) -- se conserva como segunda capa
  -- independiente, barata de mantener, mismo principio que los CHECK que
  -- duplican validaciones ya hechas en la RPC.
  CONSTRAINT filas_cuenta_misma_empresa
    FOREIGN KEY (cuenta_id, empresa_id) REFERENCES public.cuentas_bancarias (id, empresa_id),
  CONSTRAINT filas_conciliacion_misma_empresa
    FOREIGN KEY (conciliacion_id, empresa_id) REFERENCES public.conciliaciones_bancarias (id, empresa_id),
  CONSTRAINT filas_posicion_positiva
    CHECK (posicion_en_archivo > 0),
  CONSTRAINT filas_posicion_unica_por_importacion
    UNIQUE (importacion_id, posicion_en_archivo),
  CONSTRAINT filas_descripcion_no_vacia
    CHECK (movimiento_descripcion = trim(movimiento_descripcion) AND movimiento_descripcion <> ''),
  CONSTRAINT filas_descripcion_longitud_valida
    CHECK (char_length(movimiento_descripcion) <= 500),
  CONSTRAINT filas_descripcion_normalizada_no_vacia
    CHECK (descripcion_normalizada = trim(descripcion_normalizada) AND descripcion_normalizada <> ''),
  CONSTRAINT filas_descripcion_normalizada_longitud_valida
    CHECK (char_length(descripcion_normalizada) <= 500),
  CONSTRAINT filas_referencia_bancaria_longitud_valida
    CHECK (referencia_bancaria IS NULL OR char_length(referencia_bancaria) <= 100),
  CONSTRAINT filas_estado_valido
    CHECK (estado IN ('pendiente_procesamiento','posible_duplicado','vinculada_existente','aceptada_como_nueva','rechazada')),
  CONSTRAINT filas_estado_coherente_con_conciliacion
    CHECK (
      (estado IN ('pendiente_procesamiento','posible_duplicado','rechazada') AND conciliacion_id IS NULL)
      OR (estado IN ('vinculada_existente','aceptada_como_nueva') AND conciliacion_id IS NOT NULL)
    ),
  CONSTRAINT filas_resolucion_coherente
    CHECK (
      (estado IN ('pendiente_procesamiento','posible_duplicado') AND resuelto_por IS NULL AND resuelto_en IS NULL)
      OR (estado IN ('vinculada_existente','aceptada_como_nueva','rechazada') AND resuelto_por IS NOT NULL AND resuelto_en IS NOT NULL)
    )
);

ALTER TABLE public.importacion_filas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "importacion_filas_select_por_empresa" ON public.importacion_filas
  FOR SELECT
  USING (empresa_id IN (SELECT public.mis_empresas()));

-- Sin politica de escritura -- reservado para la RPC de 9c.

-- ---------------------------------------------------------------------
-- 3. importacion_filas_candidatos -- relacional (no JSON), para que la
--    integridad referencial la garantice Postgres. Vacia hasta 9c.
-- ---------------------------------------------------------------------
CREATE TABLE public.importacion_filas_candidatos (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  importacion_fila_id uuid NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.contabot_empresas(id) ON DELETE CASCADE,
  conciliacion_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidatos_pkey PRIMARY KEY (id),
  CONSTRAINT candidatos_fila_misma_empresa
    FOREIGN KEY (importacion_fila_id, empresa_id) REFERENCES public.importacion_filas (id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT candidatos_conciliacion_misma_empresa
    FOREIGN KEY (conciliacion_id, empresa_id) REFERENCES public.conciliaciones_bancarias (id, empresa_id),
  CONSTRAINT candidatos_unico UNIQUE (importacion_fila_id, conciliacion_id)
);

ALTER TABLE public.importacion_filas_candidatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidatos_select_por_empresa" ON public.importacion_filas_candidatos
  FOR SELECT
  USING (empresa_id IN (SELECT public.mis_empresas()));

-- ---------------------------------------------------------------------
-- 4. iniciar_o_reintentar_importacion -- unica RPC de esta migracion.
--    Nunca recibe movimientos, nunca escribe importacion_filas ni
--    conciliaciones_bancarias.
-- ---------------------------------------------------------------------

-- No se usa mis_empresas() aqui dentro -- esa funcion no tiene su propio
-- SET search_path (replicada identica a produccion, ver PR 6/8/9a). Con
-- SET search_path = pg_catalog en esta RPC, una funcion anidada sin su
-- propio search_path heredaria el de quien la invoca y "usuarios_empresas"
-- dejaria de resolverse. La membresia se calcula aqui mismo, calificada.
CREATE FUNCTION public.iniciar_o_reintentar_importacion(
  p_cuenta_id uuid,
  p_hash_archivo text,
  p_nombre_archivo text,
  p_tamano_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
  v_existente public.importaciones_bancarias%ROWTYPE;
  v_importacion_id uuid;
  v_filas int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sin_autenticacion',
      'mensaje', 'Sesión no válida.');
  END IF;

  IF p_hash_archivo IS NULL OR p_hash_archivo !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'hash_invalido',
      'mensaje', 'El hash del archivo no tiene un formato válido.');
  END IF;

  IF p_nombre_archivo IS NULL OR trim(p_nombre_archivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'nombre_invalido',
      'mensaje', 'El nombre del archivo es obligatorio.');
  END IF;

  IF char_length(p_nombre_archivo) > 255 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'nombre_demasiado_largo',
      'mensaje', 'El nombre del archivo no puede superar 255 caracteres.');
  END IF;

  IF p_tamano_bytes IS NULL OR p_tamano_bytes <= 0 OR p_tamano_bytes > 10485760 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'tamano_invalido',
      'mensaje', 'El archivo debe pesar entre 1 byte y 10 MB.');
  END IF;

  -- Autorizacion y derivacion de empresa_id en la MISMA consulta -- mismo
  -- principio que actualizar_cuenta_bancaria y confirmar_cruce_factura.
  -- p_cuenta_id nunca implica empresa_id como parametro propio: se deriva,
  -- nunca se confia en lo que mande el cliente. banco ya no se deriva aqui
  -- -- la tabla no lo almacena (correccion 2); se obtiene via JOIN a
  -- cuentas_bancarias cuando haga falta mostrarlo.
  SELECT cb.empresa_id INTO v_empresa_id
  FROM public.cuentas_bancarias cb
  WHERE cb.id = p_cuenta_id
    AND EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id = v_user_id
        AND ue.activo = true
        AND ue.empresa_id = cb.empresa_id
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'cuenta_no_encontrada_o_sin_permiso',
      'mensaje', 'No se encontró la cuenta o no tienes acceso a ella.');
  END IF;

  -- Importacion activa (procesando/completada) con el mismo hash, para
  -- esta empresa+cuenta. FOR UPDATE bloquea esta fila especifica contra
  -- otra sesion que intente la misma transicion simultaneamente -- el
  -- INSERT de abajo, protegido por el indice parcial + EXCEPTION, es el
  -- backstop real para el caso en que NINGUNA sesion encuentre fila aqui.
  SELECT * INTO v_existente
  FROM public.importaciones_bancarias ib
  WHERE ib.empresa_id = v_empresa_id
    AND ib.cuenta_id = p_cuenta_id
    AND ib.hash_archivo = p_hash_archivo
    AND ib.estado IN ('procesando', 'completada')
  ORDER BY ib.subido_en DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existente.estado = 'completada' THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'ya_importado',
        'mensaje', 'Este archivo ya fue importado.',
        'importacion_id', v_existente.id);
    END IF;

    -- procesando: solo se reintenta si quedo abandonada (sin actividad
    -- hace mas de 15 minutos). Si sigue vigente, se rechaza.
    IF v_existente.actualizado_en >= now() - interval '15 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'importacion_en_curso',
        'mensaje', 'Hay una importación de este archivo en curso.',
        'importacion_id', v_existente.id);
    END IF;

    -- GET DIAGNOSTICS + aborto controlado -- mismo principio defensivo que
    -- confirmar_cruce_factura y actualizar_cuenta_bancaria (hallazgo de
    -- revision: esta fila ya esta bajo el FOR UPDATE tomado arriba, asi que
    -- 0 filas afectadas es teoricamente inalcanzable, pero se verifica en
    -- vez de asumirlo -- si algun cambio futuro rompe esa garantia de lock,
    -- esto lo revela con un error explicito en vez de fallar en silencio).
    UPDATE public.importaciones_bancarias
    SET estado = 'fallida', actualizado_en = now()
    WHERE id = v_existente.id AND estado = 'procesando';
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'UPDATE de recuperacion de importacion abandonada afecto % filas, se esperaba 1 (importacion %)', v_filas, v_existente.id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.importaciones_bancarias (
      empresa_id, cuenta_id, usuario_id,
      nombre_archivo, tamano_bytes, hash_archivo, estado, actualizado_en
    ) VALUES (
      v_empresa_id, p_cuenta_id, v_user_id,
      trim(p_nombre_archivo), p_tamano_bytes, p_hash_archivo, 'procesando', now()
    )
    RETURNING id INTO v_importacion_id;
  EXCEPTION WHEN unique_violation THEN
    -- Carrera real: otra sesion gano el indice parcial entre nuestro SELECT
    -- y este INSERT. Se reporta como el mismo caso "en curso", nunca como
    -- un error crudo de Postgres.
    RETURN jsonb_build_object('ok', false, 'codigo', 'importacion_en_curso',
      'mensaje', 'Otra sesión ya está procesando este archivo.');
  END;

  RETURN jsonb_build_object('ok', true, 'importacion_id', v_importacion_id);
END;
$function$;

ALTER FUNCTION public.iniciar_o_reintentar_importacion(uuid, text, text, bigint) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.iniciar_o_reintentar_importacion(uuid, text, text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iniciar_o_reintentar_importacion(uuid, text, text, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.iniciar_o_reintentar_importacion(uuid, text, text, bigint) TO authenticated;

COMMIT;

-- ROLLBACK -- SOLO VALIDO EN UN ENTORNO DE PREPRODUCCION SIN DATOS REALES
-- creados por esta migracion (estas 3 tablas quedan vacias mientras nadie
-- haya llamado iniciar_o_reintentar_importacion todavia). Con datos reales,
-- no se revierte destructivamente -- forward-fix.
--
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.iniciar_o_reintentar_importacion(uuid, text, text, bigint) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.iniciar_o_reintentar_importacion(uuid, text, text, bigint);
-- DROP TABLE IF EXISTS public.importacion_filas_candidatos;
-- DROP TABLE IF EXISTS public.importacion_filas;
-- DROP TABLE IF EXISTS public.importaciones_bancarias;
-- ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS conciliaciones_id_empresa_unico;
-- COMMIT;
