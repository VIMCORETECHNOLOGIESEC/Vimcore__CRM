import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { getConfiguracion, updateConfiguracion } from "../src/services/configuracion-empresa.service.js";

async function limpiar(): Promise<void> {
  await prisma.configuracionEmpresa.deleteMany();
}

// `beforeEach` (no solo `afterEach`): `configuracion_empresa` es una tabla
// singleton compartida por toda la suite — el primer test de este archivo no
// puede asumir que quedó vacía tras otro archivo de test (orden de ejecución
// de vitest no es una garantía a la que este archivo deba atarse).
beforeEach(async () => {
  await limpiar();
});

afterEach(async () => {
  await limpiar();
});

describe("services/configuracion-empresa — getConfiguracion", () => {
  it("lazy init: crea la fila con defaults cuando no existe ninguna previa", async () => {
    const resultado = await getConfiguracion();

    expect(resultado).toEqual({
      nombre: "CRM Embudo de Leads",
      colorPrimario: "#1e2a5e",
      colorSecundario: "#2563eb",
    });

    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });

  it("no crea una segunda fila en llamadas sucesivas", async () => {
    await getConfiguracion();
    const segunda = await getConfiguracion();

    expect(segunda.nombre).toBe("CRM Embudo de Leads");
    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });

  it("devuelve la fila ya personalizada si existe", async () => {
    await prisma.configuracionEmpresa.create({
      data: { nombre: "Empresa Personalizada", colorPrimario: "#010203", colorSecundario: "#040506" },
    });

    const resultado = await getConfiguracion();
    expect(resultado).toEqual({
      nombre: "Empresa Personalizada",
      colorPrimario: "#010203",
      colorSecundario: "#040506",
    });
  });
});

describe("services/configuracion-empresa — updateConfiguracion", () => {
  it("actualiza parcialmente solo el campo enviado", async () => {
    await getConfiguracion();

    const resultado = await updateConfiguracion({ nombre: "Nuevo Nombre" });

    expect(resultado.nombre).toBe("Nuevo Nombre");
    expect(resultado.colorPrimario).toBe("#1e2a5e");
    expect(resultado.colorSecundario).toBe("#2563eb");
  });

  it("crea la fila si aún no existe (PATCH antes de cualquier GET)", async () => {
    const resultado = await updateConfiguracion({ colorPrimario: "#123456" });

    expect(resultado.colorPrimario).toBe("#123456");
    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });
});
