-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "holding_id" UUID;

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_empresas_holding" ON "empresas"("holding_id");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
