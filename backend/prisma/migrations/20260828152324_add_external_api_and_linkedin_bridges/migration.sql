-- CreateEnum
CREATE TYPE "estado_conexion_linkedin" AS ENUM ('ACTIVA', 'TOKEN_EXPIRADO', 'REVOCADA', 'ERROR');

-- CreateEnum
CREATE TYPE "tipo_fuente_linkedin" AS ENUM ('SPONSORED_ACCOUNT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "tipo_lead_linkedin" AS ENUM ('SPONSORED', 'EVENT', 'COMPANY', 'ORGANIZATION_PRODUCT');

-- CreateEnum
CREATE TYPE "estado_suscripcion_linkedin" AS ENUM ('PENDIENTE', 'ACTIVA', 'ERROR', 'REVOCADA');

-- AlterEnum
ALTER TYPE "red_social" ADD VALUE 'API_EXTERNA';

-- AlterTable
ALTER TABLE "bridges" ADD COLUMN     "configuracion_json" JSONB,
ADD COLUMN     "credencial_externa_cifrada" TEXT;

-- CreateTable
CREATE TABLE "linkedin_conexiones" (
    "id" UUID NOT NULL,
    "bridge_id" UUID NOT NULL,
    "autorizado_por_usuario_id" UUID NOT NULL,
    "member_urn" TEXT,
    "access_token_cifrado" TEXT NOT NULL,
    "refresh_token_cifrado" TEXT,
    "access_token_expira_en" TIMESTAMPTZ(6) NOT NULL,
    "refresh_token_expira_en" TIMESTAMPTZ(6),
    "scopes" TEXT[],
    "estado" "estado_conexion_linkedin" NOT NULL DEFAULT 'ACTIVA',
    "revocado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "linkedin_conexiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "bridge_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "usado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linkedin_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_fuentes" (
    "id" UUID NOT NULL,
    "conexion_id" UUID NOT NULL,
    "cuenta_publicitaria_id" UUID,
    "tipo" "tipo_fuente_linkedin" NOT NULL,
    "owner_urn" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_lead" "tipo_lead_linkedin" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "estado_suscripcion" "estado_suscripcion_linkedin" NOT NULL DEFAULT 'PENDIENTE',
    "subscription_id" TEXT,
    "ultima_sincronizacion_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "linkedin_fuentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_formularios" (
    "id" UUID NOT NULL,
    "fuente_id" UUID NOT NULL,
    "versioned_form_urn" TEXT NOT NULL,
    "nombre" TEXT,
    "contenido" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "linkedin_formularios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_conexiones_bridge_id_key" ON "linkedin_conexiones"("bridge_id");

-- CreateIndex
CREATE INDEX "idx_linkedin_conexiones_estado_access_expira" ON "linkedin_conexiones"("estado", "access_token_expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_oauth_states_state_hash_key" ON "linkedin_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "idx_linkedin_oauth_states_expira" ON "linkedin_oauth_states"("expira_en");

-- CreateIndex
CREATE INDEX "idx_linkedin_oauth_states_bridge_usuario" ON "linkedin_oauth_states"("bridge_id", "usuario_id");

-- CreateIndex
CREATE INDEX "idx_linkedin_fuentes_activa_estado_suscripcion" ON "linkedin_fuentes"("activa", "estado_suscripcion");

-- CreateIndex
CREATE INDEX "idx_linkedin_fuentes_owner_urn" ON "linkedin_fuentes"("owner_urn");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_fuentes_conexion_owner_tipo_lead_key" ON "linkedin_fuentes"("conexion_id", "owner_urn", "tipo_lead");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_formularios_fuente_versioned_form_key" ON "linkedin_formularios"("fuente_id", "versioned_form_urn");

-- AddForeignKey
ALTER TABLE "linkedin_conexiones" ADD CONSTRAINT "linkedin_conexiones_bridge_id_fkey" FOREIGN KEY ("bridge_id") REFERENCES "bridges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_conexiones" ADD CONSTRAINT "linkedin_conexiones_autorizado_por_usuario_id_fkey" FOREIGN KEY ("autorizado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_oauth_states" ADD CONSTRAINT "linkedin_oauth_states_bridge_id_fkey" FOREIGN KEY ("bridge_id") REFERENCES "bridges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_oauth_states" ADD CONSTRAINT "linkedin_oauth_states_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_fuentes" ADD CONSTRAINT "linkedin_fuentes_conexion_id_fkey" FOREIGN KEY ("conexion_id") REFERENCES "linkedin_conexiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_fuentes" ADD CONSTRAINT "linkedin_fuentes_cuenta_publicitaria_id_fkey" FOREIGN KEY ("cuenta_publicitaria_id") REFERENCES "cuentas_publicitarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_formularios" ADD CONSTRAINT "linkedin_formularios_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "linkedin_fuentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
