import type { Membresia } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque B (Fase 2, non-functional requirement "Shadow authorizer is
 * observational only"). `membresia.repository.ts` mockeado (unit, sin BD);
 * `leads.access.ts` se importa REAL — el comparador reutiliza
 * `canReassign`/`canTransfer`/`canClose` tal cual, contra un `UsuarioAcceso`
 * sintético proyectado desde cada `Membresia` activa (mismo criterio de
 * mapeo que el backfill de Fase 1: `ASESOR + habilitadoParaVenta=true` ⇔
 * `VENDEDOR` legado).
 */
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findActivasByUsuarioId: vi.fn(),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const { logger } = await import("../src/lib/logger.js");
const shadowAuthorizationService = await import("../src/services/shadow-authorization.service.js");

function membresiaFalsa(overrides: Partial<Membresia> = {}): Membresia {
  return {
    id: "membresia-1",
    usuarioId: "usuario-1",
    empresaId: "empresa-1",
    rol: "ASESOR",
    habilitadoParaVenta: false,
    correo: null,
    passwordHash: null,
    activa: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("services/shadow-authorization — compareRequireRole (Fase 2, shadow, no cutover)", () => {
  it("no loguea divergencia cuando ambas decisiones coinciden (permitido en ambas)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareRequireRole(
      "usuario-1",
      ["ADMINISTRADOR", "SUPERVISOR"],
      true,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("loguea divergencia cuando Usuario.rol permite pero ninguna Membresia activa lo haría", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: false }),
    ]);

    await shadowAuthorizationService.compareRequireRole("usuario-1", ["ADMINISTRADOR"], true);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shadow_authz_divergence", capability: "requireRole" }),
      expect.any(String),
    );
  });

  it("mapea VENDEDOR legado <-> Membresia ASESOR+habilitadoParaVenta=true sin divergencia", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: true }),
    ]);

    await shadowAuthorizationService.compareRequireRole("usuario-1", ["VENDEDOR"], true);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("no lanza ni bloquea cuando el repositorio falla (shadow failure is non-fatal)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockRejectedValue(new Error("boom"));

    await expect(
      shadowAuthorizationService.compareRequireRole("usuario-1", ["ADMINISTRADOR"], true),
    ).resolves.toBeUndefined();
  });
});

describe("services/shadow-authorization — compareCanReassign", () => {
  it("no loguea divergencia cuando ambas rutas deniegan (VENDEDOR legado, ASESOR habilitado_para_venta=true)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: true }),
    ]);

    await shadowAuthorizationService.compareCanReassign(
      "usuario-1",
      { asesorId: "otro", vendedorId: null, semaforo: null },
      "rol",
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("loguea divergencia cuando la Membresia habilitaría (ADMINISTRADOR) pero el legado deniega", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareCanReassign(
      "usuario-1",
      { asesorId: "otro", vendedorId: null, semaforo: null },
      "rol",
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shadow_authz_divergence", capability: "canReassign" }),
      expect.any(String),
    );
  });
});

describe("services/shadow-authorization — compareCanTransfer", () => {
  it("no loguea divergencia cuando ambas rutas coinciden (permitido)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareCanTransfer(
      "usuario-1",
      { asesorId: "usuario-1", vendedorId: null, etapa: "CONTACTADO" },
      null,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("services/shadow-authorization — compareCanClose", () => {
  it("loguea divergencia cuando el legado permite y ninguna Membresia activa lo haría", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([]);

    await shadowAuthorizationService.compareCanClose(
      "usuario-1",
      { asesorId: "usuario-1", vendedorId: null, etapa: "CONTACTADO" },
      null,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shadow_authz_divergence", capability: "canClose" }),
      expect.any(String),
    );
  });
});

