-- CreateEnum
CREATE TYPE "semaforo" AS ENUM ('ROJO', 'AMARILLO', 'VERDE');

-- CreateEnum
CREATE TYPE "forma_pago" AS ENUM ('CONTADO', 'CREDITO', 'FINANCIAMIENTO');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "asesor_id" UUID,
ADD COLUMN     "forma_pago" "forma_pago",
ADD COLUMN     "monto_venta" DECIMAL(12,2),
ADD COLUMN     "observacion_cierre" TEXT,
ADD COLUMN     "producto_servicio" TEXT,
ADD COLUMN     "puntuacion" INTEGER,
ADD COLUMN     "semaforo" "semaforo",
ADD COLUMN     "sla_inicio_en" TIMESTAMPTZ(6),
ADD COLUMN     "vendedor_id" UUID;

-- AlterTable
ALTER TABLE "lead_eventos" ADD COLUMN     "semaforo_anterior" "semaforo",
ADD COLUMN     "semaforo_nuevo" "semaforo";

-- CreateTable
CREATE TABLE "respuestas_formulario" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "etapa" "etapa_lead" NOT NULL,
    "respuestas" JSONB NOT NULL,
    "puntuacion" INTEGER NOT NULL,
    "semaforo" "semaforo" NOT NULL,
    "version_rubrica" TEXT NOT NULL,
    "registrado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuestas_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "respuestas_formulario_lead_id_registrado_en_idx" ON "respuestas_formulario"("lead_id", "registrado_en");

-- CreateIndex
CREATE INDEX "idx_leads_asesor_etapa" ON "leads"("asesor_id", "etapa");

-- CreateIndex
CREATE INDEX "idx_leads_vendedor_etapa" ON "leads"("vendedor_id", "etapa");

-- CreateIndex
CREATE INDEX "idx_leads_etapa_ingreso" ON "leads"("etapa", "ingresado_en" DESC);

-- CreateIndex
CREATE INDEX "idx_leads_red_social" ON "leads"("red_social");

-- CreateIndex (D11, docs/03-modelo-datos.md §leads): índice parcial — no
-- expresable en el DSL de Prisma (sin soporte de índices filtrados a la
-- fecha), agregado a mano. `schema.prisma` documenta esta excepción junto al
-- resto de los índices de `Lead`. Sostiene el futuro job de detección de
-- atrasos de M6: solo recorre leads abiertos, no el histórico completo.
CREATE INDEX "idx_leads_sla" ON "leads"("sla_inicio_en") WHERE "cerrado_en" IS NULL;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_formulario" ADD CONSTRAINT "respuestas_formulario_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_formulario" ADD CONSTRAINT "respuestas_formulario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration (DD1, diseño M5): back-fill NULL-only de `red_social` y
-- `payload_original` para leads que M4 ya creó sin poblarlos (bug de M4
-- corregido en este mismo cambio, ver `deduplicacion.service.ts::createLead`
-- call site). Toca únicamente filas con AMBAS columnas en NULL y que tengan
-- una recepción vinculada en `leads_recibidos` — nunca sobrescribe un valor
-- ya presente (D14-safe, no destructivo). `campos_dinamicos` NO se
-- reconstruye aquí: la extracción de campos dinámicos es específica de cada
-- adaptador (docs/05-bridges.md §2) y no es derivable de forma confiable
-- desde el payload crudo en SQL puro — deviación documentada en el diseño
-- (DD1) y en el reporte de apply de PR1.
UPDATE "leads" AS l
SET "red_social" = b."red_social",
    "payload_original" = lr."payload"
FROM "leads_recibidos" AS lr
JOIN "bridges" AS b ON b."id" = lr."bridge_id"
WHERE lr."lead_id" = l."id"
  AND l."red_social" IS NULL
  AND l."payload_original" IS NULL;
