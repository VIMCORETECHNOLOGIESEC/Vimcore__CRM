import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { updateApariencia } from "../src/services/empresa-apariencia.service.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("services/empresa-apariencia — updateApariencia", () => {
  it("actualiza la Empresa indicada por empresaId y devuelve solo los dos campos de apariencia", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa service apariencia ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });

    const resultado = await updateApariencia(empresa.id, {
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
    });

    expect(resultado).toEqual({ colorPrimario: "#7c2d12", colorSecundario: "#f97316", logoUrl: null });
  });

  it("restaura ambos colores a null", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa service apariencia null ${randomUUID()}`, colorPrimario: "#7c2d12", colorSecundario: "#f97316" },
    });

    const resultado = await updateApariencia(empresa.id, {
      colorPrimario: null,
      colorSecundario: null,
    });

    expect(resultado).toEqual({ colorPrimario: null, colorSecundario: null, logoUrl: null });
  });

  it("actualiza el logoUrl cuando se lo envía", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa service apariencia logo ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });

    const resultado = await updateApariencia(empresa.id, {
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });

    expect(resultado.logoUrl).toBe("https://cdn.miempresa.com/logo.svg");
  });

  it("no toca el logoUrl cuando no se lo envía (campo opcional)", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa service apariencia logo intacto ${randomUUID()}`,
        colorPrimario: "#111111",
        colorSecundario: "#222222",
        logoUrl: "https://cdn.miempresa.com/logo-previo.svg",
      },
    });

    const resultado = await updateApariencia(empresa.id, {
      colorPrimario: "#333333",
      colorSecundario: "#444444",
    });

    expect(resultado.logoUrl).toBe("https://cdn.miempresa.com/logo-previo.svg");
  });
});
