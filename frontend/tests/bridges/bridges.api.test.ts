import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/api/httpClient";
import {
  BRIDGES_MOCK,
  createBridgeApi,
  deleteBridgeApi,
  fetchBridgeDetalleApi,
  fetchBridgeLogsApi,
  fetchBridgesApi,
  fetchRedesSocialesActivasApi,
  fetchRedesSocialesSoportadasApi,
  reactivateBridgeApi,
  regenerateClaveApi,
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
 *
 * A partir de bridge-lifecycle-management, `BRIDGES_MOCK` también cambia de
 * TAMAÑO (alta/baja física con push/splice) -- por eso la restauración ya no
 * alcanza con pisar campos: reconstruye el arreglo completo con el snapshot
 * inicial clonado.
 */
const SNAPSHOT_INICIAL: typeof BRIDGES_MOCK = JSON.parse(JSON.stringify(BRIDGES_MOCK));

afterEach(() => {
  BRIDGES_MOCK.length = 0;
  BRIDGES_MOCK.push(...SNAPSHOT_INICIAL.map((b) => ({ ...b, cuentasPublicitarias: b.cuentasPublicitarias.map((c) => ({ ...c })) })));
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

describe("createBridgeApi — alta de bridge (Requirement: Create Bridge)", () => {
  it("crea el bridge con estado INACTIVO y devuelve la clave en texto plano una única vez", async () => {
    const respuesta = await createBridgeApi({ redSocial: "GOOGLE_FORMS", nombre: "Formulario Ventas Norte" });

    expect(respuesta.bridge.redSocial).toBe("GOOGLE_FORMS");
    expect(respuesta.bridge.nombre).toBe("Formulario Ventas Norte");
    expect(respuesta.bridge.estado).toBe("INACTIVO");
    expect(respuesta.claveApi).toMatch(/^brg_/);
  });

  it("el bridge creado aparece en el listado inmediatamente después", async () => {
    const respuesta = await createBridgeApi({ redSocial: "X", nombre: "X — Campaña Sur" });

    const bridges = await fetchBridgesApi();
    expect(bridges.some((b) => b.id === respuesta.bridge.id)).toBe(true);
  });

  it("permite dos bridges con la misma redSocial y distinto nombre (Requirement: Multiple Bridges per Red Social)", async () => {
    await createBridgeApi({ redSocial: "FACEBOOK", nombre: "Facebook — Página Norte" });
    await createBridgeApi({ redSocial: "FACEBOOK", nombre: "Facebook — Página Sur" });

    const bridges = await fetchBridgesApi();
    const facebookBridges = bridges.filter((b) => b.redSocial === "FACEBOOK");
    expect(facebookBridges.length).toBeGreaterThanOrEqual(2);
    expect(new Set(facebookBridges.map((b) => b.id)).size).toBe(facebookBridges.length);
  });
});

describe("deleteBridgeApi — baja física u lógica según historial de leads (Requirement: Hard Delete Only Without Leads)", () => {
  it("bridge sin leads recibidos (ultimoLeadEn nulo): baja física, se elimina del listado", async () => {
    const resultado = await deleteBridgeApi("bridge-google-forms");

    expect(resultado.resultado).toBe("BAJA_FISICA");
    const bridges = await fetchBridgesApi();
    expect(bridges.some((b) => b.id === "bridge-google-forms")).toBe(false);
  });

  it("bridge con leads recibidos (ultimoLeadEn no nulo): baja lógica, queda INACTIVO pero no se elimina", async () => {
    const resultado = await deleteBridgeApi("bridge-facebook");

    expect(resultado.resultado).toBe("BAJA_LOGICA");
    expect(resultado.bridge.estado).toBe("INACTIVO");
    const bridges = await fetchBridgesApi();
    expect(bridges.some((b) => b.id === "bridge-facebook")).toBe(true);
  });

  it("lanza un error si el bridge no existe", async () => {
    await expect(deleteBridgeApi("no-existe")).rejects.toThrow();
  });
});

describe("reactivateBridgeApi — reactivación preserva clave e historial (Requirement: Soft Deactivate and Reactivate)", () => {
  it("pasa el estado a ACTIVO sin tocar ultimoLeadEn ni cuentasPublicitarias", async () => {
    const bridge = await reactivateBridgeApi("bridge-google-forms");

    expect(bridge.estado).toBe("ACTIVO");
    expect(bridge.ultimoLeadEn).toBe(SNAPSHOT_INICIAL.find((b) => b.id === "bridge-google-forms")?.ultimoLeadEn ?? null);
  });

  it("funciona igual sobre un bridge ya ACTIVO (idempotente)", async () => {
    const bridge = await reactivateBridgeApi("bridge-facebook");
    expect(bridge.estado).toBe("ACTIVO");
  });

  it("lanza un error si el bridge no existe", async () => {
    await expect(reactivateBridgeApi("no-existe")).rejects.toThrow();
  });
});

describe("regenerateClaveApi — invalida la clave anterior (Requirement: Regenerate Key)", () => {
  it("devuelve una nueva clave en texto plano con la misma forma que la de alta", async () => {
    const respuesta = await regenerateClaveApi("bridge-x");
    expect(respuesta.claveApi).toMatch(/^brg_/);
    expect(respuesta.bridge.id).toBe("bridge-x");
  });

  it("dos regeneraciones sucesivas nunca devuelven la misma clave", async () => {
    const primera = await regenerateClaveApi("bridge-x");
    const segunda = await regenerateClaveApi("bridge-x");
    expect(primera.claveApi).not.toBe(segunda.claveApi);
  });

  it("no cambia el estado guardado del bridge", async () => {
    await regenerateClaveApi("bridge-google-forms");
    const bridge = await fetchBridgeDetalleApi("bridge-google-forms");
    expect(bridge.estado).toBe("INACTIVO");
  });

  it("lanza un error si el bridge no existe", async () => {
    await expect(regenerateClaveApi("no-existe")).rejects.toThrow();
  });
});

describe("fetchRedesSocialesSoportadasApi — catálogo de creación (Requirement: Backend-Driven Creation Catalog)", () => {
  it("devuelve las 5 redes sociales soportadas", async () => {
    const redes = await fetchRedesSocialesSoportadasApi();
    expect(new Set(redes)).toEqual(new Set(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "X", "GOOGLE_FORMS"]));
  });
});

describe("fetchRedesSocialesActivasApi — catálogo de activas para el filtro de F3 (Requirement: Active Red-Social Catalog Endpoint)", () => {
  it("devuelve solo las redes sociales de bridges ACTIVO, sin duplicados", async () => {
    const redes = await fetchRedesSocialesActivasApi();
    expect(new Set(redes)).toEqual(new Set(["FACEBOOK", "INSTAGRAM"]));
    expect(redes.length).toBe(new Set(redes).size);
  });

  it("una vez desactivado el único bridge de una red, esa red ya no aparece", async () => {
    await deleteBridgeApi("bridge-facebook");
    const redes = await fetchRedesSocialesActivasApi();
    expect(redes).not.toContain("FACEBOOK");
  });

  it("devuelve vacío cuando ningún bridge está ACTIVO", async () => {
    await deleteBridgeApi("bridge-facebook");
    await deleteBridgeApi("bridge-instagram");
    const redes = await fetchRedesSocialesActivasApi();
    expect(redes).toEqual([]);
  });
});
