import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";
const VEINTICINCO_HORAS_MS = 25 * 60 * 60 * 1000;

let contador = 0;

// Bloque C follow-up (D2 gap closure): ASESOR/VENDEDOR sin Membresia activa
// ya no pueden autenticarse (TenantContext irresoluble se rechaza, D2) — solo
// esos dos roles la necesitan (ADMINISTRADOR/SUPERVISOR resuelven
// holding-wide incondicionalmente, sin leer Membresia).
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
const ROLES_CON_MEMBRESIA = new Set(["ASESOR", "VENDEDOR"]);

async function crearUsuarioConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR",
  activo = true,
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario AR ${contador}`,
      correo: `usuario-ar-${contador}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo,
    },
  });
  if (ROLES_CON_MEMBRESIA.has(rol)) {
    await prisma.membresia.create({
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
    semaforo: "ROJO" | "AMARILLO" | "VERDE" | null;
    asesorId: string | null;
    vendedorId: string | null;
    slaInicioEn: Date | null;
  }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente AR ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      slaInicioEn: overrides.slaInicioEn === undefined ? null : overrides.slaInicioEn,
      ingresadoEn: new Date(),
      empresaId: BOOTSTRAP_EMPRESA_ID,
    },
  });
  return { id: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/leads/:id/asignar — prueba obligatoria 9 (D8): restringido a Admin/Supervisor", () => {
  it("403: un asesor no puede usar /asignar", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const asesorActor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/asignar`)
      .set("Authorization", `Bearer ${asesorActor.token}`)
      .send({});

    expect(respuesta.status).toBe(403);
  });

  it("200: un supervisor puede usar /asignar y el lead queda asignado por el algoritmo", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const supervisor = await crearUsuarioConToken("SUPERVISOR");
    const asesorDestino = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/asignar`)
      .set("Authorization", `Bearer ${supervisor.token}`)
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.asesorId).toBe(asesorDestino.id);
    expect(respuesta.body.lead.slaInicioEn).not.toBeNull();
  });

  it("200: un administrador puede indicar destinatario explícito en /asignar", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    await crearUsuarioConToken("ASESOR");
    const asesorElegido = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/asignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: asesorElegido.id });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.asesorId).toBe(asesorElegido.id);
  });
});

describe("POST /api/v1/leads/:id/reasignar — prueba obligatoria 3 (D8/DD6): semáforo verde bloquea al asesor titular", () => {
  it("403: el asesor titular no puede reasignar su propio lead con semáforo verde", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, semaforo: "VERDE" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    expect(respuesta.status).toBe(403);
    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.asesorId).toBe(asesor.id);
  });

  it("200: el asesor titular puede reasignar su propio lead con semáforo rojo", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const asesorTitular = await crearUsuarioConToken("ASESOR");
    const asesorDestino = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id, semaforo: "ROJO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${asesorTitular.token}`)
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.asesorId).toBe(asesorDestino.id);
  });
});

describe("POST /api/v1/leads/:id/reasignar — prueba obligatoria 7 (D3): reinicia el reloj de SLA", () => {
  it("200: un lead atrasado vuelve a a_tiempo inmediatamente después de reasignarse", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const asesorTitular = await crearUsuarioConToken("ASESOR");
    await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({
      asesorId: asesorTitular.id,
      semaforo: "ROJO",
      slaInicioEn: new Date(Date.now() - VEINTICINCO_HORAS_MS),
    });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${asesorTitular.token}`)
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.estadoSla).toBe("a_tiempo");
  });
});

describe("POST /api/v1/leads/:id/traspasar — prueba obligatoria 10 (D9): compuerta de etapa", () => {
  it("409: un lead en NUEVO no puede traspasarse, ni siquiera por un administrador", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead({ etapa: "NUEVO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/traspasar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});

    expect(respuesta.status).toBe(409);
    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.vendedorId).toBeNull();
  });

  it("200: desde CONTACTADO, sin destinatario explícito, el vendedor lo elige el algoritmo", async () => {
    await prisma.usuario.updateMany({ where: { rol: "VENDEDOR" }, data: { activo: false } });
    const asesorTitular = await crearUsuarioConToken("ASESOR");
    const vendedorDestino = await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead({ asesorId: asesorTitular.id, etapa: "CONTACTADO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/traspasar`)
      .set("Authorization", `Bearer ${asesorTitular.token}`)
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.vendedorId).toBe(vendedorDestino.id);
    expect(respuesta.body.lead.asesorId).toBe(asesorTitular.id);
  });
});

describe("POST /api/v1/leads/:id/traspasar — prueba obligatoria 13 (D13, regresión M5)", () => {
  it("tras traspaso: el asesor origen conserva GET (200) pero pierde PATCH etapa (403)", async () => {
    await prisma.usuario.updateMany({ where: { rol: "VENDEDOR" }, data: { activo: false } });
    const asesorTitular = await crearUsuarioConToken("ASESOR");
    await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead({ asesorId: asesorTitular.id, etapa: "CONTACTADO" });

    const traspaso = await request(app)
      .post(`/api/v1/leads/${lead.id}/traspasar`)
      .set("Authorization", `Bearer ${asesorTitular.token}`)
      .send({});
    expect(traspaso.status).toBe(200);

    const lectura = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", `Bearer ${asesorTitular.token}`);
    expect(lectura.status).toBe(200);

    const edicion = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesorTitular.token}`)
      .send({ etapa: "CITA", respuestas: {} });
    expect(edicion.status).toBe(403);
  });
});

describe("POST /api/v1/leads/asignar-lote — asignación masiva (design D-A1)", () => {
  it("200: lote mixto (válido + inexistente + cerrado) reporta exitosos[] y fallidos[] con codigo, sin bloquear el lote", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const supervisor = await crearUsuarioConToken("SUPERVISOR");
    const asesorDestino = await crearUsuarioConToken("ASESOR");
    const leadValido = await crearLead();
    const leadCerrado = await crearLead({ etapa: "VENTA", semaforo: "VERDE" });
    const leadInexistente = "00000000-0000-0000-0000-000000000000";

    const respuesta = await request(app)
      .post("/api/v1/leads/asignar-lote")
      .set("Authorization", `Bearer ${supervisor.token}`)
      .send({ leadIds: [leadValido.id, leadInexistente, leadCerrado.id], asesorId: asesorDestino.id });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.exitosos).toEqual([{ leadId: leadValido.id, asesorId: asesorDestino.id }]);
    expect(respuesta.body.fallidos).toHaveLength(2);
    const codigos = respuesta.body.fallidos.map((f: { codigo: string }) => f.codigo).sort();
    expect(codigos).toEqual(["lead_cerrado", "lead_no_encontrado"]);
    expect(respuesta.body.resumen).toEqual({ solicitados: 3, exitosos: 1, fallidos: 2 });

    const leadValidoActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: leadValido.id } });
    expect(leadValidoActualizado.asesorId).toBe(asesorDestino.id);
  });

  it("200: un lead inválido en un lote de 20 no bloquea la asignación de los otros 19", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const supervisor = await crearUsuarioConToken("SUPERVISOR");
    const asesorDestino = await crearUsuarioConToken("ASESOR");
    const leadsValidos = await Promise.all(Array.from({ length: 19 }, () => crearLead()));
    const leadCerrado = await crearLead({ etapa: "VENTA", semaforo: "VERDE" });

    const respuesta = await request(app)
      .post("/api/v1/leads/asignar-lote")
      .set("Authorization", `Bearer ${supervisor.token}`)
      .send({
        leadIds: [...leadsValidos.map((l) => l.id), leadCerrado.id],
        asesorId: asesorDestino.id,
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.exitosos).toHaveLength(19);
    expect(respuesta.body.fallidos).toHaveLength(1);
    expect(respuesta.body.fallidos[0].leadId).toBe(leadCerrado.id);

    const asignados = await prisma.lead.count({
      where: { id: { in: leadsValidos.map((l) => l.id) }, asesorId: asesorDestino.id },
    });
    expect(asignados).toBe(19);
  });

  it("403: un ASESOR no puede usar el lote (misma barrera que /asignar individual)", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const asesorActor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .post("/api/v1/leads/asignar-lote")
      .set("Authorization", `Bearer ${asesorActor.token}`)
      .send({ leadIds: [lead.id] });

    expect(respuesta.status).toBe(403);
  });

  it("403: un VENDEDOR no puede usar el lote", async () => {
    const vendedorActor = await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .post("/api/v1/leads/asignar-lote")
      .set("Authorization", `Bearer ${vendedorActor.token}`)
      .send({ leadIds: [lead.id] });

    expect(respuesta.status).toBe(403);
  });

  it("400: leadIds vacío es rechazado por el schema antes de llegar al servicio", async () => {
    const supervisor = await crearUsuarioConToken("SUPERVISOR");

    const respuesta = await request(app)
      .post("/api/v1/leads/asignar-lote")
      .set("Authorization", `Bearer ${supervisor.token}`)
      .send({ leadIds: [] });

    expect(respuesta.status).toBe(400);
  });
});

describe("POST /api/v1/leads/:id/asignar|reasignar|traspasar — casos de error comunes", () => {
  it("404 cuando el lead no existe", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const respuesta = await request(app)
      .post("/api/v1/leads/00000000-0000-0000-0000-000000000000/asignar")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});
    expect(respuesta.status).toBe(404);
  });

  it("409 lead_cerrado: un lead en VENTA no puede reasignarse (DD12)", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead({ etapa: "VENTA", semaforo: "VERDE" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("lead_cerrado");
  });

  it("409 sin_candidatos: reasignar sin ningún otro asesor activo disponible", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const asesorUnico = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesorUnico.id, semaforo: "ROJO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("sin_candidatos");
  });

  it("401 sin token de acceso", async () => {
    const lead = await crearLead();
    const respuesta = await request(app).post(`/api/v1/leads/${lead.id}/asignar`).send({});
    expect(respuesta.status).toBe(401);
  });
});
