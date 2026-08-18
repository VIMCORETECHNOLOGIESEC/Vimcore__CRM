-- CreateTable
CREATE TABLE "cuentas_publicitarias" (
    "id" UUID NOT NULL,
    "bridge_id" UUID NOT NULL,
    "id_externo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "id_externo_vinculado" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cuentas_publicitarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanias" (
    "id" UUID NOT NULL,
    "cuenta_publicitaria_id" UUID NOT NULL,
    "id_externo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "red_social" "red_social" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "campanias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_publicitarias_bridge_id_id_externo_key" ON "cuentas_publicitarias"("bridge_id", "id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "campanias_cuenta_publicitaria_id_id_externo_key" ON "campanias"("cuenta_publicitaria_id", "id_externo");

-- AddForeignKey
ALTER TABLE "cuentas_publicitarias" ADD CONSTRAINT "cuentas_publicitarias_bridge_id_fkey" FOREIGN KEY ("bridge_id") REFERENCES "bridges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanias" ADD CONSTRAINT "campanias_cuenta_publicitaria_id_fkey" FOREIGN KEY ("cuenta_publicitaria_id") REFERENCES "cuentas_publicitarias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
