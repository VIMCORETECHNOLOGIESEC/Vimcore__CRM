-- LinkedIn Lead Sync hereda el tenant desde Bridge. Una conexión contiene
-- múltiples fuentes/formularios, pero todas permanecen dentro de la empresa
-- propietaria del único Bridge asociado.

ALTER TABLE "linkedin_conexiones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "linkedin_conexiones" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "linkedin_conexiones"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "linkedin_conexiones"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "linkedin_conexiones"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "linkedin_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "linkedin_oauth_states" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "linkedin_oauth_states"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "linkedin_oauth_states"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "bridges" b
    WHERE b."id" = "linkedin_oauth_states"."bridge_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "linkedin_fuentes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "linkedin_fuentes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "linkedin_fuentes"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1
    FROM "linkedin_conexiones" lc
    JOIN "bridges" b ON b."id" = lc."bridge_id"
    WHERE lc."id" = "linkedin_fuentes"."conexion_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1
    FROM "linkedin_conexiones" lc
    JOIN "bridges" b ON b."id" = lc."bridge_id"
    WHERE lc."id" = "linkedin_fuentes"."conexion_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "linkedin_formularios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "linkedin_formularios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "linkedin_formularios"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1
    FROM "linkedin_fuentes" lf
    JOIN "linkedin_conexiones" lc ON lc."id" = lf."conexion_id"
    JOIN "bridges" b ON b."id" = lc."bridge_id"
    WHERE lf."id" = "linkedin_formularios"."fuente_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1
    FROM "linkedin_fuentes" lf
    JOIN "linkedin_conexiones" lc ON lc."id" = lf."conexion_id"
    JOIN "bridges" b ON b."id" = lc."bridge_id"
    WHERE lf."id" = "linkedin_formularios"."fuente_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);
