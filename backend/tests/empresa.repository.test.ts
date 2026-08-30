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

describe("empresa.repository::updateApariencia", () => {
  it("actualiza colorPrimario/colorSecundario de la Empresa indicada", async () => {
    const nombre = `Empresa repo apariencia ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: { nombre, colorPrimario: "#111111", colorSecundario: "#222222" },
    });

    const actualizada = await empresaRepository.updateApariencia(empresa.id, {
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
    });

    expect(actualizada.colorPrimario).toBe("#7c2d12");
    expect(actualizada.colorSecundario).toBe("#f97316");
  });

  it("restaura ambos colores a null", async () => {
    const nombre = `Empresa repo apariencia null ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: { nombre, colorPrimario: "#7c2d12", colorSecundario: "#f97316" },
    });

    const actualizada = await empresaRepository.updateApariencia(empresa.id, {
      colorPrimario: null,
      colorSecundario: null,
    });

    expect(actualizada.colorPrimario).toBeNull();
    expect(actualizada.colorSecundario).toBeNull();
  });
});

// tema-empresarial-integracion (PASO 8, gap de gestor de empresas): listado
// exclusivo sessionScope holding consumido por `GET /empresas` -- el guard de
// autorización vive en el controller, acá solo se prueba la lectura cruda.
describe("empresa.repository::findAll", () => {
  it("incluye una Empresa recién creada con su apariencia completa", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa repo listado ${randomUUID()}`,
        colorPrimario: "#111111",
        colorSecundario: "#222222",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });

    const listado = await empresaRepository.findAll();

    expect(listado).toContainEqual(
      expect.objectContaining({
        id: empresa.id,
        nombre: empresa.nombre,
        colorPrimario: "#111111",
        colorSecundario: "#222222",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      }),
    );
  });

  it("incluye una Empresa sin apariencia propia (colores/logo null)", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa repo listado sin color ${randomUUID()}` },
    });

    const listado = await empresaRepository.findAll();

    expect(listado).toContainEqual(
      expect.objectContaining({
        id: empresa.id,
        nombre: empresa.nombre,
        colorPrimario: null,
        colorSecundario: null,
        logoUrl: null,
      }),
    );
  });

  it("devuelve un array (independiente de cuántas Empresa existan)", async () => {
    const listado = await empresaRepository.findAll();

    expect(Array.isArray(listado)).toBe(true);
  });
});
