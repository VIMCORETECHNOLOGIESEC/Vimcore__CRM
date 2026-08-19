import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../src/lib/cifrado-token.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { verificarTokensVigentes } from "../src/services/verificacion-token.service.js";

/**
 * `verificarTokensVigentes` (docs/05-bridges.md §3, "Trabajo programado:
 * verificación diaria de token vigente por Página vía `/debug_token`"),
 * mismo estilo de fixtures que `bridge-mudo.job.test.ts` y mismo mocking de
 * `fetch` que `meta-webhook.worker.test.ts`.
 */

let contador = 0;

function mockFetchJson(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge verificacion-token ${contador}`,
      claveApiHash: hashClaveBridge(`clave-verificacion-token-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

async function crearCuentaConToken(
  bridgeId: string,
  overrides: { tokenCifrado?: string | null; tokenExpiraEn?: Date | null } = {},
): Promise<{ id: string }> {
  contador += 1;
  const cuenta = await prisma.cuentaPublicitaria.create({
    data: {
      bridgeId,
      idExterno: `page-verificacion-token-${contador}`,
      nombre: `Página verificacion-token ${contador}`,
      tokenCifrado: overrides.tokenCifrado === undefined ? encrypt(`token-${contador}`) : overrides.tokenCifrado,
      tokenExpiraEn: overrides.tokenExpiraEn ?? null,
    },
  });
  return { id: cuenta.id };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("verificacion-token.service — verificarTokensVigentes", () => {
  it("token inválido/revocado: marca TOKEN_EXPIRADO y registra bridge_logs ERROR", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuentaConToken(bridgeId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: false } })));

    const resultado = await verificarTokensVigentes(new Date());

    expect(resultado.candidatos).toBeGreaterThanOrEqual(1);
    expect(resultado.invalidados).toBeGreaterThanOrEqual(1);
    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.estadoToken).toBe("TOKEN_EXPIRADO");
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("inválido/revocado");
    expect(log?.mensaje).toContain("TOKEN_EXPIRADO");
  });

  it("token válido: no modifica estadoToken ni registra ningún bridge_logs", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuentaConToken(bridgeId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } })));

    const resultado = await verificarTokensVigentes(new Date());

    expect(resultado.invalidados).toBe(0);
    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.estadoToken).toBe("VALIDO");
    const log = await prisma.bridgeLog.findFirst({ where: { bridgeId } });
    expect(log).toBeNull();
  });

  it("token válido con expires_at nuevo: actualiza tokenExpiraEn sin volver a cifrar", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuentaConToken(bridgeId, { tokenExpiraEn: null });
    const filaAntes = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true, expires_at: 1_900_000_000 } })),
    );

    await verificarTokensVigentes(new Date());

    const filaDespues = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(filaDespues.tokenExpiraEn).toEqual(new Date(1_900_000_000 * 1000));
    expect(filaDespues.tokenCifrado).toBe(filaAntes.tokenCifrado);
  });

  it("cuentas sin tokenCifrado se ignoran: no aumentan el conteo de candidatos ni disparan una consulta propia", async () => {
    // `listConTokenCargado` no filtra por bridge (docs/05-bridges.md §3, "universo
    // completo"): otros tests de este archivo/suite pueden dejar cuentas CON
    // token en la misma base compartida, así que no se puede afirmar
    // `fetchMock` nunca llamado en términos absolutos — se mide en delta.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } })));
    const antes = await verificarTokensVigentes(new Date());

    const { id: bridgeId } = await crearBridge();
    await crearCuentaConToken(bridgeId, { tokenCifrado: null });

    const despues = await verificarTokensVigentes(new Date());

    expect(despues.candidatos).toBe(antes.candidatos);
    expect(despues.invalidados).toBe(0);
  });

  it("consulta Graph API exactamente una vez por cuenta con token cargado, ninguna extra por las que no lo tienen", async () => {
    const { id: bridgeId } = await crearBridge();
    await crearCuentaConToken(bridgeId, { tokenCifrado: null });
    await crearCuentaConToken(bridgeId);
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokensVigentes(new Date());

    expect(fetchMock).toHaveBeenCalledTimes(resultado.candidatos);
  });

  it("tokenCifrado corrupto en una cuenta: marca esa cuenta TOKEN_EXPIRADO, registra bridge_logs ERROR, y NO aborta el resto del loop", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaCorruptaId } = await crearCuentaConToken(bridgeId, {
      tokenCifrado: "ciphertext-corrupto-no-parseable",
    });
    const { id: cuentaSanaId } = await crearCuentaConToken(bridgeId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } })));

    const resultado = await verificarTokensVigentes(new Date());

    expect(resultado.invalidados).toBeGreaterThanOrEqual(1);

    const filaCorrupta = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaCorruptaId } });
    expect(filaCorrupta.estadoToken).toBe("TOKEN_EXPIRADO");
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("no se pudo descifrar");
    expect(log?.mensaje).toContain("TOKEN_EXPIRADO");

    // La otra cuenta del mismo tick se verifica igual — el fallo de una
    // cuenta no interrumpe el resto del loop (`listConTokenCargado` no
    // garantiza orden, así que esto cubre cualquier posición relativa).
    const filaSana = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaSanaId } });
    expect(filaSana.estadoToken).toBe("VALIDO");
  });
});
