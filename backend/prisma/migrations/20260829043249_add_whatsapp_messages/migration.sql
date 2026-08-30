-- CreateEnum
CREATE TYPE "estado_conexion_whatsapp" AS ENUM ('ACTIVA', 'TOKEN_EXPIRADO', 'ERROR', 'INACTIVA');

-- CreateEnum
CREATE TYPE "tipo_evento_conversacion" AS ENUM ('ASIGNADA', 'REASIGNADA_TRASPASO_LEAD', 'REASIGNADA_SLA_VENCIDO');

-- CreateEnum
CREATE TYPE "direccion_mensaje" AS ENUM ('ENTRANTE', 'SALIENTE');

-- AlterEnum
ALTER TYPE "red_social" ADD VALUE 'WHATSAPP';

-- CreateTable
CREATE TABLE "whatsapp_conexiones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "numero_telefono_id" TEXT NOT NULL,
    "numero_display" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "token_cifrado" TEXT,
    "token_expira_en" TIMESTAMPTZ(6),
    "estado" "estado_conexion_whatsapp" NOT NULL DEFAULT 'INACTIVA',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conexiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "usado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones_whatsapp" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "conexion_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "asesor_id" UUID,
    "ultimo_mensaje_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversaciones_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones_whatsapp_eventos" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "usuario_id" UUID,
    "tipo" "tipo_evento_conversacion" NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "conversaciones_whatsapp_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_whatsapp" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "direccion" "direccion_mensaje" NOT NULL,
    "id_externo_mensaje" TEXT NOT NULL,
    "texto" TEXT,
    "payload_original" JSONB,
    "usuario_id" UUID,
    "enviado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mensajes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conexiones_empresa_id_key" ON "whatsapp_conexiones"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conexiones_numero_telefono_id_key" ON "whatsapp_conexiones"("numero_telefono_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_oauth_states_state_hash_key" ON "whatsapp_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "idx_whatsapp_oauth_states_expira" ON "whatsapp_oauth_states"("expira_en");

-- CreateIndex
CREATE INDEX "idx_whatsapp_oauth_states_empresa_usuario" ON "whatsapp_oauth_states"("empresa_id", "usuario_id");

-- CreateIndex
CREATE INDEX "idx_conversaciones_whatsapp_empresa" ON "conversaciones_whatsapp"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_conversaciones_whatsapp_asesor" ON "conversaciones_whatsapp"("asesor_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_whatsapp_cliente_id_conexion_id_key" ON "conversaciones_whatsapp"("cliente_id", "conexion_id");

-- CreateIndex
CREATE INDEX "idx_conversaciones_whatsapp_eventos_conversacion" ON "conversaciones_whatsapp_eventos"("conversacion_id", "ocurrido_en");

-- CreateIndex
CREATE INDEX "idx_conversaciones_whatsapp_eventos_empresa" ON "conversaciones_whatsapp_eventos"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_mensajes_whatsapp_conversacion" ON "mensajes_whatsapp"("conversacion_id", "enviado_en");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_whatsapp_conversacion_id_id_externo_mensaje_key" ON "mensajes_whatsapp"("conversacion_id", "id_externo_mensaje");

-- AddForeignKey
ALTER TABLE "whatsapp_conexiones" ADD CONSTRAINT "whatsapp_conexiones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_oauth_states" ADD CONSTRAINT "whatsapp_oauth_states_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_oauth_states" ADD CONSTRAINT "whatsapp_oauth_states_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_conexion_id_fkey" FOREIGN KEY ("conexion_id") REFERENCES "whatsapp_conexiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp_eventos" ADD CONSTRAINT "conversaciones_whatsapp_eventos_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp_eventos" ADD CONSTRAINT "conversaciones_whatsapp_eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp_eventos" ADD CONSTRAINT "conversaciones_whatsapp_eventos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
