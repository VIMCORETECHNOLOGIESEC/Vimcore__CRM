import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "../src/lib/cifrado-token.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { cargarToken, probarConexion } from "../src/services/cuenta-publicitaria.service.js";

/**
 * `cargarToken`/`probarConexion` (docs/05-bridges.md §7): mismo estilo de
 * fixtures que `bridges.service.test.ts`, mismo mocking de `fetch` que
 * `meta-webhook.worker.test.ts`.
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
      nombre: `Bridge token-service ${contador}`,
      claveApiHash: hashClaveBridge(`clave-token-service-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

async function crearCuenta(bridgeId: string, overrides: { tokenCifrado?: string | null } = {}): Promise<{ id: string }> {
  contador += 1;
  const cuenta = await prisma.cuentaPublicitaria.create({
    data: {
      bridgeId,
      idExterno: `page-token-service-${contador}`,
      nombre: `Página token-service ${contador}`,
      tokenCifrado: overrides.tokenCifrado ?? null,
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

describe("cuenta-publicitaria.service — cargarToken (docs/05-bridges.md §7, carga y renovación con verificación inmediata)", () => {
  it("token válido: cifra y persiste tokenCifrado/tokenExpiraEn, marca VALIDO, y nunca devuelve el token en claro", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId);
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(200, { data: { is_valid: true, expires_at: 1_900_000_000 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const dto = await cargarToken(bridgeId, cuentaId, "page-access-token-en-claro");

    expect(dto).not.toHaveProperty("tokenCifrado");
    expect(JSON.stringify(dto)).not.toContain("page-access-token-en-claro");
    expect(dto.estadoToken).toBe("VALIDO");
    expect(dto.tokenExpiraEn).toEqual(new Date(1_900_000_000 * 1000));

    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.estadoToken).toBe("VALIDO");
    expect(fila.tokenCifrado).not.toBeNull();
    expect(decrypt(fila.tokenCifrado as string)).toBe("page-access-token-en-claro");
    expect(fila.tokenExpiraEn).toEqual(new Date(1_900_000_000 * 1000));
  });

  it("token inválido: 422, nunca cifra ni persiste nada", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId);
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(200, { data: { is_valid: false, error: { message: "Token inválido" } } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarToken(bridgeId, cuentaId, "token-malo")).rejects.toMatchObject({
      code: "meta_token_invalido",
      statusHttp: 422,
    });

    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.tokenCifrado).toBeNull();
    expect(fila.estadoToken).toBe("VALIDO"); // default, sin cambios
  });

  it("bridge inexistente: 404, nunca llama a Graph API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      cargarToken("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001", "token"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cuenta que no pertenece al bridge: 404, nunca llama a Graph API", async () => {
    const { id: bridgeA } = await crearBridge();
    const { id: bridgeB } = await crearBridge();
    const { id: cuentaDeA } = await crearCuenta(bridgeA);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarToken(bridgeB, cuentaDeA, "token")).rejects.toMatchObject({
      code: "cuenta_publicitaria_no_encontrada",
      statusHttp: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cuenta-publicitaria.service — probarConexion (docs/05-bridges.md §7, prueba de conexión bajo demanda)", () => {
  it("token vigente: ok=true, nunca persiste cambios", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId, {
      tokenCifrado: encrypt("token-vigente"),
    });
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const antes = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });

    const resultado = await probarConexion(bridgeId, cuentaId);

    expect(resultado).toEqual({ ok: true, mensaje: "Conexión verificada correctamente." });
    const despues = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(despues).toEqual(antes);
  });

  it("token inválido/revocado: ok=false, nunca persiste cambios (estadoToken se mantiene VALIDO)", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId, {
      tokenCifrado: encrypt("token-revocado"),
    });
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: false } }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await probarConexion(bridgeId, cuentaId);

    expect(resultado.ok).toBe(false);
    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.estadoToken).toBe("VALIDO");
  });

  it("cuenta sin token cargado: ok=false sin llamar a Graph API", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await probarConexion(bridgeId, cuentaId);

    expect(resultado.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      probarConexion("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });

  it("tokenCifrado corrupto: devuelve { ok: false, mensaje } en vez de lanzar (contrato del endpoint)", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: cuentaId } = await crearCuenta(bridgeId, {
      tokenCifrado: "ciphertext-corrupto-no-parseable",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await probarConexion(bridgeId, cuentaId);

    expect(resultado.ok).toBe(false);
    expect(typeof resultado.mensaje).toBe("string");
    expect(resultado.mensaje.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    const fila = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(fila.estadoToken).toBe("VALIDO"); // puramente diagnóstica, nunca persiste
  });
});
