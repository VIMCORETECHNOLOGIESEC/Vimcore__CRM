import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createEmpresa,
  getEmpresaHolding,
  listEmpresas,
  updateAparienciaHolding,
} from "../src/services/empresa-apariencia.service.js";

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
 *
 * Gap de paginación (478 filas reales sin límite ni filtro en este entorno):
 * `listEmpresas` ahora exige `page`/`pageSize` y devuelve `{ items, total }`
 * -- cada test usa `search` para acotar el resultado a la Empresa que crea,
 * ya que sin filtro la paginación por defecto podría dejarla fuera de página.
 */
describe("services/empresa-apariencia — listEmpresas", () => {
  it("incluye una Empresa recién creada con el shape de EmpresaAparienciaHoldingView", async () => {
    const nombre = `Empresa service listado ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: {
        nombre,
 * `GET /empresas/:empresaId` (pedido explícito de frontend, `EmpresaDetallePage
 * .tsx`): mismo shape `EmpresaAparienciaHoldingView` que `updateAparienciaHolding`
 * arriba, mismo criterio de 404.
 */
describe("services/empresa-apariencia — getEmpresaHolding", () => {
  it("resuelve una Empresa existente con su apariencia completa", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa service detalle ${randomUUID()}`,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });

    const { items } = await listEmpresas({ page: 1, pageSize: 25, search: nombre });

    const resultado = await getEmpresaHolding(empresa.id);

    expect(resultado).toEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("lanza AppError 404 cuando la empresa no existe", async () => {
    await expect(getEmpresaHolding(randomUUID())).rejects.toMatchObject<Partial<AppError>>({
      statusHttp: 404,
      code: "empresa_no_encontrada",
    });
  });
});

/**
 * `POST /empresas` (alta de empresa nueva): sin auto-provisioning de
 * `Membresia` -- ver `services/empresa-apariencia.service.ts::createEmpresa`.
 * Mismo shape `EmpresaAparienciaHoldingView` que el resto del módulo.
 */
describe("services/empresa-apariencia — createEmpresa", () => {
  it("crea una Empresa nueva con nombre y apariencia", async () => {
    const nombre = `Empresa service alta ${randomUUID()}`;

    const resultado = await createEmpresa({
      nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });

    expect(resultado).toEqual({
      id: resultado.id,
      nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });

    const enBd = await prisma.empresa.findUnique({ where: { id: resultado.id } });
    expect(enBd?.nombre).toBe(nombre);
  });

  it("crea una Empresa nueva solo con nombre (apariencia queda null)", async () => {
    const nombre = `Empresa service alta minima ${randomUUID()}`;

    const resultado = await createEmpresa({ nombre });

    expect(resultado).toEqual({
      id: resultado.id,
      nombre,
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });

  it("no crea ninguna Membresia (bypass por Usuario.rol, sin auto-provisioning)", async () => {
    const nombre = `Empresa service alta sin membresia ${randomUUID()}`;

    const resultado = await createEmpresa({ nombre });

    const membresias = await prisma.membresia.findMany({ where: { empresaId: resultado.id } });
    expect(membresias).toHaveLength(0);
  });
});

/**
 * tema-empresarial-integracion (PASO 8, gap de gestor de empresas): listado
 * exclusivo sessionScope holding -- shape idéntico a
 * `EmpresaAparienciaHoldingView` (el mismo tipo que ya devuelve
 * `updateAparienciaHolding`), consumido por `GET /empresas`.
 *
 * Gap de paginación (478 filas reales sin límite ni filtro en este entorno):
 * `listEmpresas` ahora exige `page`/`pageSize` y devuelve `{ items, total }`
 * -- cada test usa `search` para acotar el resultado a la Empresa que crea,
 * ya que sin filtro la paginación por defecto podría dejarla fuera de página.
 */
describe("services/empresa-apariencia — listEmpresas", () => {
  it("incluye una Empresa recién creada con el shape de EmpresaAparienciaHoldingView", async () => {
    const nombre = `Empresa service listado ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: {
        nombre,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });

    const { items } = await listEmpresas({ page: 1, pageSize: 25, search: nombre });

    expect(items).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("incluye una Empresa sin apariencia propia (colores/logo null)", async () => {
    const nombre = `Empresa service listado sin color ${randomUUID()}`;
    const empresa = await prisma.empresa.create({ data: { nombre } });

    const { items } = await listEmpresas({ page: 1, pageSize: 25, search: nombre });

    expect(items).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });

  it("devuelve un array en items", async () => {
    const { items } = await listEmpresas({ page: 1, pageSize: 25 });

    expect(Array.isArray(items)).toBe(true);
  });

  it("pagina: pageSize acota items, total refleja el conteo del search", async () => {
    const nombreBase = `Empresa service paginacion ${randomUUID()}`;
    await prisma.empresa.create({ data: { nombre: `${nombreBase} A` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} B` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} C` } });

    const { items, total } = await listEmpresas({ page: 1, pageSize: 2, search: nombreBase });

    expect(items).toHaveLength(2);
    expect(total).toBe(3);
  });

  it("search es case-insensitive", async () => {
    const marca = `MarcaServicio${randomUUID().replace(/-/g, "")}`;
    await prisma.empresa.create({ data: { nombre: `Empresa ${marca} SA` } });

    const { items, total } = await listEmpresas({
      page: 1,
      pageSize: 25,
      search: marca.toLowerCase(),
    });

    expect(total).toBe(1);
    expect(items[0]?.nombre).toContain(marca);
  });
});
