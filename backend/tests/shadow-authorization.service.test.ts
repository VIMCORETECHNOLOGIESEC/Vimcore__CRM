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

/**
 * Bloque C (Fase 1 / Stage 1, D1): corrige el bug nombrado en el brief —
 * `rolesEquivalentesActivos` pooleaba membresías de TODAS las empresas del
 * usuario, descartando `empresaId` antes de comparar. Estas pruebas fijan el
 * comportamiento correcto (empresa cruzada = no equivalente) y preservan el
 * paso holding-wide (`empresaId === null`, D2) para no romper los call sites
 * existentes (que siguen sin pasar un `empresaId`, ver
 * `shadow-authorization.wiring.test.ts` / `require-role.middleware.test.ts`).
 */
describe("services/shadow-authorization — rolesEquivalentesActivos empresa-aware (Bloque C, D1)", () => {
  it("una Membresia de OTRA empresa ya no reporta equivalencia: divergencia si el legado permitía", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ empresaId: "empresa-A", rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareRequireRole(
      "usuario-1",
      ["ADMINISTRADOR"],
      true,
      "empresa-B",
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "shadow_authz_divergence",
        capability: "requireRole",
        legacyDecision: true,
        membresiaDecision: false,
      }),
      expect.any(String),
    );
  });

  it("una Membresia de la MISMA empresa sigue contando como equivalente (sin falso positivo)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ empresaId: "empresa-A", rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareRequireRole(
      "usuario-1",
      ["ADMINISTRADOR"],
      true,
      "empresa-A",
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("empresaId=null (holding-wide, D2) preserva el paso pooled sin filtrar por empresa", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ empresaId: "empresa-A", rol: "ADMINISTRADOR" }),
    ]);

    await shadowAuthorizationService.compareRequireRole(
      "usuario-1",
      ["ADMINISTRADOR"],
      true,
      null,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("emite shadow_authz_empresa_compared cuando compara con una empresa específica (señal de volumen, D3)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([]);

    await shadowAuthorizationService.compareRequireRole(
      "usuario-1",
      ["ADMINISTRADOR"],
      false,
      "empresa-A",
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shadow_authz_empresa_compared", empresaId: "empresa-A" }),
      expect.any(String),
    );
  });

  it("NO emite shadow_authz_empresa_compared en el paso holding-wide (empresaId=null)", async () => {
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([]);

    await shadowAuthorizationService.compareRequireRole("usuario-1", ["ADMINISTRADOR"], false, null);

    expect(logger.info).not.toHaveBeenCalled();
  });
});

/**
 * Bloque C (Fase 1 / Stage 1, D3, spec "Bake-period exit"): función pura,
 * sin mocks — el exit criterion exige AMBAS condiciones.
 */
describe("services/shadow-authorization — evaluateBakeExit (Bloque C, D3, bake-period exit)", () => {
  it("Scenario 'Low-traffic bake cannot be declared clean': tiempo cumplido, volumen bajo -> not-met nombrando 'volume'", () => {
    const resultado = shadowAuthorizationService.evaluateBakeExit({
      elapsedDays: 30,
      observedCount: 5,
      minDays: 30,
      minCount: 1000,
    });

    expect(resultado).toEqual({ status: "not-met", missing: ["volume"] });
  });

  it("volumen cumplido, tiempo insuficiente -> not-met nombrando 'elapsed'", () => {
    const resultado = shadowAuthorizationService.evaluateBakeExit({
      elapsedDays: 5,
      observedCount: 5000,
      minDays: 30,
      minCount: 1000,
    });

    expect(resultado).toEqual({ status: "not-met", missing: ["elapsed"] });
  });

  it("ambos criterios cumplidos -> met", () => {
    const resultado = shadowAuthorizationService.evaluateBakeExit({
      elapsedDays: 30,
      observedCount: 1000,
      minDays: 30,
      minCount: 1000,
    });

    expect(resultado).toEqual({ status: "met" });
  });

  it("ambos criterios insuficientes -> not-met nombrando ambos", () => {
    const resultado = shadowAuthorizationService.evaluateBakeExit({
      elapsedDays: 1,
      observedCount: 1,
      minDays: 30,
      minCount: 1000,
    });

    expect(resultado).toEqual({ status: "not-met", missing: ["elapsed", "volume"] });
  });
});

