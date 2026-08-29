import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as configuracionEmpresaRepository from "../src/repositories/configuracion-empresa.repository.js";

async function limpiar(): Promise<void> {
  await prisma.configuracionEmpresa.deleteMany();
}

// Mismo criterio que `configuracion-empresa.service.test.ts`: tabla
// singleton compartida por toda la suite, `beforeEach` además de `afterEach`
// para no depender del orden de ejecución entre archivos de test.
beforeEach(async () => {
  await limpiar();
});

afterEach(async () => {
  await limpiar();
});

describe("repositories/configuracion-empresa — findSingleton", () => {
  it("devuelve null cuando no existe ninguna fila", async () => {
    const resultado = await configuracionEmpresaRepository.findSingleton();
    expect(resultado).toBeNull();
  });

  it("devuelve la única fila existente", async () => {
    const creada = await prisma.configuracionEmpresa.create({
      data: { nombre: "Instancia X", colorPrimario: "#111111", colorSecundario: "#222222" },
    });

    const resultado = await configuracionEmpresaRepository.findSingleton();
    expect(resultado?.id).toBe(creada.id);
  });
});

describe("repositories/configuracion-empresa — createWithDefaults", () => {
  it("crea la fila con los defaults documentados (nombre/colores actuales del frontend)", async () => {
    const creada = await configuracionEmpresaRepository.createWithDefaults();

    expect(creada.nombre).toBe("CRM Embudo de Leads");
    expect(creada.colorPrimario).toBe("#1e2a5e");
    expect(creada.colorSecundario).toBe("#2563eb");

    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });
});

describe("repositories/configuracion-empresa — upsertSingleton", () => {
  it("crea la fila con defaults + campos provistos cuando no existe ninguna", async () => {
    const resultado = await configuracionEmpresaRepository.upsertSingleton({ nombre: "Mi Empresa" });

    expect(resultado.nombre).toBe("Mi Empresa");
    expect(resultado.colorPrimario).toBe("#1e2a5e");
    expect(resultado.colorSecundario).toBe("#2563eb");

    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });

  it("actualiza la fila existente en vez de crear una segunda (nunca dos filas)", async () => {
    const existente = await configuracionEmpresaRepository.createWithDefaults();

    const resultado = await configuracionEmpresaRepository.upsertSingleton({
      colorPrimario: "#abcdef",
    });

    expect(resultado.id).toBe(existente.id);
    expect(resultado.colorPrimario).toBe("#abcdef");
    // Campos no enviados no se tocan.
    expect(resultado.nombre).toBe(existente.nombre);

    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });
});
