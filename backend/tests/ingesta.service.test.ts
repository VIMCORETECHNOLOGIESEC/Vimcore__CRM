import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as leadRecibidoRepository from "../src/repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../src/services/ingesta.service.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `procesarRecepcion`
 * corre en producción dentro de `runWithTenantContext({ empresaId: null },
 * ...)` (ver `jobs/ingesta-inbox.job.ts`) porque el worker no tiene ciclo de
 * request HTTP.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

let contador = 0;

/** Bridge de prueba con clave de API unica — evita colision del UNIQUE. */
async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ingesta ${contador}`,
      claveApiHash: hashClaveBridge(`clave-ingesta-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

function entradaBase(bridgeId: string, overrides: Partial<LeadEntrante> = {}): LeadEntrante {
  contador += 1;
  const idExternoLead = `externo-ingesta-${contador}`;
  return {
    redSocial: "GOOGLE_FORMS",
    bridgeId,
    nombre: "Cliente de prueba",
    // Prefijo "097" (distinto del "099" de `deduplicacion.service.test.ts`
    // y del "098" de `prisma.runInTransaction.test.ts`) para que ningún
    // teléfono normalizado colisione entre archivos de prueba cuando la
    // suite completa corre sin truncar entre ellos (D-H).
    telefono: `097${String(contador).padStart(7, "0")}`,
    correo: null,
    idExternoLead,
    idExternoCampania: null,
    nombreCampania: null,
    idExternoCuenta: null,
    camposDinamicos: {},
    ingresadoEn: new Date(),
    payloadOriginal: { idExternoLead },
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buzón durable de ingesta", () => {
  async function cerrarRecepcionesElegibles(): Promise<void> {
    await testAdminPrisma.$executeRawUnsafe(
      `UPDATE leads_recibidos SET estado = 'PROCESADO', lease_owner = NULL, lease_hasta = NULL WHERE estado <> 'PROCESADO'`,
    );
  }

  it("entrega un único lease bajo reclamos concurrentes y excluye el lease vigente", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const ahora = new Date("2026-08-18T00:00:00.000Z");
    await leadRecibidoRepository.aceptarLeadRecibido(entrada, ahora, testAdminPrisma);

    const [primero, segundo] = await Promise.all([
      leadRecibidoRepository.claimNext(ahora, "worker-a", testAdminPrisma),
      leadRecibidoRepository.claimNext(ahora, "worker-b", testAdminPrisma),
    ]);
    const claims = [primero, segundo].filter((claim) => claim !== null);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toEqual(
      expect.objectContaining({ intento: 1, leaseOwner: expect.stringMatching(/^worker-[ab]$/) }),
    );
    expect(await leadRecibidoRepository.claimNext(ahora, "worker-c", testAdminPrisma)).toBeNull();
  });

  it("recupera un lease vencido y rechaza al propietario anterior", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const inicio = new Date("2026-08-18T01:00:00.000Z");
    const recepcion = await leadRecibidoRepository.aceptarLeadRecibido(entrada, inicio, testAdminPrisma);
    await leadRecibidoRepository.claimNext(inicio, "worker-vencido", testAdminPrisma);

    const recuperado = await leadRecibidoRepository.claimNext(
      new Date(inicio.getTime() + 61_000),
      "worker-recuperacion",
      testAdminPrisma,
    );
    const propietarioAnteriorAceptado = await leadRecibidoRepository.marcarFallo(
      recepcion.recepcionId,
      "worker-vencido",
      "error tardío",
      new Date(inicio.getTime() + 62_000),
      testAdminPrisma,
    );

    expect(recuperado).toEqual(
      expect.objectContaining({
        recepcionId: recepcion.recepcionId,
        leaseOwner: "worker-recuperacion",
        intento: 2,
      }),
    );
    expect(propietarioAnteriorAceptado).toBe(false);
  });
});

describe("procesarRecepcion — notificacion LEAD_DATO_INCOMPLETO (M-hardening Bloque A, WU7, spec bridge-log-notifications)", () => {
  const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
  /**
   * Bloque C (D5): el chokepoint de notificaciones (`findActiveRecipientIds`)
   * ahora resuelve destinatarios vía `Membresia` (empresaId+rol) — se crea la
   * Membresia activa equivalente para que este fixture siga recibiendo el
   * fan-out de `LEAD_DATO_INCOMPLETO`.
   */
  async function crearSupervisor(): Promise<{ id: string }> {
    contador += 1;
    const usuario = await prisma.usuario.create({
      data: {
        nombre: `Supervisor WU7 ${contador}`,
        correo: `supervisor-wu7-${contador}@test.local`,
        passwordHash: "unused",
        rol: "SUPERVISOR",
        activo: true,
      },
    });
    await testAdminPrisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "SUPERVISOR",
        activa: true,
      },
    });
    return { id: usuario.id };
  }

  /**
   * Construye el claim directamente sobre LA FILA insertada por esta prueba
   * — NO usa `claimNext` (recoge "la próxima fila disponible" en TODA la
   * tabla `leads_recibidos`, sin scoping por bridge/entrada; filas
   * abandonadas con lease vencido de otras pruebas del mismo archivo — p.
   * ej. "buzón durable de ingesta" arriba, que deja `PROCESANDO` sin
   * completar — competirían por el mismo `claimNext` y harían que esta
   * prueba procese la entrada equivocada). Mismo patrón manual que
   * `ingesta-inbox.worker.test.ts`.
   */
  async function reclamar(entrada: LeadEntrante, ahora: Date): Promise<leadRecibidoRepository.InboxClaim> {
    const owner = `worker-wu7-${++contador}`;
    const receipt = await leadRecibidoRepository.aceptarLeadRecibido(entrada, ahora, testAdminPrisma);
    const row = await testAdminPrisma.leadRecibido.update({
      where: { id: receipt.recepcionId },
      data: { estado: "PROCESANDO", intentos: 1, leaseOwner: owner, leaseHasta: new Date(ahora.getTime() + 60_000) },
    });
    return {
      recepcionId: row.id,
      leaseOwner: owner,
      intento: 1,
      leaseHasta: row.leaseHasta!,
      entradaProcesamiento: row.entradaProcesamiento as unknown as leadRecibidoRepository.PersistedLeadEntranteV1,
    };
  }

  it("Scenario 'Incomplete-data lead notifies supervisors individually': lead sin telefono ni correo crea LEAD_DATO_INCOMPLETO por cada supervisor activo", async () => {
    const supervisor = await crearSupervisor();
    const { id: bridgeId } = await crearBridge();
    const ahora = new Date();
    const entrada = entradaBase(bridgeId, { telefono: null, correo: null });
    const claim = await reclamar(entrada, ahora);

    const procesado = await conContexto(() => procesarRecepcion(claim));

    expect(procesado).toBe(true);
    const notificaciones = await testAdminPrisma.notificacion.findMany({
      where: { usuarioId: supervisor.id, tipo: "LEAD_DATO_INCOMPLETO" },
    });
    expect(notificaciones).toHaveLength(1);
    expect(notificaciones[0]?.leadId).not.toBeNull();
  });

  it("Scenario 'Two incomplete leads in quick succession each notify separately': sin agregacion, dos notificaciones distintas", async () => {
    const supervisor = await crearSupervisor();
    const { id: bridgeId } = await crearBridge();
    const ahora = new Date();
    const antes = await testAdminPrisma.notificacion.count({
      where: { usuarioId: supervisor.id, tipo: "LEAD_DATO_INCOMPLETO" },
    });

    const claim1 = await reclamar(entradaBase(bridgeId, { telefono: null, correo: null }), ahora);
    await conContexto(() => procesarRecepcion(claim1));
    const claim2 = await reclamar(entradaBase(bridgeId, { telefono: null, correo: null }), ahora);
    await conContexto(() => procesarRecepcion(claim2));

    const notificaciones = await testAdminPrisma.notificacion.findMany({
      where: { usuarioId: supervisor.id, tipo: "LEAD_DATO_INCOMPLETO" },
    });
    expect(notificaciones.length - antes).toBe(2);
    expect(new Set(notificaciones.map((n) => n.leadId)).size).toBe(notificaciones.length);
  });

  it("Scenario 'ERROR level notification path unchanged': un lead con datos completos no crea LEAD_DATO_INCOMPLETO", async () => {
    const supervisor = await crearSupervisor();
    const { id: bridgeId } = await crearBridge();
    const ahora = new Date();
    const claim = await reclamar(entradaBase(bridgeId), ahora); // entradaBase ya trae telefono

    await conContexto(() => procesarRecepcion(claim));

    expect(
      await testAdminPrisma.notificacion.count({ where: { usuarioId: supervisor.id, tipo: "LEAD_DATO_INCOMPLETO" } }),
    ).toBe(0);
  });
});
