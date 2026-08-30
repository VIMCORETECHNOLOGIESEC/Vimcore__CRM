/*
  Warnings:

  - Made the column `empresa_id` on table `bridges` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresa_id` on table `leads` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "bridges" DROP CONSTRAINT "bridges_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_empresa_id_fkey";

-- AlterTable
ALTER TABLE "bridges" ALTER COLUMN "empresa_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "empresa_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
