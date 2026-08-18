CREATE TYPE "tipo_notificacion" AS ENUM (
  'LEAD_ASIGNADO', 'LEAD_TRASPASADO', 'LEAD_SIN_ATENDER', 'LEAD_SIN_ASIGNAR',
  'RECORDATORIO_CITA', 'ERROR_BRIDGE', 'TOKEN_POR_EXPIRAR', 'INTERACCION_REPETIDA'
);
CREATE TYPE "canal_notificacion" AS ENUM ('IN_APP');
CREATE TABLE "notificaciones" (
  "id" UUID NOT NULL, "usuario_id" UUID NOT NULL, "tipo" "tipo_notificacion" NOT NULL,
  "canal" "canal_notificacion" NOT NULL DEFAULT 'IN_APP', "titulo" TEXT NOT NULL,
  "mensaje" TEXT NOT NULL, "lead_id" UUID, "leida_en" TIMESTAMPTZ(6),
  "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_notificaciones_usuario_creada" ON "notificaciones"("usuario_id", "creada_en" DESC);
CREATE INDEX "notificaciones_lead_id_idx" ON "notificaciones"("lead_id");
CREATE INDEX "idx_notificaciones_no_leidas" ON "notificaciones"("usuario_id", "creada_en" DESC) WHERE "leida_en" IS NULL;
