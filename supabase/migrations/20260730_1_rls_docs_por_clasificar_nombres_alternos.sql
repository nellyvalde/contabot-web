-- Migration: Enable RLS on docs_por_clasificar and nombres_alternos.
-- Contexto: ambas tablas resultaron legibles sin autenticacion (anon key)
-- en una auditoria de seguridad (2026-07-30). El 100% del codigo que las
-- usa (app/api/procesar-email/route.ts) corre con Service Role Key, que
-- ignora RLS, asi que activar RLS aqui no cambia ningun comportamiento
-- de la aplicacion -- solo cierra el acceso anonimo/publico directo.
--
-- docs_por_clasificar: no tiene ninguna consulta desde el navegador en
-- todo el repositorio (solo INSERT desde el intake de correo, con
-- service role). Se deja SIN ninguna policy para anon/authenticated:
-- RLS sin policy deniega todo acceso a esos roles por defecto.
ALTER TABLE public.docs_por_clasificar ENABLE ROW LEVEL SECURITY;

-- nombres_alternos: solo se lee (nunca se escribe) desde
-- app/api/procesar-email/route.ts, tambien con service role. Igual que
-- docs_por_clasificar, hoy no tiene ningun consumidor desde el
-- navegador, asi que se deja SIN ninguna policy en vez de inventar un
-- alcance "por empresa" que ningun flujo real necesita todavia. Si en
-- el futuro se construye una pantalla de gestion de alias, en ese
-- momento se agrega la policy correspondiente (empresa_id ya existe en
-- la tabla, listo para reusar el patron de abonos_nomina /
-- mapeos_excel_nomina / whatsapp_numeros_autorizados).
ALTER TABLE public.nombres_alternos ENABLE ROW LEVEL SECURITY;

-- Nota: el intake de correo (app/api/procesar-email) usa la Service Role
-- Key, que bypassa RLS, por lo que sigue funcionando sin cambios. Sin
-- ninguna policy, ni anon ni authenticated pueden hacer SELECT, INSERT,
-- UPDATE ni DELETE desde el navegador sobre esta tabla.
