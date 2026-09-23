-- Explicit DML grants for the runtime role `crm_app` on every table created after
-- 20260827100000_rls_tenant_isolation.
--
-- That migration granted DML on the tables existing at the time and relied on
-- `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER` for future tables. Default
-- privileges only apply to objects created by that exact role, so in an
-- environment where later migrations ran under a different Postgres user these
-- tables were left with no privilege for `crm_app` (observed in production on
-- 2026-09-23: `42501 permission denied for table holdings` while provisioning a
-- company from `CompanyModuleSubscribed`).
--
-- None of these tables has a deliberately restricted grant, so each receives the
-- same SELECT/INSERT/UPDATE/DELETE the default privileges intended. Tables with a
-- deliberate restriction (e.g. `outbox_messages`, no DELETE) are NOT touched.
-- GRANT is idempotent: environments where the default privileges did apply are
-- unaffected.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "canales_manuales",
  "configuracion_empresa",
  "configuraciones_reporte",
  "conversaciones_lectura_whatsapp",
  "conversaciones_whatsapp",
  "conversaciones_whatsapp_eventos",
  "holdings",
  "linkedin_conexiones",
  "linkedin_formularios",
  "linkedin_fuentes",
  "linkedin_oauth_states",
  "mensajes_whatsapp",
  "oportunidad_eventos",
  "oportunidades",
  "productos",
  "reporte_jobs",
  "whatsapp_conexiones",
  "whatsapp_oauth_states"
TO "crm_app";

-- Re-register the default privileges for the role that runs migrations in this
-- environment, so tables created by future migrations are covered again. New
-- migrations should still grant explicitly (see 20260921170000_crm_outbox_messages).
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "crm_app";
