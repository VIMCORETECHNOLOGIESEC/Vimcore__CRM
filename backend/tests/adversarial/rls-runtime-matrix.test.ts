import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../../src/lib/prisma.js";
import type { TenantContext } from "../../src/lib/tenant-context.js";
import { testAdminPrisma } from "../fixtures/admin-prisma.js";

const TABLES = [
  "membresias",
  "clientes",
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
  "linkedin_conexiones",
  "linkedin_oauth_states",
  "linkedin_fuentes",
  "linkedin_formularios",
] as const;

const LINKEDIN_TABLES = [
  "linkedin_conexiones",
  "linkedin_oauth_states",
  "linkedin_fuentes",
  "linkedin_formularios",
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
    data: { empresaId, nombre: `Cliente RLS ${suffix}`, telefonoValido: false },
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
    data: {
      leadId: lead.id,
      usuarioId: usuario.id,
      empresaId,
      programadaPara: new Date(),
      finalizaEn: new Date(Date.now() + 60 * 60 * 1000),
      modalidad: "VIRTUAL",
    },
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
  const conexionLinkedIn = await testAdminPrisma.linkedInConexion.create({
    data: {
      bridgeId: bridge.id,
      autorizadoPorUsuarioId: usuario.id,
      accessTokenCifrado: `token-cifrado-${suffix}`,
      accessTokenExpiraEn: new Date(Date.now() + 60_000),
      scopes: ["r_marketing_leadgen_automation"],
    },
  });
  const oauthStateLinkedIn = await testAdminPrisma.linkedInOAuthState.create({
    data: {
      stateHash: `state-${suffix}-${randomUUID()}`,
      bridgeId: bridge.id,
      usuarioId: usuario.id,
      expiraEn: new Date(Date.now() + 60_000),
    },
  });
  const fuenteLinkedIn = await testAdminPrisma.linkedInFuente.create({
    data: {
      conexionId: conexionLinkedIn.id,
      tipo: "ORGANIZATION",
      ownerUrn: `urn:li:organization:${randomUUID()}`,
      nombre: `Fuente LinkedIn ${suffix}`,
      tipoLead: "COMPANY",
    },
  });
  const formularioLinkedIn = await testAdminPrisma.linkedInFormulario.create({
    data: {
      fuenteId: fuenteLinkedIn.id,
      versionedFormUrn: `urn:li:versionedLeadGenForm:${randomUUID()}`,
      contenido: {},
      sincronizadoEn: new Date(),
    },
  });
  return {
    membresias: membresia.id,
    clientes: cliente.id,
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
    linkedin_conexiones: conexionLinkedIn.id,
    linkedin_oauth_states: oauthStateLinkedIn.id,
    linkedin_fuentes: fuenteLinkedIn.id,
    linkedin_formularios: formularioLinkedIn.id,
  };
}

/** `undefined` = no tenant context at all (fail-closed). */
async function countById(table: TableName, id: string, scope?: TenantContext): Promise<number> {
  const query = () => prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*) AS total FROM "${table}" WHERE id = $1::uuid`, id,
    );
    return Number(rows[0]?.total ?? 0);
  });
  return scope === undefined ? query() : runWithTenantContext(scope, query);
}

async function touchById(table: TableName, id: string, scope?: TenantContext): Promise<number> {
  const query = () => prisma.$transaction((tx) => tx.$executeRawUnsafe(
    `UPDATE "${table}" SET id = id WHERE id = $1::uuid`, id,
  ));
  return scope === undefined ? query() : runWithTenantContext(scope, query);
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
      expect(await countById(table, rowsA[table], { empresaId: empresaA.id }), table).toBe(1);
      expect(await countById(table, rowsB[table], { empresaId: empresaA.id })).toBe(0);
      expect(await touchById(table, rowsA[table])).toBe(0);
      expect(await touchById(table, rowsA[table], { empresaId: empresaA.id }), table).toBe(1);
      expect(await touchById(table, rowsB[table], { empresaId: empresaA.id })).toBe(0);
    }

    for (const table of LINKEDIN_TABLES) {
      expect(await countById(table, rowsA[table], { unrestricted: true }), table).toBe(1);
      expect(await countById(table, rowsB[table], { unrestricted: true }), table).toBe(1);
    }
  });
});

// holding-scoped-tenant-isolation (T2). Holding-bound sessions set only
// `app.tenant_holding_id`; the additive `holding_isolation` policies must show
// them the rows of every empresa of THEIR holding and nothing else.
describe("adversarial RLS runtime matrix — holding scope", () => {
  async function crearHoldingConDosEmpresas(suffix: string) {
    const holding = await testAdminPrisma.holding.create({ data: { nombre: `RLS holding ${suffix} ${randomUUID()}` } });
    const [empresa1, empresa2] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `RLS ${suffix}1 ${randomUUID()}`, holdingId: holding.id } }),
      testAdminPrisma.empresa.create({ data: { nombre: `RLS ${suffix}2 ${randomUUID()}`, holdingId: holding.id } }),
    ]);
    const [rows1, rows2] = await Promise.all([
      crearGrafoEmpresa(empresa1.id, `${suffix}1`),
      crearGrafoEmpresa(empresa2.id, `${suffix}2`),
    ]);
    return { holding, empresa1, empresa2, rows1, rows2 };
  }

  it("a holding session sees and touches every row of its own empresas and none of another holding", async () => {
    const [a, b] = [await crearHoldingConDosEmpresas("ha"), await crearHoldingConDosEmpresas("hb")];
    const scopeA: TenantContext = { holdingId: a.holding.id };

    for (const table of TABLES) {
      // Own holding: both empresas visible/writable.
      expect(await countById(table, a.rows1[table], scopeA), `${table} own empresa 1`).toBe(1);
      expect(await countById(table, a.rows2[table], scopeA), `${table} own empresa 2`).toBe(1);
      expect(await touchById(table, a.rows1[table], scopeA), `${table} touch own 1`).toBe(1);
      expect(await touchById(table, a.rows2[table], scopeA), `${table} touch own 2`).toBe(1);
      // Other holding: invisible and immutable.
      expect(await countById(table, b.rows1[table], scopeA), `${table} foreign 1`).toBe(0);
      expect(await countById(table, b.rows2[table], scopeA), `${table} foreign 2`).toBe(0);
      expect(await touchById(table, b.rows1[table], scopeA), `${table} touch foreign`).toBe(0);
    }
  });

  it("a holding session bound to an unknown holding, and a session with no context, see nothing", async () => {
    const a = await crearHoldingConDosEmpresas("hn");
    // Run a holding query first so the pooled connection keeps an empty-string GUC afterwards.
    await countById("leads", a.rows1.leads, { holdingId: a.holding.id });

    for (const table of TABLES) {
      expect(await countById(table, a.rows1[table], { holdingId: randomUUID() }), table).toBe(0);
      expect(await countById(table, a.rows1[table]), `${table} no context`).toBe(0);
      expect(await touchById(table, a.rows1[table]), `${table} no context touch`).toBe(0);
    }
  });

  it("an empresa-scoped session is unchanged and does not gain its sibling empresa", async () => {
    const a = await crearHoldingConDosEmpresas("he");
    for (const table of TABLES) {
      expect(await countById(table, a.rows1[table], { empresaId: a.empresa1.id }), table).toBe(1);
      expect(await countById(table, a.rows2[table], { empresaId: a.empresa1.id }), table).toBe(0);
    }
  });

  it("an unrestricted session still sees the rows of every holding", async () => {
    const [a, b] = [await crearHoldingConDosEmpresas("hu"), await crearHoldingConDosEmpresas("hv")];
    for (const table of TABLES) {
      expect(await countById(table, a.rows1[table], { unrestricted: true }), table).toBe(1);
      expect(await countById(table, b.rows2[table], { unrestricted: true }), table).toBe(1);
    }
  });

  it("WITH CHECK: a holding session can write into its own empresas but not into another holding's", async () => {
    const [a, b] = [await crearHoldingConDosEmpresas("hw"), await crearHoldingConDosEmpresas("hx")];
    const scopeA: TenantContext = { holdingId: a.holding.id };
    const nuevoBridge = (empresaId: string) => prisma.bridge.create({
      data: {
        empresaId,
        redSocial: "FACEBOOK",
        nombre: `Bridge holding ${randomUUID()}`,
        claveApiHash: `holding-${randomUUID()}`,
      },
    });

    await expect(runWithTenantContext(scopeA, () => nuevoBridge(a.empresa2.id))).resolves.toMatchObject({
      empresaId: a.empresa2.id,
    });
    await expect(runWithTenantContext(scopeA, () => nuevoBridge(b.empresa1.id))).rejects.toThrow();

    // Indirect (EXISTS) policy: a child row hanging from another holding's bridge is rejected.
    const insertarRecibido = (bridgeId: string) => prisma.leadRecibido.create({
      data: { bridgeId, idExternoLead: `holding-${randomUUID()}`, payload: {}, entradaProcesamiento: {} },
    });
    await expect(runWithTenantContext(scopeA, () => insertarRecibido(a.rows1.bridges))).resolves.toBeDefined();
    await expect(runWithTenantContext(scopeA, () => insertarRecibido(b.rows1.bridges))).rejects.toThrow();

    // Moving a row out of the holding (UPDATE ... new row fails WITH CHECK) is rejected too.
    await expect(runWithTenantContext(scopeA, () => prisma.$transaction((tx) => tx.$executeRawUnsafe(
      `UPDATE "bridges" SET empresa_id = $1::uuid WHERE id = $2::uuid`, b.empresa1.id, a.rows1.bridges,
    )))).rejects.toThrow();
  });
});
