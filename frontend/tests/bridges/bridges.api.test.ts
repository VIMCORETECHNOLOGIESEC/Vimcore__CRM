import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/api/httpClient";
import {
  BRIDGES_MOCK,
  fetchBridgeDetalleApi,
  fetchBridgeLogsApi,
  fetchBridgesApi,
  saveTokenApi,
  testConnectionApi,
  toggleCuentaActivaApi,
} from "@/funcionalidades/bridges/bridges.api";

/**
 * `BRIDGES_MOCK` es un fixture mutable en memoria (mismo criterio que
 * `LEADS_MOCK` en F3): las pruebas que mutan estado/token/cuentas restauran
 * el snapshot original después de cada test, para que el orden de ejecución
 * nunca afecte a otro test (mismo problema y misma solución que
 * `reassignCarteraActiva` -- ver `usuarios.api.test.ts`, que en cambio no
 * necesita restaurar porque solo un test lo ejercita).
 */
const SNAPSHOT_INICIAL: typeof BRIDGES_MOCK = JSON.parse(JSON.stringify(BRIDGES_MOCK));

afterEach(() => {
  for (const original of SNAPSHOT_INICIAL) {
    const actual = BRIDGES_MOCK.find((b) => b.id === original.id);
    if (!actual) continue;
    actual.estado = original.estado;
    actual.tokenExpiraEn = original.tokenExpiraEn;
    actual.ultimoLeadEn = original.ultimoLeadEn;
    actual.cuentasPublicitarias = original.cuentasPublicitarias.map((c) => ({ ...c }));
  }
});

describe("fetchBridgesApi", () => {
  it("devuelve el listado con estado, último lead recibido y expiración de token", async () => {
    const bridges = await fetchBridgesApi();
    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      expect(bridge).toHaveProperty("estado");
      expect(bridge).toHaveProperty("ultimoLeadEn");
      expect(bridge).toHaveProperty("tokenExpiraEn");
    }
  });

  it("cubre las 5 redes sociales documentadas (docs/05)", async () => {
    const bridges = await fetchBridgesApi();
    const redes = new Set(bridges.map((b) => b.redSocial));
    expect(redes).toEqual(new Set(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "X", "GOOGLE_FORMS"]));
  });

  it("nunca expone ningún campo de token -- solo estado y expiración (docs/05 §7)", async () => {
    const bridges = await fetchBridgesApi();
    for (const bridge of bridges) {
      expect(bridge).not.toHaveProperty("token");
      expect(bridge).not.toHaveProperty("tokenCifrado");
      expect(bridge).not.toHaveProperty("secretoWebhook");
    }
  });

  it("devuelve copias, no referencias al fixture (mutar el resultado no afecta al mock compartido)", async () => {
    const bridges = await fetchBridgesApi();
    bridges[0].estado = "ERROR";
    const bridgesOtraVez = await fetchBridgesApi();
    expect(bridgesOtraVez[0].estado).not.toBe("ERROR");
  });
});

describe("fetchBridgeDetalleApi", () => {
  it("devuelve el bridge con sus cuentas publicitarias asociadas", async () => {
    const bridge = await fetchBridgeDetalleApi("bridge-facebook");
    expect(bridge.id).toBe("bridge-facebook");
    expect(bridge.cuentasPublicitarias.length).toBeGreaterThan(0);
  });

  it("lanza un error si el bridge no existe", async () => {
    await expect(fetchBridgeDetalleApi("no-existe")).rejects.toThrow();
  });
});

describe("saveTokenApi — carga y renovación con verificación inmediata", () => {
  it("con un token válido, activa el bridge y fija una nueva expiración", async () => {
    const bridge = await saveTokenApi("bridge-linkedin", "un-token-bastante-largo-1234");
    expect(bridge.estado).toBe("ACTIVO");
    expect(bridge.tokenExpiraEn).not.toBeNull();
    expect(new Date(bridge.tokenExpiraEn as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("con un token demasiado corto, rechaza con un ApiError accionable (verificación inmediata fallida)", async () => {
    await expect(saveTokenApi("bridge-linkedin", "corto")).rejects.toBeInstanceOf(ApiError);
    await expect(saveTokenApi("bridge-linkedin", "corto")).rejects.toThrow(
      "El token no es válido. Verificá que lo copiaste completo desde la plataforma e intentá nuevamente.",
    );
  });

  it("no cambia el estado del bridge cuando el token es rechazado", async () => {
    try {
      await saveTokenApi("bridge-linkedin", "corto");
    } catch {
      // esperado
    }
    const bridge = await fetchBridgeDetalleApi("bridge-linkedin");
    expect(bridge.estado).toBe("TOKEN_EXPIRADO");
  });

  it("para X (clave de API, sin expiración), guarda el token sin fijar tokenExpiraEn", async () => {
    const bridge = await saveTokenApi("bridge-x", "una-clave-de-api-bien-larga-123");
    expect(bridge.estado).toBe("ACTIVO");
    expect(bridge.tokenExpiraEn).toBeNull();
  });
});

describe("testConnectionApi — prueba de conexión bajo demanda", () => {
  it("falla con un mensaje accionable si el token expiró", async () => {
    const resultado = await testConnectionApi("bridge-linkedin");
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("token expiró");
  });

  it("falla con un mensaje accionable si el bridge está inactivo", async () => {
    const resultado = await testConnectionApi("bridge-google-forms");
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("inactivo");
  });

  it("falla con un mensaje accionable si el estado es ERROR", async () => {
    const resultado = await testConnectionApi("bridge-x");
    expect(resultado.ok).toBe(false);
  });

  it("es exitosa para un bridge ACTIVO", async () => {
    const resultado = await testConnectionApi("bridge-facebook");
    expect(resultado.ok).toBe(true);
  });

  it("no cambia el estado guardado del bridge -- es puramente diagnóstica", async () => {
    await testConnectionApi("bridge-linkedin");
    const bridge = await fetchBridgeDetalleApi("bridge-linkedin");
    expect(bridge.estado).toBe("TOKEN_EXPIRADO");
  });
});

describe("toggleCuentaActivaApi — alta/baja de cuentas publicitarias (docs/05 §7)", () => {
  it("activa/desactiva la cuenta indicada y devuelve el bridge actualizado", async () => {
    const cuentaId = SNAPSHOT_INICIAL.find((b) => b.id === "bridge-facebook")?.cuentasPublicitarias[1]
      .id as string; // cuenta-fb-2, activa: false originalmente
    const bridge = await toggleCuentaActivaApi("bridge-facebook", cuentaId, true);
    const cuenta = bridge.cuentasPublicitarias.find((c) => c.id === cuentaId);
    expect(cuenta?.activa).toBe(true);
  });

  it("lanza un error si la cuenta no existe", async () => {
    await expect(toggleCuentaActivaApi("bridge-facebook", "no-existe", true)).rejects.toThrow();
  });
});

describe("fetchBridgeLogsApi — bitácora con filtro por nivel y rango de fechas", () => {
  it("solo devuelve entradas del bridge solicitado", async () => {
    const logs = await fetchBridgeLogsApi("bridge-linkedin");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.bridgeId === "bridge-linkedin")).toBe(true);
  });

  it("filtra por nivel", async () => {
    const logs = await fetchBridgeLogsApi("bridge-linkedin", { nivel: "ERROR" });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.nivel === "ERROR")).toBe(true);
  });

  it("filtra por rango de fechas", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const logs = await fetchBridgeLogsApi("bridge-x", { fechaDesde: hoy, fechaHasta: hoy });
    expect(logs.every((log) => log.ocurridoEn.slice(0, 10) === hoy)).toBe(true);
  });

  it("combina nivel y rango de fechas en la misma consulta (filtros combinables)", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const logs = await fetchBridgeLogsApi("bridge-x", { nivel: "ERROR", fechaDesde: hoy });
    expect(logs.every((log) => log.nivel === "ERROR")).toBe(true);
  });

  it("ordena de más reciente a más antigua", async () => {
    const logs = await fetchBridgeLogsApi("bridge-linkedin");
    const timestamps = logs.map((log) => new Date(log.ocurridoEn).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });
});
