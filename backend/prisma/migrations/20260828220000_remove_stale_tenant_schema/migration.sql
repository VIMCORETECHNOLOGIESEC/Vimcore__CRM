DROP POLICY IF EXISTS "tenant_isolation" ON "bridges";
DROP POLICY IF EXISTS "tenant_isolation" ON "citas";
DROP POLICY IF EXISTS "tenant_isolation" ON "lead_eventos";
DROP POLICY IF EXISTS "tenant_isolation" ON "leads";
DROP POLICY IF EXISTS "tenant_isolation" ON "notificaciones";

ALTER TABLE "bridges" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "citas" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_eventos" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "notificaciones" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "bridges" DROP COLUMN IF EXISTS "empresa_id";
ALTER TABLE "citas" DROP COLUMN IF EXISTS "empresa_id";
ALTER TABLE "lead_eventos" DROP COLUMN IF EXISTS "empresa_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "empresa_id";
ALTER TABLE "notificaciones" DROP COLUMN IF EXISTS "empresa_id";
ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "membresia_id";

DROP TABLE IF EXISTS "leads_abiertos_revision_pendiente";
DROP TABLE IF EXISTS "membresias";
DROP TABLE IF EXISTS "empresas";
DROP TYPE IF EXISTS "rol_membresia";
