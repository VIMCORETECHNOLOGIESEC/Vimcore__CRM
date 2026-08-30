-- Fix (hallazgo real, no cosmetico, detectado escribiendo tests del modulo
-- negociacion): `productos`, `oportunidades` y `oportunidad_eventos` nacieron
-- en 20260829180602_add_negociacion_oportunidad_producto con columna
-- `empresa_id` pero SIN `ENABLE ROW LEVEL SECURITY` ni `CREATE POLICY` --
-- a diferencia de cada tabla tenant-scoped hermana de este mismo proyecto
-- (ver 20260828170000_linkedin_rls_tenant_isolation,
-- 20260829200000_add_reportes_module, 20260829210000_add_meta_ads_metrics).
-- Sin esto, el aislamiento entre empresas de estas tres tablas dependia
-- exclusivamente de los filtros de aplicacion (`aplicarFiltroEmpresa*`),
-- exactamente el punto unico de fallo que RLS existe para eliminar como
-- defensa en profundidad -- contradice la decision de arquitectura cerrada
-- "RLS real via rol crm_app" (AGENTS.md, Bloque C).
--
-- `crm_app` ya tiene SELECT/INSERT/UPDATE/DELETE sobre estas tres tablas via
-- el `ALTER DEFAULT PRIVILEGES` de 20260827100000_rls_tenant_isolation (se
-- crearon con el mismo CURRENT_USER admin) -- este fix solo agrega la
-- politica, no re-otorga privilegios que ya existen.

ALTER TABLE "productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "productos"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "oportunidades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oportunidades" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "oportunidades"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "oportunidad_eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oportunidad_eventos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "oportunidad_eventos"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
