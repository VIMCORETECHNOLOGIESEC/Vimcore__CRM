import { RedSocial } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import * as bridgeLogRepository from "../src/repositories/bridge-log.repository.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import {
  createBridge,
  deleteBridge,
  findBridges,
  getBridgeById,
  listLogs,
  listRedesActivas,
  listRedesSoportadas,
  regenerateClave,
  resolveLimiteLogs,
  updateBridge,
} from "../src/services/bridge.service.js";
import {
  create as crearCuentaPublicitaria,
  listByBridge as listarCuentasPorBridge,
  toggleActiva,
} from "../src/services/cuenta-publicitaria.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

/**
 * Fix (bug de seguridad, scope por empresa en `bridge.service.ts`): los
 * lookups por id ahora exigen el actor autenticado. Este archivo prueba el
 * comportamiento de cada operación en sí (no el scope por empresa, cubierto
 * en `tests/adversarial/http-cross-company.test.ts`) -- un actor holding-wide
 * preserva el comportamiento exacto previo a este fix
 * (`bridgeFueraDeAlcance` es siempre `false` cuando `empresaId === null`).
 */
const actorHoldingWide: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000bb",
  nombre: "Actor Holding-Wide (fixture de test)",
  correo: "actor-holding-wide-bridges@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "holding",
  empresaId: null,
};

/**
 * Fix (bug de seguridad, empresaId forzado por sesión -- `createBridge`, y
 * scope de los sub-recursos -- `cuenta-publicitaria.service.ts`/
 * `bridgeApi/configuracion.service.ts`): actor company-scoped sintético,
 * mismo criterio que `usuarios.service.test.ts`.
 */
const actorCompanyScoped: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000dd",
  nombre: "Actor Company-Scoped (fixture de test)",
  correo: "actor-company-scoped-bridges@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "company",
  empresaId: EMPRESA_BOOTSTRAP_ID,
};

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `bridge.service.ts`/
 * `cuenta-publicitaria.service.ts` no aceptan un `client` swappable (a
 * diferencia de los repositorios) — llaman siempre al `prisma` real
 * (`crm_app`) internamente. Estas pruebas invocan esos servicios DIRECTO
 * (sin HTTP/`requireAuthentication`), así que no hay `TenantContext` real
 * salvo que esta prueba lo fije explícitamente. `conContexto` envuelve la
 * llamada bajo prueba en `runWithTenantContext` (empresa bootstrap) — mismo
 * patrón que un request autenticado normal vería.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, fn);
}

/**
 * Fix (post-corrección, corrida real contra `.env.dev`): `empresaId: null`
 * es el contexto RLS "sin restricción" -- mismo criterio que
 * `deduplicacion.service.test.ts::sinRestriccion`. Un actor holding-wide que
 * necesita leer/escribir una fila de una empresa DISTINTA a la de
 * `conContexto` (BOOTSTRAP) requiere este wrapper: `conContexto` por sí solo
 * pinea la RLS del cliente `prisma` normal a BOOTSTRAP, y esa fila sería
 * físicamente invisible para esa conexión sin importar qué `actor` reciba el
 * service -- RLS es una capa independiente del chequeo de aplicación
 * (`bridgeFueraDeAlcance`) que este archivo prueba.
 */
function sinRestriccion<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

function claveApiUnica(): string {
  contador += 1;
  return `clave-api-service-${contador}`;
}

async function crearBridgeDirecto(
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO"; redSocial: RedSocial }> = {},
): Promise<{ id: string; claveApi: string }> {
  contador += 1;
  const claveApi = claveApiUnica();
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: overrides.redSocial ?? "GOOGLE_FORMS",
      nombre: `Bridge servicio ${contador}`,
      claveApiHash: hashClaveBridge(claveApi),
      estado: overrides.estado ?? "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id, claveApi };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bridge.service — createBridge (Requirement: Bridge creation starts inactive with one-time plaintext key)", () => {
  it("nace INACTIVO sin importar el redSocial y devuelve la clave en claro con el prefijo brg_", async () => {
    const { bridge, claveApi } = await conContexto(() =>
      createBridge(actorHoldingWide, {
        redSocial: "FACEBOOK",
        nombre: "Bridge Facebook Servicio",
        empresaId: EMPRESA_BOOTSTRAP_ID,
      }),
    );

    expect(bridge.estado).toBe("INACTIVO");
    expect(claveApi.startsWith("brg_")).toBe(true);

    const filaPersistida = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id: bridge.id } });
    expect(filaPersistida.claveApiHash).toBe(hashClaveBridge(claveApi));
  });

  it("la respuesta nunca incluye claveApiHash", async () => {
    const { bridge } = await conContexto(() =>
      createBridge(actorHoldingWide, {
        redSocial: "X",
        nombre: "Bridge X Servicio",
        empresaId: EMPRESA_BOOTSTRAP_ID,
      }),
    );

    expect(bridge).not.toHaveProperty("claveApiHash");
    expect(bridge.tokenExpiraEn).toBeNull();
  });

  it("actor holding-wide sin empresaId en el body: rechaza con 400 empresa_requerida", () =>
    conContexto(() =>
      expect(
        createBridge(actorHoldingWide, { redSocial: "GOOGLE_FORMS", nombre: "Bridge sin empresa" }),
      ).rejects.toMatchObject({ code: "empresa_requerida", statusHttp: 400 }),
    ));

  /** Fix (bug de seguridad: POST /bridges no forzaba empresaId a la empresa del actor). */
  it("actor company-scoped: ignora el empresaId del body y usa el de su propia sesión", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena bridges ${crypto.randomUUID()}` },
      });

      const { bridge } = await createBridge(actorCompanyScoped, {
        redSocial: "GOOGLE_FORMS",
        nombre: `Bridge company-scoped ${crypto.randomUUID()}`,
        empresaId: empresaAjena.id,
      });

      const filaPersistida = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id: bridge.id } });
      expect(filaPersistida.empresaId).toBe(EMPRESA_BOOTSTRAP_ID);
      expect(filaPersistida.empresaId).not.toBe(empresaAjena.id);
    }));
});

describe("bridge.service — findBridges/getBridgeById", () => {
  it("findBridges nunca expone claveApiHash y devuelve total/pagina/limite", async () => {
    await crearBridgeDirecto();

    const resultado = await conContexto(() => findBridges(actorHoldingWide, { pagina: 1, limite: 20 }));

    expect(resultado.bridges.length).toBeGreaterThan(0);
    expect(typeof resultado.total).toBe("number");
    expect(resultado.pagina).toBe(1);
    expect(resultado.limite).toBe(20);
    for (const bridge of resultado.bridges) {
      expect(bridge).not.toHaveProperty("claveApiHash");
    }
  });

  it("findBridges filtra por busqueda contra el nombre (insensible a mayúsculas)", async () => {
    const { id } = await crearBridgeDirecto();
    const nombreUnico = (await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } })).nombre;

    const resultado = await conContexto(() =>
      findBridges(actorHoldingWide, {
        pagina: 1,
        limite: 20,
        busqueda: nombreUnico.toUpperCase(),
      }),
    );

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
  });

  it("findBridges filtra por redSocial exacto", async () => {
    const { id } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });

    const resultado = await conContexto(() => findBridges(actorHoldingWide, { pagina: 1, limite: 100, redSocial: "FACEBOOK" }));

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
    for (const bridge of resultado.bridges) {
      expect(bridge.redSocial).toBe("FACEBOOK");
    }
  });

  it("findBridges filtra por estado exacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO" });

    const resultado = await conContexto(() => findBridges(actorHoldingWide, { pagina: 1, limite: 100, estado: "INACTIVO" }));

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
    for (const bridge of resultado.bridges) {
      expect(bridge.estado).toBe("INACTIVO");
    }
  });

  it("findBridges pagina respetando limite", async () => {
    await crearBridgeDirecto();
    await crearBridgeDirecto();

    const primeraPagina = await conContexto(() => findBridges(actorHoldingWide, { pagina: 1, limite: 1 }));
    expect(primeraPagina.bridges).toHaveLength(1);
    expect(primeraPagina.total).toBeGreaterThanOrEqual(2);

    const segundaPagina = await conContexto(() => findBridges(actorHoldingWide, { pagina: 2, limite: 1 }));
    expect(segundaPagina.bridges).toHaveLength(1);
    expect(segundaPagina.bridges[0]?.id).not.toBe(primeraPagina.bridges[0]?.id);
  });

  it("getBridgeById incluye cuentasPublicitarias embebidas", async () => {
    const { id } = await crearBridgeDirecto();

    const detalle = await conContexto(() => getBridgeById(actorHoldingWide, id));

    expect(detalle.id).toBe(id);
    expect(Array.isArray(detalle.cuentasPublicitarias)).toBe(true);
  });

  it("getBridgeById con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => getBridgeById(actorHoldingWide, "00000000-0000-0000-0000-000000000000")),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — updateBridge (Requirement: PATCH /bridges/:id es el único endpoint)", () => {
  it("renombrar no cambia el estado", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const actualizado = await conContexto(() => updateBridge(actorHoldingWide, id, { nombre: "Nombre Renombrado" }));

    expect(actualizado.nombre).toBe("Nombre Renombrado");
    expect(actualizado.estado).toBe("ACTIVO");
  });

  it("cambia estado de ACTIVO a INACTIVO y viceversa por el mismo endpoint", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const desactivado = await conContexto(() => updateBridge(actorHoldingWide, id, { estado: "INACTIVO" }));
    expect(desactivado.estado).toBe("INACTIVO");

    const reactivado = await conContexto(() => updateBridge(actorHoldingWide, id, { estado: "ACTIVO" }));
    expect(reactivado.estado).toBe("ACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => updateBridge(actorHoldingWide, "00000000-0000-0000-0000-000000000000", { nombre: "Fantasma" })),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — deleteBridge (Requirement: Delete mode is decided by lead count, never ultimoLeadEn)", () => {
  it("con leadsRecibidos.count === 0 hace BAJA_FISICA y elimina la fila", async () => {
    const { id } = await crearBridgeDirecto();

    const resultado = await conContexto(() => deleteBridge(actorHoldingWide, id));

    expect(resultado.resultado).toBe("BAJA_FISICA");
    const filaTrasBorrado = await testAdminPrisma.bridge.findUnique({ where: { id } });
    expect(filaTrasBorrado).toBeNull();
  });

  it("con leadsRecibidos.count > 0 hace BAJA_LOGICA y la fila permanece INACTIVO", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });
    await testAdminPrisma.leadRecibido.create({
      data: {
        bridgeId: id,
        idExternoLead: `lead-externo-${contador}`,
        payload: {},
        entradaProcesamiento: {},
      },
    });

    const resultado = await conContexto(() => deleteBridge(actorHoldingWide, id));

    expect(resultado.resultado).toBe("BAJA_LOGICA");
    const filaTrasBaja = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(filaTrasBaja.estado).toBe("INACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => deleteBridge(actorHoldingWide, "00000000-0000-0000-0000-000000000000")),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — regenerateClave (Requirement: Key regeneration never changes bridge state)", () => {
  it("emite una clave nueva distinta de la original y deja estado ACTIVO intacto", async () => {
    const { id, claveApi: claveOriginal } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const { bridge, claveApi: claveNueva } = await conContexto(() => regenerateClave(actorHoldingWide, id));

    expect(claveNueva).not.toBe(claveOriginal);
    expect(bridge.estado).toBe("ACTIVO");
  });

  it("deja estado INACTIVO intacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO" });

    const { bridge } = await conContexto(() => regenerateClave(actorHoldingWide, id));

    expect(bridge.estado).toBe("INACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => regenerateClave(actorHoldingWide, "00000000-0000-0000-0000-000000000000")),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — listRedesSoportadas (Requirement: Network catalogs are enum-derived and deduplicated)", () => {
  it("devuelve solo las redes con integración de ingesta real (FACEBOOK, GOOGLE_FORMS y API_EXTERNA)", () => {
    const redes = listRedesSoportadas();

    expect(new Set(redes)).toEqual(new Set<RedSocial>(["FACEBOOK", "GOOGLE_FORMS", "API_EXTERNA"]));
  });

  it("excluye INSTAGRAM, X y LINKEDIN aunque formen parte del enum RedSocial", () => {
    const redes = listRedesSoportadas();

    expect(redes).not.toContain("INSTAGRAM" satisfies RedSocial);
    expect(redes).not.toContain("X" satisfies RedSocial);
    expect(redes).not.toContain("LINKEDIN" satisfies RedSocial);
  });
});

describe("bridge.service — listRedesActivas (Requirement: Network catalogs are enum-derived and deduplicated)", () => {
  it("no duplica una red social compartida por dos bridges no eliminados", async () => {
    await crearBridgeDirecto({ redSocial: "X" });
    await crearBridgeDirecto({ redSocial: "X" });

    const redes = await conContexto(() => listRedesActivas());

    expect(redes.filter((r) => r === "X")).toHaveLength(1);
  });
});

describe("bridge.service — resolveLimiteLogs (Requirement: Log reads are bounded by a server-side default cap)", () => {
  it("sin argumento devuelve el default 100", () => {
    expect(resolveLimiteLogs(undefined)).toBe(100);
  });

  it("recorta un valor mayor a 500 al cap duro", () => {
    expect(resolveLimiteLogs(10_000)).toBe(500);
  });

  it("respeta un valor válido dentro del rango", () => {
    expect(resolveLimiteLogs(10)).toBe(10);
  });
});

describe("bridge.service — listLogs (Requirement: Log reads are bounded by a server-side default cap)", () => {
  it("filtra por bridge y nivel, respetando el límite resuelto", async () => {
    const { id } = await crearBridgeDirecto();
    await bridgeLogRepository.registrarLog(
      { bridgeId: id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "info listarLogs" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "ERROR", mensaje: "error listarLogs" },
      testAdminPrisma,
    );

    const logs = await conContexto(() => listLogs(actorHoldingWide, id, { nivel: "ERROR" }));

    expect(logs).toHaveLength(1);
    expect(logs[0]?.nivel).toBe("ERROR");
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => listLogs(actorHoldingWide, "00000000-0000-0000-0000-000000000000", {})),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — create (Requirement: Admin can manually create a CuentaPublicitaria)", () => {
  it("crea la cuenta bajo el bridge indicado con instagramAccountId sin validar (texto libre)", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });

    const cuenta = await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeId, {
        idExterno: "page-123",
        nombre: "Cuenta Meta",
        instagramAccountId: "ig-cualquier-cosa-no-validada",
      }),
    );

    expect(cuenta.bridgeId).toBe(bridgeId);
    expect(cuenta.instagramAccountId).toBe("ig-cualquier-cosa-no-validada");

    const filaPersistida = await testAdminPrisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuenta.id } });
    expect(filaPersistida.idExternoVinculado).toBe("ig-cualquier-cosa-no-validada");
  });

  it("instagramAccountId es opcional y persiste null cuando se omite", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "GOOGLE_FORMS" });

    const cuenta = await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeId, { idExterno: "form-1", nombre: "Cuenta Forms" }),
    );

    expect(cuenta.instagramAccountId).toBeNull();
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() =>
        crearCuentaPublicitaria(actorHoldingWide, "00000000-0000-0000-0000-000000000000", { idExterno: "x", nombre: "y" }),
      ),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — listByBridge", () => {
  it("mapea instagramAccountId y nunca expone idExternoVinculado", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });
    await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeId, {
        idExterno: "page-list-1",
        nombre: "Cuenta Lista",
        instagramAccountId: "ig-list-1",
      }),
    );

    const cuentas = await conContexto(() => listarCuentasPorBridge(actorHoldingWide, bridgeId));

    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]?.instagramAccountId).toBe("ig-list-1");
    expect(cuentas[0]).not.toHaveProperty("idExternoVinculado");
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() => listarCuentasPorBridge(actorHoldingWide, "00000000-0000-0000-0000-000000000000")),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — toggleActiva (Requirement: Bridge detail embeds its accounts; PATCH toggles only activation)", () => {
  it("cambia solo activa, dejando idExterno/nombre intactos", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const cuenta = await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeId, { idExterno: "page-toggle", nombre: "Cuenta Toggle" }),
    );

    const actualizada = await conContexto(() => toggleActiva(actorHoldingWide, bridgeId, cuenta.id, false));

    expect(actualizada.activa).toBe(false);
    expect(actualizada.idExterno).toBe("page-toggle");
    expect(actualizada.nombre).toBe("Cuenta Toggle");
  });

  it("con una cuenta que no pertenece al bridge lanza cuenta_no_encontrada (404)", async () => {
    const { id: bridgeA } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const { id: bridgeB } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const cuentaDeA = await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeA, { idExterno: "page-cross", nombre: "Cuenta Cruzada" }),
    );

    await expect(conContexto(() => toggleActiva(actorHoldingWide, bridgeB, cuentaDeA.id, false))).rejects.toMatchObject({
      code: "cuenta_publicitaria_no_encontrada",
      statusHttp: 404,
    });
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      conContexto(() =>
        toggleActiva(actorHoldingWide, "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001", false),
      ),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — getBridgeById embeds cuentasPublicitarias mapped to instagramAccountId (Requirement: Bridge detail embeds its accounts)", () => {
  it("nunca expone idExternoVinculado en las cuentas embebidas", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "INSTAGRAM" });
    await conContexto(() =>
      crearCuentaPublicitaria(actorHoldingWide, bridgeId, {
        idExterno: "page-embed",
        nombre: "Cuenta Embebida",
        instagramAccountId: "ig-embed",
      }),
    );

    const detalle = await conContexto(() => getBridgeById(actorHoldingWide, bridgeId));

    expect(detalle.cuentasPublicitarias).toHaveLength(1);
    expect(detalle.cuentasPublicitarias[0]?.instagramAccountId).toBe("ig-embed");
    expect(detalle.cuentasPublicitarias[0]).not.toHaveProperty("idExternoVinculado");
  });
});

/**
 * Fix (bug de seguridad: los sub-recursos de bridge no filtraban por
 * empresa) -- mismo criterio 404-no-403 que `bridge.service.ts`, ahora
 * replicado en `cuenta-publicitaria.service.ts::bridgeFueraDeAlcance`.
 */
describe("cuenta-publicitaria.service — scope por empresa (fix bug de seguridad)", () => {
  async function crearBridgeEnEmpresa(empresaId: string): Promise<{ id: string }> {
    contador += 1;
    const bridge = await testAdminPrisma.bridge.create({
      data: {
        redSocial: "FACEBOOK",
        nombre: `Bridge ajeno cuentas ${contador}`,
        claveApiHash: hashClaveBridge(claveApiUnica()),
        empresaId,
      },
    });
    return { id: bridge.id };
  }

  it("create: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena cuentas create ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeEnEmpresa(empresaAjena.id);

      await expect(
        crearCuentaPublicitaria(actorCompanyScoped, bridgeAjeno.id, { idExterno: "x", nombre: "y" }),
      ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    }));

  it("listByBridge: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena cuentas list ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeEnEmpresa(empresaAjena.id);

      await expect(listarCuentasPorBridge(actorCompanyScoped, bridgeAjeno.id)).rejects.toMatchObject({
        code: "bridge_no_encontrado",
        statusHttp: 404,
      });
    }));

  it("toggleActiva: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    sinRestriccion(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena cuentas toggle ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeEnEmpresa(empresaAjena.id);
      const cuentaAjena = await crearCuentaPublicitaria(actorHoldingWide, bridgeAjeno.id, {
        idExterno: "page-ajena",
        nombre: "Cuenta Ajena",
      });

      // El chequeo de APLICACIÓN (`bridgeFueraDeAlcance`), no la RLS -- acá
      // corremos sin restricción a propósito, así el 404 solo puede venir de
      // `actorCompanyScoped` siendo rechazado por `cuenta-publicitaria.service.ts`.
      await expect(
        toggleActiva(actorCompanyScoped, bridgeAjeno.id, cuentaAjena.id, false),
      ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    }));

  it("create: 201 (control positivo) cuando el bridge pertenece a la propia empresa del actor", () =>
    conContexto(async () => {
      const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });

      const cuenta = await crearCuentaPublicitaria(actorCompanyScoped, bridgeId, {
        idExterno: "page-propio",
        nombre: "Cuenta Propia",
      });

      expect(cuenta.bridgeId).toBe(bridgeId);
    }));

  it("listByBridge: un actor holding-wide sigue viendo las cuentas de cualquier bridge (sin restricción, D2)", () =>
    sinRestriccion(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena cuentas holding ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeEnEmpresa(empresaAjena.id);
      await crearCuentaPublicitaria(actorHoldingWide, bridgeAjeno.id, { idExterno: "page-x", nombre: "Cuenta X" });

      const cuentas = await listarCuentasPorBridge(actorHoldingWide, bridgeAjeno.id);

      expect(cuentas).toHaveLength(1);
    }));
});
