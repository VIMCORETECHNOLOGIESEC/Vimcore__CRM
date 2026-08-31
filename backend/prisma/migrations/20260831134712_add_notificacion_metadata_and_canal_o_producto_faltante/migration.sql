-- AlterEnum
ALTER TYPE "tipo_notificacion" ADD VALUE 'CANAL_O_PRODUCTO_FALTANTE';

-- AlterTable
ALTER TABLE "notificaciones" ADD COLUMN     "metadata" JSONB;
