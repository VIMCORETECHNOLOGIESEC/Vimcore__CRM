import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * D-M5 (diseño, tarea PR1.8): verificación de la migración M5 contra la base
 * de pruebas real (ya migrada por `prisma migrate deploy` antes de
 * `pnpm test`), mismo patrón que `schema.bridges.test.ts` (M4).
 */

let contador = 0;

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge M5 schema ${contador}`,
      claveApiHash: hashClaveBridge(`clave-m5-schema-${contador}-${randomUUID()}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

async function crearCliente(): Promise<{ id: string }> {
  const cliente = await prisma.cliente.create({
    data: { nombre: "Cliente de prueba M5 schema", creadoEn: new Date() },
  });
  return { id: cliente.id };
}

async function crearUsuario(): Promise<{ id: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario M5 schema ${contador}`,
      correo: `usuario-m5-schema-${contador}-${randomUUID()}@integracion.test`,
      passwordHash: "hash-no-usado-en-esta-prueba",
      rol: "ASESOR",
      activo: true,
    },
  });
  return { id: usuario.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema M5 — índices D11 (leads, migración)", () => {
  it("existen los 4 índices simples de D11 sobre leads", async () => {
    const indices = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'leads'
    `;
    const nombres = indices.map((i) => i.indexname);

    for (const nombre of [
      "idx_leads_asesor_etapa",
      "idx_leads_vendedor_etapa",
      "idx_leads_etapa_ingreso",
      "idx_leads_red_social",
    ]) {
      expect(nombres).toContain(nombre);
    }
  });

  it("idx_leads_sla es un índice PARCIAL sobre sla_inicio_en WHERE cerrado_en IS NULL", async () => {
    const indices = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'leads' AND indexname = 'idx_leads_sla'
    `;

    expect(indices).toHaveLength(1);
    expect(indices[0]?.indexdef).toContain("sla_inicio_en");
    expect(indices[0]?.indexdef).toContain("WHERE");
    expect(indices[0]?.indexdef).toContain("cerrado_en");
  });
});

describe("schema M5 — columnas nuevas de Lead son nullable (D14/D1/D13)", () => {
  it("crea un lead sin ninguna columna nueva de M5: todas quedan NULL", async () => {
    const cliente = await crearCliente();

    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });

    expect(lead.semaforo).toBeNull();
    expect(lead.puntuacion).toBeNull();
    expect(lead.asesorId).toBeNull();
    expect(lead.vendedorId).toBeNull();
    expect(lead.slaInicioEn).toBeNull();
    expect(lead.montoVenta).toBeNull();
    expect(lead.observacionCierre).toBeNull();
    expect(lead.productoServicio).toBeNull();
    expect(lead.formaPago).toBeNull();
  });

  it("crea un lead con todas las columnas nuevas de M5 pobladas (round-trip real, no mockeado)", async () => {
    const cliente = await crearCliente();
    const asesor = await crearUsuario();
    const vendedor = await crearUsuario();

    const lead = await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "VENTA",
        ingresadoEn: new Date(),
        semaforo: "VERDE",
        puntuacion: 100,
        asesorId: asesor.id,
        vendedorId: vendedor.id,
        slaInicioEn: new Date(),
        cerradoEn: new Date(),
        montoVenta: 1500.5,
        productoServicio: "Plan Premium",
        formaPago: "CREDITO",
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });

    expect(lead.semaforo).toBe("VERDE");
    expect(lead.puntuacion).toBe(100);
    expect(lead.asesorId).toBe(asesor.id);
    expect(lead.vendedorId).toBe(vendedor.id);
    expect(lead.formaPago).toBe("CREDITO");
    expect(lead.montoVenta === null ? null : Number(lead.montoVenta)).toBe(1500.5);
  });
});

describe("schema M5 — LeadEvento.semaforoAnterior/semaforoNuevo (D17)", () => {
  it("persiste un evento CAMBIO_SEMAFORO con ambos colores", async () => {
    const cliente = await crearCliente();
    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });

    const evento = await testAdminPrisma.leadEvento.create({
      data: {
        leadId: lead.id,
        empresaId: EMPRESA_BOOTSTRAP_ID,
        tipo: "CAMBIO_SEMAFORO",
        semaforoAnterior: "ROJO",
        semaforoNuevo: "AMARILLO",
      },
    });

    expect(evento.semaforoAnterior).toBe("ROJO");
    expect(evento.semaforoNuevo).toBe("AMARILLO");
  });
});

describe("schema M5 — respuestas_formulario (D8/D12)", () => {
  it("inserta una respuesta de formulario ligada a lead y usuario, con registradoEn por defecto", async () => {
    const cliente = await crearCliente();
    const usuario = await crearUsuario();
    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });

    const respuesta = await prisma.respuestaFormulario.create({
      data: {
        leadId: lead.id,
        usuarioId: usuario.id,
        etapa: "NUEVO",
        respuestas: { contacto_logrado: "si_respondio" },
        puntuacion: 55,
        semaforo: "AMARILLO",
        versionRubrica: "v1",
      },
    });

    expect(respuesta.puntuacion).toBe(55);
    expect(respuesta.versionRubrica).toBe("v1");
    expect(respuesta.registradoEn).toBeInstanceOf(Date);
  });

  it("dos envíos para el mismo lead producen dos filas distintas (D8: historial, sin sobrescritura)", async () => {
    const cliente = await crearCliente();
    const usuario = await crearUsuario();
    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });

    await prisma.respuestaFormulario.create({
      data: {
        leadId: lead.id,
        usuarioId: usuario.id,
        etapa: "NUEVO",
        respuestas: { contacto_logrado: "no_respondio_primer_intento" },
        puntuacion: 20,
        semaforo: "ROJO",
        versionRubrica: "v1",
      },
    });
    await prisma.respuestaFormulario.create({
      data: {
        leadId: lead.id,
        usuarioId: usuario.id,
        etapa: "NUEVO",
        respuestas: { contacto_logrado: "si_respondio" },
        puntuacion: 80,
        semaforo: "VERDE",
        versionRubrica: "v1",
      },
    });

    const total = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
    expect(total).toBe(2);
  });
});

describe("schema M5 — DD1 backfill NULL-only en la migración (D14-safe)", () => {
  /**
   * Ejecuta EXACTAMENTE la misma sentencia del bloque "DataMigration" de
   * `prisma/migrations/20260814050000_m5_gestion_leads/migration.sql`. La
   * migración real ya corrió una vez sobre la base de pruebas (sin filas que
   * backfillear en ese momento); esta prueba reproduce la misma sentencia
   * SQL contra filas sembradas a propósito para probar las dos ramas del
   * guard NULL-only (D14).
   */
  async function ejecutarBackfill(): Promise<void> {
    await testAdminPrisma.$executeRawUnsafe(`
      UPDATE "leads" AS l
      SET "red_social" = b."red_social",
          "payload_original" = lr."payload"
      FROM "leads_recibidos" AS lr
      JOIN "bridges" AS b ON b."id" = lr."bridge_id"
      WHERE lr."lead_id" = l."id"
        AND l."red_social" IS NULL
        AND l."payload_original" IS NULL;
    `);
  }

  it("rellena red_social/payload_original de un lead M4 previo al fix (ambos NULL) desde su recepción", async () => {
    const cliente = await crearCliente();
    const bridge = await crearBridge();
    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });
    const payloadCrudo = { idExternoLead: `backfill-${randomUUID()}`, nombre: "Lead pre-fix" };
    await prisma.leadRecibido.create({
      data: {
        bridgeId: bridge.id,
        idExternoLead: payloadCrudo.idExternoLead,
        leadId: lead.id,
        payload: payloadCrudo,
        entradaProcesamiento: { version: 0, payloadLegacy: payloadCrudo },
      },
    });

    await ejecutarBackfill();

    const leadActualizado = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.redSocial).toBe("GOOGLE_FORMS");
    expect(leadActualizado.payloadOriginal).toEqual(payloadCrudo);
  });

  it("NO sobrescribe un lead que ya tiene red_social poblado (D14: NULL-only, no destructivo)", async () => {
    const cliente = await crearCliente();
    const bridgeGoogle = await crearBridge();
    // Lead ya calificado con un valor DISTINTO al del bridge de su recepción
    // — si el backfill no fuera NULL-only, este valor se perdería.
    const lead = await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
        redSocial: "FACEBOOK",
        payloadOriginal: { yaPoblado: true },
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });
    await prisma.leadRecibido.create({
      data: {
        bridgeId: bridgeGoogle.id,
        idExternoLead: `backfill-no-overwrite-${randomUUID()}`,
        leadId: lead.id,
        payload: { idExternoLead: "no-deberia-usarse" },
        entradaProcesamiento: { version: 0, payloadLegacy: {} },
      },
    });

    await ejecutarBackfill();

    const leadTrasBackfill = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasBackfill.redSocial).toBe("FACEBOOK");
    expect(leadTrasBackfill.payloadOriginal).toEqual({ yaPoblado: true });
  });
});
