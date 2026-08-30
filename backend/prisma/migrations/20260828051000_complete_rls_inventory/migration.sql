ALTER TABLE "bridge_logs" ADD COLUMN "empresa_id" UUID;
UPDATE "bridge_logs" bl
SET "empresa_id" = b."empresa_id"
FROM "bridges" b
WHERE b."id" = bl."bridge_id";
ALTER TABLE "bridge_logs"
  ADD CONSTRAINT "bridge_logs_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_bridge_logs_empresa" ON "bridge_logs"("empresa_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "respuestas_formulario",
  "leads_recibidos",
  "cuentas_publicitarias",
  "campanias",
  "bridge_logs",
  "leads_abiertos_revision_pendiente"
TO "crm_bypass_jobs";

DROP POLICY IF EXISTS "tenant_isolation" ON "leads";
CREATE POLICY "tenant_isolation" ON "leads"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

DROP POLICY IF EXISTS "tenant_isolation" ON "membresias";
CREATE POLICY "tenant_isolation" ON "membresias"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  OR "usuario_id" = NULLIF(current_setting('app.tenant_bootstrap_usuario_id', true), '')::uuid
  OR "correo" = NULLIF(current_setting('app.tenant_bootstrap_correo', true), '')
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

DROP POLICY IF EXISTS "tenant_isolation" ON "bridges";
CREATE POLICY "tenant_isolation" ON "bridges"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  OR "clave_api_hash" = NULLIF(current_setting('app.tenant_bootstrap_clave_api_hash', true), '')
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

DROP POLICY IF EXISTS "tenant_isolation" ON "citas";
CREATE POLICY "tenant_isolation" ON "citas"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

DROP POLICY IF EXISTS "tenant_isolation" ON "lead_eventos";
CREATE POLICY "tenant_isolation" ON "lead_eventos"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

DROP POLICY IF EXISTS "tenant_isolation" ON "notificaciones";
CREATE POLICY "tenant_isolation" ON "notificaciones"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" IS NULL
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" IS NULL
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "respuestas_formulario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "respuestas_formulario" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "respuestas_formulario"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "leads" l
    WHERE l."id" = "respuestas_formulario"."lead_id"
      AND l."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "leads" l
    WHERE l."id" = "respuestas_formulario"."lead_id"
      AND l."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "leads_recibidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads_recibidos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leads_recibidos"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "leads_recibidos"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "leads_recibidos"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "cuentas_publicitarias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cuentas_publicitarias" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cuentas_publicitarias"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "cuentas_publicitarias"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "cuentas_publicitarias"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "campanias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campanias" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "campanias"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "cuentas_publicitarias" cp
    JOIN "bridges" b ON b."id" = cp."bridge_id"
    WHERE cp."id" = "campanias"."cuenta_publicitaria_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "cuentas_publicitarias" cp
    JOIN "bridges" b ON b."id" = cp."bridge_id"
    WHERE cp."id" = "campanias"."cuenta_publicitaria_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "bridge_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bridge_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bridge_logs"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR ("empresa_id" IS NULL AND "bridge_id" IS NULL)
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR ("empresa_id" IS NULL AND "bridge_id" IS NULL)
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "leads_abiertos_revision_pendiente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads_abiertos_revision_pendiente" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leads_abiertos_revision_pendiente"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_ingesta_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_ingesta_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
