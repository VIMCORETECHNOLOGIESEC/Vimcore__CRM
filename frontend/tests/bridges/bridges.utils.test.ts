import { describe, expect, it } from "vitest";
import {
  evaluateAvisoBridge,
  evaluateEstadoTokenCuenta,
  formatFecha,
  proximaExpiracionTokenBridge,
  canEliminarseFisicamente,
  hasAvisoDestacado,
  listAvisosBridge,
  buildBridgesQueryParams,
  FILTRO_TODOS,
  FILTROS_BRIDGES_VACIOS,
  type BridgesFiltrosState,
} from "@/funcionalidades/bridges/bridges.utils";
import type { Bridge, CuentaPublicitariaBridge } from "@/tipos/bridge";

const AHORA = new Date("2026-08-14T12:00:00.000Z");

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
    ...overrides,
  };
}

function cuentaFake(overrides: Partial<CuentaPublicitariaBridge> = {}): CuentaPublicitariaBridge {
  return {
    id: "c1",
    bridgeId: "bridge-1",
    idExterno: "act_1",
    nombre: "Cuenta",
    instagramAccountId: null,
    activa: true,
    estadoToken: "VALIDO",
    tokenExpiraEn: null,
    ...overrides,
  };
}

function horasAntes(horas: number): string {
  return new Date(AHORA.getTime() - horas * 60 * 60 * 1000).toISOString();
}

function diasDesde(dias: number): string {
  return new Date(AHORA.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

describe("evaluateAvisoBridge — token expirado (peor caso entre cuentas publicitarias)", () => {
  it("marca tokenExpirado cuando alguna cuenta tiene estadoToken TOKEN_EXPIRADO", () => {
    const bridge = bridgeFake({ cuentasPublicitarias: [cuentaFake({ estadoToken: "TOKEN_EXPIRADO" })] });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenExpirado).toBe(true);
  });

  it("no marca tokenExpirado para estadoToken ERROR, aunque también sea una condición anómala", () => {
    const bridge = bridgeFake({ cuentasPublicitarias: [cuentaFake({ estadoToken: "ERROR" })] });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenExpirado).toBe(false);
  });

  it("un bridge con una cuenta expirada y otra sana muestra el peor caso (tokenExpirado true)", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [
        cuentaFake({ id: "c1", estadoToken: "TOKEN_EXPIRADO" }),
        cuentaFake({ id: "c2", estadoToken: "VALIDO", tokenExpiraEn: diasDesde(200) }),
      ],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenExpirado).toBe(true);
  });

  it("un bridge sin ninguna cuenta publicitaria no dispara ningún aviso de token", () => {
    const bridge = bridgeFake({ cuentasPublicitarias: [] });
    const aviso = evaluateAvisoBridge(bridge, AHORA);
    expect(aviso.tokenExpirado).toBe(false);
    expect(aviso.tokenProximoAVencer).toBe(false);
  });

  it("ignora `bridge.estado`/`bridge.tokenExpiraEn` (datos muertos a nivel bridge) para decidir tokenExpirado", () => {
    const bridge = bridgeFake({
      estado: "TOKEN_EXPIRADO",
      tokenExpiraEn: diasDesde(-1),
      cuentasPublicitarias: [cuentaFake({ estadoToken: "VALIDO" })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenExpirado).toBe(false);
  });
});

describe("evaluateAvisoBridge — token próximo a vencer (umbral de 7 días)", () => {
  it("marca tokenProximoAVencer cuando una cuenta VALIDO expira dentro de los 7 días", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: diasDesde(3) })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenProximoAVencer).toBe(true);
  });

  it("no marca tokenProximoAVencer cuando la expiración está a más de 7 días", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: diasDesde(8) })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenProximoAVencer).toBe(false);
  });

  it("no marca tokenProximoAVencer si tokenExpiraEn es nulo (token de larga duración que no expira)", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: null })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).tokenProximoAVencer).toBe(false);
  });

  it("prioriza tokenExpirado sobre tokenProximoAVencer si otra cuenta ya expiró (peor caso)", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [
        cuentaFake({ id: "c1", estadoToken: "TOKEN_EXPIRADO" }),
        cuentaFake({ id: "c2", estadoToken: "VALIDO", tokenExpiraEn: diasDesde(3) }),
      ],
    });
    const aviso = evaluateAvisoBridge(bridge, AHORA);
    expect(aviso.tokenExpirado).toBe(true);
    expect(aviso.tokenProximoAVencer).toBe(false);
  });
});

describe("evaluateAvisoBridge — sin actividad (docs/05 §8, 72 horas con cuentas activas)", () => {
  it("marca sinActividad cuando pasaron 72 h o más desde el último lead, con una cuenta activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(72),
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(true);
  });

  it("no marca sinActividad con menos de 72 h desde el último lead", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(10),
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("marca sinActividad cuando nunca recibió un lead (ultimoLeadEn nulo), con cuenta activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: null,
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(true);
  });

  it("no marca sinActividad si ninguna cuenta publicitaria está activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: null,
      cuentasPublicitarias: [cuentaFake({ activa: false })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("no marca sinActividad si no hay ninguna cuenta publicitaria asociada", () => {
    const bridge = bridgeFake({ ultimoLeadEn: null, cuentasPublicitarias: [] });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("un bridge INACTIVO nunca dispara sinActividad, aunque nunca haya recibido leads con cuenta activa", () => {
    const bridge = bridgeFake({
      estado: "INACTIVO",
      ultimoLeadEn: null,
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    expect(evaluateAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });
});

describe("hasAvisoDestacado", () => {
  it("es true si cualquiera de las tres banderas es true", () => {
    expect(
      hasAvisoDestacado({ tokenExpirado: true, tokenProximoAVencer: false, sinActividad: false }),
    ).toBe(true);
    expect(
      hasAvisoDestacado({ tokenExpirado: false, tokenProximoAVencer: true, sinActividad: false }),
    ).toBe(true);
    expect(
      hasAvisoDestacado({ tokenExpirado: false, tokenProximoAVencer: false, sinActividad: true }),
    ).toBe(true);
  });

  it("es false cuando ninguna bandera está activa", () => {
    expect(
      hasAvisoDestacado({ tokenExpirado: false, tokenProximoAVencer: false, sinActividad: false }),
    ).toBe(false);
  });
});

describe("proximaExpiracionTokenBridge", () => {
  it("devuelve la fecha más próxima entre varias cuentas con expiración conocida", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [
        cuentaFake({ id: "c1", tokenExpiraEn: diasDesde(20) }),
        cuentaFake({ id: "c2", tokenExpiraEn: diasDesde(3) }),
      ],
    });
    expect(proximaExpiracionTokenBridge(bridge)).toBe(diasDesde(3));
  });

  it("devuelve null si ninguna cuenta tiene tokenExpiraEn", () => {
    const bridge = bridgeFake({
      cuentasPublicitarias: [cuentaFake({ tokenExpiraEn: null })],
    });
    expect(proximaExpiracionTokenBridge(bridge)).toBeNull();
  });

  it("devuelve null si el bridge no tiene ninguna cuenta publicitaria", () => {
    expect(proximaExpiracionTokenBridge(bridgeFake({ cuentasPublicitarias: [] }))).toBeNull();
  });
});

describe("evaluateEstadoTokenCuenta — estado puntual por cuenta, sin agregación", () => {
  it("devuelve TOKEN_EXPIRADO para una cuenta con estadoToken TOKEN_EXPIRADO", () => {
    expect(evaluateEstadoTokenCuenta(cuentaFake({ estadoToken: "TOKEN_EXPIRADO" }), AHORA)).toBe(
      "TOKEN_EXPIRADO",
    );
  });

  it("devuelve ERROR_VERIFICACION para una cuenta con estadoToken ERROR", () => {
    expect(evaluateEstadoTokenCuenta(cuentaFake({ estadoToken: "ERROR" }), AHORA)).toBe(
      "ERROR_VERIFICACION",
    );
  });

  it("devuelve TOKEN_PROXIMO_A_VENCER para una cuenta VALIDO que expira dentro del umbral", () => {
    expect(
      evaluateEstadoTokenCuenta(cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: diasDesde(5) }), AHORA),
    ).toBe("TOKEN_PROXIMO_A_VENCER");
  });

  it("devuelve TOKEN_VALIDO para una cuenta VALIDO que expira lejos, o que no expira nunca", () => {
    expect(
      evaluateEstadoTokenCuenta(cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: diasDesde(60) }), AHORA),
    ).toBe("TOKEN_VALIDO");
    expect(
      evaluateEstadoTokenCuenta(cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: null }), AHORA),
    ).toBe("TOKEN_VALIDO");
  });
});

describe("formatFecha", () => {
  it("formatea en DD/MM/AAAA HH:mm (docs/07, formato de fechas)", () => {
    const iso = new Date(2026, 2, 5, 8, 7).toISOString();
    expect(formatFecha(iso)).toBe("05/03/2026 08:07");
  });
});

describe("canEliminarseFisicamente — señal de baja física vs. lógica (Requirement: Hard Delete Only Without Leads)", () => {
  it("es true cuando el bridge nunca recibió un lead (ultimoLeadEn nulo)", () => {
    const bridge = bridgeFake({ ultimoLeadEn: null });
    expect(canEliminarseFisicamente(bridge)).toBe(true);
  });

  it("es false cuando el bridge ya recibió al menos un lead", () => {
    const bridge = bridgeFake({ ultimoLeadEn: horasAntes(5) });
    expect(canEliminarseFisicamente(bridge)).toBe(false);
  });
});

describe("listAvisosBridge — lista discreta de avisos para el ícono por fila (F8)", () => {
  it("devuelve un arreglo vacío para un bridge sano", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(1),
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    expect(listAvisosBridge(bridge, AHORA)).toEqual([]);
  });

  it("token expirado: un único aviso de severidad alta", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(1),
      cuentasPublicitarias: [cuentaFake({ estadoToken: "TOKEN_EXPIRADO" })],
    });
    const avisos = listAvisosBridge(bridge, AHORA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toEqual({
      severidad: "alta",
      mensaje: "El token expiró y dejará de recibir leads hasta que se cargue uno nuevo.",
    });
  });

  it("token próximo a vencer: un único aviso de severidad media", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(1),
      cuentasPublicitarias: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn: diasDesde(3) })],
    });
    const avisos = listAvisosBridge(bridge, AHORA);
    expect(avisos).toEqual([
      {
        severidad: "media",
        mensaje: "El token de alguna cuenta publicitaria está próximo a vencer.",
      },
    ]);
  });

  it("sin actividad: un único aviso de severidad media", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(200),
      cuentasPublicitarias: [cuentaFake({ activa: true })],
    });
    const avisos = listAvisosBridge(bridge, AHORA);
    expect(avisos).toEqual([
      {
        severidad: "media",
        mensaje: "No recibió leads en las últimas 72 horas a pesar de tener cuentas publicitarias activas.",
      },
    ]);
  });

  it("token expirado y sin actividad a la vez: dos avisos, el de severidad alta primero", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(200),
      cuentasPublicitarias: [cuentaFake({ estadoToken: "TOKEN_EXPIRADO", activa: true })],
    });
    const avisos = listAvisosBridge(bridge, AHORA);
    expect(avisos).toHaveLength(2);
    expect(avisos[0].severidad).toBe("alta");
    expect(avisos[1].severidad).toBe("media");
  });
});

describe("buildBridgesQueryParams — contrato de query de fetchBridgesApi (F8)", () => {
  it("sin filtros activos, solo manda pagina y limite", () => {
    expect(buildBridgesQueryParams(FILTROS_BRIDGES_VACIOS, 1, 10)).toEqual({ pagina: 1, limite: 10 });
  });

  it("recorta espacios de la búsqueda y la omite si queda vacía", () => {
    const filtros: BridgesFiltrosState = { ...FILTROS_BRIDGES_VACIOS, busqueda: "  meta ads  " };
    expect(buildBridgesQueryParams(filtros, 1, 10)).toEqual({ pagina: 1, limite: 10, busqueda: "meta ads" });

    const filtrosVacios: BridgesFiltrosState = { ...FILTROS_BRIDGES_VACIOS, busqueda: "   " };
    expect(buildBridgesQueryParams(filtrosVacios, 1, 10)).toEqual({ pagina: 1, limite: 10 });
  });

  it("incluye redSocial y estado solo cuando no son el sentinela FILTRO_TODOS", () => {
    const filtros: BridgesFiltrosState = { busqueda: "", redSocial: "FACEBOOK", estado: "ACTIVO" };
    expect(buildBridgesQueryParams(filtros, 2, 20)).toEqual({
      pagina: 2,
      limite: 20,
      redSocial: "FACEBOOK",
      estado: "ACTIVO",
    });
  });

  it("con FILTRO_TODOS en ambos, no manda redSocial ni estado", () => {
    const filtros: BridgesFiltrosState = {
      busqueda: "",
      redSocial: FILTRO_TODOS,
      estado: FILTRO_TODOS,
    };
    expect(buildBridgesQueryParams(filtros, 1, 10)).toEqual({ pagina: 1, limite: 10 });
  });
});
