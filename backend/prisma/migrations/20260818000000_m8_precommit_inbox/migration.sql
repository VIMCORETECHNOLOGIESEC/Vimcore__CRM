CREATE TYPE "estado_recepcion" AS ENUM (
  'PENDIENTE', 'PROCESANDO', 'REINTENTO', 'PROCESADO', 'FALLA_MANUAL'
);

ALTER TABLE "leads_recibidos"
  ADD COLUMN "entrada_procesamiento" JSONB,
  ADD COLUMN "estado" "estado_recepcion",
  ADD COLUMN "intentos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disponible_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "lease_hasta" TIMESTAMPTZ(6),
  ADD COLUMN "ultimo_error" TEXT,
  ADD COLUMN "procesado_en" TIMESTAMPTZ(6);

UPDATE "leads_recibidos"
SET
  "entrada_procesamiento" = jsonb_build_object(
    'version', 0,
    'recibidoEn', "recibido_en",
    'payloadLegacy', "payload"
  ),
  "estado" = CASE
    WHEN "lead_id" IS NULL THEN 'FALLA_MANUAL'::"estado_recepcion"
    ELSE 'PROCESADO'::"estado_recepcion"
  END,
  "ultimo_error" = CASE
    WHEN "lead_id" IS NULL THEN 'Recepción heredada sin sobre de procesamiento; requiere revisión manual'
    ELSE NULL
  END,
  "procesado_en" = CASE WHEN "lead_id" IS NOT NULL THEN "recibido_en" ELSE NULL END;

ALTER TABLE "leads_recibidos"
  ALTER COLUMN "entrada_procesamiento" SET NOT NULL,
  ALTER COLUMN "estado" SET NOT NULL,
  ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE';

CREATE INDEX "idx_leads_recibidos_estado_disponible"
  ON "leads_recibidos" ("estado", "disponible_en");
CREATE INDEX "idx_leads_recibidos_claim"
  ON "leads_recibidos" ("disponible_en", "recibido_en")
  WHERE "estado" IN ('PENDIENTE', 'REINTENTO');
CREATE INDEX "idx_leads_recibidos_lease_vencido"
  ON "leads_recibidos" ("lease_hasta")
  WHERE "estado" = 'PROCESANDO';
