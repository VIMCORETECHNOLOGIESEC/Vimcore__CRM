-- D-mensajería (leído/no leído): watermark de lectura por (conversación,
-- usuario), no por mensaje -- ver el comentario del modelo `ConversacionLectura`
-- en schema.prisma para el criterio completo.

-- CreateTable
CREATE TABLE "conversaciones_lectura_whatsapp" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "leido_hasta_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversaciones_lectura_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_lectura_whatsapp_usuario_id_conversacion_id_key" ON "conversaciones_lectura_whatsapp"("usuario_id", "conversacion_id");

-- CreateIndex
CREATE INDEX "idx_conversaciones_lectura_empresa" ON "conversaciones_lectura_whatsapp"("empresa_id");

-- AddForeignKey
ALTER TABLE "conversaciones_lectura_whatsapp" ADD CONSTRAINT "conversaciones_lectura_whatsapp_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_lectura_whatsapp" ADD CONSTRAINT "conversaciones_lectura_whatsapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_lectura_whatsapp" ADD CONSTRAINT "conversaciones_lectura_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: tabla propia con empresa_id directo -- mismo patrón que
-- cuentas_anuncios_conexiones/cuentas_anuncios_oauth_states
-- (20260829210000_add_meta_ads_metrics). `crm_app` ya recibe
-- SELECT/INSERT/UPDATE/DELETE sobre esta tabla vía el
-- `ALTER DEFAULT PRIVILEGES` de 20260827100000_rls_tenant_isolation, no hace
-- falta un GRANT explícito acá.
ALTER TABLE "conversaciones_lectura_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversaciones_lectura_whatsapp" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "conversaciones_lectura_whatsapp"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
