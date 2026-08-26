import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import {
  deduplicateLead,
  type DeduplicacionInput,
} from "../src/services/deduplicacion.service.js";

// Solo `createEvento` se reemplaza por un mock que delega a la
// implementación real por defecto (D-M3): permite forzar un único fallo
// puntual en la prueba de rollback sin afectar al resto de la batería, que
// sigue corriendo contra la BD real de compose.
vi.mock("../src/repositories/lead-evento.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-evento.repository.js")>();
  return { ...actual, createEvento: vi.fn(actual.createEvento) };
});

let contadorTelefono = 0;

/** EC móvil válido y único por llamada — evita colisión entre pruebas. */
function telefonoUnico(): string {
  contadorTelefono += 1;
  return `099${String(contadorTelefono).padStart(7, "0")}`;
}

function normalizadoDe(telefonoLocal: string): string {
  return `+593${telefonoLocal.slice(1)}`;
}

function entradaBase(overrides: Partial<DeduplicacionInput> = {}): DeduplicacionInput {
  return {
    nombre: "Cliente de Prueba",
    telefono: telefonoUnico(),
    correo: null,
    ingresadoEn: new Date(),
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("deduplicacion.service — deduplicateLead", () => {
  it("1. crea cliente y lead nuevos cuando no existe cliente con ese teléfono", async () => {
    const entrada = entradaBase();
    const resultado = await deduplicateLead(entrada);

    expect(resultado.clienteCreado).toBe(true);
    expect(resultado.leadCreado).toBe(true);
    expect(resultado.identidadPor).toBe("telefono");
    expect(resultado.accion.kind).toBe("crear_lead");

    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: resultado.clienteId },
    });
    expect(cliente.telefonoNormalizado).toBe(normalizadoDe(entrada.telefono!));

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.origen).toBe("NUEVO");
    expect(lead.etapa).toBe("NUEVO");
  });

  it("2. N=5 webhooks concurrentes con el mismo teléfono producen exactamente 1 cliente y 1 lead", async () => {
    const telefono = telefonoUnico();
    const llamadas = Array.from({ length: 5 }, () =>
      deduplicateLead(entradaBase({ telefono, correo: null })),
    );

    const resultados = await Promise.all(llamadas);

    const clienteIds = new Set(resultados.map((r) => r.clienteId));
    expect(clienteIds.size).toBe(1);
    const [clienteId] = [...clienteIds];

    const totalClientes = await prisma.cliente.count({
      where: { telefonoNormalizado: normalizadoDe(telefono) },
    });
    expect(totalClientes).toBe(1);

    const totalLeads = await prisma.lead.count({ where: { clienteId } });
    expect(totalLeads).toBe(1);

    const creados = resultados.filter((r) => r.leadCreado).length;
    expect(creados).toBe(1);
    const interacciones = resultados.filter(
      (r) => r.accion.kind === "interaccion_repetida",
    ).length;
    expect(interacciones).toBe(4);
  });

  it("3. D7: teléfono inválido + correo que coincide con cliente existente resuelve a ese cliente", async () => {
    const correo = `existente-${randomUUID()}@correo.test`;
    const primero = await deduplicateLead(entradaBase({ correo }));

    const segundo = await deduplicateLead(
      entradaBase({ telefono: "abc-no-es-telefono", correo }),
    );

    expect(segundo.clienteId).toBe(primero.clienteId);
    expect(segundo.clienteCreado).toBe(false);
    expect(segundo.identidadPor).toBe("correo");
    expect(segundo.telefonoValido).toBe(false);

    const totalClientesConEseCorreo = await prisma.correoCliente.count({
      where: { correoNormalizado: correo.toLowerCase() },
    });
    expect(totalClientesConEseCorreo).toBe(1); // no duplica el correo ya adjunto
  });

  it("4. teléfono inválido sin coincidencia de correo crea cliente nuevo con telefonoValido=false", async () => {
    const resultado = await deduplicateLead(
      entradaBase({
        telefono: "no-es-un-telefono",
        correo: `sin-match-${randomUUID()}@correo.test`,
      }),
    );

    expect(resultado.clienteCreado).toBe(true);
    expect(resultado.telefonoValido).toBe(false);
    expect(resultado.identidadPor).toBe("nueva");

    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: resultado.clienteId },
    });
    expect(cliente.telefonoNormalizado).toBeNull();
    expect(cliente.telefonoValido).toBe(false);
  });

  it("5. reingreso — límite exacto: 89 días no reabre, 91 días crea REINGRESO en etapa NUEVO", async () => {
    const telefono = telefonoUnico();
    const ingreso = await deduplicateLead(entradaBase({ telefono }));

    const hace89 = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
    await prisma.lead.update({
      where: { id: ingreso.leadId },
      data: { etapa: "VENTA", cerradoEn: hace89 },
    });

    const contacto89 = await deduplicateLead(entradaBase({ telefono }));
    expect(contacto89.leadCreado).toBe(false);
    expect(contacto89.accion.kind).toBe("interaccion_repetida");
    expect(contacto89.leadId).toBe(ingreso.leadId);

    const hace91 = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await prisma.lead.update({
      where: { id: ingreso.leadId },
      data: { cerradoEn: hace91 },
    });

    const contacto91 = await deduplicateLead(entradaBase({ telefono }));
    expect(contacto91.leadCreado).toBe(true);
    expect(contacto91.accion.kind).toBe("crear_lead");
    if (contacto91.accion.kind === "crear_lead") {
      expect(contacto91.accion.origen).toBe("REINGRESO");
    }

    const nuevoLead = await prisma.lead.findUniqueOrThrow({
      where: { id: contacto91.leadId },
    });
    expect(nuevoLead.origen).toBe("REINGRESO");
    expect(nuevoLead.etapa).toBe("NUEVO");
  });

  it("6. lead abierto existente registra interacción repetida y no crea lead nuevo aunque cambie otro dato", async () => {
    const telefono = telefonoUnico();
    const primero = await deduplicateLead(entradaBase({ telefono, correo: null }));

    const segundo = await deduplicateLead(
      entradaBase({ telefono, correo: `nuevo-correo-${randomUUID()}@correo.test` }),
    );

    expect(segundo.leadCreado).toBe(false);
    expect(segundo.leadId).toBe(primero.leadId);
    expect(segundo.accion.kind).toBe("interaccion_repetida");
    if (segundo.accion.kind === "interaccion_repetida") {
      expect(segundo.accion.motivo).toBe("lead_abierto");
    }

    const totalLeads = await prisma.lead.count({ where: { clienteId: primero.clienteId } });
    expect(totalLeads).toBe(1);
  });

  it("7. D8: el nombre almacenado no se sobrescribe en un contacto repetido con nombre distinto", async () => {
    const telefono = telefonoUnico();
    await deduplicateLead(entradaBase({ telefono, nombre: "Juan Perez" }));

    const resultado = await deduplicateLead(entradaBase({ telefono, nombre: "J. Perez G." }));

    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: resultado.clienteId },
    });
    expect(cliente.nombre).toBe("Juan Perez");
  });

  it("D9: ambas ramas de interaccion_repetida marcan detalle.requiereNotificacion=true", async () => {
    // Rama lead_abierto.
    const telefonoAbierto = telefonoUnico();
    await deduplicateLead(entradaBase({ telefono: telefonoAbierto }));
    const repetidaAbierto = await deduplicateLead(entradaBase({ telefono: telefonoAbierto }));

    const eventoAbierto = await prisma.leadEvento.findUniqueOrThrow({
      where: { id: repetidaAbierto.eventoId },
    });
    const detalleAbierto = eventoAbierto.detalle as Record<string, unknown>;
    expect(detalleAbierto.requiereNotificacion).toBe(true);
    expect(detalleAbierto.motivo).toBe("lead_abierto");

    // Rama lead_cerrado_en_ventana.
    const telefonoCerrado = telefonoUnico();
    const ingresoCerrado = await deduplicateLead(entradaBase({ telefono: telefonoCerrado }));
    await prisma.lead.update({
      where: { id: ingresoCerrado.leadId },
      data: { etapa: "VENTA", cerradoEn: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const repetidaCerrado = await deduplicateLead(entradaBase({ telefono: telefonoCerrado }));

    const eventoCerrado = await prisma.leadEvento.findUniqueOrThrow({
      where: { id: repetidaCerrado.eventoId },
    });
    const detalleCerrado = eventoCerrado.detalle as Record<string, unknown>;
    expect(detalleCerrado.requiereNotificacion).toBe(true);
    expect(detalleCerrado.motivo).toBe("lead_cerrado_en_ventana");
    expect(typeof detalleCerrado.diasDesdeCierre).toBe("number");
  });

  it("8. rollback forzado: cero cliente y cero lead_eventos huérfanos de ese intento (atomicidad de toda la transacción)", async () => {
    const telefono = telefonoUnico();
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    // Falla exactamente en la escritura del evento (paso E), después del
    // upsert del cliente (paso A) — prueba que TODA la transacción revierte,
    // no solo la escritura del evento.
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado para probar rollback"));

    await expect(deduplicateLead(entradaBase({ telefono }))).rejects.toThrow(
      "fallo forzado para probar rollback",
    );

    const normalizado = normalizadoDe(telefono);
    const clientesHuerfanos = await prisma.cliente.count({
      where: { telefonoNormalizado: normalizado },
    });
    expect(clientesHuerfanos).toBe(0);

    const leadsHuerfanos = await prisma.lead.count({
      where: { cliente: { telefonoNormalizado: normalizado } },
    });
    expect(leadsHuerfanos).toBe(0);

    const eventosHuerfanos = await prisma.leadEvento.count({
      where: { lead: { cliente: { telefonoNormalizado: normalizado } } },
    });
    expect(eventosHuerfanos).toBe(0);
  });

  it("M5 DD1: crea lead con redSocial/payloadOriginal/camposDinamicos poblados cuando la entrada los trae", async () => {
    const payloadOriginal = { idExternoLead: `dd1-${randomUUID()}`, campo: "valor crudo" };
    const camposDinamicos = { presupuesto: "10000-20000" };
    const entrada: DeduplicacionInput = {
      ...entradaBase(),
      redSocial: "GOOGLE_FORMS",
      payloadOriginal,
      camposDinamicos,
    };

    const resultado = await deduplicateLead(entrada);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.redSocial).toBe("GOOGLE_FORMS");
    expect(lead.payloadOriginal).toEqual(payloadOriginal);
    expect(lead.camposDinamicos).toEqual(camposDinamicos);
  });

  it("M5 DD1: sin esos tres campos en la entrada (compatibilidad M3), el lead los deja NULL como antes", async () => {
    const entrada = entradaBase();

    const resultado = await deduplicateLead(entrada);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.redSocial).toBeNull();
    expect(lead.payloadOriginal).toBeNull();
    expect(lead.camposDinamicos).toBeNull();
  });

  it("M-hardening Bloque A (WU4, D6): sin bridgeId (compatibilidad M3) la atribución degrada a null sin lanzar", async () => {
    const entrada: DeduplicacionInput = {
      ...entradaBase(),
      idExternoCuenta: "cuenta-sin-bridge",
      idExternoCampania: "campania-sin-bridge",
    };

    const resultado = await deduplicateLead(entrada);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.cuentaPublicitariaId).toBeNull();
    expect(lead.campaniaId).toBeNull();
    expect(lead.idExternoCuenta).toBe("cuenta-sin-bridge");
    expect(lead.idExternoCampania).toBe("campania-sin-bridge");
  });
});

describe("deduplicacion.service — Bloque B (Fase 3): empresaId derivation + dedupe shadow scope", () => {
  const EMPRESA_BOOTSTRAP = "00000000-0000-0000-0000-000000000001";

  async function crearBridgeConEmpresa(empresaId: string | null): Promise<{ id: string }> {
    const bridge = await prisma.bridge.create({
      data: {
        redSocial: "FACEBOOK",
        nombre: `Bridge dedupe-empresa ${randomUUID()}`,
        claveApiHash: hashClaveBridge(`clave-dedupe-empresa-${randomUUID()}`),
        estado: "ACTIVO",
        empresaId: empresaId ?? undefined,
      },
    });
    return { id: bridge.id };
  }

  it("deriva Lead.empresaId desde el Bridge al crear el lead (dual-write, legado intacto)", async () => {
    const bridge = await crearBridgeConEmpresa(EMPRESA_BOOTSTRAP);
    const entrada: DeduplicacionInput = { ...entradaBase(), bridgeId: bridge.id };

    const resultado = await deduplicateLead(entrada);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.empresaId).toBe(EMPRESA_BOOTSTRAP);
  });

  it("cross-empresa: una repetición vía bridge de OTRA empresa sobre un lead abierto produce exactamente una fila de revisión pendiente, sin alterar el outcome legado (Scenario 'Client open in more than one company')", async () => {
    const empresaB = (
      await prisma.empresa.create({ data: { nombre: `Empresa B ${randomUUID()}` } })
    ).id;
    const bridgeA = await crearBridgeConEmpresa(EMPRESA_BOOTSTRAP);
    const bridgeB = await crearBridgeConEmpresa(empresaB);
    const telefono = telefonoUnico();

    const primera = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridgeA.id });
    expect(primera.accion.kind).toBe("crear_lead");

    const segunda = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridgeB.id });
    // Scenario negativo (spec): el criterio global sigue siendo la ÚNICA
    // autoridad — el outcome legado y el leadId NUNCA cambian por el shadow.
    expect(segunda.accion.kind).toBe("interaccion_repetida");
    expect(segunda.leadId).toBe(primera.leadId);

    const filas = await prisma.leadAbiertoRevisionPendiente.findMany({
      where: { clienteId: primera.clienteId, leadAbiertoId: primera.leadId },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.empresaLeadId).toBe(EMPRESA_BOOTSTRAP);
    expect(filas[0]?.empresaIngestaId).toBe(empresaB);

    // Un segundo repeat desde la MISMA empresa foránea no duplica la fila
    // (upsert idempotente sobre la tripleta única).
    const tercera = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridgeB.id });
    expect(tercera.accion.kind).toBe("interaccion_repetida");
    expect(tercera.leadId).toBe(primera.leadId);

    const filasTrasSegundoRepeat = await prisma.leadAbiertoRevisionPendiente.findMany({
      where: { clienteId: primera.clienteId, leadAbiertoId: primera.leadId },
    });
    expect(filasTrasSegundoRepeat).toHaveLength(1);
  });

  it("scope coincide (misma empresa en ambos lados): agreement, sin fila de revisión (Scenario 'agrees with legacy')", async () => {
    const bridge = await crearBridgeConEmpresa(EMPRESA_BOOTSTRAP);
    const telefono = telefonoUnico();

    const primera = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridge.id });
    const segunda = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridge.id });

    expect(segunda.accion.kind).toBe("interaccion_repetida");
    const filas = await prisma.leadAbiertoRevisionPendiente.findMany({
      where: { clienteId: primera.clienteId, leadAbiertoId: primera.leadId },
    });
    expect(filas).toHaveLength(0);
  });

  it("sin bridgeId en la repetición (compatibilidad M3): empresaIdCandidato null, ninguna fila de revisión, ingesta normal", async () => {
    const bridge = await crearBridgeConEmpresa(EMPRESA_BOOTSTRAP);
    const telefono = telefonoUnico();

    const primera = await deduplicateLead({ ...entradaBase({ telefono }), bridgeId: bridge.id });
    const segunda = await deduplicateLead(entradaBase({ telefono }));

    expect(segunda.accion.kind).toBe("interaccion_repetida");
    const filas = await prisma.leadAbiertoRevisionPendiente.findMany({
      where: { clienteId: primera.clienteId, leadAbiertoId: primera.leadId },
    });
    expect(filas).toHaveLength(0);
  });
});

