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

  // tema-empresarial-integracion (Parte 2): color de marca real por empresa.
  it("resuelve colorPrimario/colorSecundario cuando la Empresa los tiene seteados", async () => {
    const nombre = `Empresa repo con color ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: { nombre, colorPrimario: "#7c2d12", colorSecundario: "#f97316" },
    });

    const encontrada = await empresaRepository.findById(empresa.id);

    expect(encontrada?.colorPrimario).toBe("#7c2d12");
    expect(encontrada?.colorSecundario).toBe("#f97316");
  });

  it("devuelve colorPrimario/colorSecundario null cuando la Empresa nunca los seteó", async () => {
    const nombre = `Empresa repo sin color ${randomUUID()}`;
    const empresa = await prisma.empresa.create({ data: { nombre } });

    const encontrada = await empresaRepository.findById(empresa.id);

    expect(encontrada?.colorPrimario).toBeNull();
    expect(encontrada?.colorSecundario).toBeNull();
  });
});
