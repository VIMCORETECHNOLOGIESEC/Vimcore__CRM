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
