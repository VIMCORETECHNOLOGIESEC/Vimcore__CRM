-- CreateEnum
CREATE TYPE "modalidad_cita" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'TELEFONICA');

-- CreateEnum
CREATE TYPE "estado_cita" AS ENUM ('AGENDADA', 'CUMPLIDA', 'NO_ASISTIO', 'REPROGRAMADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "citas" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "programada_para" TIMESTAMPTZ(6) NOT NULL,
    "modalidad" "modalidad_cita" NOT NULL,
    "estado" "estado_cita" NOT NULL DEFAULT 'AGENDADA',
    "notas" TEXT,
    "recordatorio_enviado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citas_lead_id_idx" ON "citas"("lead_id");

-- CreateIndex
CREATE INDEX "citas_estado_programada_para_idx" ON "citas"("estado", "programada_para");

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
