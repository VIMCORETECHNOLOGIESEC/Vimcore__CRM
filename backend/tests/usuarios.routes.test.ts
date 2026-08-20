import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-1234";

let adminAccessToken: string;
let vendedorAccessToken: string;
let vendedorId: string;

beforeAll(async () => {
  await prisma.usuario.create({
    data: {
      nombre: "Admin Integración",
      correo: "admin-crud@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

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
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.user.correo).toBe("nuevo@integracion.test");
    expect(respuesta.body.user.rol).toBe("ASESOR");
    expect(respuesta.body.user.passwordHash).toBeUndefined();
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
