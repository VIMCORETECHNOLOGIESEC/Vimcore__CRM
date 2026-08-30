import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const mocks = vi.hoisted(() => ({
  findActivasByUsuarioId: vi.fn(),
}));

vi.mock("../src/repositories/membresia.repository.js", () => ({
  findActivasByUsuarioId: mocks.findActivasByUsuarioId,
}));

import { puedeGenerarReportes, resolverEmpresaIdReporte } from "../src/services/reportes/reportes.access.js";

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

  it("con empresaId solicitado y el usuario sin ninguna Membresia activa, rechaza con 403", async () => {
    mocks.findActivasByUsuarioId.mockResolvedValue([]);

    await expect(
      resolverEmpresaIdReporte(usuario({ empresaId: null }), "empresa-cualquiera", {} as never),
    ).rejects.toBeInstanceOf(AppError);
  });
});
