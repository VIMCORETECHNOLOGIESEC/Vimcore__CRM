import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as respuestaFormularioRepository from "../src/repositories/respuesta-formulario.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearUsuario(): Promise<{ id: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Asesor RF ${contador}`,
      correo: `asesor-rf-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-de-prueba-123456"),
      rol: "ASESOR",
      activo: true,
    },
  });
  return { id: usuario.id };
}

async function crearClienteYLead(): Promise<{ leadId: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente RF ${contador}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
  return { leadId: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("repositories/respuesta-formulario — createRespuesta (D8, insert-only)", () => {
  it("inserta una fila con los datos exactos suministrados", async () => {
    const { id: usuarioId } = await crearUsuario();
    const { leadId } = await crearClienteYLead();

    const fila = await respuestaFormularioRepository.createRespuesta({
      leadId,
      usuarioId,
      etapa: "NUEVO",
      respuestas: { p1: "alto" },
      puntuacion: 87,
      semaforo: "VERDE",
      versionRubrica: "v1",
    });

    expect(fila.leadId).toBe(leadId);
    expect(fila.usuarioId).toBe(usuarioId);
    expect(fila.puntuacion).toBe(87);
    expect(fila.semaforo).toBe("VERDE");
    expect(fila.versionRubrica).toBe("v1");
    expect(fila.respuestas).toEqual({ p1: "alto" });
  });

  it("D8: dos envíos para el mismo lead crean dos filas distintas, nunca sobrescriben la anterior", async () => {
    const { id: usuarioId } = await crearUsuario();
    const { leadId } = await crearClienteYLead();

    const primera = await respuestaFormularioRepository.createRespuesta({
      leadId,
      usuarioId,
      etapa: "NUEVO",
      respuestas: { p1: "bajo" },
      puntuacion: 10,
      semaforo: "ROJO",
      versionRubrica: "v1",
    });
    const segunda = await respuestaFormularioRepository.createRespuesta({
      leadId,
      usuarioId,
      etapa: "CONTACTADO",
      respuestas: { p1: "alto" },
      puntuacion: 90,
      semaforo: "VERDE",
      versionRubrica: "v1",
    });

    expect(primera.id).not.toBe(segunda.id);
    const total = await prisma.respuestaFormulario.count({ where: { leadId } });
    expect(total).toBe(2);

    const filaOriginal = await prisma.respuestaFormulario.findUniqueOrThrow({
      where: { id: primera.id },
    });
    expect(filaOriginal.puntuacion).toBe(10); // no fue sobrescrita por la segunda inserción
  });
});
