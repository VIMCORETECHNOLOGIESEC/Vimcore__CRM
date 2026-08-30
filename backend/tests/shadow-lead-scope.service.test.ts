import type { Lead } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque B (Fase 3, spec "Company-scoped open-lead dedupe runs in shadow
 * beside the global criterion"). `lead-abierto-revision.repository.ts`
 * mockeado (unit, sin BD/tx real) — el comparador nunca debe afectar ningún
 * valor que alimente `decideAccionDeduplicacion` (asserted implícitamente:
 * la función no devuelve nada que la deduplicación pudiera leer).
 */
vi.mock("../src/repositories/lead-abierto-revision.repository.js", () => ({
  upsertRevisionPendiente: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const leadAbiertoRevisionRepository = await import(
  "../src/repositories/lead-abierto-revision.repository.js"
);
const { logger } = await import("../src/lib/logger.js");
const { compararLeadAbiertoScope } = await import("../src/services/shadow-lead-scope.service.js");

const txFalsa = {} as never;

function leadFalso(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    clienteId: "cliente-1",
    origen: "NUEVO",
    etapa: "CONTACTADO",
    redSocial: null,
    camposDinamicos: null,
    payloadOriginal: null,
    semaforo: null,
    puntuacion: null,
    asesorId: null,
    vendedorId: null,
    slaInicioEn: null,
    ingresadoEn: new Date(),
    cerradoEn: null,
    montoVenta: null,
    observacionCierre: null,
    productoServicio: null,
    formaPago: null,
    cuentaPublicitariaId: null,
    campaniaId: null,
    idExternoCuenta: null,
    idExternoCampania: null,
    nombreCampania: null,
    empresaId: "empresa-lead",
    ...overrides,
  } as Lead;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("services/shadow-lead-scope — compararLeadAbiertoScope (Fase 3, shadow, no cutover)", () => {
  it("no loguea ni escribe cuando el scope coincide (happy path)", async () => {
    await compararLeadAbiertoScope(leadFalso({ empresaId: "empresa-1" }), "empresa-1", txFalsa);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(leadAbiertoRevisionRepository.upsertRevisionPendiente).not.toHaveBeenCalled();
  });

  it("loguea divergencia y hace upsert en la cola de revisión cuando el scope difiere (ambos no nulos)", async () => {
    await compararLeadAbiertoScope(
      leadFalso({ id: "lead-1", clienteId: "cliente-1", empresaId: "empresa-A" }),
      "empresa-B",
      txFalsa,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shadow_dedupe_scope_divergence" }),
      expect.any(String),
    );
    expect(leadAbiertoRevisionRepository.upsertRevisionPendiente).toHaveBeenCalledWith(
      {
        clienteId: "cliente-1",
        leadAbiertoId: "lead-1",
        empresaLeadId: "empresa-A",
        empresaIngestaId: "empresa-B",
      },
      txFalsa,
    );
  });

  it("no hace nada cuando no hay lead abierto (leadAbierto null)", async () => {
    await compararLeadAbiertoScope(null, "empresa-B", txFalsa);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(leadAbiertoRevisionRepository.upsertRevisionPendiente).not.toHaveBeenCalled();
  });

  it("no hace nada cuando empresaIdCandidato es null (bridge sin empresa / sin bridgeId)", async () => {
    await compararLeadAbiertoScope(leadFalso({ empresaId: "empresa-A" }), null, txFalsa);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(leadAbiertoRevisionRepository.upsertRevisionPendiente).not.toHaveBeenCalled();
  });

  it("no hace nada cuando el lead abierto legado (pre-Fase-3) tiene empresaId null", async () => {
    await compararLeadAbiertoScope(leadFalso({ empresaId: null }), "empresa-B", txFalsa);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(leadAbiertoRevisionRepository.upsertRevisionPendiente).not.toHaveBeenCalled();
  });

  it("no lanza ni bloquea cuando el repositorio de revisión falla (scoped evaluation failure is non-fatal)", async () => {
    vi.mocked(leadAbiertoRevisionRepository.upsertRevisionPendiente).mockRejectedValue(
      new Error("boom"),
    );

    await expect(
      compararLeadAbiertoScope(leadFalso({ empresaId: "empresa-A" }), "empresa-B", txFalsa),
    ).resolves.toBeUndefined();
  });
});

