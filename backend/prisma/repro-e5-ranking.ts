// Script de una sola vez para reproducir el hallazgo E5 (ranking de
// productos por empresa no muestra la segunda empresa a un admin
// holding-wide). NO es parte del deploy -- solo diagnostico local. Borrar
// despues de usarlo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMPRESA_BOOTSTRAP_ID = "00000000-0000-0000-0000-000000000001";

async function crearOportunidadEnEmpresa(empresaId: string, nombreProducto: string): Promise<void> {
  const producto = await prisma.producto.upsert({
    where: { empresaId_nombre: { empresaId, nombre: nombreProducto } },
    update: {},
    create: { empresaId, nombre: nombreProducto },
  });
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente repro E5 ${Date.now()}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: { clienteId: cliente.id, empresaId, origen: "NUEVO", ingresadoEn: new Date() },
  });
  await prisma.oportunidad.create({
    data: { leadId: lead.id, empresaId, productoId: producto.id, etapa: "NUEVO" },
  });
  console.log(`Oportunidad creada en empresa ${empresaId} con producto "${nombreProducto}"`);
}

async function main(): Promise<void> {
  const empresaB = await prisma.empresa.create({ data: { nombre: `Empresa Repro E5 ${Date.now()}` } });
  console.log(`Empresa B creada: ${empresaB.id}`);

  await crearOportunidadEnEmpresa(EMPRESA_BOOTSTRAP_ID, "Producto Bootstrap Repro");
  await crearOportunidadEnEmpresa(empresaB.id, "Producto Empresa B Repro");

  console.log(`\nempresaB.id = ${empresaB.id}  <- guardalo para comparar contra la respuesta del endpoint`);
}

main().finally(() => prisma.$disconnect());
