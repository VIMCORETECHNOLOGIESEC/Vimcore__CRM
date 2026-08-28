import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("empresa.repository::findById", () => {
  it("resuelve una Empresa existente por id", async () => {
    const nombre = `Empresa repo ${randomUUID()}`;
    const empresa = await prisma.empresa.create({ data: { nombre } });

    const encontrada = await empresaRepository.findById(empresa.id);

    expect(encontrada?.id).toBe(empresa.id);
    expect(encontrada?.nombre).toBe(nombre);
  });

  it("devuelve null cuando el id no corresponde a ninguna Empresa", async () => {
    const encontrada = await empresaRepository.findById(randomUUID());

    expect(encontrada).toBeNull();
  });
});
