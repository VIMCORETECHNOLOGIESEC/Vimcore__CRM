import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";

let contador = 0;

// Bloque C follow-up (D2 gap closure): ASESOR/VENDEDOR sin Membresia activa
// ya no pueden autenticarse (TenantContext irresoluble se rechaza, D2) — solo
// esos dos roles la necesitan (ADMINISTRADOR/SUPERVISOR resuelven
// holding-wide incondicionalmente, sin leer Membresia).
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
const ROLES_CON_MEMBRESIA = new Set(["ASESOR", "VENDEDOR"]);

async function crearUsuarioConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario citas AR ${contador}`,
      correo: `usuario-citas-ar-${contador}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  if (ROLES_CON_MEMBRESIA.has(rol)) {
    await testAdminPrisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: rol === "VENDEDOR",
        activa: true,
      },
    });
  }
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

async function crearLead(
  overrides: Partial<{
    etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
    asesorId: string | null;
    vendedorId: string | null;
  }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente citas AR ${contador}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "CONTACTADO",
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      ingresadoEn: new Date(),
      empresaId: BOOTSTRAP_EMPRESA_ID,
    },
  });
  return { id: lead.id };
}

function enUnaHoraIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

/** Vista de calendario (feature aditiva post-M7): duración mínima válida (1h) desde un ISO de inicio dado. */
function finUnaHoraDespuesIso(inicioIso: string): string {
  return new Date(new Date(inicioIso).getTime() + 60 * 60 * 1000).toISOString();
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/leads/:id/citas", () => {
  it("401 sin token de acceso", async () => {
    const lead = await crearLead();
    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });
    expect(respuesta.status).toBe(401);
  });

  it("201: el responsable operativo del lead agenda una cita", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
        notas: "Primera reunión",
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cita.estado).toBe("AGENDADA");
    expect(respuesta.body.cita.leadId).toBe(lead.id);
  });

  it("403: un asesor ajeno al lead no puede agendar", async () => {
    const asesorTitular = await crearUsuarioConToken("ASESOR");
    const asesorAjeno = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesorAjeno.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    expect(respuesta.status).toBe(403);
  });

  it("422: rechaza una cita programada en el pasado", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: new Date(Date.now() - 60_000).toISOString(),
        finalizaEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        modalidad: "VIRTUAL",
      });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.code).toBe("cita_en_pasado");
  });

  it("400: modalidad inválida se rechaza en el borde (Zod)", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "NO_EXISTE",
      });

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/v1/leads/:id/citas y GET /api/v1/citas/:citaId", () => {
  it("200: Admin/Supervisor ven las citas de cualquier lead", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead({ asesorId: asesor.id });

    await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .get(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.citas).toHaveLength(1);
  });

  it("200: obtener una cita por id", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "PRESENCIAL",
      });

    const respuesta = await request(app)
      .get(`/api/v1/citas/${creada.body.cita.id}`)
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cita.id).toBe(creada.body.cita.id);
  });

  it("404: una cita inexistente", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/citas/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("POST /api/v1/citas/:citaId/cancelar", () => {
  it("200: el responsable operativo cancela su cita", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/cancelar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cita.estado).toBe("CANCELADA");
  });

  it("409: cancelar una cita ya cancelada", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/cancelar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/cancelar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("cita_no_cancelable");
  });
});

describe("POST /api/v1/citas/:citaId/reprogramar", () => {
  it("200: reprograma y el estado vuelve a AGENDADA con la nueva fecha", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const nuevaFecha = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/reprogramar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ programadaPara: nuevaFecha, finalizaEn: finUnaHoraDespuesIso(nuevaFecha) });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cita.estado).toBe("AGENDADA");
    expect(respuesta.body.cita.programadaPara).toBe(nuevaFecha);
  });

  it("409: no se puede reprogramar una cita cancelada", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/cancelar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/reprogramar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ programadaPara: enUnaHoraIso(), finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()) });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("cita_no_reprogramable");
  });
});

describe("POST /api/v1/citas/:citaId/resultado", () => {
  it("200: marca la cita como CUMPLIDA", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/resultado`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ estado: "CUMPLIDA" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cita.estado).toBe("CUMPLIDA");
  });

  it("400: un estado fuera de {CUMPLIDA, NO_ASISTIO} se rechaza en el borde", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    const creada = await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .post(`/api/v1/citas/${creada.body.cita.id}/resultado`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ estado: "CANCELADA" });

    expect(respuesta.status).toBe(400);
  });
});

// Vista de calendario (feature aditiva post-M7): `GET /citas`.
describe("GET /api/v1/citas", () => {
  function rangoAmplioQuery(): string {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hasta = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  }

  it("200: un asesor solo ve sus propias citas dentro del rango", async () => {
    const asesorUno = await crearUsuarioConToken("ASESOR");
    const asesorDos = await crearUsuarioConToken("ASESOR");
    const lead1 = await crearLead({ asesorId: asesorUno.id });
    const lead2 = await crearLead({ asesorId: asesorDos.id });

    await request(app)
      .post(`/api/v1/leads/${lead1.id}/citas`)
      .set("Authorization", `Bearer ${asesorUno.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });
    await request(app)
      .post(`/api/v1/leads/${lead2.id}/citas`)
      .set("Authorization", `Bearer ${asesorDos.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .get(`/api/v1/citas?${rangoAmplioQuery()}`)
      .set("Authorization", `Bearer ${asesorUno.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.citas).toHaveLength(1);
    expect(respuesta.body.citas[0].usuarioId).toBe(asesorUno.id);
  });

  it("200: un administrador ve todas las citas de la empresa", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead({ asesorId: asesor.id });

    await request(app)
      .post(`/api/v1/leads/${lead.id}/citas`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({
        programadaPara: enUnaHoraIso(),
        finalizaEn: finUnaHoraDespuesIso(enUnaHoraIso()),
        modalidad: "VIRTUAL",
      });

    const respuesta = await request(app)
      .get(`/api/v1/citas?${rangoAmplioQuery()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.citas.some((c: { usuarioId: string }) => c.usuarioId === asesor.id)).toBe(true);
  });

  it("400: desde/hasta faltantes se rechaza en el borde (Zod)", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");

    const respuesta = await request(app).get("/api/v1/citas").set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(400);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get(`/api/v1/citas?${rangoAmplioQuery()}`);
    expect(respuesta.status).toBe(401);
  });
});
