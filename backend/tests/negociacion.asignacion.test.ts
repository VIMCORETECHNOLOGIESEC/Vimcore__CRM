import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import {
  chooseCandidato,
  type CandidatoAsignacionOportunidad,
} from "../src/services/negociacion/asignacion-oportunidad.service.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * negociacion (Bloque D, D3/D4/D7/D9): cobertura de asignación por pool y de
 * la excepción administrativa -- los escenarios 1/2/5/6/10 del "Plan de
 * pruebas de integración" de `docs/claude-negociacion-estado-actual.md`
 * (nunca antes automatizados, ver "Decisión de testing" de ese documento).
 */
const app = createApp();
const PASSWORD = "clave-negociacion-asignacion-123456";
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
      nombre: `Usuario NA ${contador}`,
      correo: `usuario-na-${contador}-${randomUUID()}@integracion.test`,
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

async function crearAsesorConMembresia(
  empresaId: string,
  opciones: { habilitadoParaVenta?: boolean } = {},
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Asesor NA ${contador}`,
      correo: `asesor-na-${contador}-${randomUUID()}@integracion.test`,
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
    data: { nombre: `Cliente NA ${contador}`, telefonoValido: false },
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

async function crearOportunidad(actor: { token: string }, leadId: string, productoId?: string) {
  const respuesta = await request(app)
    .post("/api/v1/oportunidades")
    .set("Authorization", `Bearer ${actor.token}`)
    .send(productoId ? { leadId, productoId } : { leadId });
  return respuesta;
}

async function obtenerEventos(oportunidadId: string) {
  return testAdminPrisma.oportunidadEvento.findMany({ where: { oportunidadId }, orderBy: { ocurridoEn: "asc" } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("services/negociacion/asignacion-oportunidad — chooseCandidato (D3/D4, PURA)", () => {
  it("prueba obligatoria 1 (mirror de asignacion.selector.test.ts): con cargas 3/1/2 elige al candidato de carga 1", () => {
    const candidatos: CandidatoAsignacionOportunidad[] = [
      { id: "asesor-carga-3", ultimaAsignacionEn: null, cargaActiva: 3 },
      { id: "asesor-carga-1", ultimaAsignacionEn: null, cargaActiva: 1 },
      { id: "asesor-carga-2", ultimaAsignacionEn: null, cargaActiva: 2 },
    ];

    expect(chooseCandidato(candidatos)?.id).toBe("asesor-carga-1");
  });

  it("prueba obligatoria 2 (mirror): en empate de carga, gana ultimaAsignacionEn más antigua, y null cuenta como la más antigua", () => {
    const candidatos: CandidatoAsignacionOportunidad[] = [
      { id: "asesor-fecha-reciente", ultimaAsignacionEn: new Date("2026-08-01T00:00:00Z"), cargaActiva: 2 },
      { id: "asesor-nunca-asignado", ultimaAsignacionEn: null, cargaActiva: 2 },
    ];

    expect(chooseCandidato(candidatos)?.id).toBe("asesor-nunca-asignado");
  });

  it("desempate final determinístico por id ascendente cuando carga y ultimaAsignacionEn coinciden", () => {
    const fecha = new Date("2026-08-01T00:00:00Z");
    const candidatos: CandidatoAsignacionOportunidad[] = [
      { id: "b-candidato", ultimaAsignacionEn: fecha, cargaActiva: 1 },
      { id: "a-candidato", ultimaAsignacionEn: fecha, cargaActiva: 1 },
    ];

    expect(chooseCandidato(candidatos)?.id).toBe("a-candidato");
  });

  it("lista vacía devuelve null (sin candidatos)", () => {
    expect(chooseCandidato([])).toBeNull();
  });
});

describe("POST /api/v1/oportunidades — prueba obligatoria 1 (D3/D4): pool normal", () => {
  it("200/201: con un único asesor activo en la empresa, la oportunidad se asigna automático con evento ASIGNADA_POOL", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa pool normal");
    const asesor = await crearAsesorConMembresia(empresa.id);
    const lead = await crearLead(empresa.id);

    const respuesta = await crearOportunidad(admin, lead.id);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.oportunidad.asesorId).toBe(asesor.id);

    const eventos = await obtenerEventos(respuesta.body.oportunidad.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.tipo).toBe("ASIGNADA_POOL");
    expect((eventos[0]?.detalle as Record<string, unknown> | null)?.asesorId).toBe(asesor.id);
  });

  it("triangulación de carga: entre dos asesores activos, gana el de menor carga activa", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa pool carga");
    const asesorOcupado = await crearAsesorConMembresia(empresa.id);
    const asesorLibre = await crearAsesorConMembresia(empresa.id);

    // Deja a `asesorOcupado` con una Oportunidad ABIERTA previa -- su carga
    // activa pasa a ser 1, mientras que `asesorLibre` sigue en 0.
    const leadPrevio = await crearLead(empresa.id);
    await testAdminPrisma.oportunidad.create({
      data: { leadId: leadPrevio.id, empresaId: empresa.id, productoId: null, asesorId: asesorOcupado.id },
    });

    const lead = await crearLead(empresa.id);
    const respuesta = await crearOportunidad(admin, lead.id);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.oportunidad.asesorId).toBe(asesorLibre.id);
  });
});

describe("POST /api/v1/oportunidades — prueba obligatoria 2 (D3/D4): SIN_ASIGNAR sin candidatos", () => {
  it("201: sin ningún asesor activo en la empresa, la oportunidad se crea igual con asesorId null y evento SIN_ASIGNAR", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa sin candidatos");
    const lead = await crearLead(empresa.id);

    const respuesta = await crearOportunidad(admin, lead.id);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.oportunidad.asesorId).toBeNull();

    const eventos = await obtenerEventos(respuesta.body.oportunidad.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.tipo).toBe("SIN_ASIGNAR");
  });
});

describe("POST /api/v1/oportunidades/:id/reasignar — prueba obligatoria 5 (D9): excepción administrativa, primera vez", () => {
  it("403: un ASESOR no puede usar /reasignar (restringido a ADMINISTRADOR/SUPERVISOR)", async () => {
    const empresa = await crearEmpresa("Empresa reasignar 403");
    const asesorActor = await crearAsesorConMembresia(empresa.id);
    const otroAsesor = await crearAsesorConMembresia(empresa.id);
    const lead = await crearLead(empresa.id);
    const creada = await crearOportunidad(asesorActor, lead.id);

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${asesorActor.token}`)
      .send({ asesorId: otroAsesor.id });

    expect(respuesta.status).toBe(403);
  });

  it("200: un ADMINISTRADOR sin Membresia previa se autoasigna la oportunidad -- se le crea la Membresia(ASESOR, habilitadoParaVenta:true) al vuelo y el evento es ASIGNADA_EXCEPCION_ADMINISTRATIVA (nunca ASIGNADA_POOL)", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa D9 primera vez");
    const lead = await crearLead(empresa.id);
    const creada = await crearOportunidad(admin, lead.id);
    expect(creada.body.oportunidad.asesorId).toBeNull(); // sin candidatos todavía

    const previa = await testAdminPrisma.membresia.findFirst({
      where: { usuarioId: admin.id, empresaId: empresa.id, rol: "ASESOR" },
    });
    expect(previa).toBeNull();

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: admin.id });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.oportunidad.asesorId).toBe(admin.id);

    const membresiaCreada = await testAdminPrisma.membresia.findFirst({
      where: { usuarioId: admin.id, empresaId: empresa.id, rol: "ASESOR" },
    });
    expect(membresiaCreada).not.toBeNull();
    expect(membresiaCreada?.habilitadoParaVenta).toBe(true);
    expect(membresiaCreada?.activa).toBe(true);

    const eventos = await obtenerEventos(creada.body.oportunidad.id);
    const eventoExcepcion = eventos.find((e) => e.tipo === "ASIGNADA_EXCEPCION_ADMINISTRATIVA");
    expect(eventoExcepcion).toBeDefined();
    expect(eventoExcepcion?.tipo).not.toBe("ASIGNADA_POOL");
    expect((eventoExcepcion?.detalle as Record<string, unknown> | null)?.asesorNuevoId).toBe(admin.id);
  });

  it("segunda vez: si el ADMINISTRADOR ya tiene Membresia activa (de una excepción D9 previa en la MISMA empresa), tomar una SEGUNDA oportunidad no crea una fila de Membresia duplicada", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa D9 segunda vez");

    // D9 primera vez: el admin se autoasigna la primera oportunidad -- le
    // queda una Membresia(ASESOR, habilitadoParaVenta:true) activa y, con
    // ella, carga activa 1 en el pool de esta empresa.
    const lead1 = await crearLead(empresa.id);
    const creada1 = await crearOportunidad(admin, lead1.id);
    const primeraReasignacion = await request(app)
      .post(`/api/v1/oportunidades/${creada1.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: admin.id });
    expect(primeraReasignacion.status).toBe(200);

    // Un asesor real, recién creado (carga activa 0) -- el pool lo prefiere
    // sobre el admin (carga activa 1) para la SEGUNDA oportunidad, así que
    // esta se asigna a él automáticamente, nunca al admin.
    const otroAsesor = await crearAsesorConMembresia(empresa.id);
    const lead2 = await crearLead(empresa.id);
    const creada2 = await crearOportunidad(admin, lead2.id);
    expect(creada2.body.oportunidad.asesorId).toBe(otroAsesor.id);

    // El admin usa D9 de nuevo para QUITARLE la segunda oportunidad al otro
    // asesor y tomarla para sí -- ya tiene Membresia activa en esta empresa,
    // así que este segundo paso por D9 no debe crear una fila duplicada.
    const segundaReasignacion = await request(app)
      .post(`/api/v1/oportunidades/${creada2.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: admin.id });

    expect(segundaReasignacion.status).toBe(200);
    expect(segundaReasignacion.body.oportunidad.asesorId).toBe(admin.id);
    const membresias = await testAdminPrisma.membresia.findMany({
      where: { usuarioId: admin.id, empresaId: empresa.id, rol: "ASESOR" },
    });
    expect(membresias).toHaveLength(1);
  });

  it("409 destinatario_invalido: reasignar al mismo titular actual se rechaza", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa D9 mismo titular");
    const asesor = await crearAsesorConMembresia(empresa.id);
    const lead = await crearLead(empresa.id);
    const creada = await crearOportunidad(admin, lead.id);
    expect(creada.body.oportunidad.asesorId).toBe(asesor.id);

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: asesor.id });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("destinatario_invalido");
  });

  it("409 usuario_invalido: el destinatario indicado no existe", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa D9 destinatario inexistente");
    const lead = await crearLead(empresa.id);
    const creada = await crearOportunidad(admin, lead.id);

    const respuesta = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: "00000000-0000-0000-0000-000000000000" });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.code).toBe("usuario_invalido");
  });
});

describe("POST /api/v1/oportunidades — prueba obligatoria 6 (D9): administrador polifuncional", () => {
  it("201: un ADMINISTRADOR con Membresia(ASESOR) permanente recibe la oportunidad por el POOL NORMAL (no por /reasignar) -- evento ASIGNADA_POOL, nunca ASIGNADA_EXCEPCION_ADMINISTRATIVA", async () => {
    const actorCreador = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa admin polifuncional");
    const adminPolifuncional = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    await testAdminPrisma.membresia.create({
      data: {
        usuarioId: adminPolifuncional.id,
        empresaId: empresa.id,
        rol: "ASESOR",
        habilitadoParaVenta: true,
        activa: true,
      },
    });
    const lead = await crearLead(empresa.id);

    const respuesta = await crearOportunidad(actorCreador, lead.id);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.oportunidad.asesorId).toBe(adminPolifuncional.id);

    const eventos = await obtenerEventos(respuesta.body.oportunidad.id);
    expect(eventos.map((e) => e.tipo)).toEqual(["ASIGNADA_POOL"]);
  });
});

describe("Fix aplicado: D9 le da al administrador autoridad real de cierre", () => {
  /**
   * `oportunidad.access.ts::canCerrarOportunidad` tenía
   * `if (usuario.rol !== "ASESOR") return false;` antes del chequeo real por
   * `Membresia` -- `usuario.rol` es `Usuario.rol` (el campo legado, NUNCA
   * cambia por D9). Un ADMINISTRADOR que toma una Oportunidad vía
   * `/reasignar` (D9) gana una `Membresia(ASESOR, habilitadoParaVenta:
   * true)`, pero su `Usuario.rol` sigue siendo "ADMINISTRADOR" -- ese
   * chequeo lo bloqueaba SIEMPRE, contradiciendo el comentario del propio
   * archivo ("en ese punto satisface esta misma regla como cualquier
   * asesor"). Corregido borrando ese filtro prematuro -- el chequeo por
   * Membresia ya era la fuente correcta.
   */
  it("200: el administrador que tomó la oportunidad por D9 SÍ puede cerrarla, por tener Membresia(ASESOR, habilitadoParaVenta:true) activa", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa bug D9 cierre");
    const lead = await crearLead(empresa.id);
    const creada = await crearOportunidad(admin, lead.id);

    const reasignar = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: admin.id });
    expect(reasignar.status).toBe(200);

    const membresia = await testAdminPrisma.membresia.findFirst({
      where: { usuarioId: admin.id, empresaId: empresa.id, rol: "ASESOR" },
    });
    expect(membresia?.habilitadoParaVenta).toBe(true);
    expect(membresia?.activa).toBe(true);

    const cierre = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "VENTA", montoVenta: 100, formaPago: "CONTADO" });

    expect(cierre.status).toBe(200);
    expect(cierre.body.oportunidad.etapa).toBe("VENTA");
  });
});

describe("prueba obligatoria 10 (plan de integración): no-regresión de Lead", () => {
  it("crear/asignar/cerrar una Oportunidad no modifica ninguna columna de negociación propia del Lead de origen", async () => {
    const admin = await crearUsuarioHoldingConToken("ADMINISTRADOR");
    const empresa = await crearEmpresa("Empresa no regresion lead");
    const asesor = await crearAsesorConMembresia(empresa.id, { habilitadoParaVenta: true });
    const lead = await crearLead(empresa.id);

    const antes = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(antes.etapa).toBe("NUEVO");
    expect(antes.asesorId).toBeNull();

    const creada = await crearOportunidad(admin, lead.id);
    expect(creada.body.oportunidad.asesorId).toBe(asesor.id);

    const cierre = await request(app)
      .post(`/api/v1/oportunidades/${creada.body.oportunidad.id}/cerrar`)
      .set("Authorization", `Bearer ${asesor.token}`)
      .send({ etapa: "VENTA", montoVenta: 999.99, formaPago: "FINANCIAMIENTO" });
    expect(cierre.status).toBe(200);

    const despues = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(despues.etapa).toBe("NUEVO");
    expect(despues.asesorId).toBeNull();
    expect(despues.vendedorId).toBeNull();
    expect(despues.montoVenta).toBeNull();
    expect(despues.cerradoEn).toBeNull();
    expect(despues.observacionCierre).toBeNull();
    expect(despues.slaInicioEn).toBeNull();
  });
});
