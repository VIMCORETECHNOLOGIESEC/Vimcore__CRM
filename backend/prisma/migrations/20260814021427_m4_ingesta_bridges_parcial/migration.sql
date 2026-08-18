-- CreateEnum
CREATE TYPE "red_social" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'X', 'LINKEDIN', 'GOOGLE_FORMS');

-- CreateEnum
CREATE TYPE "estado_bridge" AS ENUM ('ACTIVO', 'TOKEN_EXPIRADO', 'ERROR', 'INACTIVO');

-- CreateEnum
CREATE TYPE "nivel_bridge_log" AS ENUM ('INFO', 'ADVERTENCIA', 'ERROR');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campos_dinamicos" JSONB,
ADD COLUMN     "payload_original" JSONB,
ADD COLUMN     "red_social" "red_social";

-- CreateTable
CREATE TABLE "bridges" (
    "id" UUID NOT NULL,
    "red_social" "red_social" NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave_api_hash" TEXT NOT NULL,
    "estado" "estado_bridge" NOT NULL DEFAULT 'INACTIVO',
    "ultimo_lead_en" TIMESTAMPTZ(6),

    CONSTRAINT "bridges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bridge_logs" (
    "id" UUID NOT NULL,
    "bridge_id" UUID,
    "nivel" "nivel_bridge_log" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "payload" JSONB,
    "ocurrido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bridge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads_recibidos" (
    "id" UUID NOT NULL,
    "bridge_id" UUID NOT NULL,
    "id_externo_lead" TEXT NOT NULL,
    "lead_id" UUID,
    "payload" JSONB NOT NULL,
    "datos_incompletos" BOOLEAN NOT NULL DEFAULT false,
    "recibido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_recibidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridges_clave_api_hash_key" ON "bridges"("clave_api_hash");

-- CreateIndex
CREATE INDEX "bridge_logs_bridge_id_ocurrido_en_idx" ON "bridge_logs"("bridge_id", "ocurrido_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "leads_recibidos_bridge_id_id_externo_lead_key" ON "leads_recibidos"("bridge_id", "id_externo_lead");

-- AddForeignKey
ALTER TABLE "bridge_logs" ADD CONSTRAINT "bridge_logs_bridge_id_fkey" FOREIGN KEY ("bridge_id") REFERENCES "bridges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_recibidos" ADD CONSTRAINT "leads_recibidos_bridge_id_fkey" FOREIGN KEY ("bridge_id") REFERENCES "bridges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_recibidos" ADD CONSTRAINT "leads_recibidos_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
