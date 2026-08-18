import { RedSocial } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

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
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO" }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge ruta ${contador}`,
      claveApiHash: hashClaveBridge(claveApiUnica()),
      estado: overrides.estado ?? "ACTIVO",
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
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ redSocial: "FACEBOOK", nombre: "Bridge Facebook Rutas" });

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
  it("200 lista bridges sin exponer claveApiHash", async () => {
    await crearBridgeDirecto();

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.bridges)).toBe(true);
    for (const bridge of respuesta.body.bridges) {
      expect(bridge.claveApiHash).toBeUndefined();
    }
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
    await prisma.leadRecibido.create({
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

    const filaTrasBaja = await prisma.bridge.findUniqueOrThrow({ where: { id } });
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
    it("200 devuelve exactamente los valores del enum RedSocial, nunca un 400 por id-swallowing", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bridges/catalogo/redes-soportadas")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.redesSociales).toHaveLength(Object.values(RedSocial).length);
      expect(new Set(respuesta.body.redesSociales)).toEqual(new Set(Object.values(RedSocial)));
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
      const cuenta = await prisma.cuentaPublicitaria.create({
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
