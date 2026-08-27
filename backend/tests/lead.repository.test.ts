import type { Lead } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as leadRepository from "../src/repositories/lead.repository.js";
import { VersionConflictError } from "../src/services/asignacion.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearClienteYLead(): Promise<{ leadId: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente LR ${contador}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
  return { leadId: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("repositories/lead — updateSemaforo (M5, DD4)", () => {
  it("persiste semaforo y puntuacion en el lead, sin tocar otras columnas", async () => {
    const { leadId } = await crearClienteYLead();

    const actualizado = await leadRepository.updateSemaforo(
      leadId,
      { semaforo: "AMARILLO", puntuacion: 55 },
      testAdminPrisma,
    );

    expect(actualizado.semaforo).toBe("AMARILLO");
    expect(actualizado.puntuacion).toBe(55);
    expect(actualizado.etapa).toBe("NUEVO"); // no cambia etapa (D16)

    const filaPersistida = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(filaPersistida.semaforo).toBe("AMARILLO");
    expect(filaPersistida.puntuacion).toBe(55);
  });

  it("una segunda llamada sobrescribe el valor anterior (siempre refleja la última puntuación)", async () => {
    const { leadId } = await crearClienteYLead();

    await leadRepository.updateSemaforo(leadId, { semaforo: "ROJO", puntuacion: 10 }, testAdminPrisma);
    const segunda = await leadRepository.updateSemaforo(
      leadId,
      { semaforo: "VERDE", puntuacion: 95 },
      testAdminPrisma,
    );

    expect(segunda.semaforo).toBe("VERDE");
    expect(segunda.puntuacion).toBe(95);
  });

  it("PR3: puntuacion omitida no toca la columna (fijado directo de color en etapas terminales, D6)", async () => {
    const { leadId } = await crearClienteYLead();
    await leadRepository.updateSemaforo(leadId, { semaforo: "AMARILLO", puntuacion: 55 }, testAdminPrisma);

    const actualizado = await leadRepository.updateSemaforo(leadId, { semaforo: "VERDE" }, testAdminPrisma);

    expect(actualizado.semaforo).toBe("VERDE");
    expect(actualizado.puntuacion).toBe(55); // preservado, no sobrescrito por undefined
  });
});

describe("repositories/lead — findById (PR3)", () => {
  it("devuelve el lead cuando existe", async () => {
    const { leadId } = await crearClienteYLead();
    const lead = await leadRepository.findById(leadId, testAdminPrisma);
    expect(lead?.id).toBe(leadId);
  });

  it("devuelve null cuando no existe", async () => {
    const lead = await leadRepository.findById("00000000-0000-0000-0000-000000000000", testAdminPrisma);
    expect(lead).toBeNull();
  });
});

describe("repositories/lead — findMany (PR3, listado filtrado)", () => {
  it("filtra por etapa y pagina con el total real, no el de la página", async () => {
    const cliente = await prisma.cliente.create({
      data: { nombre: "Cliente FM", telefonoValido: false },
    });
    await testAdminPrisma.lead.createMany({
      data: [
        { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
        { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
        { clienteId: cliente.id, origen: "NUEVO", etapa: "CONTACTADO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
      ],
    });

    const resultado = await leadRepository.findMany(
      { clienteId: cliente.id, etapa: "NUEVO" },
      { skip: 0, take: 1, orderBy: { ingresadoEn: "desc" } },
      testAdminPrisma,
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
    const lead = await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        asesorId: asesor.id,
        vendedorId: vendedor.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });

    const encontrado = await leadRepository.findById(lead.id, testAdminPrisma);

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
    await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        asesorId: asesor.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });

    const resultado = await leadRepository.findMany(
      { clienteId: cliente.id },
      { skip: 0, take: 10, orderBy: { ingresadoEn: "desc" } },
      testAdminPrisma,
    );

    expect(resultado.leads).toHaveLength(1);
    expect(resultado.leads[0]?.cliente.nombre).toBe(`Cliente Rel FM ${contador}`);
    expect(resultado.leads[0]?.asesor?.nombre).toBe(`Asesor Rel FM ${contador}`);
    expect(resultado.leads[0]?.vendedor).toBeNull();
  });
});

describe("repositories/lead — assignResponsable (Group 3, design D6: CAS por version)", () => {
  it("con expectedVersion correcto: asigna, incrementa version en 1 y persiste slaInicioEn", async () => {
    const { leadId } = await crearClienteYLead();
    const asesorId = (
      await prisma.usuario.create({
        data: {
          nombre: "Asesor CAS",
          correo: `asesor-cas-${Date.now()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      })
    ).id;
    const slaInicioEn = new Date();

    const actualizado = await leadRepository.assignResponsable(
      leadId,
      { pool: "ASESOR", responsableId: asesorId, slaInicioEn },
      0,
      testAdminPrisma,
    );

    expect(actualizado.asesorId).toBe(asesorId);
    expect(actualizado.slaInicioEn?.getTime()).toBe(slaInicioEn.getTime());
    expect(actualizado.version).toBe(1);
  });

  it("con expectedVersion obsoleto (stale): lanza VersionConflictError y NO muta la fila (ni asesorId ni version)", async () => {
    const { leadId } = await crearClienteYLead();
    const asesorId = (
      await prisma.usuario.create({
        data: {
          nombre: "Asesor CAS Stale",
          correo: `asesor-cas-stale-${Date.now()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      })
    ).id;
    // Alguien más ya asignó el lead primero (version pasa de 0 a 1).
    await leadRepository.assignResponsable(
      leadId,
      { pool: "ASESOR", responsableId: asesorId, slaInicioEn: new Date() },
      0,
      testAdminPrisma,
    );

    // Este llamador todavía cree que la version es 0 (leyó el lead ANTES
    // del primer assignResponsable) — su CAS debe perder la carrera.
    await expect(
      leadRepository.assignResponsable(
        leadId,
        { pool: "ASESOR", responsableId: asesorId, slaInicioEn: new Date() },
        0,
        testAdminPrisma,
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const filaTrasConflicto = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(filaTrasConflicto.version).toBe(1); // sin cambios desde la primera asignación exitosa
  });

  it("Group 3, task 3.6 (concurrencia real): dos transacciones concurrentes con el MISMO expectedVersion — exactamente una gana el CAS, la otra pierde con VersionConflictError, y la version final es 1 (no 2)", async () => {
    const { leadId } = await crearClienteYLead();
    const [asesorA, asesorB] = await Promise.all([
      prisma.usuario.create({
        data: {
          nombre: "Asesor CAS Concurrente A",
          correo: `asesor-cas-conc-a-${Date.now()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      }),
      prisma.usuario.create({
        data: {
          nombre: "Asesor CAS Concurrente B",
          correo: `asesor-cas-conc-b-${Date.now()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      }),
    ]);

    // Ambas "transacciones" leyeron el lead ANTES de que cualquiera
    // escribiera — las dos creen que expectedVersion=0 (mismo escenario que
    // dos supervisores reasignando el mismo lead casi al mismo instante).
    const resultados = await Promise.allSettled([
      leadRepository.assignResponsable(
        leadId,
        { pool: "ASESOR", responsableId: asesorA.id, slaInicioEn: new Date() },
        0,
        testAdminPrisma,
      ),
      leadRepository.assignResponsable(
        leadId,
        { pool: "ASESOR", responsableId: asesorB.id, slaInicioEn: new Date() },
        0,
        testAdminPrisma,
      ),
    ]);

    const cumplidas = resultados.filter((r) => r.status === "fulfilled");
    const rechazadas = resultados.filter((r) => r.status === "rejected");
    expect(cumplidas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(VersionConflictError);

    const filaFinal = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    // Ningún write se pierde en silencio y ninguno se aplica dos veces:
    // version avanza EXACTAMENTE una vez (0 -> 1), nunca 0 (perdido) ni 2
    // (ambos aplicados).
    expect(filaFinal.version).toBe(1);
    expect([asesorA.id, asesorB.id]).toContain(filaFinal.asesorId);
    const ganadorId = (cumplidas[0] as PromiseFulfilledResult<Lead>).value.asesorId;
    expect(filaFinal.asesorId).toBe(ganadorId);
  });
});

describe("repositories/lead — updateEtapa (PR3)", () => {
  it("actualiza etapa y campos de cierre de VENTA en la misma llamada", async () => {
    const { leadId } = await crearClienteYLead();

    const actualizado = await leadRepository.updateEtapa(
      leadId,
      {
        etapa: "VENTA",
        cerradoEn: new Date("2026-08-14T10:00:00.000Z"),
        montoVenta: 1500.5,
        productoServicio: "Plan Premium",
        formaPago: "CONTADO",
      },
      testAdminPrisma,
    );

    expect(actualizado.etapa).toBe("VENTA");
    expect(actualizado.productoServicio).toBe("Plan Premium");
    expect(actualizado.formaPago).toBe("CONTADO");
    expect(Number(actualizado.montoVenta)).toBe(1500.5);
    expect(actualizado.cerradoEn?.toISOString()).toBe("2026-08-14T10:00:00.000Z");
  });
});
