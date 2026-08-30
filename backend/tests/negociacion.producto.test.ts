import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import {
  crearProductoBodySchema,
  listProductosQuerySchema,
} from "../src/schemas/negociacion/producto.schema.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * negociacion (Bloque D, D14): cobertura de integración/unitaria del
 * catálogo `Producto` -- este módulo se shippeó sin tests propios (ver
 * `docs/claude-negociacion-estado-actual.md`, "Decisión de testing"). Mismo
 * patrón de fixtures que `asignacion.routes.test.ts`/`auth.session-scope.test.ts`:
 * login real vía `/auth/login`, nunca un mock de JWT.
 */
const app = createApp();
const PASSWORD = "clave-negociacion-producto-123456";
let contador = 0;

async function crearEmpresa(prefijo: string): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.empresa.create({ data: { nombre: `${prefijo} ${contador} ${randomUUID()}` } });
}

/** Sesión holding-wide (Usuario.correo) -- mismo camino que `asignacion.routes.test.ts::crearUsuarioConToken`. */
async function crearUsuarioHoldingConToken(
  rol: "ADMINISTRADOR" | "ASESOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario NP ${contador}`,
      correo: `usuario-np-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

/**
 * Sesión company-scoped REAL (vía `Membresia.correo`/`passwordHash`), mismo
 * patrón que `auth.session-scope.test.ts::createMembershipSessionFixture` --
 * necesaria para probar la rama de `producto.service.ts::resolveEmpresaId`
 * donde la sesión YA trae su propia empresa y el body se ignora.
 */
async function crearAdministradorCompanyScoped(empresaId: string): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Admin Company NP ${contador}`,
      correo: `admin-company-np-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });
  const membresiaCorreo = `membresia-admin-np-${contador}-${randomUUID()}@integracion.test`;
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol: "ADMINISTRADOR",
      correo: membresiaCorreo,
      passwordHash: await hashPassword(PASSWORD),
      activa: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: membresiaCorreo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/productos — D14 catálogo, restringido a ADMINISTRADOR", () => {
  it("403: un ASESOR no puede crear un producto", async () => {
    const asesor = await crearUsuarioHoldingConToken("ASESOR");
    const empresa = await crearEmpresa("Empresa producto 403");

    const respuesta = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Producto rechazado", empresaId: empresa.id });

    expect(respuesta.status).toBe(403);
  });

  it("201: un ADMINISTRADOR holding-wide crea un producto indicando empresaId explícito", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa producto ok");

    const respuesta = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto A", empresaId: empresa.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.producto.empresaId).toBe(empresa.id);
    expect(respuesta.body.producto.nombre).toBe("Producto A");
    expect(respuesta.body.producto.activo).toBe(true);
  });

  it("400 empresa_requerida: un ADMINISTRADOR holding-wide sin empresaId en el body es rechazado", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto sin empresa" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.code).toBe("empresa_requerida");
  });

  it("201: una sesión company-scoped ignora el empresaId del body y usa la de su propia sesión", async () => {
    const empresaSesion = await crearEmpresa("Empresa sesión producto");
    const empresaAjena = await crearEmpresa("Empresa ajena producto");
    const adminCompany = await crearAdministradorCompanyScoped(empresaSesion.id);

    const respuesta = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${adminCompany.token}`)
      .send({ nombre: "Producto company-scoped", empresaId: empresaAjena.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.producto.empresaId).toBe(empresaSesion.id);
  });

  it("409 producto_duplicado: mismo nombre en la misma empresa", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa dedup producto");

    const primero = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto duplicado", empresaId: empresa.id });
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto duplicado", empresaId: empresa.id });

    expect(segundo.status).toBe(409);
    expect(segundo.body.code).toBe("producto_duplicado");
  });

  it("201: el mismo nombre en OTRA empresa no colisiona -- la unicidad es (empresaId, nombre)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresaA = await crearEmpresa("Empresa A mismo nombre");
    const empresaB = await crearEmpresa("Empresa B mismo nombre");

    const enA = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto compartido", empresaId: empresaA.id });
    expect(enA.status).toBe(201);

    const enB = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Producto compartido", empresaId: empresaB.id });

    expect(enB.status).toBe(201);
  });
});

describe("GET /api/v1/productos — cualquier autenticado", () => {
  it("200: un ASESOR puede listar productos (para elegir producto al crear una Oportunidad)", async () => {
    const asesor = await crearUsuarioHoldingConToken("ASESOR");

    const respuesta = await request(app)
      .get("/api/v1/productos")
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.productos)).toBe(true);
  });

  it("200: filtra por empresaId de query para una sesión holding-wide", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa filtro listado");
    await testAdminPrisma.producto.create({ data: { empresaId: empresa.id, nombre: "Producto listado único" } });

    const respuesta = await request(app)
      .get("/api/v1/productos")
      .query({ empresaId: empresa.id })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.productos).toHaveLength(1);
    expect(respuesta.body.productos[0].empresaId).toBe(empresa.id);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/productos");
    expect(respuesta.status).toBe(401);
  });

  /**
   * Fix aplicado: `?activo=false` en la query string real HTTP ahora filtra
   * por `activo: false` de verdad -- `listProductosQuerySchema` pasó de
   * `z.coerce.boolean()` (`Boolean("false") === true`) a `z.enum(["true",
   * "false"]).transform(...)`, mismo criterio ya usado en
   * `usuarios.schema.ts::listUsuariosQuerySchema`.
   */
  it("?activo=false devuelve los productos INACTIVOS, no los activos", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa activo=false");
    await testAdminPrisma.producto.create({
      data: { empresaId: empresa.id, nombre: "Producto activo", activo: true },
    });
    const inactivo = await testAdminPrisma.producto.create({
      data: { empresaId: empresa.id, nombre: "Producto inactivo", activo: false },
    });

    const respuesta = await request(app)
      .get("/api/v1/productos")
      .query({ empresaId: empresa.id, activo: "false" })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.productos).toHaveLength(1);
    expect(respuesta.body.productos[0].id).toBe(inactivo.id);
  });
});

describe("schemas/negociacion/producto.schema — validación Zod", () => {
  it("crearProductoBodySchema rechaza nombre vacío", () => {
    const resultado = crearProductoBodySchema.safeParse({ nombre: "" });
    expect(resultado.success).toBe(false);
  });

  it("crearProductoBodySchema rechaza nombre de más de 200 caracteres", () => {
    const resultado = crearProductoBodySchema.safeParse({ nombre: "a".repeat(201) });
    expect(resultado.success).toBe(false);
  });

  it("crearProductoBodySchema recorta espacios (trim) del nombre", () => {
    const resultado = crearProductoBodySchema.safeParse({ nombre: "  Producto con espacios  " });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.nombre).toBe("Producto con espacios");
  });

  it("crearProductoBodySchema rechaza empresaId que no es un uuid", () => {
    const resultado = crearProductoBodySchema.safeParse({ nombre: "Producto", empresaId: "no-es-un-uuid" });
    expect(resultado.success).toBe(false);
  });

  it("crearProductoBodySchema acepta sin empresaId (opcional)", () => {
    const resultado = crearProductoBodySchema.safeParse({ nombre: "Producto sin empresa" });
    expect(resultado.success).toBe(true);
  });

  it("listProductosQuerySchema: 'true'/'false' de query string coercionan al booleano correcto", () => {
    const conTrue = listProductosQuerySchema.safeParse({ activo: "true" });
    const conFalse = listProductosQuerySchema.safeParse({ activo: "false" });
    expect(conTrue.success).toBe(true);
    expect(conFalse.success).toBe(true);
    if (conTrue.success) expect(conTrue.data.activo).toBe(true);
    if (conFalse.success) expect(conFalse.data.activo).toBe(false);
  });

  it("listProductosQuerySchema: rechaza cualquier otro literal de activo", () => {
    const resultado = listProductosQuerySchema.safeParse({ activo: "si" });
    expect(resultado.success).toBe(false);
  });
});
