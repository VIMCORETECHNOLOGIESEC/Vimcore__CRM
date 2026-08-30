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
// Gap de paginación (478 filas reales sin límite ni filtro en este entorno):
// `findAll` devuelve `{ items, total }`, no un array plano.
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

    const { items } = await empresaRepository.findAll();

    expect(items).toContainEqual(
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

    const { items } = await empresaRepository.findAll();

    expect(items).toContainEqual(
      expect.objectContaining({
        id: empresa.id,
        nombre: empresa.nombre,
        colorPrimario: null,
        colorSecundario: null,
        logoUrl: null,
      }),
    );
  });

  it("devuelve un array en items (independiente de cuántas Empresa existan)", async () => {
    const { items } = await empresaRepository.findAll();

    expect(Array.isArray(items)).toBe(true);
  });

  it("respeta skip/take para paginar", async () => {
    const nombreBase = `Empresa repo paginacion ${randomUUID()}`;
    await prisma.empresa.create({ data: { nombre: `${nombreBase} A` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} B` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} C` } });

    const { items } = await empresaRepository.findAll({
      where: { nombre: { contains: nombreBase, mode: "insensitive" } },
      skip: 1,
      take: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.nombre).toBe(`${nombreBase} B`);
  });

  it("total refleja el conteo del where, no el tamaño de la página", async () => {
    const nombreBase = `Empresa repo total ${randomUUID()}`;
    await prisma.empresa.create({ data: { nombre: `${nombreBase} A` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} B` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} C` } });

    const { items, total } = await empresaRepository.findAll({
      where: { nombre: { contains: nombreBase, mode: "insensitive" } },
      skip: 0,
      take: 1,
    });

    expect(items).toHaveLength(1);
    expect(total).toBe(3);
  });

  it("filtra por where (contains case-insensitive sobre nombre)", async () => {
    const marca = `MarcaUnica${randomUUID().replace(/-/g, "")}`;
    await prisma.empresa.create({ data: { nombre: `Empresa ${marca} SA` } });

    const { items, total } = await empresaRepository.findAll({
      where: { nombre: { contains: marca.toLowerCase(), mode: "insensitive" } },
    });

    expect(total).toBe(1);
    expect(items[0]?.nombre).toContain(marca);
  });
});

// POST /empresas (alta de empresa nueva): mismo `select` que `findAll`/
// `findById`, así que `create` devuelve el mismo shape `EmpresaListItem`.
describe("empresa.repository::create", () => {
  it("crea la Empresa con nombre y apariencia completa", async () => {
    const nombre = `Empresa repo alta ${randomUUID()}`;

    const creada = await empresaRepository.create({
      nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });

    expect(creada).toEqual({
      id: creada.id,
      nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });

    const enBd = await prisma.empresa.findUnique({ where: { id: creada.id } });
    expect(enBd?.nombre).toBe(nombre);
  });

  it("crea la Empresa solo con nombre (apariencia queda null)", async () => {
    const nombre = `Empresa repo alta minima ${randomUUID()}`;

    const creada = await empresaRepository.create({ nombre });

    expect(creada).toEqual({
      id: creada.id,
      nombre,
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });
});
