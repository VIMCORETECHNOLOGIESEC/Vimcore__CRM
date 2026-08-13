-- CreateEnum
CREATE TYPE "origen_lead" AS ENUM ('NUEVO', 'REINGRESO');

-- CreateEnum
CREATE TYPE "etapa_lead" AS ENUM ('NUEVO', 'CONTACTADO', 'CITA', 'VENTA', 'NO_VENTA');

-- CreateEnum
CREATE TYPE "tipo_evento_lead" AS ENUM ('INGRESO', 'ASIGNACION', 'REASIGNACION', 'TRASPASO', 'CAMBIO_ETAPA', 'CAMBIO_SEMAFORO', 'INTERACCION_REPETIDA', 'CITA_AGENDADA', 'CITA_REPROGRAMADA', 'SLA_INCUMPLIDO', 'CIERRE');

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "nombre" TEXT,
    "telefono_original" TEXT,
    "telefono_normalizado" TEXT,
    "telefono_valido" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correos_cliente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "correo_normalizado" CITEXT NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "correos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "origen" "origen_lead" NOT NULL,
    "etapa" "etapa_lead" NOT NULL DEFAULT 'NUEVO',
    "ingresado_en" TIMESTAMPTZ(6) NOT NULL,
    "cerrado_en" TIMESTAMPTZ(6),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_eventos" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "usuario_id" UUID,
    "tipo" "tipo_evento_lead" NOT NULL,
    "etapa_anterior" "etapa_lead",
    "etapa_nueva" "etapa_lead",
    "detalle" JSONB,
    "ocurrido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_telefono_normalizado_key" ON "clientes"("telefono_normalizado");

-- CreateIndex
CREATE INDEX "correos_cliente_correo_normalizado_idx" ON "correos_cliente"("correo_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "correos_cliente_cliente_id_correo_normalizado_key" ON "correos_cliente"("cliente_id", "correo_normalizado");

-- CreateIndex
CREATE INDEX "leads_cliente_id_etapa_idx" ON "leads"("cliente_id", "etapa");

-- CreateIndex
CREATE INDEX "leads_cliente_id_cerrado_en_idx" ON "leads"("cliente_id", "cerrado_en" DESC);

-- CreateIndex
CREATE INDEX "lead_eventos_lead_id_ocurrido_en_idx" ON "lead_eventos"("lead_id", "ocurrido_en");

-- CreateIndex
CREATE INDEX "lead_eventos_tipo_ocurrido_en_idx" ON "lead_eventos"("tipo", "ocurrido_en");

-- AddForeignKey
ALTER TABLE "correos_cliente" ADD CONSTRAINT "correos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_eventos" ADD CONSTRAINT "lead_eventos_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_eventos" ADD CONSTRAINT "lead_eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
