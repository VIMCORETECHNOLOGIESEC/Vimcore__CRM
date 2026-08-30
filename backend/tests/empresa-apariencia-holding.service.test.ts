import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import { prisma } from "../src/lib/prisma.js";
import { listEmpresas, updateAparienciaHolding } from "../src/services/empresa-apariencia.service.js";

/**
 * empresa-apariencia-holding (tema-empresarial-integracion, PASO 8): admin
 * cross-empresa, exclusivo sessionScope holding -- a diferencia de
 * `updateApariencia` (self-service, empresa-apariencia.service.test.ts), acá
 * `empresaId` es arbitrario (viene de la URL, nunca de la sesión) y el PATCH
 * es parcial, incluyendo `nombre`.
 */
describe("services/empresa-apariencia — updateAparienciaHolding", () => {
  it("actualiza nombre y colores de CUALQUIER empresa por id", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa holding original ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });

    const resultado = await updateAparienciaHolding(empresa.id, {
      nombre: "Nombre renombrado por holding",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
    });

    expect(resultado).toEqual({
      id: empresa.id,
      nombre: "Nombre renombrado por holding",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: null,
    });

    const empresaActualizada = await prisma.empresa.findUnique({ where: { id: empresa.id } });
    expect(empresaActualizada?.nombre).toBe("Nombre renombrado por holding");
    expect(empresaActualizada?.colorPrimario).toBe("#7c2d12");
  });

  it("actualiza solo el nombre sin tocar los colores existentes (PATCH parcial)", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa holding parcial ${randomUUID()}`,
        colorPrimario: "#333333",
        colorSecundario: "#444444",
        logoUrl: "https://cdn.miempresa.com/logo-previo.svg",
      },
    });

    const resultado = await updateAparienciaHolding(empresa.id, {
      nombre: "Solo nombre nuevo",
    });

    expect(resultado.nombre).toBe("Solo nombre nuevo");
    expect(resultado.colorPrimario).toBe("#333333");
    expect(resultado.colorSecundario).toBe("#444444");
    expect(resultado.logoUrl).toBe("https://cdn.miempresa.com/logo-previo.svg");
  });

  it("restaura los colores a null sin tocar el nombre", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa holding restaurar ${randomUUID()}`,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
      },
    });

    const resultado = await updateAparienciaHolding(empresa.id, {
      colorPrimario: null,
      colorSecundario: null,
    });

    expect(resultado.colorPrimario).toBeNull();
    expect(resultado.colorSecundario).toBeNull();
    expect(resultado.nombre).toBe(empresa.nombre);
  });

  it("lanza AppError 404 cuando la empresa no existe", async () => {
    await expect(
      updateAparienciaHolding(randomUUID(), { nombre: "No importa" }),
    ).rejects.toMatchObject<Partial<AppError>>({ statusHttp: 404, code: "empresa_no_encontrada" });
  });
});

/**
 * tema-empresarial-integracion (PASO 8, gap de gestor de empresas): listado
 * exclusivo sessionScope holding -- shape idéntico a
 * `EmpresaAparienciaHoldingView` (el mismo tipo que ya devuelve
 * `updateAparienciaHolding`), consumido por `GET /empresas`.
 */
describe("services/empresa-apariencia — listEmpresas", () => {
  it("incluye una Empresa recién creada con el shape de EmpresaAparienciaHoldingView", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa service listado ${randomUUID()}`,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });

    const listado = await listEmpresas();

    expect(listado).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("incluye una Empresa sin apariencia propia (colores/logo null)", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa service listado sin color ${randomUUID()}` },
    });

    const listado = await listEmpresas();

    expect(listado).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });

  it("devuelve un array", async () => {
    const listado = await listEmpresas();

    expect(Array.isArray(listado)).toBe(true);
  });
});
