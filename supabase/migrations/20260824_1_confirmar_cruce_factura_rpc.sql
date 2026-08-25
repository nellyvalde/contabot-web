-- Migration: RPC transaccional exclusiva para confirmar el cruce banco-factura
-- en Compras/Gastos, reemplazando la escritura directa desde el navegador
-- (facturas.update + estado local de React sin persistir) por una unica
-- funcion SECURITY DEFINER que hace ambas escrituras (facturas.estado y
-- conciliaciones_bancarias.estado) en una sola transaccion atomica.
--
-- Contexto: hoy app/bancos/page.tsx (confirmarCruce) actualiza facturas.estado
-- desde el navegador y nunca escribe conciliaciones_bancarias.estado -- por
-- eso "Confirmado" solo vive en React y desaparece al recargar. Ademas,
-- conciliaciones_bancarias no tiene ninguna politica RLS de UPDATE, asi que
-- un UPDATE directo desde el cliente afectaria 0 filas de todas formas.
--
-- Se elige una RPC de un solo proposito (no una politica UPDATE generica)
-- porque RLS no puede restringir COLUMNAS: una politica UPDATE basada en
-- mis_empresas() permitiria a cualquier miembro autenticado, via una llamada
-- directa a la API (sin pasar por la UI), reasignar empresa_id entre sus
-- propias empresas, falsificar documento_id/nomina_id, o reescribir
-- movimiento_valor/fecha/descripcion -- el registro original del extracto
-- bancario. Esta funcion solo permite UNA transicion de estado especifica
-- (encontrado -> confirmado, junto con Pendiente|Vencido -> Pagado en la
-- factura asociada), sin exponer ninguna otra columna a modificacion.
--
-- Alcance exclusivo de facturas/Compras-Gastos: si la conciliacion tiene
-- nomina_id en vez de documento_id, se rechaza explicitamente (codigo
-- ruta_nomina). No se toca lib/nomina/abonos.ts, nomina_programada,
-- abonos_nomina, ni el flujo de confirmarCruce para nomina.
--
-- Diseño revisado en varias rondas de auditoria de solo lectura contra
-- produccion (proyecto contabot, project_ref wuvckixocqetjcjdhiwn) antes de
-- escribir esta migracion:
--
-- * FOR UPDATE / FOR SHARE: usar NOT FOUND despues de cada SELECT ... INTO,
--   nunca "record IS NULL" (semantica inesperada con columnas nullable).
--
-- * Autorizacion integrada en el mismo SELECT que toma el lock de la
--   conciliacion (no lock-primero-verificar-despues): evita que un
--   authenticated que conozca un UUID ajeno pueda tomar un lock sobre una
--   fila de otra empresa antes de ser rechazado. El resultado es un codigo
--   generico "no_encontrada_o_sin_permiso" que no distingue "no existe" de
--   "existe pero no es tuya" -- esa distincion solo se prueba
--   administrativamente en contabot-rls-test, nunca se expone al usuario.
--   Mismo principio aplicado al lock de la factura: se busca directamente
--   por id = documento_id AND empresa_id = conciliacion.empresa_id, sin
--   revelar si existe una factura con ese id en otra empresa.
--
-- * empresa_id de la conciliacion es nullable en produccion -- se rechaza
--   explicitamente antes de evaluar membresia (NOT EXISTS sobre
--   mis_empresas(), no NOT IN, que con NULL puede no entrar al IF).
--
-- * Orden de validacion: autenticacion -> lock+autorizacion de la
--   conciliacion -> lock del periodo -> validacion documento_id/nomina_id
--   (corre SIEMPRE, incluso si la fila ya esta confirmada) -> lock+igualdad
--   de empresa de la factura -> SOLO DESPUES se evalua idempotencia/estado.
--   Esto evita que una conciliacion "confirmada" corrupta que apunte a una
--   factura de otra empresa se devuelva como exito solo porque encontro
--   una factura Pagado.
--
-- * Orden de locks: conciliacion -> periodo (FOR SHARE) -> factura, siempre
--   en el mismo orden sin importar la rama de ejecucion, para no introducir
--   riesgo de deadlock. cerrarPeriodo (app/bancos/page.tsx) solo toca la
--   tabla de periodos con un unico UPSERT, nunca conciliaciones ni facturas,
--   asi que no puede participar en un ciclo de espera -- en el peor caso
--   espera a que esta funcion termine, nunca al reves.
--
-- * Auditoria de produccion (solo lectura, antes de esta migracion) sobre
--   las 289 conciliaciones existentes: 0 con periodo NULL, 0 con periodo sin
--   fila correspondiente entre las que estan en 'encontrado'/'confirmado'
--   (108 huerfanas de periodo existen, pero ninguna en esos dos estados),
--   0 con periodo cerrado entre 'encontrado'/'confirmado', 0 con formato de
--   periodo invalido. Rechazar periodo NULL/inexistente/cerrado no afecta
--   ninguna fila real existente.
--
-- * Estados de origen validos para facturas.estado -> 'Pagado': 'Pendiente'
--   y 'Vencido' (decision de negocio confirmada: una factura Vencido puede
--   pagarse legitimamente). Auditoria de produccion sobre 55 facturas:
--   Pendiente=28, Pagado=24, Vencido=3 -- no existe ningun otro valor.
--   'Pagado' solo se acepta en la rama idempotente, cuando la conciliacion
--   YA esta 'confirmado'; si la conciliacion sigue en 'encontrado' y la
--   factura ya esta 'Pagado' (por otra conciliacion), se rechaza como
--   factura_ya_pagada.
--
-- * PENDIENTE PARA UN PR FUTURO (no se toca aqui, sin mezclar cambios):
--   cruzarConDocumentos (app/bancos/page.tsx) hoy solo busca facturas con
--   estado='Pendiente' al armar los candidatos de cruce -- nunca ofrece una
--   factura 'Vencido' como coincidencia en primer lugar, aunque esta RPC ya
--   la aceptaria si llegara. Ampliar esa busqueda para incluir 'Vencido' es
--   un cambio de UI/matching, documentado como obligatorio para el PR 3
--   (emparejamiento uno-a-uno), no de esta migracion.
--
-- * GET DIAGNOSTICS ROW_COUNT despues de cada UPDATE, sin ningun bloque
--   EXCEPTION WHEN OTHERS que pueda ocultar un fallo real: si algo falla,
--   la excepcion se propaga sin capturar y Postgres revierte automaticamente
--   ambos UPDATE al abortar la transaccion completa de la llamada RPC.
--
-- * SET search_path = pg_catalog (sin "public"): todos los objetos se
--   referencian completamente calificados dentro del cuerpo de la funcion,
--   asi que no se necesita "public" en el search_path.
--
-- * Propietario: postgres, confirmado por evidencia directa, no supuesto --
--   mis_empresas() es propiedad de postgres, las tres tablas que esta
--   funcion toca (facturas, conciliaciones_bancarias,
--   periodos_conciliacion_bancaria) son propiedad de postgres, y
--   current_user/session_user de la sesion que aplica esta migracion
--   tambien es postgres.

BEGIN;

CREATE FUNCTION public.confirmar_cruce_factura(p_conciliacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_conciliacion    public.conciliaciones_bancarias%ROWTYPE;
  v_factura         public.facturas%ROWTYPE;
  v_periodo_cerrado boolean;
  v_filas           int;
BEGIN
  -- 1. Autenticacion.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sin_autenticacion',
      'mensaje', 'Sesión no válida.');
  END IF;

  -- 2. Lock + autorizacion de la conciliacion en UNA sola sentencia. No se
  --    toma el lock primero y se verifica membresia despues -- eso
  --    permitiria a un authenticated con un UUID ajeno bloquear una fila de
  --    otra empresa antes del rechazo. empresa_id NULL tambien cae aqui
  --    (la condicion "empresa_id IS NOT NULL" lo excluye del match).
  --    No se usa public.mis_empresas() aqui: esa funcion no tiene su propio
  --    SET search_path (se replico identica a produccion, sin modificarla,
  --    con "from usuarios_empresas" sin calificar). Con SET search_path =
  --    pg_catalog en esta RPC, una funcion anidada sin su propio search_path
  --    hereda el de quien la invoca -- "usuarios_empresas" dejaria de
  --    resolverse y mis_empresas() fallaria en cada llamada (confirmado
  --    empiricamente en contabot-rls-test: 42P01 relation "usuarios_empresas"
  --    does not exist). La membresia se calcula aqui mismo, calificada.
  SELECT c.* INTO v_conciliacion
  FROM public.conciliaciones_bancarias c
  WHERE c.id = p_conciliacion_id
    AND c.empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid()
        AND ue.activo = true
        AND ue.empresa_id = c.empresa_id
    )
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrada_o_sin_permiso',
      'mensaje', 'No se encontró la conciliación o no tienes acceso a ella.');
  END IF;

  -- 3. Lock del periodo (FOR SHARE -- solo se necesita lectura consistente
  --    de "cerrado" durante la transaccion, no bloquear su modificacion
  --    entre transacciones concurrentes que solo leen). Segunda posicion
  --    del orden de locks conciliacion -> periodo -> factura, siempre en
  --    esta posicion sin importar el estado de la conciliacion.
  SELECT p.cerrado INTO v_periodo_cerrado
  FROM public.periodos_conciliacion_bancaria p
  WHERE p.empresa_id = v_conciliacion.empresa_id
    AND p.periodo = v_conciliacion.periodo
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'periodo_inexistente',
      'mensaje', 'No se encontró el periodo de esta conciliación.');
  END IF;

  -- 4. Validacion estructural documento_id/nomina_id. Corre SIEMPRE, sin
  --    importar el estado actual, para que una fila ya confirmada pero
  --    corrupta no se salte esta verificacion.
  IF v_conciliacion.documento_id IS NOT NULL AND v_conciliacion.nomina_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'anomalia_documento_y_nomina',
      'mensaje', 'La conciliación tiene documento_id y nomina_id a la vez. Contacta soporte.');
  END IF;

  IF v_conciliacion.documento_id IS NULL AND v_conciliacion.nomina_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ruta_nomina',
      'mensaje', 'Esta conciliación corresponde a nómina, no a facturas.');
  END IF;

  IF v_conciliacion.documento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sin_documento',
      'mensaje', 'Esta conciliación no tiene una factura asociada.');
  END IF;

  -- 5. Lock de la factura, restringido por id Y empresa_id en la misma
  --    condicion -- no se bloquea cualquier factura por id para comparar la
  --    empresa despues; eso revelaria la existencia de una factura ajena.
  --    Tercera y ultima posicion del orden de locks.
  SELECT f.* INTO v_factura
  FROM public.facturas f
  WHERE f.id = v_conciliacion.documento_id
    AND f.empresa_id = v_conciliacion.empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'factura_no_encontrada_o_inconsistente',
      'mensaje', 'La factura asociada no existe o no es consistente con esta conciliación.');
  END IF;

  -- 6. Idempotencia/estado -- solo se evalua aqui, con toda la integridad
  --    estructural ya verificada arriba (documento_id valido, factura de la
  --    misma empresa).
  IF v_conciliacion.estado = 'confirmado' THEN
    IF v_factura.estado = 'Pagado' THEN
      RETURN jsonb_build_object('ok', true, 'codigo', 'ya_confirmada',
        'mensaje', 'Esta conciliación ya estaba confirmada.',
        'conciliacion_id', v_conciliacion.id, 'factura_id', v_factura.id,
        'estado_conciliacion', 'confirmado', 'estado_factura', 'Pagado');
    ELSE
      -- Estado inconsistente entre conciliacion y factura -- no deberia ser
      -- alcanzable dado que ambas escrituras van en la misma transaccion.
      -- No se repara en silencio, se reporta para investigar.
      RETURN jsonb_build_object('ok', false, 'codigo', 'inconsistencia_detectada',
        'mensaje', 'Estado inconsistente entre conciliación y factura. Contacta soporte.',
        'conciliacion_id', v_conciliacion.id, 'factura_id', v_factura.id);
    END IF;
  END IF;

  IF v_conciliacion.estado <> 'encontrado' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'estado_invalido',
      'mensaje', format('No se puede confirmar una conciliación en estado %L.', v_conciliacion.estado));
  END IF;

  -- 7. Reglas de negocio exclusivas de la rama "encontrado" (transicion
  --    fresca, no idempotente). El cierre del periodo no bloquea la
  --    reproduccion idempotente de una confirmacion ya exitosa -- solo
  --    bloquea confirmaciones nuevas.
  IF v_periodo_cerrado THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'periodo_cerrado',
      'mensaje', 'El periodo de esta conciliación está cerrado.');
  END IF;

  IF v_factura.estado = 'Pagado' THEN
    -- La factura ya fue pagada por otra via/conciliacion -- esta
    -- conciliacion especifica nunca fue la que lo hizo.
    RETURN jsonb_build_object('ok', false, 'codigo', 'factura_ya_pagada',
      'mensaje', 'Esta factura ya fue marcada como pagada por otro movimiento.');
  END IF;

  IF v_factura.estado NOT IN ('Pendiente', 'Vencido') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'factura_estado_no_transicionable',
      'mensaje', format('La factura está en estado %L y no puede confirmarse.', v_factura.estado));
  END IF;

  -- 8. Las dos escrituras reales. Sin bloque EXCEPTION alrededor: si
  --    cualquiera falla o afecta un numero de filas inesperado, la
  --    excepcion se propaga sin capturar y Postgres revierte AMBAS al
  --    abortar la transaccion completa de la llamada RPC.
  UPDATE public.facturas
  SET estado = 'Pagado'
  WHERE id = v_factura.id
    AND empresa_id = v_conciliacion.empresa_id
    AND estado IN ('Pendiente', 'Vencido');
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'UPDATE en facturas afectó % filas, se esperaba 1 (factura %)', v_filas, v_factura.id;
  END IF;

  UPDATE public.conciliaciones_bancarias
  SET estado = 'confirmado'
  WHERE id = v_conciliacion.id
    AND empresa_id = v_conciliacion.empresa_id
    AND estado = 'encontrado'
    AND documento_id = v_factura.id
    AND nomina_id IS NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'UPDATE en conciliaciones_bancarias afectó % filas, se esperaba 1 (conciliación %)', v_filas, v_conciliacion.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'codigo', 'ok',
    'mensaje', 'Cruce confirmado.',
    'conciliacion_id', v_conciliacion.id, 'factura_id', v_factura.id,
    'estado_conciliacion', 'confirmado', 'estado_factura', 'Pagado');
END;
$function$;

ALTER FUNCTION public.confirmar_cruce_factura(uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.confirmar_cruce_factura(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirmar_cruce_factura(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_cruce_factura(uuid) TO authenticated;

COMMIT;

-- ROLLBACK -- exacto, no toca datos ni politicas existentes. Elimina
-- unicamente la funcion nueva de esta migracion.
--
-- REVOKE EXECUTE ON FUNCTION public.confirmar_cruce_factura(uuid) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.confirmar_cruce_factura(uuid);
