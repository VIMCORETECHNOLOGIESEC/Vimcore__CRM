import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../src/lib/cifrado-token.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as inbox from "../src/repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../src/services/ingesta.service.js";
import { META_DETALLE_MAX_INTENTOS } from "../src/services/meta-webhook.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `procesarRecepcion`
 * corre en producción dentro de `runWithTenantContext({ empresaId: null },
 * ...)` (ver `jobs/ingesta-inbox.job.ts`) porque el worker no tiene ciclo de
 * request HTTP — este archivo la ejercita directo, así que replica ese mismo
 * contexto.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

/**
 * Cubre el tramo que se movió del controller síncrono al worker durable
 * (2026-08-18, cambio consciente: webhook de Meta pasado al patrón M4 de
 * `leads_recibidos`). `meta-webhook.routes.test.ts` cubre el `POST` (firma,
 * handshake, encolado idempotente); este archivo cubre lo que antes cubría
 * "POST /api/v1/ingesta/meta — manejo de errores" contra Graph API, ahora
 * ejercitado directamente sobre `procesarRecepcion` con un sobre
 * `META_PENDIENTE_DETALLE` (v2), mismo patrón que
 * `ingesta-inbox.worker.test.ts`.
 */

let contador = 0;

interface CuentaFixture {
  bridgeId: string;
  cuentaId: string;
  pageId: string;
}

async function crearBridgeConCuenta(
  overrides: { estadoToken?: "VALIDO" | "TOKEN_EXPIRADO" | "ERROR"; tokenCifrado?: string | null } = {},
): Promise<CuentaFixture> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge Meta Worker ${contador}`,
      claveApiHash: hashClaveBridge(`clave-meta-worker-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  const pageId = `page-meta-worker-${contador}`;
  const cuenta = await prisma.cuentaPublicitaria.create({
    data: {
      bridgeId: bridge.id,
      idExterno: pageId,
      nombre: `Página Meta Worker ${contador}`,
      estadoToken: overrides.estadoToken ?? "VALIDO",
      tokenCifrado:
        overrides.tokenCifrado === undefined ? encrypt("page-access-token-de-prueba") : overrides.tokenCifrado,
    },
  });
  return { bridgeId: bridge.id, cuentaId: cuenta.id, pageId };
}

function mockFetchJson(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Encola vía el repositorio y lo deja tomado como un `claimNext` real, igual que `ingesta-inbox.worker.test.ts`. */
async function encolarYReclamar(
  cuenta: CuentaFixture,
  leadgenId: string,
  owner: string,
): Promise<inbox.InboxClaim> {
  const recibidoEn = new Date();
  const receipt = await inbox.aceptarLeadgenMetaPendiente(
    { bridgeId: cuenta.bridgeId, leadgenId, pageId: cuenta.pageId },
    recibidoEn,
  );
  const row = await prisma.leadRecibido.update({
    where: { id: receipt.recepcionId },
    data: { estado: "PROCESANDO", intentos: 1, leaseOwner: owner, leaseHasta: new Date(Date.now() + 60_000) },
  });
  return {
    recepcionId: row.id,
    leaseOwner: owner,
    intento: 1,
    leaseHasta: row.leaseHasta!,
    entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedEntradaProcesamiento,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("worker de ingesta — sobre META_PENDIENTE_DETALLE (docs/05-bridges.md §8)", () => {
  it("fallo transitorio de Graph API: reintenta con backoff hasta 3 veces, registra ERROR y propaga el rechazo sin completar la recepción", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-worker-transitorio-${contador}`;
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(500, { error: { message: "temporalmente no disponible" } }));
    vi.stubGlobal("fetch", fetchMock);
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-transitorio");

    await expect(conContexto(() => procesarRecepcion(claim))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(META_DETALLE_MAX_INTENTOS);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: cuenta.bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain(`tras ${META_DETALLE_MAX_INTENTOS} intentos`);
    expect(JSON.stringify(log?.payload)).toContain(leadgenId);
    const recepcion = await prisma.leadRecibido.findUniqueOrThrow({ where: { id: claim.recepcionId } });
    expect(recepcion.leadId).toBeNull();
  }, 10_000);

  it("token ya TOKEN_EXPIRADO: no consulta Graph API, registra ERROR y propaga el rechazo", async () => {
    const cuenta = await crearBridgeConCuenta({ estadoToken: "TOKEN_EXPIRADO" });
    const leadgenId = `leadgen-worker-token-expirado-${contador}`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-token-expirado");

    await expect(conContexto(() => procesarRecepcion(claim))).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: cuenta.bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("no vigente");
  });

  it("Graph API detecta token inválido/revocado (error 190): marca la cuenta TOKEN_EXPIRADO sin agotar reintentos, y propaga el rechazo", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-worker-token-invalido-${contador}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchJson(400, { error: { code: 190, message: "Error validating access token" } }));
    vi.stubGlobal("fetch", fetchMock);
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-token-invalido");

    await expect(conContexto(() => procesarRecepcion(claim))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const cuentaActualizada = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuenta.cuentaId } });
    expect(cuentaActualizada.estadoToken).toBe("TOKEN_EXPIRADO");
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: cuenta.bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("TOKEN_EXPIRADO");
  });

  it("cuenta eliminada entre el encolado y el procesamiento: registra ERROR con bridgeId null y propaga el rechazo", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-worker-cuenta-eliminada-${contador}`;
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-cuenta-eliminada");
    await prisma.cuentaPublicitaria.delete({ where: { id: cuenta.cuentaId } });

    await expect(conContexto(() => procesarRecepcion(claim))).rejects.toThrow();

    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain(cuenta.pageId);
  });

  it("detalle resuelto sin teléfono ni correo: marca datosIncompletos y registra ADVERTENCIA (docs/05-bridges.md §8, 'notificar a supervisores')", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-worker-sin-contacto-${contador}`;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockFetchJson(200, {
        id: leadgenId,
        field_data: [{ name: "full_name", values: ["Cliente sin contacto"] }],
        ad_id: "ad-sin-contacto",
        form_id: "form-sin-contacto",
        campaign_id: "campania-sin-contacto",
        campaign_name: "Campaña sin contacto",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-sin-contacto");

    expect(await conContexto(() => procesarRecepcion(claim))).toBe(true);

    const recepcion = await prisma.leadRecibido.findUniqueOrThrow({ where: { id: claim.recepcionId } });
    expect(recepcion.datosIncompletos).toBe(true);
    expect(recepcion.leadId).not.toBeNull();
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: cuenta.bridgeId, nivel: "ADVERTENCIA" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("datos incompletos");
    expect(JSON.stringify(log?.payload)).toContain(recepcion.leadId);
  });

  it("detalle resuelto con teléfono: no marca datosIncompletos ni registra ADVERTENCIA", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-worker-con-telefono-${contador}`;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockFetchJson(200, {
        id: leadgenId,
        field_data: [
          { name: "full_name", values: ["Cliente con contacto"] },
          { name: "phone_number", values: ["+5491100000099"] },
        ],
        ad_id: "ad-con-contacto",
        form_id: "form-con-contacto",
        campaign_id: "campania-con-contacto",
        campaign_name: "Campaña con contacto",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const claim = await encolarYReclamar(cuenta, leadgenId, "worker-con-contacto");

    expect(await conContexto(() => procesarRecepcion(claim))).toBe(true);

    const recepcion = await prisma.leadRecibido.findUniqueOrThrow({ where: { id: claim.recepcionId } });
    expect(recepcion.datosIncompletos).toBe(false);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: cuenta.bridgeId, nivel: "ADVERTENCIA" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).toBeNull();
  });
});
