import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import {
  cerrarOportunidadBodySchema,
  crearOportunidadBodySchema,
  listOportunidadesQuerySchema,
  patchOportunidadEtapaBodySchema,
} from "../src/schemas/negociacion/oportunidad.schema.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * negociacion (Bloque D, D13/D14): cobertura de integración de
 * `POST/GET/PATCH /oportunidades*` -- crea/lee/transiciona/cierra. El pool
 * de asignación (D3/D4/D9) tiene su propio archivo,
 * `negociacion.asignacion.test.ts` -- acá solo lo mínimo indispensable para
 * dejar una `Oportunidad` en el estado que cada escenario necesita.
 */
const app = createApp();
const PASSWORD = "clave-negociacion-oportunidad-123456";
let contador = 0;

async function crearEmpresa(prefijo: string): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.empresa.create({ data: { nombre: `${prefijo} ${contador} ${randomUUID()}` } });
}

async function crearUsuarioHoldingConToken(
  rol: "ADMINISTRADOR" | "ASESOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario NO ${contador}`,
      correo: `usuario-no-${contador}-${randomUUID()}@integracion.test`,
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
 * D3/D4/D7: candidato del pool -- `Usuario.rol: ASESOR` + `Membresia(rol:
 * ASESOR, empresaId, habilitadoParaVenta, activa: true)`. Login siempre por
 * `Usuario.correo` (sesión holding-wide, `empresaId: null`) -- ninguna de
 * las reglas de negocio de este módulo (D3/D4/D7/D9) depende del
 * `empresaId` de la SESIÓN del actor, solo de la `Membresia` real y de la
 * titularidad (`asesorId`) de la `Oportunidad`.
 */
async function crearAsesorConMembresia(
  empresaId: string,
  opciones: { habilitadoParaVenta?: boolean } = {},
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Asesor NO ${contador}`,
      correo: `asesor-no-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ASESOR",
      activo: true,
    },
  });
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol: "ASESOR",
      habilitadoParaVenta: opciones.habilitadoParaVenta ?? true,
      activa: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

async function crearLead(empresaId: string): Promise<{ id: string }> {
  contador += 1;
  const cliente = await testAdminPrisma.cliente.create({
    data: { nombre: `Cliente NO ${contador}`, telefonoValido: false },
  });
  return testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: "NUEVO",
      ingresadoEn: new Date(),
      empresaId,
    },
  });
}

async function crearProducto(empresaId: string, nombre: string): Promise<{ id: string }> {
  return testAdminPrisma.producto.create({ data: { empresaId, nombre } });
}

async function obtenerEventos(oportunidadId: string) {
  return testAdminPrisma.oportunidadEvento.findMany({ where: { oportunidadId }, orderBy: { ocurridoEn: "asc" } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/oportunidades — creación (D13/D14)", () => {
  it("404 lead_no_encontrado: leadId inexistente", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: "00000000-0000-0000-0000-000000000000" });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.code).toBe("lead_no_encontrado");
  });

  it("prueba obligatoria 9 (plan de integración): producto de OTRA empresa rechaza con 409", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresaA = await crearEmpresa("Empresa A producto ajeno");
    const empresaB = await crearEmpresa("Empresa B producto ajeno");
    const lead = await crearLead(empresaA.id);
    const productoAjeno = await crearProducto(empresaB.id, "Producto de otra empresa");

    const respuesta = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id, productoId: productoAjeno.id });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("producto_invalido");
  });

  it("201: crea sin productoId (opcional, D13)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa sin producto");
    const lead = await crearLead(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.oportunidad.leadId).toBe(lead.id);
    expect(respuesta.body.oportunidad.productoId).toBeNull();
    expect(respuesta.body.oportunidad.etapa).toBe("NUEVO");
  });

  it("prueba obligatoria 7 (plan de integración, D14): dedup -- una segunda Oportunidad ABIERTA para el mismo (leadId, productoId) rechaza con 409, pero se habilita de nuevo tras cerrar la primera, sin ventana de espera", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa dedup D14");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);
    const producto = await crearProducto(empresa.id, "Producto dedup D14");

    const primera = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id, productoId: producto.id });
    expect(primera.status).toBe(201);
    expect(primera.body.oportunidad.asesorId).toBe(asesor.id);

    const segundaMientrasAbierta = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id, productoId: producto.id });
    expect(segundaMientrasAbierta.status).toBe(409);
    expect(segundaMientrasAbierta.body.code).toBe("oportunidad_duplicada");

    const cierre = await request(app)
      .post(`/api/v1/oportunidades/${primera.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "NO_VENTA", observacionCierre: "El cliente decidió no avanzar con la compra" });
    expect(cierre.status).toBe(200);

    const tercera = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id, productoId: producto.id });
    expect(tercera.status).toBe(201);
    expect(tercera.body.oportunidad.id).not.toBe(primera.body.oportunidad.id);
  });
});

describe("GET /api/v1/oportunidades/:id y GET /api/v1/oportunidades", () => {
  it("404 cuando la oportunidad no existe", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/oportunidades/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(respuesta.status).toBe(404);
  });

  it("200: un ADMINISTRADOR (acceso total) puede leer cualquier oportunidad con sus relaciones", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa lectura");
    const lead = await crearLead(empresa.id);

    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const lectura = await request(app)
      .get(`/api/v1/oportunidades/${creada.body.oportunidad.id}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(lectura.status).toBe(200);
    expect(lectura.body.oportunidad.lead.id).toBe(lead.id);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/oportunidades");
    expect(respuesta.status).toBe(401);
  });
});

describe("PATCH /api/v1/oportunidades/:id/etapa — transiciones intermedias", () => {
  it("prueba obligatoria 8 (plan de integración): transición inválida (saltar CONTACTADO) rechaza con 409", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa etapa invalida");
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const respuesta = await request(app)
      .patch(`/api/v1/oportunidades/${creada.body.oportunidad.id}/etapa`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "CITA" });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("transicion_invalida");
  });

  it("prueba obligatoria 8 (plan de integración): transición válida NUEVO->CONTACTADO da 200 y evento ETAPA_CAMBIADA", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa etapa valida");
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const respuesta = await request(app)
      .patch(`/api/v1/oportunidades/${creada.body.oportunidad.id}/etapa`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "CONTACTADO" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.oportunidad.etapa).toBe("CONTACTADO");

    const eventos = await obtenerEventos(creada.body.oportunidad.id);
    const evento = eventos.find((e) => e.tipo === "ETAPA_CAMBIADA");
    expect(evento).toBeDefined();
    expect(evento?.etapaAnterior).toBe("NUEVO");
    expect(evento?.etapaNueva).toBe("CONTACTADO");
  });

  it("409 oportunidad_cerrada: no se puede cambiar la etapa de una oportunidad ya cerrada", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa etapa cerrada");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const cierre = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", montoVenta: 1500, formaPago: "CONTADO" });
    expect(cierre.status).toBe(200);

    const respuesta = await request(app)
      .patch(`/api/v1/oportunidades/${creada.body.oportunidad.id}/etapa`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "CONTACTADO" });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("oportunidad_cerrada");
  });
});

describe("POST /api/v1/oportunidades/:id/cerrar — D7 autoridad de cierre estricta", () => {
  it("prueba obligatoria 3 (plan de integración, D7): el asesor titular habilitado cierra VENTA con 200 y evento CERRADA", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa cierre venta");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });
    expect(creada.body.oportunidad.asesorId).toBe(asesor.id);

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", montoVenta: 2500.5, formaPago: "CREDITO" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.oportunidad.etapa).toBe("VENTA");
    expect(respuesta.body.oportunidad.cerradaEn).not.toBeNull();

    const eventos = await obtenerEventos(creada.body.oportunidad.id);
    expect(eventos.some((e) => e.tipo === "CERRADA" && e.etapaNueva === "VENTA")).toBe(true);
  });

  it("triangulación: el asesor titular habilitado también puede cerrar NO_VENTA con 200", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa cierre no-venta");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "NO_VENTA", observacionCierre: "El cliente no continuó con la negociación" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.oportunidad.etapa).toBe("NO_VENTA");
  });

  it("prueba obligatoria 4 (plan de integración, D7): un ADMINISTRADOR sin relación con la oportunidad no puede cerrarla directo (403), sin pasar por D9", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa cierre rechazado");
    await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "VENTA", montoVenta: 100, formaPago: "CONTADO" });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.code).toBe("permiso_denegado");
  });

  it("403: un asesor titular SIN habilitadoParaVenta no puede cerrar (D7 exige el flag, no solo la titularidad)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa sin habilitado");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: false });
    const lead = await crearLead(empresa.id);
    const creada = await request(app)
      .post("/api/v1/oportunidades")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ leadId: lead.id });
    expect(creada.body.oportunidad.asesorId).toBe(asesor.id);

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", montoVenta: 100, formaPago: "CONTADO" });

    expect(respuesta.status).toBe(403);
  });
});

describe("schemas/negociacion/oportunidad.schema — validación Zod", () => {
  it("crearOportunidadBodySchema exige leadId uuid", () => {
    const resultado = crearOportunidadBodySchema.safeParse({ leadId: "no-es-uuid" });
    expect(resultado.success).toBe(false);
  });

  it("crearOportunidadBodySchema acepta sin productoId (opcional)", () => {
    const resultado = crearOportunidadBodySchema.safeParse({ leadId: randomUUID() });
    expect(resultado.success).toBe(true);
  });

  it("listOportunidadesQuerySchema rechaza un límite no permitido (ej. 30)", () => {
    const resultado = listOportunidadesQuerySchema.safeParse({ limite: "30" });
    expect(resultado.success).toBe(false);
  });

  it("listOportunidadesQuerySchema acepta los límites permitidos (10/25/50/100) y usa 25 por defecto", () => {
    for (const limite of [10, 25, 50, 100]) {
      const resultado = listOportunidadesQuerySchema.safeParse({ limite: String(limite) });
      expect(resultado.success).toBe(true);
    }
    const porDefecto = listOportunidadesQuerySchema.safeParse({});
    expect(porDefecto.success).toBe(true);
    if (porDefecto.success) expect(porDefecto.data.limite).toBe(25);
  });

  it("patchOportunidadEtapaBodySchema solo acepta CONTACTADO/CITA -- rechaza VENTA (cierra por /cerrar, no acá)", () => {
    const resultado = patchOportunidadEtapaBodySchema.safeParse({ etapa: "VENTA" });
    expect(resultado.success).toBe(false);
  });

  it("cerrarOportunidadBodySchema (unión discriminada): VENTA exige montoVenta positivo y formaPago", () => {
    const sinMonto = cerrarOportunidadBodySchema.safeParse({ etapa: "VENTA", formaPago: "CONTADO" });
    expect(sinMonto.success).toBe(false);

    const montoNegativo = cerrarOportunidadBodySchema.safeParse({
      etapa: "VENTA",
      montoVenta: -10,
      formaPago: "CONTADO",
    });
    expect(montoNegativo.success).toBe(false);

    const valido = cerrarOportunidadBodySchema.safeParse({ etapa: "VENTA", montoVenta: 10, formaPago: "CONTADO" });
    expect(valido.success).toBe(true);
  });

  it("cerrarOportunidadBodySchema (unión discriminada): NO_VENTA exige observacionCierre de al menos 20 caracteres", () => {
    const corta = cerrarOportunidadBodySchema.safeParse({ etapa: "NO_VENTA", observacionCierre: "muy corta" });
    expect(corta.success).toBe(false);

    const valida = cerrarOportunidadBodySchema.safeParse({
      etapa: "NO_VENTA",
      observacionCierre: "El cliente decidió no continuar con la compra",
    });
    expect(valida.success).toBe(true);
  });
});
