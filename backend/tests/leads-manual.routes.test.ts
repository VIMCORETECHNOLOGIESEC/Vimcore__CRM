import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico",
 * docs/blocks/d-routing-oportunidad.md:259-299 + carga masiva aditiva):
 * cobertura de integración de `POST /leads` y `POST /leads/carga-masiva`.
 * Mismo patrón de fixtures que `negociacion.producto.test.ts`/
 * `leads.routes.test.ts` -- login real vía `/auth/login`, nunca un mock de
 * JWT.
 */
const app = createApp();
const PASSWORD = "clave-leads-manual-123456";
let contador = 0;

async function crearEmpresa(prefijo: string): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.empresa.create({ data: { nombre: `${prefijo} ${contador} ${randomUUID()}` } });
}

/** Sesión holding-wide (Usuario.correo, sin Membresia) -- ADMINISTRADOR/SUPERVISOR resuelven sin restricción (D2). */
async function crearUsuarioHoldingConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario LM Holding ${contador}`,
      correo: `usuario-lm-holding-${contador}-${randomUUID()}@integracion.test`,
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
 * Sesión company-scoped (vía `Membresia.correo`/`passwordHash`) -- ASESOR/
 * VENDEDOR SIEMPRE necesitan una Membresia activa para autenticarse (Bloque
 * C, D2: "ASESOR/VENDEDOR sin Membresia activa ya no pueden autenticarse"),
 * así que nunca existen como sesión holding-wide en este código base.
 */
async function crearUsuarioCompanyScoped(
  rol: "ADMINISTRADOR" | "ASESOR" | "VENDEDOR",
  empresaId: string,
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario LM Company ${contador}`,
      correo: `usuario-lm-company-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const membresiaCorreo = `membresia-lm-${contador}-${randomUUID()}@integracion.test`;
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

async function crearCanal(
  empresaId: string,
  overrides: Partial<{ nombre: string; activo: boolean }> = {},
): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.canalManual.create({
    data: {
      empresaId,
      nombre: overrides.nombre ?? `Canal LM ${contador} ${randomUUID()}`,
      activo: overrides.activo ?? true,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/leads — Bloque D, ingreso manual", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).post("/api/v1/leads").send({ nombre: "Sin token" });
    expect(respuesta.status).toBe(401);
  });

  it("403: un VENDEDOR no puede cargar un lead manual", async () => {
    const empresa = await crearEmpresa("Empresa VENDEDOR manual");
    const vendedor = await crearUsuarioCompanyScoped("VENDEDOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${vendedor.token}`)
      .send({ nombre: "Lead rechazado", telefono: "0991234567" });

    expect(respuesta.status).toBe(403);
  });

  it("201: un ASESOR company-scoped crea un lead manual con solo teléfono, origen MANUAL", async () => {
    const empresa = await crearEmpresa("Empresa ASESOR manual");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead manual asesor", telefono: `099${randomUUID().replace(/\D/g, "").slice(0, 7)}` });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.lead.empresaId).toBe(empresa.id);
    expect(respuesta.body.lead.origen).toBe("MANUAL");
  });

  it("201: crea un lead manual con solo correo (sin teléfono)", async () => {
    const empresa = await crearEmpresa("Empresa solo correo");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead solo correo", correo: `lead-manual-${randomUUID()}@integracion.test` });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.lead.origen).toBe("MANUAL");
  });

  it("400: ni teléfono ni correo -- rechazado en el borde (Zod), nunca llega al servicio", async () => {
    const empresa = await crearEmpresa("Empresa sin contacto");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead sin contacto" });

    expect(respuesta.status).toBe(400);
  });

  it("400 empresa_requerida: un ADMINISTRADOR holding-wide sin empresaId en el body es rechazado", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Lead sin empresa", telefono: "0991234567" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.code).toBe("empresa_requerida");
  });

  it("201: un ADMINISTRADOR holding-wide crea un lead manual indicando empresaId explícito", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa admin holding manual");

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ nombre: "Lead admin holding", telefono: "0997654321", empresaId: empresa.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.lead.empresaId).toBe(empresa.id);
  });

  it("201: una sesión company-scoped ignora el empresaId del body y usa la de su propia sesión", async () => {
    const empresaSesion = await crearEmpresa("Empresa sesión manual");
    const empresaAjena = await crearEmpresa("Empresa ajena manual");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresaSesion.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead company-scoped", telefono: "0995551234", empresaId: empresaAjena.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.lead.empresaId).toBe(empresaSesion.id);
  });

  it("201: acepta un canalManualId activo de la misma empresa", async () => {
    const empresa = await crearEmpresa("Empresa canal ok");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const canal = await crearCanal(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead con canal", telefono: "0993334444", canalManualId: canal.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.lead.canalManualId).toBe(canal.id);
  });

  it("409 canal_manual_invalido: un canalManualId de OTRA empresa es rechazado", async () => {
    const empresa = await crearEmpresa("Empresa canal cruzado A");
    const empresaAjena = await crearEmpresa("Empresa canal cruzado B");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const canalAjeno = await crearCanal(empresaAjena.id);

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead canal ajeno", telefono: "0992223333", canalManualId: canalAjeno.id });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("canal_manual_invalido");
  });

  it("409 canal_manual_invalido: un canalManualId inactivo es rechazado", async () => {
    const empresa = await crearEmpresa("Empresa canal inactivo");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const canalInactivo = await crearCanal(empresa.id, { activo: false });

    const respuesta = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead canal inactivo", telefono: "0994445555", canalManualId: canalInactivo.id });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("canal_manual_invalido");
  });

  it("200 (duplicado): un segundo ingreso manual con el mismo teléfono ancla al lead abierto en vez de crear uno nuevo", async () => {
    const empresa = await crearEmpresa("Empresa duplicado manual");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const telefono = `098${randomUUID().replace(/\D/g, "").slice(0, 7)}`;

    const primero = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead original", telefono });
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ nombre: "Lead original de nuevo", telefono });

    expect(segundo.status).toBe(200);
    expect(segundo.body.lead.id).toBe(primero.body.lead.id);
  });
});

describe("POST /api/v1/leads/carga-masiva — Bloque D, aditivo (contrato ya comunicado a frontend)", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .send({ leads: [{ nombre: "X", telefono: "0990000000" }] });
    expect(respuesta.status).toBe(401);
  });

  it("400: un array vacío de leads es rechazado (min 1)", async () => {
    const empresa = await crearEmpresa("Empresa lote vacío");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ leads: [] });

    expect(respuesta.status).toBe(400);
  });

  it("400: más de 100 leads en el lote es rechazado (tope D-A1)", async () => {
    const empresa = await crearEmpresa("Empresa lote excedido");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const leads = Array.from({ length: 101 }, (_, i) => ({ nombre: `Lead ${i}`, telefono: `099${String(i).padStart(7, "0")}` }));

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ leads });

    expect(respuesta.status).toBe(400);
  });

  it("200: lote mixto -- filas inválidas (canalManualId inexistente) no abortan el resto, reporte por fila preserva el orden", async () => {
    const empresa = await crearEmpresa("Empresa lote mixto");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        leads: [
          { nombre: "Fila 1 ok", telefono: `098${randomUUID().replace(/\D/g, "").slice(0, 7)}` },
          { nombre: "Fila 2 canal inexistente", telefono: `098${randomUUID().replace(/\D/g, "").slice(0, 7)}`, canalManualId: randomUUID() },
          { nombre: "Fila 3 ok", telefono: `098${randomUUID().replace(/\D/g, "").slice(0, 7)}` },
        ],
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen).toEqual({ solicitados: 3, creados: 2, duplicados: 0, fallidos: 1 });
    expect(respuesta.body.resultados).toHaveLength(3);
    expect(respuesta.body.resultados[0]).toMatchObject({ fila: 1, estado: "creado" });
    expect(respuesta.body.resultados[1]).toMatchObject({ fila: 2, estado: "error" });
    expect(respuesta.body.resultados[2]).toMatchObject({ fila: 3, estado: "creado" });
  });

  it("200: canalManualId de nivel de lote aplica a toda fila que no traiga el suyo propio", async () => {
    const empresa = await crearEmpresa("Empresa canal de lote");
    const asesor = await crearUsuarioCompanyScoped("ASESOR", empresa.id);
    const canal = await crearCanal(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        canalManualId: canal.id,
        leads: [{ nombre: "Fila canal de lote", telefono: `098${randomUUID().replace(/\D/g, "").slice(0, 7)}` }],
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen.creados).toBe(1);
    // `testAdminPrisma` (superusuario, sin RLS) -- esta aserción corre fuera de cualquier
    // `TenantContext` de request, mismo criterio que el resto de este archivo de tests.
    const lead = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: respuesta.body.resultados[0].leadId } });
    expect(lead.canalManualId).toBe(canal.id);
  });

  it("200: una sesión holding-wide sin empresaId de lote reporta cada fila como error", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leads: [{ nombre: "Lote holding sin empresa", telefono: "0991112222" }] });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen).toEqual({ solicitados: 1, creados: 0, duplicados: 0, fallidos: 1 });
    expect(respuesta.body.resultados[0]).toMatchObject({ fila: 1, estado: "error" });
  });

  it("200: una sesión holding-wide con empresaId de lote crea todas las filas en esa empresa", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa lote holding con empresaId");

    const respuesta = await request(app)
      .post("/api/v1/leads/carga-masiva")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        empresaId: empresa.id,
        leads: [
          { nombre: "Lote holding fila 1", telefono: "0991112222" },
          { nombre: "Lote holding fila 2", correo: "fila2@lote-holding.test" },
        ],
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen).toEqual({ solicitados: 2, creados: 2, duplicados: 0, fallidos: 0 });

    const leadIds = respuesta.body.resultados.map((r: { leadId: string }) => r.leadId);
    const leads = await testAdminPrisma.lead.findMany({ where: { id: { in: leadIds } } });
    expect(leads).toHaveLength(2);
    for (const lead of leads) expect(lead.empresaId).toBe(empresa.id);
  });
});
