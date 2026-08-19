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

    // `listConTokenCargado` no filtra por bridge (universo completo): no se
    // afirma `resultado.invalidados === 0` en términos absolutos — otro
    // archivo de la suite puede haber dejado una cuenta con un
    // `tokenCifrado` no descifrable (ver test "cuentas sin tokenCifrado" más
    // abajo), que se re-marca TOKEN_EXPIRADO en cada tick sin relación con
    // esta cuenta. Lo que importa acá es el resultado scopeado a ESTA cuenta
    // y a ESTE bridge, verificado abajo.
    await verificarTokensVigentes(new Date());

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
    // Delta contra `antes`, no un `toBe(0)` absoluto: una cuenta con
    // `tokenCifrado` no descifrable dejada por otro archivo de la suite
    // (universo completo, sin filtro por bridge) se re-invalida en CADA
    // tick, incluido este "antes" — lo que importa es que agregar una cuenta
    // SIN token no sume una invalidación nueva.
    expect(despues.invalidados).toBe(antes.invalidados);
  });

  it("consulta Graph API exactamente una vez por cuenta con token cargado y descifrable, ninguna extra por las que no lo tienen", async () => {
    // `listConTokenCargado` reprocesa el universo COMPLETO de cuentas con
    // token en cada tick (no solo las nuevas de este test) — un delta de
    // llamadas entre dos invocaciones no aísla la contribución específica de
    // este test, porque la segunda invocación vuelve a contar TODAS las
    // cuentas descifrables ya existentes, no solo la nueva. Se verifica en
    // su lugar, con una única invocación, que Graph API se consultó
    // exactamente una vez con la URL que corresponde al token en claro de la
    // cuenta creada acá (`encodeURIComponent` del texto descifrado) — robusto
    // a cualquier otra cuenta que otro archivo de la suite haya dejado en la
    // misma base compartida.
    contador += 1;
    const tokenEnClaro = `token-consulta-unica-${contador}`;
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const { id: bridgeId } = await crearBridge();
    await crearCuentaConToken(bridgeId, { tokenCifrado: null });
    await crearCuentaConToken(bridgeId, { tokenCifrado: encrypt(tokenEnClaro) });

    await verificarTokensVigentes(new Date());

    const llamadasParaEstaCuenta = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(encodeURIComponent(tokenEnClaro)),
    );
    expect(llamadasParaEstaCuenta).toHaveLength(1);
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
