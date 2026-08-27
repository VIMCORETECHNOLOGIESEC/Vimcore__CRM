import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearClienteYLead(): Promise<{ leadId: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente LE ${contador}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
  return { leadId: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("repositories/lead-evento — createEvento con semaforoAnterior/semaforoNuevo (M5, D17)", () => {
  it("persiste semaforoAnterior=null y semaforoNuevo=VERDE en un evento CAMBIO_SEMAFORO", async () => {
    const { leadId } = await crearClienteYLead();

    const evento = await leadEventoRepository.createEvento(
      {
        leadId,
        empresaId: EMPRESA_BOOTSTRAP_ID,
        tipo: "CAMBIO_SEMAFORO",
        semaforoAnterior: null,
        semaforoNuevo: "VERDE",
      },
      testAdminPrisma,
    );

    const filaPersistida = await testAdminPrisma.leadEvento.findUniqueOrThrow({ where: { id: evento.id } });
    expect(filaPersistida.semaforoAnterior).toBeNull();
    expect(filaPersistida.semaforoNuevo).toBe("VERDE");
  });

  it("un evento CAMBIO_ETAPA sin semaforoAnterior/Nuevo los deja NULL (compatibilidad M3/M4)", async () => {
    const { leadId } = await crearClienteYLead();

    const evento = await leadEventoRepository.createEvento(
      {
        leadId,
        empresaId: EMPRESA_BOOTSTRAP_ID,
        tipo: "CAMBIO_ETAPA",
        etapaAnterior: "NUEVO",
        etapaNueva: "CONTACTADO",
      },
      testAdminPrisma,
    );

    const filaPersistida = await testAdminPrisma.leadEvento.findUniqueOrThrow({ where: { id: evento.id } });
    expect(filaPersistida.semaforoAnterior).toBeNull();
    expect(filaPersistida.semaforoNuevo).toBeNull();
  });
});
