-- crm-gateway-proxy (CRM Gateway Trust, Explicit Admin Linking): additive
-- Auth<->CRM identity link. Nullable, no default, no backfill, no NOT NULL,
-- no FK -- every pre-existing row stays valid and unlinked. Postgres unique
-- indexes ignore NULLs.
ALTER TABLE "empresas" ADD COLUMN "auth_company_id" UUID;
ALTER TABLE "usuarios" ADD COLUMN "auth_user_id" UUID;

CREATE UNIQUE INDEX "idx_empresas_auth_company" ON "empresas"("auth_company_id");
CREATE UNIQUE INDEX "idx_usuarios_auth_user" ON "usuarios"("auth_user_id");
