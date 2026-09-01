-- Hallazgo (2026-09-01, durante el trabajo de leído/no leído):
-- conversaciones_whatsapp/conversaciones_whatsapp_eventos/mensajes_whatsapp
-- se crearon (20260829043249_add_whatsapp_messages) sin política RLS, a
-- diferencia de casi todo el resto del backend (leads, bridges, LinkedIn,
-- Meta Ads, negociación). No hay GRANT nuevo que hacer -- crm_app ya tiene
-- SELECT/INSERT/UPDATE/DELETE sobre estas tablas desde el
-- `ALTER DEFAULT PRIVILEGES` de 20260827100000_rls_tenant_isolation (cubre
-- toda tabla creada por una migración futura corrida por el mismo rol
-- admin). Verificado antes de este cambio: los 4 caminos que escriben en
-- estas tablas (webhook de WhatsApp, job de SLA, conversaciones.service.ts
-- autenticado, whatsapp-ruteo.service.ts) YA resuelven `TenantContext`
-- correctamente (`runWithTenantContext`) -- ninguno se rompe al forzar RLS.

-- conversaciones_whatsapp / conversaciones_whatsapp_eventos: empresa_id
-- directo -- mismo patrón que cuentas_anuncios_conexiones
-- (20260829210000_add_meta_ads_metrics).
ALTER TABLE "conversaciones_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversaciones_whatsapp" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "conversaciones_whatsapp"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "conversaciones_whatsapp_eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversaciones_whatsapp_eventos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "conversaciones_whatsapp_eventos"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

-- mensajes_whatsapp: sin empresa_id propio -- hereda el tenant vía
-- conversacion_id, mismo patrón EXISTS que linkedin_fuentes
-- (20260828170000_linkedin_rls_tenant_isolation).
ALTER TABLE "mensajes_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensajes_whatsapp" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "mensajes_whatsapp"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "conversaciones_whatsapp" c
    WHERE c."id" = "mensajes_whatsapp"."conversacion_id"
      AND c."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "conversaciones_whatsapp" c
    WHERE c."id" = "mensajes_whatsapp"."conversacion_id"
      AND c."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);
