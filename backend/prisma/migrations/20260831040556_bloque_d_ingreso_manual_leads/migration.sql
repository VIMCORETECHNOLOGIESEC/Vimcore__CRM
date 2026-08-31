-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "origen_lead" ADD VALUE 'RECOMENDACION';
ALTER TYPE "origen_lead" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "canal_manual_id" UUID;

-- CreateTable
CREATE TABLE "canales_manuales" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canales_manuales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canales_manuales_empresa_id_nombre_key" ON "canales_manuales"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "idx_leads_canal_manual" ON "leads"("canal_manual_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_canal_manual_id_fkey" FOREIGN KEY ("canal_manual_id") REFERENCES "canales_manuales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canales_manuales" ADD CONSTRAINT "canales_manuales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"): RLS real
-- desde el primer día -- Prisma no genera esto solo, así se agrega a mano en
-- la misma migración que crea la tabla (a diferencia de `productos`/
-- `oportunidades`/`oportunidad_eventos`, que nacieron sin RLS y necesitaron
-- un fix aparte, ver 20260830020000_negociacion_rls_tenant_isolation). Mismo
-- patrón EXACTO de política que esa migración de fix -- `crm_app` ya tiene
-- SELECT/INSERT/UPDATE/DELETE sobre esta tabla vía el `ALTER DEFAULT
-- PRIVILEGES` de 20260827100000_rls_tenant_isolation (creada por el mismo
-- CURRENT_USER admin), así que este bloque solo agrega la política, no
-- re-otorga privilegios que ya existen.

ALTER TABLE "canales_manuales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canales_manuales" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "canales_manuales"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
