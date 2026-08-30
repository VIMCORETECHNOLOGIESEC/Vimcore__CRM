-- Bloque C (Etapa 3) — RLS de Postgres como última línea de defensa +
-- CAS en asignación (spec §1/§2, design D1-D5).
--
-- Orden de esta migración (no reordenar):
--   1. Columnas nuevas (`leads.version`, `empresa_id` denormalizado en
--      citas/lead_eventos/notificaciones) + backfill.
--   2. Nuevo valor de enum `tipo_notificacion.ASIGNACION_CONFLICTO`.
--   3. Rol de bypass `crm_bypass_jobs` (idempotente).
--   4. RLS: ENABLE + FORCE + CREATE POLICY por tabla tenant-scoped.
--   5. Rol de aplicación no-superusuario `crm_app` (D8, sin contraseña —
--      la contraseña se fija en tiempo de arranque del contenedor, nunca
--      en esta migración versionada).

-- ============================================================
-- 1. Columnas nuevas + backfill
-- ============================================================

-- AlterTable: leads.version (CAS, spec §4)
ALTER TABLE "leads" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: citas.empresa_id (denormalizado desde leads, D4)
ALTER TABLE "citas" ADD COLUMN "empresa_id" UUID;
UPDATE "citas" c SET "empresa_id" = l."empresa_id"
  FROM "leads" l WHERE l."id" = c."lead_id";
ALTER TABLE "citas" ALTER COLUMN "empresa_id" SET NOT NULL;
ALTER TABLE "citas" ADD CONSTRAINT "citas_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "citas_empresa_id_idx" ON "citas"("empresa_id");

-- AlterTable: lead_eventos.empresa_id (denormalizado desde leads, D4)
ALTER TABLE "lead_eventos" ADD COLUMN "empresa_id" UUID;
UPDATE "lead_eventos" le SET "empresa_id" = l."empresa_id"
  FROM "leads" l WHERE l."id" = le."lead_id";
ALTER TABLE "lead_eventos" ALTER COLUMN "empresa_id" SET NOT NULL;
ALTER TABLE "lead_eventos" ADD CONSTRAINT "lead_eventos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_lead_eventos_empresa" ON "lead_eventos"("empresa_id");

-- AlterTable: notificaciones.empresa_id (denormalizado desde leads cuando hay
-- lead_id; NULL = holding-wide, mismo convenio ya existente en
-- notificacion.repository.ts::findActiveRecipientIds, D4).
ALTER TABLE "notificaciones" ADD COLUMN "empresa_id" UUID;
UPDATE "notificaciones" n SET "empresa_id" = l."empresa_id"
  FROM "leads" l WHERE l."id" = n."lead_id";
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_notificaciones_empresa" ON "notificaciones"("empresa_id");

-- ============================================================
-- 2. Nuevo valor de enum (spec §4 "Exhaustion notifies actor and supervisor")
-- ============================================================

ALTER TYPE "tipo_notificacion" ADD VALUE IF NOT EXISTS 'ASIGNACION_CONFLICTO';

-- ============================================================
-- 3. Rol de bypass — spec §2 "Single audited bypass role"
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_bypass_jobs') THEN
    CREATE ROLE "crm_bypass_jobs" NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- El rol de aplicación (CURRENT_USER en tiempo de migración — la misma
-- credencial que usa la pool de conexiones HTTP, spec §2 "Bypass role
-- unreachable from HTTP") se vuelve MIEMBRO de crm_bypass_jobs para poder
-- `SET LOCAL ROLE crm_bypass_jobs` (D1, diseño) — nunca al revés. Ningún
-- camino HTTP ejecuta ese SET LOCAL; solo `lib/prisma.ts::runAsBypassJob`,
-- invocado por los dos call sites nombrados en D1.
GRANT "crm_bypass_jobs" TO CURRENT_USER;

-- crm_bypass_jobs necesita privilegios de tabla propios (BYPASSRLS solo
-- salta la política, no el GRANT normal) sobre las tablas tenant-scoped que
-- sus tres jobs autorizados leen/escriben (batch 3: se sumó verificacion-token.service.ts). `usuarios` no es tenant-scoped
-- (sin RLS) pero los jobs autorizados la leen (`findActiveRecipientById`,
-- `usuarioRepository.findActivosPorRol`) — sin este GRANT, un rol nuevo sin
-- privilegios heredados no puede ni siquiera hacer SELECT sobre ella.
GRANT USAGE ON SCHEMA public TO "crm_bypass_jobs";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "leads", "membresias", "bridges", "citas", "lead_eventos", "notificaciones"
  TO "crm_bypass_jobs";
-- `usuarios`/`clientes`/`bridge_logs` no son tenant-scoped (sin RLS) pero
-- los jobs autorizados los leen/escriben como parte de su flujo normal
-- (`findActiveRecipientById`, `usuarioRepository.findActivosPorRol`,
-- `LEAD_RELACIONES_INCLUDE` en `lead.repository.ts::findById` trae
-- `cliente`/`asesor`/`vendedor`, `registrarBridgeLog` escribe `bridge_logs`)
-- — sin estos GRANTs, un rol nuevo sin privilegios heredados no puede ni
-- siquiera hacer SELECT/INSERT sobre ellas.
-- UPDATE en `usuarios` (no solo SELECT): `assignAutomatically` ->
-- `applyAsignacion` -> `usuarioRepository.updateUltimaAsignacion`/
-- `updateUltimaAsignacionBulk` escriben `usuarios.ultima_asignacion_en`
-- dentro del mismo flujo bajo `crm_bypass_jobs`.
GRANT SELECT, UPDATE ON "usuarios" TO "crm_bypass_jobs";
GRANT SELECT ON "clientes" TO "crm_bypass_jobs";
GRANT SELECT, INSERT ON "bridge_logs" TO "crm_bypass_jobs";
-- DEVIATION (batch 3 discovery): tercer job autorizado bajo `crm_bypass_jobs`
-- — `verificacion-token.service.ts::produceAlertaTokenPorExpirar`
-- (`jobs/verificacion-token.job.ts`) — lee (`listPorExpirar`, incluyendo el
-- `bridge` requerido) y escribe (`updateAlertaExpiracionParaEn`)
-- `cuentas_publicitarias`, no tenant-scoped (sin RLS) pero sin GRANT propio
-- para este rol antes de este cambio.
GRANT SELECT, UPDATE ON "cuentas_publicitarias" TO "crm_bypass_jobs";

-- ============================================================
-- 4. RLS — spec §1 "Policy coverage is complete" / "Fail-closed without
--    tenant context" / "Writes cannot cross the company boundary"
-- ============================================================
--
-- NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid (no un
-- cast directo) — gotcha de Postgres confirmado empíricamente (batch 2,
-- descubierto solo al ejecutar bajo `crm_app`/D8, enmascarado antes por el
-- bypass de superusuario): una vez que una GUC custom fue fijada con
-- `SET LOCAL` en CUALQUIER transacción de la sesión, transacciones
-- posteriores en la MISMA conexión pooled que NUNCA llaman `SET LOCAL` (sin
-- contexto de tenant, caso fail-closed) ven `current_setting(..., true)`
-- devolver STRING VACÍO (''), no NULL — a pesar de que el valor "LOCAL" en
-- sí no sobrevive al commit/rollback de esa transacción anterior (eso sigue
-- siendo cierto). `''::uuid` lanza un error real de Postgres
-- ("invalid input syntax for type uuid"), lo que rompía la query entera en
-- vez de simplemente no devolver filas — sigue siendo fail-closed en la
-- práctica (cero filas visibles) pero viola el contrato de la tarea 2.1
-- ("ni error, ni tabla completa"). `NULLIF(..., '')` normaliza ese caso a
-- NULL antes del cast, así que la comparación `empresa_id = NULL` es NULL
-- (falsy) sin lanzar excepción.

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leads" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

-- DEVIATION (batch 3 discovery, D2 gap closure): tercera rama
-- `usuario_id = app.tenant_bootstrap_usuario_id` — sin ella,
-- `require-authentication.middleware.ts::resolverEmpresaId` no puede leer
-- las `Membresia` activas del usuario YA AUTENTICADO (JWT verificado) para
-- decidir su `empresaId`, porque en ese punto `app.tenant_empresa_id`
-- todavía no existe (es justamente lo que se está resolviendo) y
-- `crm_bypass_jobs` está prohibido en cualquier camino HTTP (spec §2). El
-- GUC dedicado `app.tenant_bootstrap_usuario_id` (fijado únicamente por
-- `lib/prisma.ts::withBootstrapUsuarioGuc`, nunca por request/cliente
-- directo) acota esta rama a ver solo las filas de ESE usuario exacto, nunca
-- una tabla completa ni otro usuario — el rol de conexión sigue siendo
-- `crm_app`.
ALTER TABLE "membresias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membresias" FORCE ROW LEVEL SECURITY;
-- DEVIATION (batch 3 discovery, D2 gap closure, segunda rama): mismo
-- razonamiento que la rama `usuario_id` de arriba, pero para
-- `auth.service.ts::login` (dual-login-routing) — necesita leer `Membresia`
-- por `correo` ANTES de saber a qué `usuarioId` pertenece (login es
-- exactamente el paso que resuelve esa identidad, todavía sin JWT). Acotada
-- por `correo` (columna UNIQUE), nunca expone más de una fila.
CREATE POLICY "tenant_isolation" ON "membresias" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  OR "usuario_id" = NULLIF(current_setting('app.tenant_bootstrap_usuario_id', true), '')::uuid
  OR "correo" = NULLIF(current_setting('app.tenant_bootstrap_correo', true), '')
);

-- DEVIATION (batch 3 discovery, D2 gap closure, tercera variante): tercera
-- rama `clave_api_hash = app.tenant_bootstrap_clave_api_hash` — sin ella,
-- `require-bridge-key.middleware.ts` no puede leer el `Bridge` dueño de la
-- `X-Bridge-Key` recibida (todo el pipeline de ingesta Meta/Google Forms)
-- porque en ese punto no hay `TenantContext` ninguno todavía (es justamente
-- lo que esa lectura resuelve) y `crm_bypass_jobs` está prohibido en
-- cualquier camino HTTP (spec §2). Acotada a un hash exacto — nunca expone
-- más de una fila.
ALTER TABLE "bridges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bridges" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bridges" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  OR "clave_api_hash" = NULLIF(current_setting('app.tenant_bootstrap_clave_api_hash', true), '')
);

ALTER TABLE "citas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "citas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "citas" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "lead_eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_eventos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lead_eventos" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

-- notificaciones: tercera rama `empresa_id IS NULL` — mismo convenio
-- holding-wide ya existente en notificacion.repository.ts::findActiveRecipientIds
-- (design D4: "nullable only on Notificacion... mirroring findActiveRecipientIds's
-- existing empresaId: null = unrestricted convention"). El filtro por
-- destinatario real (usuarioId) lo sigue haciendo la capa de aplicación
-- (`listByUsuario`); esta política solo acota el límite de empresa.
ALTER TABLE "notificaciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notificaciones" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notificaciones" USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" IS NULL
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

-- ============================================================
-- 5. Rol de aplicación no-superusuario `crm_app` (D8)
-- ============================================================
--
-- Postgres ignora RLS/FORCE ROW LEVEL SECURITY para superusuarios de forma
-- incondicional. `crm_dev` (CURRENT_USER en tiempo de migración) es
-- superusuario, así que las políticas creadas arriba no protegen nada
-- mientras la aplicación siga conectando con esa credencial. `crm_app` es
-- la credencial de runtime real (spec §1, design D8): sin privilegios de
-- superusuario, sin BYPASSRLS directo (solo llega a `crm_bypass_jobs` via
-- membership explícito, igual que cualquier otro miembro).
--
-- Se crea SIN contraseña a propósito: los secretos no viven en migraciones
-- versionadas. `docker-compose.yml` fija la contraseña de forma idempotente
-- en cada arranque del contenedor `backend`, después de `prisma migrate
-- deploy` y antes de iniciar el servidor.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE "crm_app" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOBYPASSRLS NOREPLICATION;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO "crm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "crm_app";
-- Cubre tablas creadas por migraciones futuras (siempre corridas por el rol
-- admin) sin necesitar un GRANT manual adicional.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "crm_app";
-- Membership explícito (no heredado): habilita `SET LOCAL ROLE
-- crm_bypass_jobs` desde `lib/prisma.ts::runAsBypassJob`, nunca desde el
-- estado de sesión por defecto del rol de aplicación (D1).
GRANT "crm_bypass_jobs" TO "crm_app";

-- DEVIATION (fix batch 2, no anticipada por el texto original de D8):
-- `CURRENT_USER` en tiempo de migración (`crm_dev`/`POSTGRES_USER` en este
-- entorno, la imagen oficial de Postgres) es creado por el bootstrap de
-- `initdb` con TODOS los privilegios, incluido `BYPASSRLS=true` explícito
-- -- además de `SUPERUSER=true`. Esto hace que ese rol aparezca en
-- `SELECT rolname FROM pg_roles WHERE rolbypassrls` junto a
-- `crm_bypass_jobs`, violando el criterio de aceptación de la tarea 1.4/spec
-- §2 ("crm_bypass_jobs is the only bypass-capable role"). Es seguro revocar
-- el flag explícito: la evaluación de RLS en Postgres comprueba
-- `rolsuper OR rolbypassrls` -- el rol admin sigue bypassing RLS igual (por
-- ser superusuario, atributo que esta migración NO toca, ni podría sin
-- romper `prisma migrate deploy`), este `ALTER ROLE` solo hace que el flag
-- deje de ser redundante/engañoso. `CURRENT_USER` (no un nombre literal) por
-- portabilidad -- mismo patrón que `GRANT "crm_bypass_jobs" TO CURRENT_USER`
-- más arriba en esta misma migración.
ALTER ROLE CURRENT_USER NOBYPASSRLS;
