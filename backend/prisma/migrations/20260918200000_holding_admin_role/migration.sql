-- holding-admin-gateway-auth: explicit holding-administrator role plus the
-- user-to-holding link. Additive only; PostgreSQL cannot drop enum values, so
-- there is no `down` (same criterion as 20260829190000_bloque_f_holding_roles).
--
-- Schema only. The backfill that USES the new enum value lives in
-- 20260918200100_holding_admin_backfill: a value added by `ADD VALUE` cannot be
-- used in the same transaction that added it.
ALTER TYPE "rol_usuario" ADD VALUE 'ADMINISTRADOR_HOLDING';

-- A holding-scoped user (ADMINISTRADOR_HOLDING / SUPERVISOR_HOLDING) belongs to
-- exactly one holding. Nullable: company users and SUPER_ADMIN have none.
ALTER TABLE "usuarios" ADD COLUMN "holding_id" UUID;

CREATE INDEX "idx_usuarios_holding" ON "usuarios"("holding_id");

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: `holdings` is an identity table like `empresas`/`usuarios`/`membresias`
-- (no RLS, not in the tenant inventory). `crm_app` already has DML on it through
-- the `ALTER DEFAULT PRIVILEGES` of 20260827100000_rls_tenant_isolation.
