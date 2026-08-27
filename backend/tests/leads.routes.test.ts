import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";

let contador = 0;

// Bloque C follow-up (D2 gap closure): ASESOR/VENDEDOR sin Membresia activa
// ya no pueden autenticarse (TenantContext irresoluble se rechaza, D2) — solo
// esos dos roles necesitan la Membresia (ADMINISTRADOR/SUPERVISOR resuelven
// holding-wide incondicionalmente, sin leer Membresia).
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
const ROLES_CON_MEMBRESIA = new Set(["ASESOR", "VENDEDOR"]);

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
    redSocial: "FACEBOOK" | "INSTAGRAM" | "X" | "LINKEDIN" | "GOOGLE_FORMS" | null;
  }> = {},
): Promise<{ id: string; clienteNombre: string }> {
  contador += 1;
  const clienteNombre = `Cliente LR ${contador}`;
  const cliente = await prisma.cliente.create({
    data: { nombre: clienteNombre, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      redSocial: overrides.redSocial ?? null,
      ingresadoEn: new Date(),
      empresaId: BOOTSTRAP_EMPRESA_ID,
    },
  });
  return { id: lead.id, clienteNombre };
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

  it("200: expone solo la identidad pública requerida de asesor y vendedor", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const asesor = await crearUsuarioConToken("ASESOR");
    const vendedor = await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead({ asesorId: asesor.id, vendedorId: vendedor.id });

    const respuesta = await request(app)
      .get("/api/v1/leads")
      .query({ busqueda: lead.clienteNombre })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.leads).toHaveLength(1);
    expect(respuesta.body.leads[0].asesor).toEqual({
      id: asesor.id,
      nombre: expect.any(String),
      rol: "ASESOR",
    });
    expect(respuesta.body.leads[0].vendedor).toEqual({
      id: vendedor.id,
      nombre: expect.any(String),
      rol: "VENDEDOR",
    });
    expect(respuesta.body.leads[0].asesor).not.toHaveProperty("passwordHash");
    expect(respuesta.body.leads[0].asesor).not.toHaveProperty("refreshTokens");
    expect(respuesta.body.leads[0].vendedor).not.toHaveProperty("passwordHash");
    expect(respuesta.body.leads[0].vendedor).not.toHaveProperty("refreshTokens");
  });
});

describe("GET /api/v1/leads/catalogo/redes-sociales (catálogo en cascada, reemplazo de GET /bridges/redes-activas)", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/leads/catalogo/redes-sociales");
    expect(respuesta.status).toBe(401);
  });

  it("200: un ASESOR solo ve las redes sociales de su propia cartera", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const otroAsesor = await crearUsuarioConToken("ASESOR");
    await crearLead({ asesorId: asesor.id, redSocial: "FACEBOOK" });
    await crearLead({ asesorId: otroAsesor.id, redSocial: "GOOGLE_FORMS" });

    const respuesta = await request(app)
      .get("/api/v1/leads/catalogo/redes-sociales")
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.redesSociales).toEqual(["FACEBOOK"]);
  });

  it("200: un ADMINISTRADOR ve las redes sociales de todos los leads", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    await crearLead({ redSocial: "FACEBOOK" });
    await crearLead({ redSocial: "GOOGLE_FORMS" });

    const respuesta = await request(app)
      .get("/api/v1/leads/catalogo/redes-sociales")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.redesSociales).toEqual(expect.arrayContaining(["FACEBOOK", "GOOGLE_FORMS"]));
  });

  it("200: el filtro en cascada por etapa reduce el catálogo devuelto", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    await crearLead({ etapa: "VENTA", redSocial: "FACEBOOK" });
    await crearLead({ etapa: "NUEVO", redSocial: "GOOGLE_FORMS" });

    const respuesta = await request(app)
      .get("/api/v1/leads/catalogo/redes-sociales")
      .query({ etapa: "VENTA" })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.redesSociales).toContain("FACEBOOK");
    expect(respuesta.body.redesSociales).not.toContain("GOOGLE_FORMS");
  });
});

describe("GET /api/v1/leads?busqueda= (spec: Búsqueda libre sobre datos de cliente)", () => {
  it("filtra por teléfono del cliente vía busqueda, sin devolver leads de otros clientes", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    contador += 1;
    const clienteMatch = await prisma.cliente.create({
      data: {
        nombre: `Cliente Busqueda Match ${contador}`,
        telefonoOriginal: "3011234567",
        telefonoValido: true,
      },
    });
    const clienteNoMatch = await prisma.cliente.create({
      data: {
        nombre: `Cliente Busqueda NoMatch ${contador}`,
        telefonoOriginal: "3029876543",
        telefonoValido: true,
      },
    });
    await prisma.lead.create({
      data: { clienteId: clienteMatch.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: BOOTSTRAP_EMPRESA_ID },
    });
    await prisma.lead.create({
      data: { clienteId: clienteNoMatch.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: BOOTSTRAP_EMPRESA_ID },
    });

    const respuesta = await request(app)
      .get("/api/v1/leads")
      .query({ busqueda: "3011234567" })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.leads).toHaveLength(1);
    expect(respuesta.body.leads[0].cliente.id).toBe(clienteMatch.id);
  });

  it("campaña queda fuera de la búsqueda libre: un lead cuya campaña matchea pero cuyo cliente no, no aparece", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    contador += 1;
    const clienteAjeno = await prisma.cliente.create({
      data: { nombre: `Cliente Busqueda Camp ${contador}`, telefonoValido: false },
    });
    await prisma.lead.create({
      data: {
        clienteId: clienteAjeno.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
        payloadOriginal: { nombreCampania: "Campania Verano Unica" },
        empresaId: BOOTSTRAP_EMPRESA_ID,
      },
    });

    const respuesta = await request(app)
      .get("/api/v1/leads")
      .query({ busqueda: "Campania Verano Unica" })
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.leads).toHaveLength(0);
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

  it("200: un vendedor recibe identidades públicas sin secretos de autenticación", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const vendedor = await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead({ asesorId: asesor.id, vendedorId: vendedor.id });

    const respuesta = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", `Bearer ${vendedor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.asesor).toEqual({
      id: asesor.id,
      nombre: expect.any(String),
      rol: "ASESOR",
    });
    expect(respuesta.body.lead.vendedor).toEqual({
      id: vendedor.id,
      nombre: expect.any(String),
      rol: "VENDEDOR",
    });
    expect(respuesta.body.lead.asesor).not.toHaveProperty("passwordHash");
    expect(respuesta.body.lead.asesor).not.toHaveProperty("refreshTokens");
    expect(respuesta.body.lead.vendedor).not.toHaveProperty("passwordHash");
    expect(respuesta.body.lead.vendedor).not.toHaveProperty("refreshTokens");
  });

  it("200: conserva relaciones nulas cuando el lead no tiene responsables", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead();

    const respuesta = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.lead.asesor).toBeNull();
    expect(respuesta.body.lead.vendedor).toBeNull();
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
