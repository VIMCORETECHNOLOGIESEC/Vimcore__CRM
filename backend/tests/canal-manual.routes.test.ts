import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico",
 * docs/blocks/d-routing-oportunidad.md:266-299): cobertura de integración
 * del catálogo `CanalManual`. Mismo patrón de fixtures que
 * `negociacion.producto.test.ts` -- login real vía `/auth/login`, nunca un
 * mock de JWT.
 */
const app = createApp();
const PASSWORD = "clave-canal-manual-123456";
let contador = 0;

async function crearEmpresa(prefijo: string): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.empresa.create({ data: { nombre: `${prefijo} ${contador} ${randomUUID()}` } });
}

/** Sesión holding-wide (Usuario.correo) -- mismo camino que `negociacion.producto.test.ts::crearUsuarioHoldingConToken`. */
async function crearUsuarioHoldingConToken(
  rol: "ADMINISTRADOR" | "ASESOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario CM Holding ${contador}`,
      correo: `usuario-cm-holding-${contador}-${randomUUID()}@integracion.test`,
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

/** Sesión company-scoped REAL (vía `Membresia.correo`/`passwordHash`), mismo patrón que `negociacion.producto.test.ts`. */
async function crearUsuarioCompanyScoped(
  rol: "ADMINISTRADOR" | "ASESOR" | "VENDEDOR",
  empresaId: string,
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario CM Company ${contador}`,
      correo: `usuario-cm-company-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const membresiaCorreo = `membresia-cm-${contador}-${randomUUID()}@integracion.test`;
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol: rol === "VENDEDOR" ? "ASESOR" : rol,
      habilitadoParaVenta: rol === "VENDEDOR",
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

describe("POST /api/v1/canales-manuales — gestión del catálogo, restringido a ADMINISTRADOR", () => {
  it("403: un ASESOR no puede crear un canal manual", async () => {
    const empresa = await crearEmpresa("Empresa canal 403");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Referido", empresaId: empresa.id });

    expect(respuesta.status).toBe(403);
  });

  it("201: un ADMINISTRADOR holding-wide crea un canal manual indicando empresaId explícito", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa canal ok");

    const respuesta = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Feria comercial", empresaId: empresa.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.canalManual.empresaId).toBe(empresa.id);
    expect(respuesta.body.canalManual.nombre).toBe("Feria comercial");
    expect(respuesta.body.canalManual.activo).toBe(true);
  });

  it("400 empresa_requerida: un ADMINISTRADOR holding-wide sin empresaId en el body es rechazado", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Sin empresa" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.code).toBe("empresa_requerida");
  });

  it("201: una sesión company-scoped ignora el empresaId del body y usa la de su propia sesión", async () => {
    const empresaSesion = await crearEmpresa("Empresa sesión canal");
    const empresaAjena = await crearEmpresa("Empresa ajena canal");
    const adminCompany = await crearUsuarioCompanyScoped("ADMINISTRADOR", empresaSesion.id);

    const respuesta = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${adminCompany.token}`)
      .send({ nombre: "Llamada telefónica", empresaId: empresaAjena.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.canalManual.empresaId).toBe(empresaSesion.id);
  });

  it("409 canal_manual_duplicado: mismo nombre en la misma empresa", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa dedup canal");

    const primero = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Canal duplicado", empresaId: empresa.id });
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Canal duplicado", empresaId: empresa.id });

    expect(segundo.status).toBe(409);
    expect(segundo.body.code).toBe("canal_manual_duplicado");
  });

  it("201: el mismo nombre en OTRA empresa no colisiona -- la unicidad es (empresaId, nombre)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresaA = await crearEmpresa("Empresa A canal compartido");
    const empresaB = await crearEmpresa("Empresa B canal compartido");

    const enA = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Canal compartido", empresaId: empresaA.id });
    expect(enA.status).toBe(201);

    const enB = await request(app)
      .post("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Canal compartido", empresaId: empresaB.id });

    expect(enB.status).toBe(201);
  });
});

describe("GET /api/v1/canales-manuales — Administrador/Supervisor/Asesor + holding", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/canales-manuales");
    expect(respuesta.status).toBe(401);
  });

  it("403: un VENDEDOR no puede listar canales manuales", async () => {
    const empresa = await crearEmpresa("Empresa canal vendedor");
    const vendedor = await crearUsuarioCompanyScoped("VENDEDOR", empresa.id);

    const respuesta = await request(app)
      .get("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${vendedor.token}`);

    expect(respuesta.status).toBe(403);
  });

  it("200: un ASESOR company-scoped lista solo los canales de su propia empresa", async () => {
    const empresa = await crearEmpresa("Empresa listado canal");
    const empresaAjena = await crearEmpresa("Empresa ajena listado canal");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Canal propio" } });
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresaAjena.id, nombre: "Canal ajeno" } });

    const respuesta = await request(app)
      .get("/api/v1/canales-manuales")
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalesManuales).toHaveLength(1);
    expect(respuesta.body.canalesManuales[0].empresaId).toBe(empresa.id);
  });

  it("?activo=false devuelve los canales INACTIVOS, no los activos", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa activo=false canal");
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Canal activo", activo: true } });
    const inactivo = await testAdminPrisma.canalManual.create({
      data: { empresaId: empresa.id, nombre: "Canal inactivo", activo: false },
    });

    const respuesta = await request(app)
      .get("/api/v1/canales-manuales")
      .query({ empresaId: empresa.id, activo: "false" })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalesManuales).toHaveLength(1);
    expect(respuesta.body.canalesManuales[0].id).toBe(inactivo.id);
  });
});

describe("PATCH /api/v1/canales-manuales/:id — edición parcial, restringido a ADMINISTRADOR", () => {
  it("403: un ASESOR no puede editar un canal manual", async () => {
    const empresa = await crearEmpresa("Empresa edicion 403");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const canal = await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Canal a editar" } });

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${canal.id}`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ activo: false });

    expect(respuesta.status).toBe(403);
  });

  it("200: un ADMINISTRADOR holding-wide desactiva un canal (activo=false), sin afectar leads históricos", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa desactivar canal");
    const canal = await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Canal a desactivar" } });

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${canal.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ activo: false });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalManual.activo).toBe(false);
    expect(respuesta.body.canalManual.nombre).toBe("Canal a desactivar");
  });

  it("200: renombra un canal (solo nombre, activo sin tocar)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa renombrar canal");
    const canal = await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Nombre viejo" } });

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${canal.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Nombre nuevo" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.canalManual.nombre).toBe("Nombre nuevo");
    expect(respuesta.body.canalManual.activo).toBe(true);
  });

  it("400: PATCH sin nombre ni activo es rechazado (no-op silencioso)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa patch vacío");
    const canal = await testAdminPrisma.canalManual.create({ data: { empresaId: empresa.id, nombre: "Canal patch vacío" } });

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${canal.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("404: una sesión company-scoped no puede editar un canal de OTRA empresa (id directo)", async () => {
    const empresaSesion = await crearEmpresa("Empresa sesión edición cruzada");
    const empresaAjena = await crearEmpresa("Empresa ajena edición cruzada");
    const adminCompany = await crearUsuarioCompanyScoped("ADMINISTRADOR", empresaSesion.id);
    const canalAjeno = await testAdminPrisma.canalManual.create({
      data: { empresaId: empresaAjena.id, nombre: "Canal ajeno a editar" },
    });

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${canalAjeno.id}`)
      .set("Authorization", `Bearer ${adminCompany.token}`)
      .send({ activo: false });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.code).toBe("canal_manual_no_encontrado");

    const intacto = await testAdminPrisma.canalManual.findUniqueOrThrow({ where: { id: canalAjeno.id } });
    expect(intacto.activo).toBe(true);
  });

  it("404: id inexistente", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/canales-manuales/${randomUUID()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ activo: false });

    expect(respuesta.status).toBe(404);
  });
});

describe("RLS — canales_manuales aísla por empresa a nivel de fila, no solo de aplicación", () => {
  it("una sesión company-scoped (GUC app.tenant_empresa_id) no ve canales de OTRA empresa vía Prisma directo", async () => {
    const empresaA = await crearEmpresa("Empresa RLS canal A");
    const empresaB = await crearEmpresa("Empresa RLS canal B");
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresaA.id, nombre: "Canal RLS A" } });
    await testAdminPrisma.canalManual.create({ data: { empresaId: empresaB.id, nombre: "Canal RLS B" } });

    // Hallazgo real (no cosmético) al escribir este test: `runWithTenantContext(ctx, () =>
    // prisma.model.xxx(args))` -- SIN un `await` explícito DENTRO del callback -- es un
    // patrón inseguro. Las operaciones de modelo de Prisma devuelven un `PrismaPromise`
    // perezoso (mismo mecanismo que habilita el batching de `$transaction([...])`): no
    // ejecuta nada hasta que se le hace `.then()`/`await`. Si ese `.then()` ocurre RECIÉN en
    // el `await` externo (fuera de la ventana síncrona de `AsyncLocalStorage.run`), la
    // extensión `$allOperations` de `lib/prisma.ts` corre sin `TenantContext` activo y
    // `applyTenantGucs` no escribe ningún GUC -- RLS cae fail-closed y devuelve 0 filas
    // SIEMPRE, sin distinguir "propia empresa" de "empresa ajena" (confirmado
    // empíricamente: el mismo `findMany` sin ningún `where` devolvía `[]` con este patrón).
    // Ningún call site de producción tiene este bug (todos envuelven en
    // `prisma.$transaction(...)`, que SÍ arranca su transacción real de forma síncrona/eager,
    // o delegan a una función `async` que hace su propio `await` antes de retornar) -- es
    // exclusivo de escribir un test así. `async () => { ...; return ...; }` con un `await`
    // real adentro (mismo patrón que `rls-tenant-context.test.ts`) es la forma segura.
    const visibles = await runWithTenantContext({ empresaId: empresaA.id }, async () => {
      return prisma.canalManual.findMany({ where: { empresaId: { in: [empresaA.id, empresaB.id] } } });
    });

    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.empresaId).toBe(empresaA.id);
  });

  it("un UPDATE bajo el GUC de la Empresa A no afecta una fila de la Empresa B (WITH CHECK/FORCE RLS)", async () => {
    const empresaA = await crearEmpresa("Empresa RLS update A");
    const empresaB = await crearEmpresa("Empresa RLS update B");
    const canalB = await testAdminPrisma.canalManual.create({
      data: { empresaId: empresaB.id, nombre: "Canal RLS update B" },
    });

    // Mismo patrón seguro que el test de arriba -- ver ese comentario.
    const actualizados = await runWithTenantContext({ empresaId: empresaA.id }, async () => {
      return prisma.canalManual.updateMany({ where: { id: canalB.id }, data: { activo: false } });
    });

    expect(actualizados.count).toBe(0);
    const intacto = await testAdminPrisma.canalManual.findUniqueOrThrow({ where: { id: canalB.id } });
    expect(intacto.activo).toBe(true);
  });
});
