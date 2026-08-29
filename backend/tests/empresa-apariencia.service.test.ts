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

    expect(resultado).toEqual({ colorPrimario: "#7c2d12", colorSecundario: "#f97316" });
  });

  it("restaura ambos colores a null", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa service apariencia null ${randomUUID()}`, colorPrimario: "#7c2d12", colorSecundario: "#f97316" },
    });

    const resultado = await updateApariencia(empresa.id, {
      colorPrimario: null,
      colorSecundario: null,
    });

    expect(resultado).toEqual({ colorPrimario: null, colorSecundario: null });
  });
});
