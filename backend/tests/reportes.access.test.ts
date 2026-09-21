import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const mocks = vi.hoisted(() => ({
  findActivasByUsuarioId: vi.fn(),
  findEmpresaById: vi.fn(),
}));

vi.mock("../src/repositories/empresa.repository.js", () => ({
  findById: mocks.findEmpresaById,
}));

vi.mock("../src/repositories/membresia.repository.js", () => ({
  findActivasByUsuarioId: mocks.findActivasByUsuarioId,
}));

import { puedeGenerarReportes, resolverEmpresaIdReporte, resolverTenantContextReporte } from "../src/services/reportes/reportes.access.js";

function usuario(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "usuario-1",
    nombre: "Usuario de prueba",
    correo: "usuario@example.com",
    rol: "SUPERVISOR",
    sessionScope: "company",
    empresaId: "empresa-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("services/reportes/reportes.access — puedeGenerarReportes (pura, sin BD)", () => {
  it("permite ADMINISTRADOR/SUPERVISOR/SUPERVISOR_HOLDING/SUPER_ADMIN", () => {
    expect(puedeGenerarReportes({ rol: "ADMINISTRADOR" })).toBe(true);
    expect(puedeGenerarReportes({ rol: "SUPERVISOR" })).toBe(true);
    expect(puedeGenerarReportes({ rol: "SUPERVISOR_HOLDING" })).toBe(true);
    expect(puedeGenerarReportes({ rol: "SUPER_ADMIN" })).toBe(true);
  });

  it("deniega ASESOR/VENDEDOR (docs/blocks/e-dashboards.md, 'Asesor no')", () => {
    expect(puedeGenerarReportes({ rol: "ASESOR" })).toBe(false);
    expect(puedeGenerarReportes({ rol: "VENDEDOR" })).toBe(false);
  });
});

describe("services/reportes/reportes.access — resolverEmpresaIdReporte (docs/blocks/e-dashboards.md, 'Scope empresarial de ReporteJob')", () => {
  it("sin empresaId solicitado, usa el alcance de la sesión actual (usuario.empresaId) sin consultar Membresia", async () => {
    const resultado = await resolverEmpresaIdReporte(usuario({ empresaId: "empresa-1" }), undefined, {} as never);

    expect(resultado).toBe("empresa-1");
    expect(mocks.findActivasByUsuarioId).not.toHaveBeenCalled();
  });

  it("sin empresaId solicitado y sesión holding-wide (null), preserva null (reporte holding-wide)", async () => {
    const resultado = await resolverEmpresaIdReporte(usuario({ empresaId: null }), undefined, {} as never);

    expect(resultado).toBeNull();
  });

  it("con empresaId solicitado que SÍ coincide con una Membresia activa del usuario, lo acepta", async () => {
    mocks.findActivasByUsuarioId.mockResolvedValue([
      { empresaId: "empresa-2" },
      { empresaId: "empresa-3" },
    ]);

    const resultado = await resolverEmpresaIdReporte(usuario({ empresaId: "empresa-2" }), "empresa-3", {} as never);

    expect(resultado).toBe("empresa-3");
  });

  it("con empresaId solicitado que NO coincide con ninguna Membresia activa, rechaza con 403 -- incluso si por casualidad iguala usuario.empresaId de la sesión actual", async () => {
    mocks.findActivasByUsuarioId.mockResolvedValue([]);

    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: "empresa-1" }), "empresa-1", {} as never),
    ).rejects.toMatchObject({ code: "empresa_no_autorizada", statusHttp: 403 });
  });

  it("con empresaId solicitado y sesión company-scoped sin ninguna Membresia activa, rechaza con 403", async () => {
    mocks.findActivasByUsuarioId.mockResolvedValue([]);

    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: "empresa-1" }), "empresa-cualquiera", {} as never),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("con empresaId solicitado y sesión SUPER_ADMIN (alcance global), lo acepta SIN consultar Membresia ni empresa", async () => {
    const resultado = await resolverEmpresaIdReporte(
      usuario({ rol: "SUPER_ADMIN", empresaId: null }),
      "empresa-cualquiera",
      {} as never,
    );

    expect(resultado).toBe("empresa-cualquiera");
    expect(mocks.findActivasByUsuarioId).not.toHaveBeenCalled();
    expect(mocks.findEmpresaById).not.toHaveBeenCalled();
  });

  it("sesión holding: acepta una empresa de su holding sin consultar Membresia (T5b)", async () => {
    mocks.findEmpresaById.mockResolvedValue({ id: "empresa-a", holdingId: "holding-a" });
    const resultado = await resolverEmpresaIdReporte(
      usuario({ rol: "ADMINISTRADOR_HOLDING", empresaId: null, holdingId: "holding-a" }),
      "empresa-a",
      {} as never,
    );
    expect(resultado).toBe("empresa-a");
    expect(mocks.findActivasByUsuarioId).not.toHaveBeenCalled();
  });

  it("sesión holding: una empresa de OTRO holding o inexistente responde 404 (T5b)", async () => {
    mocks.findEmpresaById.mockResolvedValueOnce({ id: "empresa-b", holdingId: "holding-b" });
    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: null, holdingId: "holding-a" }), "empresa-b", {} as never),
    ).rejects.toMatchObject({ code: "empresa_no_encontrada", statusHttp: 404 });

    mocks.findEmpresaById.mockResolvedValueOnce(null);
    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: null, holdingId: "holding-a" }), "nope", {} as never),
    ).rejects.toMatchObject({ statusHttp: 404 });
  });

  it("sesión holding sin holdingId falla cerrada con 403 (T5b)", async () => {
    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: null }), "empresa-a", {} as never),
    ).rejects.toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
  });
});

describe("resolverTenantContextReporte (T5b)", () => {
  it("un reporte de una empresa corre en esa empresa", () => {
    expect(resolverTenantContextReporte({ rol: "SUPERVISOR", holdingId: null }, "e-1")).toEqual({ empresaId: "e-1" });
  });

  it("un reporte holding-wide corre en el holding del solicitante, no irrestricto", () => {
    expect(resolverTenantContextReporte({ rol: "ADMINISTRADOR_HOLDING", holdingId: "h-1" }, null)).toEqual({ holdingId: "h-1" });
    expect(resolverTenantContextReporte({ rol: "SUPERVISOR", holdingId: "h-1" }, null)).toEqual({ holdingId: "h-1" });
  });

  it("solo SUPER_ADMIN conserva el alcance global", () => {
    expect(resolverTenantContextReporte({ rol: "SUPER_ADMIN", holdingId: null }, null)).toEqual({ unrestricted: true });
  });

  it("holding-wide sin holding y sin ser SUPER_ADMIN falla cerrado (null)", () => {
    expect(resolverTenantContextReporte({ rol: "ADMINISTRADOR_HOLDING", holdingId: null }, null)).toBeNull();
  });
});
