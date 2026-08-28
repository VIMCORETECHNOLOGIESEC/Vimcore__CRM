import { RedSocial } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

function mockFetchJson(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-bridges-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-bridges-1234";

let adminAccessToken: string;
let vendedorAccessToken: string;
let contador = 0;

function claveApiUnica(): string {
  contador += 1;
  return `clave-api-rutas-${contador}`;
}

async function crearBridgeDirecto(
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO"; redSocial: RedSocial; nombre: string }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: overrides.redSocial ?? "GOOGLE_FORMS",
      nombre: overrides.nombre ?? `Bridge ruta ${contador}`,
      claveApiHash: hashClaveBridge(claveApiUnica()),
      estado: overrides.estado ?? "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

beforeAll(async () => {
  await prisma.usuario.create({
    data: {
      nombre: "Admin Bridges",
      correo: "admin-bridges@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });
  await prisma.usuario.create({
    data: {
      nombre: "Vendedor Bridges",
      correo: "vendedor-bridges@integracion.test",
      passwordHash: await hashPassword(VENDEDOR_PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-bridges@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const vendedorLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "vendedor-bridges@integracion.test", password: VENDEDOR_PASSWORD });
  vendedorAccessToken = vendedorLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/bridges (Requirement: Bridge creation starts inactive with one-time plaintext key)", () => {
  it("201 crea el bridge INACTIVO y devuelve la clave en claro", async () => {
    // `z.uuid()` (Bloque C, `bridges.schema.ts`) exige el nibble de versión
    // RFC 4122 — `EMPRESA_BOOTSTRAP_ID` (id fijo de la migración, hallazgo ya
    // documentado en Batch 2 de Stage 1: "BOOTSTRAP_EMPRESA_ID fails Zod's
    // strict z.uuid()") no lo cumple, así que este endpoint HTTP necesita
    // una `Empresa` con un id real generado por `@default(uuid())`.
    const empresa = await prisma.empresa.create({ data: { nombre: "Empresa Bridges Rutas" } });
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ redSocial: "FACEBOOK", nombre: "Bridge Facebook Rutas", empresaId: empresa.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.bridge.estado).toBe("INACTIVO");
    expect(typeof respuesta.body.claveApi).toBe("string");
    expect(respuesta.body.claveApi.startsWith("brg_")).toBe(true);
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
  });

  it("400 con un redSocial fuera del enum", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ redSocial: "TIKTOK", nombre: "Bridge Inválido" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con campos faltantes", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Sin redSocial" });

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/v1/bridges y GET /api/v1/bridges/:id", () => {
  it("200 lista bridges sin exponer claveApiHash, con cuentasPublicitarias embebidas, junto con total/pagina/limite", async () => {
    await crearBridgeDirecto();

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.bridges)).toBe(true);
    expect(typeof respuesta.body.total).toBe("number");
    expect(respuesta.body.pagina).toBe(1);
    expect(respuesta.body.limite).toBe(20);
    for (const bridge of respuesta.body.bridges) {
      expect(bridge.claveApiHash).toBeUndefined();
      // Fix (2026-08-19): sin esto, el listado real del frontend rompía en
      // runtime -- evaluateAvisoBridge asume esta relación en cada fila.
      expect(Array.isArray(bridge.cuentasPublicitarias)).toBe(true);
    }
  });

  it("200 filtra por busqueda contra el nombre (insensible a mayúsculas)", async () => {
    const { id } = await crearBridgeDirecto({ nombre: "Bridge Buscable Ñandú" });

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ busqueda: "buscable ñandú" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(1);
    expect(respuesta.body.bridges[0].id).toBe(id);
  });

  it("200 filtra por redSocial exacto", async () => {
    const { id } = await crearBridgeDirecto({ redSocial: "FACEBOOK", nombre: "Bridge Filtro RedSocial" });

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ redSocial: "FACEBOOK", busqueda: "Bridge Filtro RedSocial" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(1);
    expect(respuesta.body.bridges[0].id).toBe(id);
    expect(respuesta.body.bridges[0].redSocial).toBe("FACEBOOK");
  });

  it("200 filtra por estado exacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO", nombre: "Bridge Filtro Estado" });

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ estado: "INACTIVO", busqueda: "Bridge Filtro Estado" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(1);
    expect(respuesta.body.bridges[0].id).toBe(id);
    expect(respuesta.body.bridges[0].estado).toBe("INACTIVO");
  });

  it("200 pagina el listado respetando limite", async () => {
    await crearBridgeDirecto({ nombre: "Bridge Paginacion A" });
    await crearBridgeDirecto({ nombre: "Bridge Paginacion B" });

    const primeraPagina = await request(app)
      .get("/api/v1/bridges")
      .query({ busqueda: "Bridge Paginacion", pagina: 1, limite: 1 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(primeraPagina.status).toBe(200);
    expect(primeraPagina.body.bridges).toHaveLength(1);
    expect(primeraPagina.body.total).toBe(2);
    expect(primeraPagina.body.pagina).toBe(1);
    expect(primeraPagina.body.limite).toBe(1);

    const segundaPagina = await request(app)
      .get("/api/v1/bridges")
      .query({ busqueda: "Bridge Paginacion", pagina: 2, limite: 1 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(segundaPagina.status).toBe(200);
    expect(segundaPagina.body.bridges).toHaveLength(1);
    expect(segundaPagina.body.bridges[0].id).not.toBe(primeraPagina.body.bridges[0].id);
  });

  it("400 con pagina fuera de rango (menor a 1)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ pagina: 0 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });

  it("400 con limite fuera de rango (mayor a 100)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ limite: 101 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });

  it("200 obtiene un bridge por id, incluye cuentasPublicitarias y nunca expone claveApiHash", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.id).toBe(id);
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
    expect(Array.isArray(respuesta.body.bridge.cuentasPublicitarias)).toBe(true);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("400 con un id que no es UUID", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/no-es-un-uuid")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });
});

describe("PATCH /api/v1/bridges/:id (Requirement: PATCH /bridges/:id es el único endpoint)", () => {
  it("200 renombra sin cambiar estado", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Renombrado por PATCH" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.nombre).toBe("Renombrado por PATCH");
    expect(respuesta.body.bridge.estado).toBe("ACTIVO");
  });

  it("200 activa/desactiva por el mismo endpoint", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ estado: "INACTIVO" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.estado).toBe("INACTIVO");
  });

  it("400 con un estado fuera del whitelist (TOKEN_EXPIRADO es system-authored)", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ estado: "TOKEN_EXPIRADO" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con un body vacío (sin campos)", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Fantasma" });

    expect(respuesta.status).toBe(404);
  });
});

describe("DELETE /api/v1/bridges/:id (Requirement: Delete mode is decided by lead count, never ultimoLeadEn)", () => {
  it("200 BAJA_FISICA cuando leadsRecibidos.count === 0", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .delete(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resultado).toBe("BAJA_FISICA");

    const filaTrasBorrado = await prisma.bridge.findUnique({ where: { id } });
    expect(filaTrasBorrado).toBeNull();
  });

  it("200 BAJA_LOGICA cuando leadsRecibidos.count > 0", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });
    await testAdminPrisma.leadRecibido.create({
      data: {
        bridgeId: id,
        idExternoLead: `lead-externo-ruta-${contador}`,
        payload: {},
        entradaProcesamiento: {},
      },
    });

    const respuesta = await request(app)
      .delete(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resultado).toBe("BAJA_LOGICA");

    const filaTrasBaja = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(filaTrasBaja.estado).toBe("INACTIVO");
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .delete("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("POST /api/v1/bridges/:id/clave (Requirement: Key regeneration never changes bridge state)", () => {
  it("200 emite una clave nueva en claro y deja el estado intacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/clave`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.claveApi.startsWith("brg_")).toBe(true);
    expect(respuesta.body.bridge.estado).toBe("ACTIVO");
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges/00000000-0000-0000-0000-000000000000/clave")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("Matriz de roles — solo ADMINISTRADOR opera /bridges (Requirement: Every /bridges endpoint requires authenticated ADMINISTRADOR)", () => {
  it("403 cuando un VENDEDOR intenta listar bridges", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("403 cuando un VENDEDOR intenta crear un bridge", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .send({ redSocial: "FACEBOOK", nombre: "No debería crearse" });

    expect(respuesta.status).toBe(403);
  });

  it("403 cuando un VENDEDOR intenta regenerar la clave", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/clave`)
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso en cualquier endpoint de /bridges", async () => {
    const respuesta = await request(app).get("/api/v1/bridges");
    expect(respuesta.status).toBe(401);
  });
});

describe(
  "GET /api/v1/bridges/catalogo/redes-soportadas (Requirement: Network catalogs are enum-derived and " +
    "deduplicated; guarda de orden de rutas: segmento literal registrado antes de /bridges/:id)",
  () => {
    it("200 devuelve solo las redes con integración de ingesta real, nunca un 400 por id-swallowing", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bridges/catalogo/redes-soportadas")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      expect(new Set(respuesta.body.redesSociales)).toEqual(new Set<RedSocial>(["FACEBOOK", "GOOGLE_FORMS"]));
      expect(respuesta.body.redesSociales).not.toContain("INSTAGRAM" satisfies RedSocial);
      expect(respuesta.body.redesSociales).not.toContain("X" satisfies RedSocial);
      expect(respuesta.body.redesSociales).not.toContain("LINKEDIN" satisfies RedSocial);
    });

    it("403 cuando un VENDEDOR intenta leer el catálogo", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bridges/catalogo/redes-soportadas")
        .set("Authorization", `Bearer ${vendedorAccessToken}`);

      expect(respuesta.status).toBe(403);
    });

    it("401 sin token de acceso", async () => {
      const respuesta = await request(app).get("/api/v1/bridges/catalogo/redes-soportadas");
      expect(respuesta.status).toBe(401);
    });
  },
);

describe(
  "GET /api/v1/bridges/redes-activas (Requirement: Network catalogs are enum-derived and deduplicated; " +
    "guarda de orden de rutas: segmento literal registrado antes de /bridges/:id)",
  () => {
    it("200 devuelve redes distintas, nunca un 400 por id-swallowing (redes-activas no es un UUID)", async () => {
      await crearBridgeDirecto();

      const respuesta = await request(app)
        .get("/api/v1/bridges/redes-activas")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      expect(Array.isArray(respuesta.body.redesSociales)).toBe(true);
    });

    it("403 cuando un VENDEDOR intenta leer las redes activas", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bridges/redes-activas")
        .set("Authorization", `Bearer ${vendedorAccessToken}`);

      expect(respuesta.status).toBe(403);
    });

    it("401 sin token de acceso", async () => {
      const respuesta = await request(app).get("/api/v1/bridges/redes-activas");
      expect(respuesta.status).toBe(401);
    });
  },
);

describe("GET /api/v1/bridges/:id/logs (Requirement: Log reads are bounded by a server-side default cap)", () => {
  it("200 sin límite explícito aplica el default del servidor y no rompe con filtros", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}/logs`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.logs)).toBe(true);
  });

  it("200 filtra por nivel cuando se provee", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}/logs`)
      .query({ nivel: "ERROR" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    for (const log of respuesta.body.logs) {
      expect(log.nivel).toBe("ERROR");
    }
  });

  it("400 con un id de bridge que no es UUID", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/no-es-un-uuid/logs")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });

  it("404 con un bridge inexistente", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/00000000-0000-0000-0000-000000000000/logs")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("403 cuando un VENDEDOR intenta leer los logs", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}/logs`)
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const { id } = await crearBridgeDirecto();
    const respuesta = await request(app).get(`/api/v1/bridges/${id}/logs`);
    expect(respuesta.status).toBe(401);
  });
});

describe("POST /api/v1/bridges/:id/cuentas (Requirement: Admin can manually create a CuentaPublicitaria)", () => {
  it("201 crea la cuenta con idExterno/nombre; instagramAccountId opcional y sin validar", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ idExterno: "page-rutas-1", nombre: "Cuenta Rutas", instagramAccountId: "ig-rutas-1" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cuenta.bridgeId).toBe(id);
    expect(respuesta.body.cuenta.instagramAccountId).toBe("ig-rutas-1");
    expect(respuesta.body.cuenta.idExternoVinculado).toBeUndefined();
    expect(respuesta.body.cuenta.estadoToken).toBe("VALIDO");
    expect(respuesta.body.cuenta.tokenExpiraEn).toBeNull();
    expect(respuesta.body.cuenta).not.toHaveProperty("tokenCifrado");
  });

  it("400 cuando falta idExterno (Instagram id solo no es aceptado como identidad)", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Sin idExterno", instagramAccountId: "ig-solo" });

    expect(respuesta.status).toBe(400);
  });

  it("404 con un bridge inexistente", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges/00000000-0000-0000-0000-000000000000/cuentas")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ idExterno: "page-fantasma", nombre: "Fantasma" });

    expect(respuesta.status).toBe(404);
  });

  it("403 cuando un VENDEDOR intenta crear una cuenta publicitaria", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .send({ idExterno: "page-vendedor", nombre: "No debería crearse" });

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const { id } = await crearBridgeDirecto();
    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/cuentas`)
      .send({ idExterno: "page-sin-token", nombre: "Sin token" });
    expect(respuesta.status).toBe(401);
  });
});

describe("GET /api/v1/bridges/:id/cuentas (Requirement: Bridge detail embeds its accounts)", () => {
  it("200 lista las cuentas del bridge exponiendo instagramAccountId", async () => {
    const { id } = await crearBridgeDirecto();
    await request(app)
      .post(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ idExterno: "page-listado", nombre: "Cuenta Listado", instagramAccountId: "ig-listado" });

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cuentas).toHaveLength(1);
    expect(respuesta.body.cuentas[0].instagramAccountId).toBe("ig-listado");
    expect(respuesta.body.cuentas[0].estadoToken).toBe("VALIDO");
    expect(respuesta.body.cuentas[0].tokenExpiraEn).toBeNull();
    expect(respuesta.body.cuentas[0]).not.toHaveProperty("tokenCifrado");
  });

  it("404 con un bridge inexistente", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/00000000-0000-0000-0000-000000000000/cuentas")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("403 cuando un VENDEDOR intenta listar cuentas", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}/cuentas`)
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const { id } = await crearBridgeDirecto();
    const respuesta = await request(app).get(`/api/v1/bridges/${id}/cuentas`);
    expect(respuesta.status).toBe(401);
  });
});

describe(
  "PATCH /api/v1/bridges/:id/cuentas/:cuentaId (Requirement: Bridge detail embeds its accounts; PATCH toggles " +
    "only activation)",
  () => {
    async function crearCuentaDirecta(bridgeId: string): Promise<{ cuentaId: string }> {
      const cuenta = await testAdminPrisma.cuentaPublicitaria.create({
        data: { bridgeId, idExterno: `page-patch-${Date.now()}-${Math.random()}`, nombre: "Cuenta a togglear" },
      });
      return { cuentaId: cuenta.id };
    }

    it("200 cambia solo activa", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .patch(`/api/v1/bridges/${id}/cuentas/${cuentaId}`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({ activa: false });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.cuenta.activa).toBe(false);
      expect(respuesta.body.cuenta.nombre).toBe("Cuenta a togglear");
      expect(respuesta.body.cuenta.estadoToken).toBe("VALIDO");
      expect(respuesta.body.cuenta).not.toHaveProperty("tokenCifrado");
    });

    it("400 con un body sin el campo activa", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .patch(`/api/v1/bridges/${id}/cuentas/${cuentaId}`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({});

      expect(respuesta.status).toBe(400);
    });

    it("404 cuando la cuenta no pertenece al bridge indicado", async () => {
      const { id: bridgeA } = await crearBridgeDirecto();
      const { id: bridgeB } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(bridgeA);

      const respuesta = await request(app)
        .patch(`/api/v1/bridges/${bridgeB}/cuentas/${cuentaId}`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({ activa: false });

      expect(respuesta.status).toBe(404);
    });

    it("403 cuando un VENDEDOR intenta togglear una cuenta", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .patch(`/api/v1/bridges/${id}/cuentas/${cuentaId}`)
        .set("Authorization", `Bearer ${vendedorAccessToken}`)
        .send({ activa: false });

      expect(respuesta.status).toBe(403);
    });

    it("401 sin token de acceso", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .patch(`/api/v1/bridges/${id}/cuentas/${cuentaId}`)
        .send({ activa: false });

      expect(respuesta.status).toBe(401);
    });
  },
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(
  "POST /api/v1/bridges/:id/cuentas/:cuentaId/token (docs/05-bridges.md §7, carga y renovación con " +
    "verificación inmediata; el token nunca se devuelve por API)",
  () => {
    async function crearCuentaDirecta(bridgeId: string): Promise<{ cuentaId: string }> {
      const cuenta = await testAdminPrisma.cuentaPublicitaria.create({
        data: { bridgeId, idExterno: `page-token-ruta-${Date.now()}-${Math.random()}`, nombre: "Cuenta a cargar" },
      });
      return { cuentaId: cuenta.id };
    }

    it("200 con un token válido: persiste y nunca devuelve el token en claro", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true, expires_at: 1_900_000_000 } })),
      );

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/token`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({ token: "page-access-token-secreto" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.cuenta.id).toBe(cuentaId);
      expect(JSON.stringify(respuesta.body)).not.toContain("page-access-token-secreto");
      expect(respuesta.body.cuenta).not.toHaveProperty("tokenCifrado");
      expect(respuesta.body.cuenta.estadoToken).toBe("VALIDO");
      expect(respuesta.body.cuenta.tokenExpiraEn).toBe(new Date(1_900_000_000 * 1000).toISOString());
    });

    it("422 con un token inválido/revocado según Graph API", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: false } })));

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/token`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({ token: "token-malo" });

      expect(respuesta.status).toBe(422);
    });

    it("400 con un body sin token", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/token`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({});

      expect(respuesta.status).toBe(400);
    });

    it("404 cuando la cuenta no pertenece al bridge indicado", async () => {
      const { id: bridgeA } = await crearBridgeDirecto();
      const { id: bridgeB } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(bridgeA);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${bridgeB}/cuentas/${cuentaId}/token`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({ token: "cualquiera" });

      expect(respuesta.status).toBe(404);
    });

    it("403 cuando un VENDEDOR intenta cargar un token", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/token`)
        .set("Authorization", `Bearer ${vendedorAccessToken}`)
        .send({ token: "cualquiera" });

      expect(respuesta.status).toBe(403);
    });

    it("401 sin token de acceso", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/token`)
        .send({ token: "cualquiera" });

      expect(respuesta.status).toBe(401);
    });
  },
);

describe(
  "POST /api/v1/bridges/:id/cuentas/:cuentaId/probar-conexion (docs/05-bridges.md §7, prueba de conexión bajo demanda)",
  () => {
    async function crearCuentaDirecta(
      bridgeId: string,
      overrides: { tokenCifrado?: string | null } = {},
    ): Promise<{ cuentaId: string }> {
      const cuenta = await testAdminPrisma.cuentaPublicitaria.create({
        data: {
          bridgeId,
          idExterno: `page-probar-ruta-${Date.now()}-${Math.random()}`,
          nombre: "Cuenta a probar",
          tokenCifrado: overrides.tokenCifrado ?? null,
        },
      });
      return { cuentaId: cuenta.id };
    }

    it("200 ok=false cuando la cuenta no tiene token cargado, sin llamar a Graph API", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/probar-conexion`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send();

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("404 cuando la cuenta no pertenece al bridge indicado", async () => {
      const { id: bridgeA } = await crearBridgeDirecto();
      const { id: bridgeB } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(bridgeA);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${bridgeB}/cuentas/${cuentaId}/probar-conexion`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send();

      expect(respuesta.status).toBe(404);
    });

    it("403 cuando un VENDEDOR intenta probar la conexión", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app)
        .post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/probar-conexion`)
        .set("Authorization", `Bearer ${vendedorAccessToken}`)
        .send();

      expect(respuesta.status).toBe(403);
    });

    it("401 sin token de acceso", async () => {
      const { id } = await crearBridgeDirecto();
      const { cuentaId } = await crearCuentaDirecta(id);

      const respuesta = await request(app).post(`/api/v1/bridges/${id}/cuentas/${cuentaId}/probar-conexion`).send();

      expect(respuesta.status).toBe(401);
    });
  },
);
