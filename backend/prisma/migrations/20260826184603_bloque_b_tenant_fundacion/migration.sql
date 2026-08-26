-- CreateEnum
CREATE TYPE "rol_membresia" AS ENUM ('ADMINISTRADOR', 'SUPERVISOR', 'ASESOR');

-- AlterTable
ALTER TABLE "bridges" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "membresia_id" UUID;

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "rol" "rol_membresia" NOT NULL,
    "habilitado_para_venta" BOOLEAN NOT NULL DEFAULT false,
    "correo" CITEXT,
    "password_hash" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads_abiertos_revision_pendiente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "lead_abierto_id" UUID NOT NULL,
    "empresa_lead_id" UUID NOT NULL,
    "empresa_ingesta_id" UUID NOT NULL,
    "detectado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "resuelto_en" TIMESTAMPTZ(6),

    CONSTRAINT "leads_abiertos_revision_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membresias_correo_key" ON "membresias"("correo");

-- CreateIndex
CREATE INDEX "membresias_usuario_id_activa_idx" ON "membresias"("usuario_id", "activa");

-- CreateIndex
CREATE INDEX "membresias_empresa_id_rol_idx" ON "membresias"("empresa_id", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_usuario_id_empresa_id_rol_key" ON "membresias"("usuario_id", "empresa_id", "rol");

-- CreateIndex
CREATE INDEX "leads_abiertos_revision_pendiente_resuelto_idx" ON "leads_abiertos_revision_pendiente"("resuelto");

-- CreateIndex
CREATE UNIQUE INDEX "leads_abiertos_revision_pendiente_cliente_id_lead_abierto_i_key" ON "leads_abiertos_revision_pendiente"("cliente_id", "lead_abierto_id", "empresa_ingesta_id");

-- CreateIndex
CREATE INDEX "idx_leads_empresa" ON "leads"("empresa_id");

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_abiertos_revision_pendiente" ADD CONSTRAINT "leads_abiertos_revision_pendiente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_abiertos_revision_pendiente" ADD CONSTRAINT "leads_abiertos_revision_pendiente_lead_abierto_id_fkey" FOREIGN KEY ("lead_abierto_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bloque B (Fase 1, spec membership-backfill, diseño "Backfill mechanism"):
-- Empresa bootstrap de id fijo + backfill determinístico 1:1
-- Usuario->Membresia, EN LA MISMA transacción que la DDL de arriba (Postgres
-- envuelve migration.sql completo en una transacción por defecto — un fallo
-- a mitad de camino revierte TODO, sin estado parcial, sin rollback manual).
-- Idempotente por diseño: ambos INSERT usan ON CONFLICT DO NOTHING sobre sus
-- claves naturales (empresas.id fijo; membresias unique(usuario_id,
-- empresa_id, rol)) — reejecutar esta sección no duplica filas ni crea un
-- segundo bootstrap. Mapeo fijo (spec): ADMINISTRADOR/SUPERVISOR 1:1;
-- VENDEDOR -> ASESOR con habilitado_para_venta=true; ASESOR ->
-- ASESOR con habilitado_para_venta=false. correo/password_hash quedan NULL
-- en toda fila backfillada (dual-login-routing aún no las escribe).
-- BACKFILL START
INSERT INTO "empresas" ("id", "nombre", "creado_en")
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Bootstrap', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "membresias" ("id", "usuario_id", "empresa_id", "rol", "habilitado_para_venta", "activa", "creado_en", "actualizado_en")
SELECT
  gen_random_uuid(),
  u."id",
  '00000000-0000-0000-0000-000000000001',
  CASE u."rol"
    WHEN 'ADMINISTRADOR' THEN 'ADMINISTRADOR'
    WHEN 'SUPERVISOR' THEN 'SUPERVISOR'
    ELSE 'ASESOR'
  END::"rol_membresia",
  (u."rol" = 'VENDEDOR'),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "usuarios" u
ON CONFLICT ("usuario_id", "empresa_id", "rol") DO NOTHING;
-- BACKFILL END

