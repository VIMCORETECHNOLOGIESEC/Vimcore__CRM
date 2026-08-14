import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";

let contador = 0;

async function crearUsuarioConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario LR ${contador}`,
      correo: `usuario-lr-${contador}@integracion.test`,
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

async function crearLead(
  overrides: Partial<{
    etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
    semaforo: "ROJO" | "AMARILLO" | "VERDE" | null;
    asesorId: string | null;
    vendedorId: string | null;
  }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente LR ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      ingresadoEn: new Date(),
    },
  });
  return { id: lead.id };
}

const RESPUESTAS_ALTAS_NUEVO = {
  contacto_logrado: "si_respondio",
  reconoce_formulario: "si_con_claridad",
  nivel_interes: "interes_alto_concreto",
  plazo_decision: "inmediato_menos_1_semana",
  toma_decision: "si",
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/leads", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/leads");
    expect(respuesta.status).toBe(401);
  });

  it("200: un asesor recibe exactamente su cartera", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const otroAsesor = await crearUsuarioConToken("ASESOR");
    await crearLead({ asesorId: asesor.id });
    await crearLead({ asesorId: asesor.id });
    await crearLead({ asesorId: otroAsesor.id });

    const respuesta = await request(app)
      .get("/api/v1/leads")
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(2);
    for (const lead of respuesta.body.leads) {
      expect(lead.asesorId).toBe(asesor.id);
    }
  });
});

describe("GET /api/v1/leads/:id — mandatory test (docs/06 §M5): un asesor no puede LEER un lead ajeno", () => {
  it("403 directo contra el endpoint cuando el asesor no tiene relación con el lead", async () => {
    const asesorAjeno = await crearUsuarioConToken("ASESOR");
    const dueno = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: dueno.id });

    const respuesta = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", `Bearer ${asesorAjeno.token}`);

    expect(respuesta.status).toBe(403);
  });

  it("200: el dueño del lead sí puede leerlo", async () => {
    const dueno = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: dueno.id });

    const respuesta = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", `Bearer ${dueno.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.id).toBe(lead.id);
    expect(respuesta.body.lead.estadoSla).toBeDefined();
  });

  it("404 cuando el lead no existe", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const respuesta = await request(app)
      .get("/api/v1/leads/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(respuesta.status).toBe(404);
  });
});

describe("PATCH /api/v1/leads/:id/etapa — mandatory test (docs/06 §M5): un asesor no puede MODIFICAR un lead ajeno", () => {
  it("403 directo contra el endpoint cuando el asesor no tiene relación con el lead", async () => {
    const asesorAjeno = await crearUsuarioConToken("ASESOR");
    const dueno = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: dueno.id, etapa: "NUEVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesorAjeno.token}`)
      .send({ etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(respuesta.status).toBe(403);
    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("NUEVO");
  });
});

describe("PATCH /api/v1/leads/:id/etapa — mandatory test (docs/06 §M5): cambio de etapa sin formulario se rechaza", () => {
  it("400 cuando el body no trae `respuestas` para una etapa calificable, y la etapa no cambia", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "CONTACTADO" });

    expect(respuesta.status).toBe(400);
    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("NUEVO");
  });
});

describe("PATCH /api/v1/leads/:id/etapa — validación de cierre en etapas terminales (D13)", () => {
  it("400 (mandatory, docs/06 §M5): VENTA sin monto se rechaza y el lead no cambia de etapa", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", productoServicio: "Plan X", formaPago: "CONTADO" });

    expect(respuesta.status).toBe(400);
    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("CONTACTADO");
  });

  it("400: NO_VENTA con observacionCierre de menos de 20 caracteres se rechaza", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "NO_VENTA", observacionCierre: "muy corta" });

    expect(respuesta.status).toBe(400);
  });

  it("200: VENTA completa (monto+producto+formaPago) fija verde y cierra el lead", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO", semaforo: "AMARILLO" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", montoVenta: 3000, productoServicio: "Plan X", formaPago: "CONTADO" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.etapa).toBe("VENTA");
    expect(respuesta.body.lead.semaforo).toBe("VERDE");
  });
});

describe("PATCH /api/v1/leads/:id/etapa — no reabre etapa terminal (D5)", () => {
  it("409 cuando el lead ya está en VENTA", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "VENTA", semaforo: "VERDE" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(respuesta.status).toBe(409);
  });
});

describe("POST /api/v1/leads/:id/formulario — recalificación sin cambio de etapa (D16)", () => {
  it("200: recalifica el semáforo sin mover la etapa ni escribir CAMBIO_ETAPA", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO", semaforo: "ROJO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/formulario`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.etapa).toBe("NUEVO");
    expect(respuesta.body.lead.semaforo).not.toBe("ROJO");

    const sinEventoEtapa = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "CAMBIO_ETAPA" },
    });
    expect(sinEventoEtapa).toBeNull();
  });

  it("403 cuando el usuario no tiene permiso de edición sobre el lead", async () => {
    const asesorAjeno = await crearUsuarioConToken("ASESOR");
    const dueno = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: dueno.id, etapa: "NUEVO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/formulario`)
      .set("Authorization", `Bearer ${asesorAjeno.token}`)
      .send({ respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(respuesta.status).toBe(403);
  });

  it("404 cuando el lead no existe", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");

    const respuesta = await request(app)
      .post("/api/v1/leads/00000000-0000-0000-0000-000000000000/formulario")
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(respuesta.status).toBe(404);
  });

  it("400 cuando el body no trae respuestas", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/formulario`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });
});

describe("Matriz de acceso — GET/PATCH sobre un lead ajeno por cada rol (D4)", () => {
  it("ADMINISTRADOR y SUPERVISOR pueden leer y editar cualquier lead; ASESOR/VENDEDOR ajenos reciben 403", async () => {
    const dueno = await crearUsuarioConToken("ASESOR");

    const roles: Array<{ rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR"; permitido: boolean }> = [
      { rol: "ADMINISTRADOR", permitido: true },
      { rol: "SUPERVISOR", permitido: true },
      { rol: "ASESOR", permitido: false },
      { rol: "VENDEDOR", permitido: false },
    ];

    for (const caso of roles) {
      const usuario = await crearUsuarioConToken(caso.rol);
      const lead = await crearLead({ asesorId: dueno.id, etapa: "NUEVO" });

      const lectura = await request(app)
        .get(`/api/v1/leads/${lead.id}`)
        .set("Authorization", `Bearer ${usuario.token}`);
      const edicion = await request(app)
        .patch(`/api/v1/leads/${lead.id}/etapa`)
        .set("Authorization", `Bearer ${usuario.token}`)
        .send({ etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO });

      if (caso.permitido) {
        expect(lectura.status).toBe(200);
        expect(edicion.status).toBe(200);
      } else {
        expect(lectura.status).toBe(403);
        expect(edicion.status).toBe(403);
      }
    }
  });
});
