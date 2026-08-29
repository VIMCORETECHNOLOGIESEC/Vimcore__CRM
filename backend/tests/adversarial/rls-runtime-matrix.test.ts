import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../../src/lib/prisma.js";
import { testAdminPrisma } from "../fixtures/admin-prisma.js";

const TABLES = [
  "membresias",
  "leads",
  "bridges",
  "citas",
  "lead_eventos",
  "notificaciones",
  "respuestas_formulario",
  "leads_recibidos",
  "cuentas_publicitarias",
  "campanias",
  "bridge_logs",
  "leads_abiertos_revision_pendiente",
] as const;

type TableName = typeof TABLES[number];

async function crearGrafoEmpresa(empresaId: string, suffix: string): Promise<Record<TableName, string>> {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `RLS ${suffix}`,
      correo: `rls-${suffix}-${randomUUID()}@test.local`,
      passwordHash: "hash-no-usado",
      rol: "ASESOR",
    },
  });
  const membresia = await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId, rol: "ASESOR" },
  });
  const cliente = await testAdminPrisma.cliente.create({
    data: { nombre: `Cliente RLS ${suffix}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, empresaId, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
  });
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      empresaId,
      redSocial: "FACEBOOK",
      nombre: `Bridge RLS ${suffix}`,
      claveApiHash: `rls-${suffix}-${randomUUID()}`,
    },
  });
  const cita = await testAdminPrisma.cita.create({
    data: { leadId: lead.id, usuarioId: usuario.id, empresaId, programadaPara: new Date(), modalidad: "VIRTUAL" },
  });
  const evento = await testAdminPrisma.leadEvento.create({
    data: { leadId: lead.id, empresaId, tipo: "INGRESO" },
  });
  const notificacion = await testAdminPrisma.notificacion.create({
    data: { usuarioId: usuario.id, empresaId, tipo: "LEAD_ASIGNADO", titulo: "RLS", mensaje: suffix },
  });
  const respuesta = await testAdminPrisma.respuestaFormulario.create({
    data: {
      leadId: lead.id,
      usuarioId: usuario.id,
      etapa: "NUEVO",
      respuestas: {},
      puntuacion: 0,
      semaforo: "ROJO",
      versionRubrica: "rls-1",
    },
  });
  const recibido = await testAdminPrisma.leadRecibido.create({
    data: {
      bridgeId: bridge.id,
      idExternoLead: `rls-${suffix}-${randomUUID()}`,
      payload: {},
      entradaProcesamiento: {},
    },
  });
  const cuenta = await testAdminPrisma.cuentaPublicitaria.create({
    data: { bridgeId: bridge.id, idExterno: `cuenta-${suffix}-${randomUUID()}`, nombre: `Cuenta ${suffix}` },
  });
  const campania = await testAdminPrisma.campania.create({
    data: {
      cuentaPublicitariaId: cuenta.id,
      idExterno: `campania-${suffix}-${randomUUID()}`,
      nombre: `Campaña ${suffix}`,
      redSocial: "FACEBOOK",
    },
  });
  const log = await testAdminPrisma.bridgeLog.create({
    data: { bridgeId: bridge.id, empresaId, nivel: "INFO", mensaje: `RLS ${suffix}` },
  });
  const revision = await testAdminPrisma.leadAbiertoRevisionPendiente.create({
    data: {
      clienteId: cliente.id,
      leadAbiertoId: lead.id,
      empresaLeadId: empresaId,
      empresaIngestaId: empresaId,
    },
  });
  return {
    membresias: membresia.id,
    leads: lead.id,
    bridges: bridge.id,
    citas: cita.id,
    lead_eventos: evento.id,
    notificaciones: notificacion.id,
    respuestas_formulario: respuesta.id,
    leads_recibidos: recibido.id,
    cuentas_publicitarias: cuenta.id,
    campanias: campania.id,
    bridge_logs: log.id,
    leads_abiertos_revision_pendiente: revision.id,
  };
}

async function countById(table: TableName, id: string, empresaId?: string): Promise<number> {
  const query = () => prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*) AS total FROM "${table}" WHERE id = $1::uuid`, id,
    );
    return Number(rows[0]?.total ?? 0);
  });
  return empresaId === undefined ? query() : runWithTenantContext({ empresaId }, query);
}

async function touchById(table: TableName, id: string, empresaId?: string): Promise<number> {
  const query = () => prisma.$transaction((tx) => tx.$executeRawUnsafe(
    `UPDATE "${table}" SET id = id WHERE id = $1::uuid`, id,
  ));
  return empresaId === undefined ? query() : runWithTenantContext({ empresaId }, query);
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("adversarial RLS runtime matrix", () => {
  it("cada ruta directa e indirecta oculta y bloquea filas con GUC ausente o foránea", async () => {
    const [empresaA, empresaB] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `RLS A ${randomUUID()}` } }),
      testAdminPrisma.empresa.create({ data: { nombre: `RLS B ${randomUUID()}` } }),
    ]);
    const [rowsA, rowsB] = await Promise.all([
      crearGrafoEmpresa(empresaA.id, "a"),
      crearGrafoEmpresa(empresaB.id, "b"),
    ]);

    for (const table of TABLES) {
      expect(await countById(table, rowsA[table])).toBe(0);
      expect(await countById(table, rowsA[table], empresaA.id), table).toBe(1);
      expect(await countById(table, rowsB[table], empresaA.id)).toBe(0);
      expect(await touchById(table, rowsA[table])).toBe(0);
      expect(await touchById(table, rowsA[table], empresaA.id), table).toBe(1);
      expect(await touchById(table, rowsB[table], empresaA.id)).toBe(0);
    }
  });
});
