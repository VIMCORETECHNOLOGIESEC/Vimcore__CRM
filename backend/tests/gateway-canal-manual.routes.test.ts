import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * crm-gateway-proxy (CRM Gateway Trust, spec crm-gateway-trust.md): cobertura
 * de integración de `requireGatewayTrust` + `gatewayRouter`, montado en
 * `/internal/gateway` (Architecture Decision #1). Mismo patrón de fixtures
 * que `canal-manual.routes.test.ts` -- `testAdminPrisma` para arrange
 * (bypassa RLS), el `app`/`prisma` reales para las aserciones bajo prueba.
 *
 * Two-tenant fixtures (task 4.1, dependencia del proposal "Two linked pilot
 * tenants"): cada test que necesita probar aislamiento crea DOS `Empresa`
 * vinculadas (authCompanyId distinto), cada una con su propio `Usuario`
 * vinculado (authUserId distinto) y `Membresia` activa.
 */
const app = createApp();
let contador = 0;

const SECRET = env.CRM_GATEWAY_SECRET;
if (!SECRET) {
  throw new Error(
    "CRM_GATEWAY_SECRET no está configurado en el entorno de test -- ver .env.dev. " +
      "Sin esto ningún camino gateway-trust (incluido el happy path) es ejercitable.",
  );
}

interface TenantFixture {
  empresaId: string;
  authCompanyId: string;
  usuarioId: string;
  authUserId: string;
}

/** Empresa + Usuario + Membresia activa, todos vinculados a Auth (authCompanyId/authUserId). */
async function crearTenantVinculado(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" = "ADMINISTRADOR",
): Promise<TenantFixture> {
  contador += 1;
  const authCompanyId = randomUUID();
  const authUserId = randomUUID();

  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `Empresa gateway trust ${contador} ${randomUUID()}`, authCompanyId },
  });
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario gateway trust ${contador}`,
      correo: `usuario-gateway-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: "x",
      rol,
      activo: true,
      authUserId,
    },
  });
  await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId: empresa.id, rol, activa: true },
  });

  return { empresaId: empresa.id, authCompanyId, usuarioId: usuario.id, authUserId };
}

function gatewayHeaders(overrides: Partial<{ secret: string; companyId: string; userId: string }> = {}) {
  return {
    "x-gateway-secret": overrides.secret ?? SECRET,
    "x-gateway-company-id": overrides.companyId ?? randomUUID(),
    "x-gateway-user-id": overrides.userId ?? randomUUID(),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("requireGatewayTrust — shared-secret validation [INV-4]", () => {
  it("401 gateway_no_autorizado: falta el header x-gateway-secret", async () => {
    const tenant = await crearTenantVinculado();

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set("x-gateway-company-id", tenant.authCompanyId)
      .set("x-gateway-user-id", tenant.authUserId);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.code).toBe("gateway_no_autorizado");
  });

  it("401 gateway_no_autorizado: x-gateway-secret no coincide con CRM_GATEWAY_SECRET", async () => {
    const tenant = await crearTenantVinculado();

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ secret: "secreto-invalido-no-coincide", companyId: tenant.authCompanyId, userId: tenant.authUserId }));

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.code).toBe("gateway_no_autorizado");
  });

  // "CRM_GATEWAY_SECRET unset" (spec, escenario "Secret unset on CRM backend")
  // comparte la MISMA rama de guarda que el secreto inválido de arriba
  // (`!secret || !presented || !timingSafeEqual(...)`, design.md) -- no es
  // posible reiniciar el proceso sin `CRM_GATEWAY_SECRET` dentro de esta
  // misma suite (env se valida una sola vez al boot, zod, `config/env.ts`),
  // así que ese branch queda cubierto estructuralmente por el caso de
  // secreto inválido de arriba, no por una tercera prueba de runtime.
});

describe("requireGatewayTrust — identity resolution fails closed [INV-1]", () => {
  it("403 identidad_no_vinculada: x-gateway-company-id no matchea ningún authCompanyId", async () => {
    const tenant = await crearTenantVinculado();

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: randomUUID(), userId: tenant.authUserId }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: x-gateway-user-id no matchea ningún authUserId", async () => {
    const tenant = await crearTenantVinculado();

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: randomUUID() }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: el Usuario linkeado existe pero está inactivo", async () => {
    const tenant = await crearTenantVinculado();
    await testAdminPrisma.usuario.update({ where: { id: tenant.usuarioId }, data: { activo: false } });

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: Empresa y Usuario linkeados pero sin Membresia activa entre ellos", async () => {
    contador += 1;
    const authCompanyId = randomUUID();
    const authUserId = randomUUID();
    const empresa = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa sin membresia ${contador} ${randomUUID()}`, authCompanyId },
    });
    const usuario = await testAdminPrisma.usuario.create({
      data: {
        nombre: `Usuario sin membresia ${contador}`,
        correo: `usuario-sin-membresia-${contador}-${randomUUID()}@integracion.test`,
        passwordHash: "x",
        rol: "ADMINISTRADOR",
        activo: true,
        authUserId,
      },
    });
    // Deliberadamente sin crear ninguna Membresia para este par.
    void usuario;

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: authCompanyId, userId: authUserId }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("identidad_no_vinculada");
    expect(empresa.id).toBeDefined();
  });

  it("403 identidad_no_vinculada: la única Membresia del par existe pero está desactivada", async () => {
    const tenant = await crearTenantVinculado();
    await testAdminPrisma.membresia.updateMany({
      where: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId },
      data: { activa: false },
    });

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("identidad_no_vinculada");
  });
});

describe("requireGatewayTrust — happy path terminates in runWithTenantContext [INV-1, INV-2]", () => {
  it("200: identidad resuelta puebla el tenant context -- GET solo devuelve los canales de ESA empresa", async () => {
    const tenantA = await crearTenantVinculado("ADMINISTRADOR");
    const empresaAjena = await testAdminPrisma.empresa.create({ data: { nombre: `Empresa ajena gw ${randomUUID()}` } });
    await testAdminPrisma.canalManual.create({ data: { empresaId: tenantA.empresaId, nombre: "Canal propio gw" } });
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresaAjena.id, nombre: "Canal ajeno gw" } });

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenantA.authCompanyId, userId: tenantA.authUserId }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalesManuales).toHaveLength(1);
    expect(respuesta.body.canalesManuales[0].empresaId).toBe(tenantA.empresaId);
  });

  it("201: POST como ADMINISTRADOR vinculado crea el canal en la empresa resuelta por el middleware", async () => {
    const tenant = await crearTenantVinculado("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }))
      .send({ nombre: "Canal creado vía gateway" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.canalManual.empresaId).toBe(tenant.empresaId);
    expect(respuesta.body.canalManual.nombre).toBe("Canal creado vía gateway");
  });
});

describe("requireGatewayTrust — authorization uses CRM's own Usuario.rol", () => {
  it("403: un ASESOR vinculado no puede crear un canal manual vía gateway", async () => {
    const tenant = await crearTenantVinculado("ASESOR");

    const respuesta = await request(app)
      .post("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }))
      .send({ nombre: "Intento asesor" });

    expect(respuesta.status).toBe(403);
  });

  it("403: un ASESOR vinculado no puede editar un canal manual vía gateway", async () => {
    const tenant = await crearTenantVinculado("ASESOR");
    const canal = await testAdminPrisma.canalManual.create({
      data: { empresaId: tenant.empresaId, nombre: "Canal a editar gw" },
    });

    const respuesta = await request(app)
      .patch(`/internal/gateway/canales-manuales/${canal.id}`)
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }))
      .send({ activo: false });

    expect(respuesta.status).toBe(403);
  });

  it("200: un ASESOR vinculado SÍ puede listar canales manuales vía gateway", async () => {
    const tenant = await crearTenantVinculado("ASESOR");
    await testAdminPrisma.canalManual.create({ data: { empresaId: tenant.empresaId, nombre: "Canal listable gw" } });

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenant.authCompanyId, userId: tenant.authUserId }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalesManuales).toHaveLength(1);
  });
});

describe("Row-level tenant isolation — canales_manuales vía gateway trust (proposal Success Criteria)", () => {
  it("GET: tenant A recibe SU fila (mismo nombre en ambos tenants), nunca la de B -- se afirma sobre el id", async () => {
    const tenantA = await crearTenantVinculado("ADMINISTRADOR");
    const tenantB = await crearTenantVinculado("ADMINISTRADOR");
    const canalA = await testAdminPrisma.canalManual.create({
      data: { empresaId: tenantA.empresaId, nombre: "Referido" },
    });
    await testAdminPrisma.canalManual.create({ data: { empresaId: tenantB.empresaId, nombre: "Referido" } });

    const respuesta = await request(app)
      .get("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenantA.authCompanyId, userId: tenantA.authUserId }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalesManuales).toHaveLength(1);
    expect(respuesta.body.canalesManuales[0].id).toBe(canalA.id);
  });

  it("PATCH del canal de B por A -> 404, nunca 403, nunca la fila (deny-not-leak)", async () => {
    const tenantA = await crearTenantVinculado("ADMINISTRADOR");
    const tenantB = await crearTenantVinculado("ADMINISTRADOR");
    const canalB = await testAdminPrisma.canalManual.create({
      data: { empresaId: tenantB.empresaId, nombre: "Referido cruzado" },
    });

    const respuesta = await request(app)
      .patch(`/internal/gateway/canales-manuales/${canalB.id}`)
      .set(gatewayHeaders({ companyId: tenantA.authCompanyId, userId: tenantA.authUserId }))
      .send({ activo: false });

    expect(respuesta.status).toBe(404);

    const intacto = await testAdminPrisma.canalManual.findUniqueOrThrow({ where: { id: canalB.id } });
    expect(intacto.activo).toBe(true);
  });

  it("POST: crear con el mismo nombre en tenant A y B no colisiona -- @@unique(empresaId, nombre)", async () => {
    const tenantA = await crearTenantVinculado("ADMINISTRADOR");
    const tenantB = await crearTenantVinculado("ADMINISTRADOR");

    const enA = await request(app)
      .post("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenantA.authCompanyId, userId: tenantA.authUserId }))
      .send({ nombre: "Compartido gw" });
    expect(enA.status).toBe(201);

    const enB = await request(app)
      .post("/internal/gateway/canales-manuales")
      .set(gatewayHeaders({ companyId: tenantB.authCompanyId, userId: tenantB.authUserId }))
      .send({ nombre: "Compartido gw" });
    expect(enB.status).toBe(201);
    expect(enB.body.canalManual.empresaId).toBe(tenantB.empresaId);
  });
});
