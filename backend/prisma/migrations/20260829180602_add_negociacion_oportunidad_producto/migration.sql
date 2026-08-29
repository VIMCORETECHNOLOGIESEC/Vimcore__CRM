-- CreateEnum
CREATE TYPE "tipo_evento_oportunidad" AS ENUM ('ASIGNADA_POOL', 'ASIGNADA_EXCEPCION_ADMINISTRATIVA', 'REASIGNADA_TRASPASO', 'ETAPA_CAMBIADA', 'CERRADA');

-- CreateTable
CREATE TABLE "productos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "producto_id" UUID,
    "etapa" "etapa_lead" NOT NULL DEFAULT 'NUEVO',
    "semaforo" "semaforo",
    "puntuacion" INTEGER,
    "asesor_id" UUID,
    "vendedor_id" UUID,
    "monto_venta" DECIMAL(12,2),
    "observacion_cierre" TEXT,
    "forma_pago" "forma_pago",
    "sla_inicio_en" TIMESTAMPTZ(6),
    "cerrada_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidad_eventos" (
    "id" UUID NOT NULL,
    "oportunidad_id" UUID NOT NULL,
    "usuario_id" UUID,
    "tipo" "tipo_evento_oportunidad" NOT NULL,
    "etapa_anterior" "etapa_lead",
    "etapa_nueva" "etapa_lead",
    "detalle" JSONB,
    "ocurrido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "oportunidad_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "productos_empresa_id_nombre_key" ON "productos"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "oportunidades_lead_id_idx" ON "oportunidades"("lead_id");

-- CreateIndex
CREATE INDEX "idx_oportunidades_empresa" ON "oportunidades"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_oportunidades_asesor_etapa" ON "oportunidades"("asesor_id", "etapa");

-- CreateIndex
CREATE INDEX "idx_oportunidades_producto" ON "oportunidades"("producto_id");

-- CreateIndex
CREATE INDEX "idx_oportunidad_eventos_oportunidad" ON "oportunidad_eventos"("oportunidad_id", "ocurrido_en");

-- CreateIndex
CREATE INDEX "idx_oportunidad_eventos_tipo" ON "oportunidad_eventos"("tipo", "ocurrido_en");

-- CreateIndex
CREATE INDEX "idx_oportunidad_eventos_empresa" ON "oportunidad_eventos"("empresa_id");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidad_eventos" ADD CONSTRAINT "oportunidad_eventos_oportunidad_id_fkey" FOREIGN KEY ("oportunidad_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidad_eventos" ADD CONSTRAINT "oportunidad_eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidad_eventos" ADD CONSTRAINT "oportunidad_eventos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
