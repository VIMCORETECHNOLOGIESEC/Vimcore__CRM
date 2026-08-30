import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import { prisma } from "../../src/lib/prisma.js";
import { testAdminPrisma } from "../fixtures/admin-prisma.js";

/**
 * Bloque C (Fase 6, tarea 6.5) — spec "Adversarial and mutation evidence",
 * escenario "Complete two-company matrix". Los tests de `rls-runtime-matrix`
 * y `rls-policy-coverage` ya prueban aislamiento a nivel de política/SQL
 * crudo; este archivo cierra la brecha que quedaba: probar, vía HTTP real
 * (login con credenciales de `Membresia`, mismo patrón que
 * `auth.session-scope.test.ts`, para obtener un `sessionScope: "company"`
 * genuino en vez del holding-wide que produce el login por `Usuario.correo`),
 * que la APLICACIÓN completa (middleware → controller → service →
 * repositorio → RLS) resuelve y enhebra el scope correcto de punta a punta —
 * no solo que la política RLS bloquea una fila cuando se le pasa el GUC
 * equivocado a mano.
 *
 * Nota deliberada sobre códigos de estado: una petición cruzada de empresa
 * debe devolver 404 (la fila es invisible por RLS antes de llegar a
 * cualquier chequeo de rol/relación), NUNCA 403 — 403 significaría que la
 * fila SÍ fue visible y solo la regla de negocio la rechazó, lo cual
 * indicaría fuga de scope (p. ej. si la resolución de sesión degradara a
 * holding-wide por error, `empresaCoincide` devolvería `false` y el código
 * cambiaría de 404 a 403 — una regresión que este test detectaría).
 */

const app = createApp();
const PASSWORD = "clave-adversarial-http-123456";

interface EmpresaAdmin {
  empresaId: string;
  usuarioId: string;
  token: string;
}

async function crearAdminDeEmpresa(etiqueta: string): Promise<EmpresaAdmin> {
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `HTTP adversarial ${etiqueta} ${crypto.randomUUID()}` },
  });
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Admin adversarial ${etiqueta}`,
      correo: `admin-adversarial-${etiqueta}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });
  const membresia = await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId: empresa.id,
      rol: "ADMINISTRADOR",
      correo: `membresia-adversarial-${etiqueta}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      activa: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: membresia.correo, password: PASSWORD });
  expect(login.status, `login de ${etiqueta}`).toBe(200);
  expect(login.body.accessToken).toEqual(expect.any(String));
  return { empresaId: empresa.id, usuarioId: usuario.id, token: login.body.accessToken as string };
}

async function crearLead(empresaId: string): Promise<{ id: string }> {
  const cliente = await testAdminPrisma.cliente.create({
    data: { nombre: `Cliente HTTP adversarial ${crypto.randomUUID()}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId },
  });
  return { id: lead.id };
}

/**
 * Fix (bug de seguridad: GET/PATCH/DELETE /usuarios y todo /bridges no
 * filtraban por empresa) — mismo criterio que `crearAdminDeEmpresa`: un
 * `Usuario` "hoja" (nunca inicia sesión) con una `Membresia` real en
 * `empresaId`, para servir de OBJETIVO de las pruebas cruzadas de abajo.
 */
async function crearUsuarioEnEmpresa(empresaId: string, etiqueta: string): Promise<{ id: string; nombre: string }> {
  const nombre = `Usuario objetivo ${etiqueta} ${crypto.randomUUID()}`;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre,
      correo: `usuario-objetivo-${etiqueta}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ASESOR",
      activo: true,
    },
  });
  await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
  });
  return { id: usuario.id, nombre };
}

async function crearBridgeEnEmpresa(empresaId: string, etiqueta: string): Promise<{ id: string; nombre: string }> {
  const nombre = `Bridge objetivo ${etiqueta} ${crypto.randomUUID()}`;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre,
      claveApiHash: `hash-adversarial-${crypto.randomUUID()}`,
      empresaId,
    },
  });
  return { id: bridge.id, nombre };
}

/**
 * Actor holding-wide GENUINO (Bloque F): `SUPER_ADMIN` nunca tiene
 * `Membresia` propia (mismo criterio que `ADMINISTRADOR`/`SUPERVISOR`
 * legado, D2) — login siempre por `Usuario.correo`, `empresaId: null`
 * incondicional. Usado como control positivo de "sin restricción, ve todo".
 */
async function crearSuperAdminHoldingWide(): Promise<{ id: string; token: string }> {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Super admin adversarial ${crypto.randomUUID()}`,
      correo: `super-admin-adversarial-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "SUPER_ADMIN",
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  expect(login.status, "login de super admin holding-wide").toBe(200);
  return { id: usuario.id, token: login.body.accessToken as string };
}

async function crearUsuarioHoldingWide(rol: "ADMINISTRADOR" | "SUPERVISOR"): Promise<{ id: string; token: string }> {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `${rol} holding-wide adversarial ${crypto.randomUUID()}`,
      correo: `${rol.toLowerCase()}-holding-adversarial-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  expect(login.status, `login holding-wide ${rol}`).toBe(200);
  return { id: usuario.id, token: login.body.accessToken as string };
}

async function crearCita(empresaId: string, usuarioId: string, leadId: string): Promise<{ id: string }> {
  const cita = await testAdminPrisma.cita.create({
    data: {
      leadId,
      usuarioId,
      empresaId,
      programadaPara: new Date(Date.now() + 60 * 60 * 1000),
      modalidad: "VIRTUAL",
    },
  });
  return { id: cita.id };
}

let empresaA: EmpresaAdmin;
let empresaB: EmpresaAdmin;

beforeAll(async () => {
  [empresaA, empresaB] = await Promise.all([
    crearAdminDeEmpresa("a"),
    crearAdminDeEmpresa("b"),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("adversarial/http-cross-company — GET /leads/:id (D-lectura)", () => {
  it("404 (no 403) cuando un administrador de empresa A pide un lead real de empresa B", async () => {
    const leadB = await crearLead(empresaB.empresaId);

    const respuesta = await request(app)
      .get(`/api/v1/leads/${leadB.id}`)
      .set("Authorization", `Bearer ${empresaA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "lead_no_encontrado" });
  });

  it("200 cuando el mismo lead se pide desde su propia empresa (control positivo)", async () => {
    const leadB = await crearLead(empresaB.empresaId);

    const respuesta = await request(app)
      .get(`/api/v1/leads/${leadB.id}`)
      .set("Authorization", `Bearer ${empresaB.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.id).toBe(leadB.id);
  });
});

describe("adversarial/http-cross-company — PATCH /leads/:id/etapa (D-escritura)", () => {
  it("404 cuando un administrador de empresa A intenta transicionar la etapa de un lead de empresa B", async () => {
    const leadB = await crearLead(empresaB.empresaId);

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${leadB.id}/etapa`)
      .set("Authorization", `Bearer ${empresaA.token}`)
      .send({ etapa: "CONTACTADO", respuestas: {} });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "lead_no_encontrado" });

    const sinCambios = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: leadB.id } });
    expect(sinCambios.etapa).toBe("NUEVO");
  });
});

describe("adversarial/http-cross-company — POST /leads/:id/asignar (D-asignación)", () => {
  it("404 cuando un administrador de empresa A intenta asignar un lead de empresa B", async () => {
    const leadB = await crearLead(empresaB.empresaId);

    const respuesta = await request(app)
      .post(`/api/v1/leads/${leadB.id}/asignar`)
      .set("Authorization", `Bearer ${empresaA.token}`)
      .send({});

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "lead_no_encontrado" });

    const sinCambios = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: leadB.id } });
    expect(sinCambios.asesorId).toBeNull();
  });
});

describe("adversarial/http-cross-company — GET /citas/:citaId", () => {
  it("404 cuando un administrador de empresa A pide una cita real de un lead de empresa B", async () => {
    const leadB = await crearLead(empresaB.empresaId);
    const citaB = await crearCita(empresaB.empresaId, empresaB.usuarioId, leadB.id);

    const respuesta = await request(app)
      .get(`/api/v1/citas/${citaB.id}`)
      .set("Authorization", `Bearer ${empresaA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "cita_no_encontrada" });
  });

  it("200 cuando la misma cita se pide desde su propia empresa (control positivo)", async () => {
    const leadB = await crearLead(empresaB.empresaId);
    const citaB = await crearCita(empresaB.empresaId, empresaB.usuarioId, leadB.id);

    const respuesta = await request(app)
      .get(`/api/v1/citas/${citaB.id}`)
      .set("Authorization", `Bearer ${empresaB.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cita.id).toBe(citaB.id);
  });
});

describe("adversarial/http-cross-company — GET /metricas/resumen (agregación, no lectura por id)", () => {
  it("el resumen de una empresa nunca incluye los ingresos de la otra, aunque ambas tengan datos en la misma ventana", async () => {
    // Par de empresas DEDICADO a este test (no el `empresaA`/`empresaB`
    // compartido del resto del archivo): `/metricas/resumen` es una
    // agregación, no una lectura por id — reutilizar las empresas
    // compartidas mezclaría el conteo con los leads que los otros `it` de
    // este archivo ya crearon para esas mismas empresas.
    const [metricasA, metricasB] = await Promise.all([
      crearAdminDeEmpresa("metricas-a"),
      crearAdminDeEmpresa("metricas-b"),
    ]);
    const [leadsA, leadsB] = await Promise.all([
      Promise.all([crearLead(metricasA.empresaId), crearLead(metricasA.empresaId)]),
      Promise.all([crearLead(metricasB.empresaId), crearLead(metricasB.empresaId), crearLead(metricasB.empresaId)]),
    ]);

    const [resumenA, resumenB] = await Promise.all([
      request(app).get("/api/v1/metricas/resumen").set("Authorization", `Bearer ${metricasA.token}`),
      request(app).get("/api/v1/metricas/resumen").set("Authorization", `Bearer ${metricasB.token}`),
    ]);

    expect(resumenA.status).toBe(200);
    expect(resumenB.status).toBe(200);
    // Empresa A tiene exactamente 2 leads propios y NUNCA debe contar los 3 de B.
    expect(resumenA.body.totalIngresados.actual).toBe(leadsA.length);
    // Empresa B tiene exactamente 3 leads propios y NUNCA debe contar los 2 de A.
    expect(resumenB.body.totalIngresados.actual).toBe(leadsB.length);
  });
});

/**
 * Fix (bug de seguridad CONFIRMADO en producción: GET/PATCH/DELETE /usuarios
 * y todo /bridges no filtraban por empresa) — `usuarios.service.ts::
 * buildWhere`/`assertUsuarioEnAlcance` y `bridge.service.ts::
 * buildBridgeWhere`/`bridgeFueraDeAlcance`. Par de empresas DEDICADO (no el
 * `empresaA`/`empresaB` compartido de arriba) para no mezclar usuarios/
 * bridges con los leads/citas que otros `it` de este archivo ya crearon para
 * esas mismas empresas.
 */
describe("adversarial/http-cross-company — GET/PATCH/DELETE /usuarios (bug de seguridad, scope por empresa)", () => {
  it("404 (no 403) cuando un administrador de empresa A pide un usuario real de empresa B por id", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("usuarios-a"),
      crearAdminDeEmpresa("usuarios-b"),
    ]);
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-b");

    const respuesta = await request(app)
      .get(`/api/v1/usuarios/${usuarioB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "usuario_no_encontrado" });
  });

  it("200 cuando el mismo usuario se pide desde su propia empresa (control positivo)", async () => {
    const adminB = await crearAdminDeEmpresa("usuarios-control-b");
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-control-b");

    const respuesta = await request(app)
      .get(`/api/v1/usuarios/${usuarioB.id}`)
      .set("Authorization", `Bearer ${adminB.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.user.id).toBe(usuarioB.id);
  });

  it("GET /usuarios: un administrador de empresa A nunca ve un usuario de empresa B en el listado", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("usuarios-listado-a"),
      crearAdminDeEmpresa("usuarios-listado-b"),
    ]);
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-listado-b");

    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: usuarioB.nombre })
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(0);
  });

  it("PATCH /usuarios/:id: 404 cuando un administrador de empresa A intenta editar un usuario de empresa B, sin cambios persistidos", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("usuarios-patch-a"),
      crearAdminDeEmpresa("usuarios-patch-b"),
    ]);
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-patch-b");

    const respuesta = await request(app)
      .patch(`/api/v1/usuarios/${usuarioB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`)
      .send({ nombre: "Nombre Inyectado Por Empresa A" });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "usuario_no_encontrado" });

    const sinCambios = await testAdminPrisma.usuario.findUniqueOrThrow({ where: { id: usuarioB.id } });
    expect(sinCambios.nombre).toBe(usuarioB.nombre);
  });

  it("DELETE /usuarios/:id: 404 cuando un administrador de empresa A intenta dar de baja un usuario de empresa B, sigue activo", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("usuarios-delete-a"),
      crearAdminDeEmpresa("usuarios-delete-b"),
    ]);
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-delete-b");

    const respuesta = await request(app)
      .delete(`/api/v1/usuarios/${usuarioB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "usuario_no_encontrado" });

    const sinCambios = await testAdminPrisma.usuario.findUniqueOrThrow({ where: { id: usuarioB.id } });
    expect(sinCambios.activo).toBe(true);
  });

  it("GET /usuarios: un SUPER_ADMIN (holding-wide, sin empresaId) sigue viendo usuarios de cualquier empresa", async () => {
    const [empresaX, superAdmin] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial usuarios-holding-x ${crypto.randomUUID()}` } }),
      crearSuperAdminHoldingWide(),
    ]);
    const usuarioX = await crearUsuarioEnEmpresa(empresaX.id, "usuarios-holding-x");

    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: usuarioX.nombre })
      .set("Authorization", `Bearer ${superAdmin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(1);
    expect(respuesta.body.users[0].id).toBe(usuarioX.id);
  });

  it("GET /usuarios?empresaId=X: un SUPER_ADMIN puede hacer drill-down a UNA empresa puntual", async () => {
    const [empresaX, empresaY, superAdmin] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial usuarios-drill-x ${crypto.randomUUID()}` } }),
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial usuarios-drill-y ${crypto.randomUUID()}` } }),
      crearSuperAdminHoldingWide(),
    ]);
    const [usuarioX, usuarioY] = await Promise.all([
      crearUsuarioEnEmpresa(empresaX.id, "usuarios-drill-x"),
      crearUsuarioEnEmpresa(empresaY.id, "usuarios-drill-y"),
    ]);

    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ empresaId: empresaX.id, limite: 100 })
      .set("Authorization", `Bearer ${superAdmin.token}`);

    expect(respuesta.status).toBe(200);
    const ids = respuesta.body.users.map((u: { id: string }) => u.id);
    expect(ids).toContain(usuarioX.id);
    expect(ids).not.toContain(usuarioY.id);
  });

  it("GET /usuarios?empresaId=B: un administrador company-scoped de empresa A ignora el query param y sigue viendo solo su propia empresa", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("usuarios-drill-ignorado-a"),
      crearAdminDeEmpresa("usuarios-drill-ignorado-b"),
    ]);
    const usuarioB = await crearUsuarioEnEmpresa(adminB.empresaId, "usuarios-drill-ignorado-b");

    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ empresaId: adminB.empresaId, busqueda: usuarioB.nombre })
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(0);
  });
});

describe("adversarial/http-cross-company — GET/PATCH/DELETE /bridges (bug de seguridad, scope por empresa)", () => {
  it("404 (no 403) cuando un administrador de empresa A pide un bridge real de empresa B por id", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("bridges-a"),
      crearAdminDeEmpresa("bridges-b"),
    ]);
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-b");

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${bridgeB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "bridge_no_encontrado" });
  });

  it("200 cuando el mismo bridge se pide desde su propia empresa (control positivo)", async () => {
    const adminB = await crearAdminDeEmpresa("bridges-control-b");
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-control-b");

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${bridgeB.id}`)
      .set("Authorization", `Bearer ${adminB.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.id).toBe(bridgeB.id);
  });

  it("GET /bridges: un administrador de empresa A nunca ve un bridge de empresa B en el listado", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("bridges-listado-a"),
      crearAdminDeEmpresa("bridges-listado-b"),
    ]);
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-listado-b");

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ busqueda: bridgeB.nombre })
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(0);
  });

  it("PATCH /bridges/:id: 404 cuando un administrador de empresa A intenta editar un bridge de empresa B, sin cambios persistidos", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("bridges-patch-a"),
      crearAdminDeEmpresa("bridges-patch-b"),
    ]);
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-patch-b");

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${bridgeB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`)
      .send({ nombre: "Nombre Inyectado Por Empresa A" });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "bridge_no_encontrado" });

    const sinCambios = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id: bridgeB.id } });
    expect(sinCambios.nombre).toBe(bridgeB.nombre);
  });

  it("DELETE /bridges/:id: 404 cuando un administrador de empresa A intenta borrar un bridge de empresa B, sigue existiendo", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("bridges-delete-a"),
      crearAdminDeEmpresa("bridges-delete-b"),
    ]);
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-delete-b");

    const respuesta = await request(app)
      .delete(`/api/v1/bridges/${bridgeB.id}`)
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ code: "bridge_no_encontrado" });

    const sinCambios = await testAdminPrisma.bridge.findUnique({ where: { id: bridgeB.id } });
    expect(sinCambios).not.toBeNull();
  });

  it("GET /bridges: un SUPER_ADMIN (holding-wide, sin empresaId) sigue viendo bridges de cualquier empresa", async () => {
    const [empresaX, superAdmin] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial bridges-holding-x ${crypto.randomUUID()}` } }),
      crearSuperAdminHoldingWide(),
    ]);
    const bridgeX = await crearBridgeEnEmpresa(empresaX.id, "bridges-holding-x");

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ busqueda: bridgeX.nombre })
      .set("Authorization", `Bearer ${superAdmin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(1);
    expect(respuesta.body.bridges[0].id).toBe(bridgeX.id);
  });

  it("GET /bridges?empresaId=X: un SUPER_ADMIN puede hacer drill-down a UNA empresa puntual", async () => {
    const [empresaX, empresaY, superAdmin] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial bridges-drill-x ${crypto.randomUUID()}` } }),
      testAdminPrisma.empresa.create({ data: { nombre: `HTTP adversarial bridges-drill-y ${crypto.randomUUID()}` } }),
      crearSuperAdminHoldingWide(),
    ]);
    const [bridgeX, bridgeY] = await Promise.all([
      crearBridgeEnEmpresa(empresaX.id, "bridges-drill-x"),
      crearBridgeEnEmpresa(empresaY.id, "bridges-drill-y"),
    ]);

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ empresaId: empresaX.id, limite: 100 })
      .set("Authorization", `Bearer ${superAdmin.token}`);

    expect(respuesta.status).toBe(200);
    const ids = respuesta.body.bridges.map((b: { id: string }) => b.id);
    expect(ids).toContain(bridgeX.id);
    expect(ids).not.toContain(bridgeY.id);
  });

  it("GET /bridges?empresaId=B: un administrador company-scoped de empresa A ignora el query param y sigue viendo solo su propia empresa", async () => {
    const [adminA, adminB] = await Promise.all([
      crearAdminDeEmpresa("bridges-drill-ignorado-a"),
      crearAdminDeEmpresa("bridges-drill-ignorado-b"),
    ]);
    const bridgeB = await crearBridgeEnEmpresa(adminB.empresaId, "bridges-drill-ignorado-b");

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .query({ empresaId: adminB.empresaId, busqueda: bridgeB.nombre })
      .set("Authorization", `Bearer ${adminA.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridges).toHaveLength(0);
  });
});

/**
 * Fix (bug de seguridad: POST /usuarios no forzaba `empresaId` a la empresa
 * del actor) -- mismo criterio que `negociacion.producto.test.ts`.
 */
describe("adversarial/http-cross-company — POST /usuarios (bug de seguridad, empresaId forzado por sesión)", () => {
  it("201: un administrador company-scoped ignora el empresaId del body y usa el de su propia sesión", async () => {
    const [adminPropio, adminAjeno] = await Promise.all([
      crearAdminDeEmpresa("usuarios-crear-propio"),
      crearAdminDeEmpresa("usuarios-crear-ajeno"),
    ]);
    const correo = `asesor-inyectado-${crypto.randomUUID()}@test.local`;

    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminPropio.token}`)
      .send({
        nombre: "Asesor Inyectado",
        correo,
        password: "clave-asesor-inyectado-123456",
        rol: "ASESOR",
        empresaId: adminAjeno.empresaId,
      });

    expect(respuesta.status).toBe(201);
    const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: respuesta.body.user.id } });
    expect(membresia?.empresaId).toBe(adminPropio.empresaId);
    expect(membresia?.empresaId).not.toBe(adminAjeno.empresaId);
  });

  it("400 empresa_requerida: un SUPER_ADMIN holding-wide sin empresaId en el body es rechazado", async () => {
    const superAdmin = await crearSuperAdminHoldingWide();

    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${superAdmin.token}`)
      .send({
        nombre: "Asesor Sin Empresa HTTP",
        correo: `asesor-sin-empresa-http-${crypto.randomUUID()}@test.local`,
        password: "clave-asesor-sin-empresa-123456",
        rol: "ASESOR",
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.code).toBe("empresa_requerida");
  });
});

describe("adversarial/http-cross-company — POST /empresas/:empresaId/administradores", () => {
  it("201: un ADMINISTRADOR holding-wide provisiona un administrador company-scoped sin filtrar passwordHash", async () => {
    const [empresa, adminHolding] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `Empresa admin endpoint ${crypto.randomUUID()}` } }),
      crearUsuarioHoldingWide("ADMINISTRADOR"),
    ]);
    const correo = `admin-empresa-endpoint-${crypto.randomUUID()}@test.local`;

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Administradora Company Scoped", correo, password: PASSWORD });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.administrador.membresia).toMatchObject({
      empresaId: empresa.id,
      rol: "ADMINISTRADOR",
      activa: true,
      correo,
    });
    expect(respuesta.body.administrador.usuario).toMatchObject({
      rol: "ADMINISTRADOR",
      activo: true,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain("passwordHash");

    const usuarioPortador = await testAdminPrisma.usuario.findUniqueOrThrow({
      where: { id: respuesta.body.administrador.usuario.id },
    });
    expect(usuarioPortador.rol).toBe("ADMINISTRADOR");
    expect(usuarioPortador.correo).not.toBe(correo);
  });

  it("el portador no autentica con la clave enviada y el correo de Membresia inicia sesión company-scoped", async () => {
    const [empresa, adminHolding] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `Empresa admin login ${crypto.randomUUID()}` } }),
      crearUsuarioHoldingWide("ADMINISTRADOR"),
    ]);
    const correo = `admin-empresa-login-${crypto.randomUUID()}@test.local`;

    const provision = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Admin Login Company", correo, password: PASSWORD });
    expect(provision.status).toBe(201);

    const usuarioPortador = await testAdminPrisma.usuario.findUniqueOrThrow({
      where: { id: provision.body.administrador.usuario.id },
    });
    const loginPortador = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: usuarioPortador.correo, password: PASSWORD });
    expect(loginPortador.status).toBe(401);
    expect(loginPortador.body).toMatchObject({ code: "credenciales_invalidas" });
    expect(loginPortador.body.accessToken).toBeUndefined();

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo, password: PASSWORD });
    expect(login.status).toBe(200);

    const perfil = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(perfil.status).toBe(200);
    expect(perfil.body).toMatchObject({
      sessionScope: "company",
      empresaId: empresa.id,
      rol: "ADMINISTRADOR",
      membresiaId: provision.body.administrador.membresia.id,
    });
  });

  it("403: un administrador company-scoped no puede provisionar administradores de empresa", async () => {
    const [target, adminEmpresa] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `Empresa admin denied ${crypto.randomUUID()}` } }),
      crearAdminDeEmpresa("admin-provision-denied"),
    ]);

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${target.id}/administradores`)
      .set("Authorization", `Bearer ${adminEmpresa.token}`)
      .send({
        nombre: "Admin Rechazado",
        correo: `admin-rechazado-${crypto.randomUUID()}@test.local`,
        password: PASSWORD,
      });

    expect(respuesta.status).toBe(403);
  });

  it("403: un SUPERVISOR holding-wide no puede provisionar administradores de empresa", async () => {
    const [empresa, supervisorHolding] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `Empresa admin supervisor denied ${crypto.randomUUID()}` } }),
      crearUsuarioHoldingWide("SUPERVISOR"),
    ]);

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${supervisorHolding.token}`)
      .send({
        nombre: "Admin Rechazado Por Rol",
        correo: `admin-rol-rechazado-${crypto.randomUUID()}@test.local`,
        password: PASSWORD,
      });

    expect(respuesta.status).toBe(403);
  });

  it("401: rechaza una petición sin autenticación", async () => {
    const empresa = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa admin sin auth ${crypto.randomUUID()}` },
    });

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .send({
        nombre: "Admin Sin Auth",
        correo: `admin-sin-auth-${crypto.randomUUID()}@test.local`,
        password: PASSWORD,
      });

    expect(respuesta.status).toBe(401);
  });

  it("400: rechaza empresaId inválido o body inválido", async () => {
    const adminHolding = await crearUsuarioHoldingWide("ADMINISTRADOR");
    const empresa = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa admin invalid body ${crypto.randomUUID()}` },
    });

    const pathInvalido = await request(app)
      .post("/api/v1/empresas/no-es-uuid/administradores")
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Admin Path", correo: `admin-path-${crypto.randomUUID()}@test.local`, password: PASSWORD });
    expect(pathInvalido.status).toBe(400);

    const bodyInvalido = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Admin Body", correo: "correo-invalido", password: PASSWORD });
    expect(bodyInvalido.status).toBe(400);
  });

  it("404: rechaza una empresa inexistente", async () => {
    const adminHolding = await crearUsuarioHoldingWide("ADMINISTRADOR");

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${crypto.randomUUID()}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({
        nombre: "Admin Empresa Inexistente",
        correo: `admin-empresa-inexistente-${crypto.randomUUID()}@test.local`,
        password: PASSWORD,
      });

    expect(respuesta.status).toBe(404);
  });

  it("409: rechaza colisión de correo con Usuario o Membresia existentes", async () => {
    const [empresa, adminHolding] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `Empresa admin collision ${crypto.randomUUID()}` } }),
      crearUsuarioHoldingWide("ADMINISTRADOR"),
    ]);
    const usuarioExistente = await testAdminPrisma.usuario.create({
      data: {
        nombre: "Usuario con correo existente",
        correo: `correo-usuario-existente-${crypto.randomUUID()}@test.local`,
        passwordHash: await hashPassword(PASSWORD),
        rol: "ASESOR",
        activo: true,
      },
    });
    const portadorMembresiaExistente = await testAdminPrisma.usuario.create({
      data: {
        nombre: "Portador membresia existente",
        correo: `portador-membresia-existente-${crypto.randomUUID()}@test.local`,
        passwordHash: await hashPassword(PASSWORD),
        rol: "ADMINISTRADOR",
        activo: true,
      },
    });
    const membresiaExistente = await testAdminPrisma.membresia.create({
      data: {
        usuarioId: portadorMembresiaExistente.id,
        empresaId: empresa.id,
        rol: "ADMINISTRADOR",
        correo: `correo-membresia-existente-${crypto.randomUUID()}@test.local`,
        passwordHash: await hashPassword(PASSWORD),
        activa: true,
      },
    });

    const colisionUsuario = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Admin Colision Usuario", correo: usuarioExistente.correo, password: PASSWORD });
    expect(colisionUsuario.status).toBe(409);

    const colisionMembresia = await request(app)
      .post(`/api/v1/empresas/${empresa.id}/administradores`)
      .set("Authorization", `Bearer ${adminHolding.token}`)
      .send({ nombre: "Admin Colision Membresia", correo: membresiaExistente.correo, password: PASSWORD });
    expect(colisionMembresia.status).toBe(409);
  });
});

/**
 * Fix (bug de seguridad: POST /bridges no forzaba `empresaId` a la empresa
 * del actor) -- mismo criterio que arriba.
 */
describe("adversarial/http-cross-company — POST /bridges (bug de seguridad, empresaId forzado por sesión)", () => {
  it("201: un administrador company-scoped ignora el empresaId del body y usa el de su propia sesión", async () => {
    const [adminPropio, adminAjeno] = await Promise.all([
      crearAdminDeEmpresa("bridges-crear-propio"),
      crearAdminDeEmpresa("bridges-crear-ajeno"),
    ]);

    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminPropio.token}`)
      .send({
        redSocial: "GOOGLE_FORMS",
        nombre: `Bridge inyectado ${crypto.randomUUID()}`,
        empresaId: adminAjeno.empresaId,
      });

    expect(respuesta.status).toBe(201);
    const filaPersistida = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id: respuesta.body.bridge.id } });
    expect(filaPersistida.empresaId).toBe(adminPropio.empresaId);
    expect(filaPersistida.empresaId).not.toBe(adminAjeno.empresaId);
  });

  it("400 empresa_requerida: un SUPER_ADMIN holding-wide sin empresaId en el body es rechazado", async () => {
    const superAdmin = await crearSuperAdminHoldingWide();

    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${superAdmin.token}`)
      .send({ redSocial: "GOOGLE_FORMS", nombre: `Bridge sin empresa ${crypto.randomUUID()}` });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.code).toBe("empresa_requerida");
  });
});
