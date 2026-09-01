import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { verifyAccessToken } from "../src/lib/jwt.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-1234";

let adminAccessToken: string;
let vendedorAccessToken: string;
let vendedorId: string;
let empresaId: string;

beforeAll(async () => {
  // Bloque C follow-up (D2 gap closure): `Empresa` real (UUID v4 válido para
  // `z.uuid()`) — el `BOOTSTRAP_EMPRESA_ID` de otras suites
  // (`00...001`) no pasa el formato estricto de `z.uuid()` (versión RFC 4122
  // inválida), así que esta suite crea la suya para ejercitar la validación
  // HTTP real de `empresaId`.
  const empresa = await prisma.empresa.create({ data: { nombre: "Empresa Integración CRUD" } });
  empresaId = empresa.id;

  await prisma.usuario.create({
    data: {
      nombre: "Admin Integración",
      correo: "admin-crud@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

  // Bloque C follow-up (D2 gap closure): este VENDEDOR se loguea y ejecuta
  // peticiones autenticadas en las pruebas de abajo (matriz de roles) — sin
  // una Membresia activa, `requireAuthentication` rechazaría el
  // TenantContext ANTES de que `requireRole` llegue a evaluar el 403 que
  // esas pruebas esperan.
  const vendedor = await prisma.usuario.create({
    data: {
      nombre: "Vendedor Integración",
      correo: "vendedor-crud@integracion.test",
      passwordHash: await hashPassword(VENDEDOR_PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });
  vendedorId = vendedor.id;
  await testAdminPrisma.membresia.create({
    data: { usuarioId: vendedor.id, empresaId, rol: "ASESOR", habilitadoParaVenta: true, activa: true },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-crud@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const vendedorLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "vendedor-crud@integracion.test", password: VENDEDOR_PASSWORD });
  vendedorAccessToken = vendedorLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/usuarios", () => {
  it("201 crea un usuario y jamás devuelve passwordHash", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Nuevo Usuario",
        correo: "nuevo@integracion.test",
        password: "clave-nueva-123456",
        rol: "ASESOR",
        empresaId,
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.user.correo).toBe("nuevo@integracion.test");
    expect(respuesta.body.user.rol).toBe("ASESOR");
    expect(respuesta.body.user.passwordHash).toBeUndefined();
  });

  it("201 ASESOR/VENDEDOR nuevo puede loguearse de inmediato (TenantContext resuelve por la Membresia recién creada, Bloque C follow-up)", async () => {
    const correo = "recien-creado-login@integracion.test";
    const password = "clave-recien-creada-1234";
    const creacion = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Recién Creado", correo, password, rol: "ASESOR", empresaId });
    expect(creacion.status).toBe(201);

    const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
    expect(login.status).toBe(200);

    const perfil = await request(app)
      .get("/api/v1/usuarios/responsables")
      .query({ rol: "ASESOR" })
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(perfil.status).toBe(200);
  });

  it("400 al crear un ASESOR sin empresaId (Bloque C follow-up, D2 gap closure)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Asesor Sin Empresa",
        correo: "asesor-sin-empresa@integracion.test",
        password: "clave-nueva-123456",
        rol: "ASESOR",
      });

    expect(respuesta.status).toBe(400);
  });

  it("400 al crear un VENDEDOR sin empresaId (Bloque C follow-up, D2 gap closure)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Vendedor Sin Empresa",
        correo: "vendedor-sin-empresa@integracion.test",
        password: "clave-nueva-123456",
        rol: "VENDEDOR",
      });

    expect(respuesta.status).toBe(400);
  });

  it("201 crea un ADMINISTRADOR sin empresaId (holding-wide incondicional, D2 — no requiere Membresia)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Otro Admin",
        correo: "otro-admin@integracion.test",
        password: "clave-nueva-123456",
        rol: "ADMINISTRADOR",
      });

    expect(respuesta.status).toBe(201);
  });

  it("400 con una contraseña más corta que la política de alta (min 12)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Corto",
        correo: "corto@integracion.test",
        password: "corta1",
        rol: "ASESOR",
      });

    expect(respuesta.status).toBe(400);
  });

  it("400 con un rol inválido (fuera de las 4 opciones del enum, D9)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Rol Inválido",
        correo: "rolinvalido@integracion.test",
        password: "clave-valida-123456",
        rol: "SUPERADMIN",
      });

    expect(respuesta.status).toBe(400);
  });

  it("400 con campos faltantes", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Incompleto" });

    expect(respuesta.status).toBe(400);
  });
});

describe("POST /api/v1/empresas/:empresaId/supervisores (hotfix: alta de Supervisor scoped a empresa)", () => {
  it("201 crea un supervisor de empresa y jamás devuelve passwordHash", async () => {
    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/supervisores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Supervisora Integración",
        correo: "supervisora-crud@integracion.test",
        password: "clave-supervisora-123456",
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.supervisor.usuario.rol).toBe("SUPERVISOR");
    expect(respuesta.body.supervisor.membresia).toMatchObject({
      empresaId,
      rol: "SUPERVISOR",
      activa: true,
      correo: "supervisora-crud@integracion.test",
    });
    expect(JSON.stringify(respuesta.body)).not.toContain("passwordHash");
  });

  it("201 y el supervisor creado puede loguearse de inmediato con sessionScope 'company' y el empresaId correcto (prueba real de punta a punta del fix)", async () => {
    const correo = "supervisora-login-real@integracion.test";
    const password = "clave-supervisora-login-1234";

    const creacion = await request(app)
      .post(`/api/v1/empresas/${empresaId}/supervisores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Supervisora Login Real", correo, password });
    expect(creacion.status).toBe(201);

    const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
    expect(login.status).toBe(200);

    const accessPayload = await verifyAccessToken(login.body.accessToken);
    expect(accessPayload).toMatchObject({
      rol: "SUPERVISOR",
      sessionScope: "company",
      empresaId,
    });
  });

  it("403 cuando el actor no es una sesión holding-wide (ej. una sesión company-scoped)", async () => {
    const correoAsesor = "asesor-companyscope@integracion.test";
    const passwordAsesor = "clave-asesor-companyscope-1234";
    await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Asesor Company Scope", correo: correoAsesor, password: passwordAsesor, rol: "ASESOR", empresaId });
    const loginAsesor = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoAsesor, password: passwordAsesor });
    expect(loginAsesor.status).toBe(200);

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/supervisores`)
      .set("Authorization", `Bearer ${loginAsesor.body.accessToken}`)
      .send({ nombre: "No Debería Crearse", correo: "no-deberia@integracion.test", password: "clave-cualquiera-1234" });

    expect(respuesta.status).toBe(403);
  });

  it("400 con campos faltantes", async () => {
    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/supervisores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Incompleto" });

    expect(respuesta.status).toBe(400);
  });
});

describe("POST /api/v1/empresas/:empresaId/asesores (fix: Asesor scoped a empresa logueaba holding-wide)", () => {
  it("201 crea un asesor de empresa y jamás devuelve passwordHash", async () => {
    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Asesora Integración",
        correo: "asesora-crud@integracion.test",
        password: "clave-asesora-123456",
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.asesor.usuario.rol).toBe("ASESOR");
    expect(respuesta.body.asesor.membresia).toMatchObject({
      empresaId,
      rol: "ASESOR",
      activa: true,
      correo: "asesora-crud@integracion.test",
    });
    expect(JSON.stringify(respuesta.body)).not.toContain("passwordHash");
  });

  it("201 y el asesor creado puede loguearse de inmediato con sessionScope 'company' y el empresaId correcto (prueba real de punta a punta del fix)", async () => {
    const correo = "asesora-login-real@integracion.test";
    const password = "clave-asesora-login-1234";

    const creacion = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Asesora Login Real", correo, password });
    expect(creacion.status).toBe(201);

    const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
    expect(login.status).toBe(200);

    const accessPayload = await verifyAccessToken(login.body.accessToken);
    expect(accessPayload).toMatchObject({
      rol: "ASESOR",
      sessionScope: "company",
      empresaId,
    });
  });

  it("403 cuando el actor no es una sesión holding-wide (ej. una sesión company-scoped)", async () => {
    const correoAsesor = "asesor-companyscope-asesores@integracion.test";
    const passwordAsesor = "clave-asesor-companyscope-1234";
    await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Asesor Company Scope", correo: correoAsesor, password: passwordAsesor, rol: "ASESOR", empresaId });
    const loginAsesor = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoAsesor, password: passwordAsesor });
    expect(loginAsesor.status).toBe(200);

    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${loginAsesor.body.accessToken}`)
      .send({ nombre: "No Debería Crearse", correo: "no-deberia-asesor@integracion.test", password: "clave-cualquiera-1234" });

    expect(respuesta.status).toBe(403);
  });

  it("400 con campos faltantes", async () => {
    const respuesta = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Incompleto" });

    expect(respuesta.status).toBe(400);
  });

  it("409 cuando el correo ya está en uso", async () => {
    const correo = "asesora-duplicada-crud@integracion.test";
    const password = "clave-asesora-duplicada-123456";

    const primeraCreacion = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Primera Asesora", correo, password });
    expect(primeraCreacion.status).toBe(201);

    const segundaCreacion = await request(app)
      .post(`/api/v1/empresas/${empresaId}/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Segunda Asesora", correo, password });

    expect(segundaCreacion.status).toBe(409);
  });

  it("404 cuando la empresa no existe", async () => {
    const respuesta = await request(app)
      .post(`/api/v1/empresas/00000000-0000-0000-0000-000000000000/asesores`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        nombre: "Asesora Empresa Inexistente",
        correo: "asesora-empresa-inexistente@integracion.test",
        password: "clave-asesora-inexistente-123456",
      });

    expect(respuesta.status).toBe(404);
  });
});

describe("GET /api/v1/usuarios y GET /api/v1/usuarios/:id", () => {
  it("200 lista usuarios sin exponer passwordHash", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.users)).toBe(true);
    for (const user of respuesta.body.users) {
      expect(user.passwordHash).toBeUndefined();
    }
  });

  it("200 obtiene un usuario por id", async () => {
    const respuesta = await request(app)
      .get(`/api/v1/usuarios/${vendedorId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.user.id).toBe(vendedorId);
    expect(respuesta.body.user.passwordHash).toBeUndefined();
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("400 con un id que no es UUID", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios/no-es-un-uuid")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/v1/usuarios — subtítulo de empresa por usuario (Josu, panel de holding)", () => {
  it("200 incluye 'empresas' con la Membresia activa del usuario", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: "Vendedor Integración" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    const encontrado = respuesta.body.users.find((u: { id: string }) => u.id === vendedorId);
    expect(encontrado.empresas).toEqual([{ id: empresaId, nombre: "Empresa Integración CRUD" }]);
  });

  it("200 triangulación: un usuario sin ninguna Membresia devuelve 'empresas' vacío", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: "Admin Integración" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    const encontrado = respuesta.body.users.find((u: { correo: string }) => u.correo === "admin-crud@integracion.test");
    expect(encontrado.empresas).toEqual([]);
  });
});

describe("GET /api/v1/usuarios — filtros y paginación", () => {
  let filtroBusquedaId: string;

  beforeAll(async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Filtro Buscable Ñandú",
        correo: "filtro-buscable@integracion.test",
        passwordHash: await hashPassword("clave-filtro-123456"),
        rol: "SUPERVISOR",
        activo: false,
      },
    });
    filtroBusquedaId = usuario.id;
  });

  it("200 devuelve total/pagina/limite junto con users", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.users)).toBe(true);
    expect(typeof respuesta.body.total).toBe("number");
    expect(respuesta.body.pagina).toBe(1);
    expect(respuesta.body.limite).toBe(20);
  });

  it("200 filtra por busqueda contra el nombre (insensible a mayúsculas)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: "buscable ñandú" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(1);
    expect(respuesta.body.users[0].id).toBe(filtroBusquedaId);
  });

  it("200 filtra por busqueda contra el correo (correo es citext)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ busqueda: "FILTRO-BUSCABLE@integracion.test" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(1);
    expect(respuesta.body.users[0].id).toBe(filtroBusquedaId);
  });

  it("200 filtra por rol exacto", async () => {
    // Combinado con `busqueda` para aislar el resultado a nuestro usuario de
    // prueba — corriendo la suite completa puede haber otros SUPERVISOR
    // creados por fixtures de otros archivos, y el `limite` por defecto (20)
    // no garantiza que el nuestro caiga en la primera página.
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ rol: "SUPERVISOR", busqueda: "Filtro Buscable" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(1);
    expect(respuesta.body.users[0].id).toBe(filtroBusquedaId);
    expect(respuesta.body.users[0].rol).toBe("SUPERVISOR");
  });

  it("200 filtra por activo=false", async () => {
    // Mismo aislamiento por `busqueda` que el test anterior (ver comentario).
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ activo: "false", busqueda: "Filtro Buscable" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.users).toHaveLength(1);
    expect(respuesta.body.users[0].id).toBe(filtroBusquedaId);
    expect(respuesta.body.users[0].activo).toBe(false);
  });

  it("200 pagina el listado respetando limite", async () => {
    const primeraPagina = await request(app)
      .get("/api/v1/usuarios")
      .query({ pagina: 1, limite: 1 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(primeraPagina.status).toBe(200);
    expect(primeraPagina.body.users).toHaveLength(1);
    expect(primeraPagina.body.pagina).toBe(1);
    expect(primeraPagina.body.limite).toBe(1);

    const segundaPagina = await request(app)
      .get("/api/v1/usuarios")
      .query({ pagina: 2, limite: 1 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(segundaPagina.status).toBe(200);
    expect(segundaPagina.body.users).toHaveLength(1);
    expect(segundaPagina.body.users[0].id).not.toBe(primeraPagina.body.users[0].id);
  });

  it("400 con pagina fuera de rango (menor a 1)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ pagina: 0 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });

  it("400 con limite fuera de rango (mayor a 100)", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .query({ limite: 101 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });

  /**
   * Bloque F (tarea 2, cuarto modo de `buildWhere`): `soloHoldingWide=true`
   * solo tiene efecto para un actor holding-wide -- filtra a los usuarios SIN
   * ninguna `Membresia`, para el tab correspondiente del panel de holding.
   * `adminAccessToken` (fixture del `beforeAll` de este archivo) es
   * holding-wide (ADMINISTRADOR sin Membresia propia, D2).
   */
  describe("GET /api/v1/usuarios?soloHoldingWide=true (Bloque F, tarea 2)", () => {
    let holdingWideId: string;
    let companyScopedId: string;
    const terminoUnico = `SoloHolding ${Date.now()}`;

    beforeAll(async () => {
      const holdingUsuario = await prisma.usuario.create({
        data: {
          nombre: `${terminoUnico} Sin Membresia`,
          correo: `solo-holding-wide-${Date.now()}@integracion.test`,
          passwordHash: await hashPassword("clave-solo-holding-123456"),
          rol: "SUPERVISOR",
          activo: true,
        },
      });
      holdingWideId = holdingUsuario.id;

      const companyUsuario = await prisma.usuario.create({
        data: {
          nombre: `${terminoUnico} Con Membresia`,
          correo: `solo-holding-company-${Date.now()}@integracion.test`,
          passwordHash: await hashPassword("clave-solo-holding-123456"),
          rol: "ASESOR",
          activo: true,
        },
      });
      companyScopedId = companyUsuario.id;
      await testAdminPrisma.membresia.create({
        data: { usuarioId: companyUsuario.id, empresaId, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });
    });

    it("200 devuelve solo el usuario sin Membresia, no el que sí tiene Membresia", async () => {
      const respuesta = await request(app)
        .get("/api/v1/usuarios")
        .query({ soloHoldingWide: "true", busqueda: terminoUnico })
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      const ids = respuesta.body.users.map((u: { id: string }) => u.id);
      expect(ids).toContain(holdingWideId);
      expect(ids).not.toContain(companyScopedId);
    });

    it("200 triangulación: sin soloHoldingWide, el mismo busqueda devuelve AMBOS usuarios (comportamiento por defecto sin cambios)", async () => {
      const respuesta = await request(app)
        .get("/api/v1/usuarios")
        .query({ busqueda: terminoUnico })
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      const ids = respuesta.body.users.map((u: { id: string }) => u.id);
      expect(ids).toContain(holdingWideId);
      expect(ids).toContain(companyScopedId);
    });

    it("200 soloHoldingWide=true prioriza sobre empresaId cuando llegan juntos (mutuamente excluyentes, decisión de prioridad)", async () => {
      const respuesta = await request(app)
        .get("/api/v1/usuarios")
        .query({ soloHoldingWide: "true", empresaId, busqueda: terminoUnico })
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(respuesta.status).toBe(200);
      const ids = respuesta.body.users.map((u: { id: string }) => u.id);
      expect(ids).toContain(holdingWideId);
      expect(ids).not.toContain(companyScopedId);
    });
  });
});

describe("PATCH /api/v1/usuarios/:id", () => {
  it("200 actualiza campos parciales sin exponer passwordHash", async () => {
    const respuesta = await request(app)
      .patch(`/api/v1/usuarios/${vendedorId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Vendedor Renombrado" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.user.nombre).toBe("Vendedor Renombrado");
    expect(respuesta.body.user.passwordHash).toBeUndefined();
  });

  it("400 con un body vacío (sin campos)", async () => {
    const respuesta = await request(app)
      .patch(`/api/v1/usuarios/${vendedorId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/usuarios/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Fantasma" });

    expect(respuesta.status).toBe(404);
  });

  it("200 reactiva (activo: true) a un usuario dado de baja y puede volver a loguearse", async () => {
    const passwordReactivada = "clave-reactivada-123456";
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Usuario Para Reactivar",
        correo: "reactivar@integracion.test",
        passwordHash: await hashPassword(passwordReactivada),
        rol: "ASESOR",
        activo: false,
      },
    });

    // Un usuario inactivo no puede loguearse (control previo al fix).
    const loginAntes = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: usuario.correo, password: passwordReactivada });
    expect(loginAntes.status).toBe(401);

    const reactivacion = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ activo: true });

    expect(reactivacion.status).toBe(200);
    expect(reactivacion.body.user.activo).toBe(true);
    expect(reactivacion.body.user.passwordHash).toBeUndefined();

    const usuarioTrasReactivar = await prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
    });
    expect(usuarioTrasReactivar.activo).toBe(true);

    const loginDespues = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: usuario.correo, password: passwordReactivada });
    expect(loginDespues.status).toBe(200);
  });

  it("200 reactivar (activo: true) a un usuario que YA está activo es un no-op, sin error", async () => {
    const respuesta = await request(app)
      .patch(`/api/v1/usuarios/${vendedorId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ activo: true });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.user.activo).toBe(true);

    const usuarioTrasNoOp = await prisma.usuario.findUniqueOrThrow({
      where: { id: vendedorId },
    });
    expect(usuarioTrasNoOp.activo).toBe(true);
  });

  it("200 sigue actualizando correo/rol sin regresión tras agregar activo al schema", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Usuario Sin Regresión",
        correo: "sin-regresion@integracion.test",
        passwordHash: await hashPassword("clave-sin-regresion-123456"),
        rol: "ASESOR",
        activo: true,
      },
    });

    const respuesta = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ correo: "sin-regresion-nuevo@integracion.test", rol: "VENDEDOR" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.user.correo).toBe("sin-regresion-nuevo@integracion.test");
    expect(respuesta.body.user.rol).toBe("VENDEDOR");
    expect(respuesta.body.user.passwordHash).toBeUndefined();
  });
});

describe("DELETE /api/v1/usuarios/:id — baja lógica (D3)", () => {
  it("204, activo=false y revoca el refresh activo del usuario en la misma transacción", async () => {
    const passwordVictima = "clave-victima-123456";
    const victima = await prisma.usuario.create({
      data: {
        nombre: "Víctima Baja",
        correo: "victima-baja@integracion.test",
        passwordHash: await hashPassword(passwordVictima),
        rol: "ASESOR",
        activo: true,
      },
    });

    const loginVictima = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: victima.correo, password: passwordVictima });
    const refreshVictima = loginVictima.body.refreshToken as string;

    const baja = await request(app)
      .delete(`/api/v1/usuarios/${victima.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(baja.status).toBe(204);

    const usuarioTrasBaja = await prisma.usuario.findUniqueOrThrow({
      where: { id: victima.id },
    });
    expect(usuarioTrasBaja.activo).toBe(false);

    // El refresh emitido antes de la baja ya no debe servir.
    const refreshTrasBaja = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshVictima });
    expect(refreshTrasBaja.status).toBe(401);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .delete("/api/v1/usuarios/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("GET /api/v1/usuarios/responsables — catálogo de responsables activos por rol (F3/F4, D-A1)", () => {
  it("200 un SUPERVISOR consulta el catálogo y recibe {id,nombre,rol}[] de asesores activos", async () => {
    const supervisorPassword = "clave-supervisor-123456";
    const supervisor = await prisma.usuario.create({
      data: {
        nombre: "Supervisor Catálogo",
        correo: "supervisor-catalogo@integracion.test",
        passwordHash: await hashPassword(supervisorPassword),
        rol: "SUPERVISOR",
        activo: true,
      },
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: supervisor.correo, password: supervisorPassword });
    const supervisorToken = login.body.accessToken as string;

    const asesorActivo = await prisma.usuario.create({
      data: {
        nombre: "Asesor Catálogo Activo",
        correo: "asesor-catalogo-activo@integracion.test",
        passwordHash: await hashPassword("clave-asesor-123456"),
        rol: "ASESOR",
        activo: true,
      },
    });

    const respuesta = await request(app)
      .get("/api/v1/usuarios/responsables")
      .query({ rol: "ASESOR" })
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.responsables)).toBe(true);
    const encontrado = respuesta.body.responsables.find(
      (r: { id: string }) => r.id === asesorActivo.id,
    );
    expect(encontrado).toEqual({ id: asesorActivo.id, nombre: "Asesor Catálogo Activo", rol: "ASESOR" });
  });

  it("200 un usuario inactivo del rol consultado NO aparece en el catálogo", async () => {
    const asesorInactivo = await prisma.usuario.create({
      data: {
        nombre: "Asesor Catálogo Inactivo",
        correo: "asesor-catalogo-inactivo@integracion.test",
        passwordHash: await hashPassword("clave-asesor-123456"),
        rol: "ASESOR",
        activo: false,
      },
    });

    const respuesta = await request(app)
      .get("/api/v1/usuarios/responsables")
      .query({ rol: "ASESOR" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    const encontrado = respuesta.body.responsables.find(
      (r: { id: string }) => r.id === asesorInactivo.id,
    );
    expect(encontrado).toBeUndefined();
  });

  it("403 cuando un ASESOR o VENDEDOR intenta consultar el catálogo", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios/responsables")
      .query({ rol: "ASESOR" })
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });
});

describe("Matriz de roles — solo ADMINISTRADOR opera el CRUD (D9)", () => {
  it("403 cuando un VENDEDOR intenta listar usuarios", async () => {
    const respuesta = await request(app)
      .get("/api/v1/usuarios")
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("403 cuando un VENDEDOR intenta crear un usuario", async () => {
    const respuesta = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .send({
        nombre: "No Debería Crearse",
        correo: "nodeberia@integracion.test",
        password: "clave-cualquiera-1234",
        rol: "ASESOR",
      });

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso en cualquier endpoint del CRUD", async () => {
    const respuesta = await request(app).get("/api/v1/usuarios");
    expect(respuesta.status).toBe(401);
  });
});
