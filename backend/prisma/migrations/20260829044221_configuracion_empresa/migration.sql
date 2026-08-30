-- CreateTable
CREATE TABLE "configuracion_empresa" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "color_primario" VARCHAR(7) NOT NULL,
    "color_secundario" VARCHAR(7) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);
