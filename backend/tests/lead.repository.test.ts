import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as leadRepository from "../src/repositories/lead.repository.js";

let contador = 0;

async function crearClienteYLead(): Promise<{ leadId: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente LR ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
  });
  return { leadId: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("repositories/lead — updateSemaforo (M5, DD4)", () => {
  it("persiste semaforo y puntuacion en el lead, sin tocar otras columnas", async () => {
    const { leadId } = await crearClienteYLead();

    const actualizado = await leadRepository.updateSemaforo(leadId, {
      semaforo: "AMARILLO",
      puntuacion: 55,
    });

    expect(actualizado.semaforo).toBe("AMARILLO");
    expect(actualizado.puntuacion).toBe(55);
    expect(actualizado.etapa).toBe("NUEVO"); // no cambia etapa (D16)

    const filaPersistida = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(filaPersistida.semaforo).toBe("AMARILLO");
    expect(filaPersistida.puntuacion).toBe(55);
  });

  it("una segunda llamada sobrescribe el valor anterior (siempre refleja la última puntuación)", async () => {
    const { leadId } = await crearClienteYLead();

    await leadRepository.updateSemaforo(leadId, { semaforo: "ROJO", puntuacion: 10 });
    const segunda = await leadRepository.updateSemaforo(leadId, {
      semaforo: "VERDE",
      puntuacion: 95,
    });

    expect(segunda.semaforo).toBe("VERDE");
    expect(segunda.puntuacion).toBe(95);
  });
});
