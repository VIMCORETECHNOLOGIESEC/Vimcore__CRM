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

  it("PR3: puntuacion omitida no toca la columna (fijado directo de color en etapas terminales, D6)", async () => {
    const { leadId } = await crearClienteYLead();
    await leadRepository.updateSemaforo(leadId, { semaforo: "AMARILLO", puntuacion: 55 });

    const actualizado = await leadRepository.updateSemaforo(leadId, { semaforo: "VERDE" });

    expect(actualizado.semaforo).toBe("VERDE");
    expect(actualizado.puntuacion).toBe(55); // preservado, no sobrescrito por undefined
  });
});

describe("repositories/lead — findById (PR3)", () => {
  it("devuelve el lead cuando existe", async () => {
    const { leadId } = await crearClienteYLead();
    const lead = await leadRepository.findById(leadId);
    expect(lead?.id).toBe(leadId);
  });

  it("devuelve null cuando no existe", async () => {
    const lead = await leadRepository.findById("00000000-0000-0000-0000-000000000000");
    expect(lead).toBeNull();
  });
});

describe("repositories/lead — findMany (PR3, listado filtrado)", () => {
  it("filtra por etapa y pagina con el total real, no el de la página", async () => {
    const cliente = await prisma.cliente.create({
      data: { nombre: "Cliente FM", telefonoValido: false },
    });
    await prisma.lead.createMany({
      data: [
        { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
        { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
        { clienteId: cliente.id, origen: "NUEVO", etapa: "CONTACTADO", ingresadoEn: new Date() },
      ],
    });

    const resultado = await leadRepository.findMany(
      { clienteId: cliente.id, etapa: "NUEVO" },
      { skip: 0, take: 1, orderBy: { ingresadoEn: "desc" } },
    );

    expect(resultado.leads).toHaveLength(1);
    expect(resultado.total).toBe(2);
  });
});

describe("repositories/lead — findById/findMany incluyen relaciones anidadas (spec: Listado/Detalle con relaciones)", () => {
  it("findById devuelve cliente/asesor/vendedor como objetos anidados, no solo IDs", async () => {
    contador += 1;
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente Rel ${contador}`, telefonoValido: false },
    });
    const asesor = await prisma.usuario.create({
      data: {
        nombre: `Asesor Rel ${contador}`,
        correo: `asesor-rel-${contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "ASESOR",
        activo: true,
      },
    });
    const vendedor = await prisma.usuario.create({
      data: {
        nombre: `Vendedor Rel ${contador}`,
        correo: `vendedor-rel-${contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "VENDEDOR",
        activo: true,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        asesorId: asesor.id,
        vendedorId: vendedor.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
      },
    });

    const encontrado = await leadRepository.findById(lead.id);

    expect(encontrado?.cliente.nombre).toBe(`Cliente Rel ${contador}`);
    expect(encontrado?.asesor?.nombre).toBe(`Asesor Rel ${contador}`);
    expect(encontrado?.vendedor?.nombre).toBe(`Vendedor Rel ${contador}`);
  });

  it("findMany devuelve cliente/asesor/vendedor anidados para cada item del listado", async () => {
    contador += 1;
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente Rel FM ${contador}`, telefonoValido: false },
    });
    const asesor = await prisma.usuario.create({
      data: {
        nombre: `Asesor Rel FM ${contador}`,
        correo: `asesor-rel-fm-${contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "ASESOR",
        activo: true,
      },
    });
    await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        asesorId: asesor.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
      },
    });

    const resultado = await leadRepository.findMany(
      { clienteId: cliente.id },
      { skip: 0, take: 10, orderBy: { ingresadoEn: "desc" } },
    );

    expect(resultado.leads).toHaveLength(1);
    expect(resultado.leads[0]?.cliente.nombre).toBe(`Cliente Rel FM ${contador}`);
    expect(resultado.leads[0]?.asesor?.nombre).toBe(`Asesor Rel FM ${contador}`);
    expect(resultado.leads[0]?.vendedor).toBeNull();
  });
});

describe("repositories/lead — updateEtapa (PR3)", () => {
  it("actualiza etapa y campos de cierre de VENTA en la misma llamada", async () => {
    const { leadId } = await crearClienteYLead();

    const actualizado = await leadRepository.updateEtapa(leadId, {
      etapa: "VENTA",
      cerradoEn: new Date("2026-08-14T10:00:00.000Z"),
      montoVenta: 1500.5,
      productoServicio: "Plan Premium",
      formaPago: "CONTADO",
    });

    expect(actualizado.etapa).toBe("VENTA");
    expect(actualizado.productoServicio).toBe("Plan Premium");
    expect(actualizado.formaPago).toBe("CONTADO");
    expect(Number(actualizado.montoVenta)).toBe(1500.5);
    expect(actualizado.cerradoEn?.toISOString()).toBe("2026-08-14T10:00:00.000Z");
  });
});
