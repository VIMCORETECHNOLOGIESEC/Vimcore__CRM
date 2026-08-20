import { afterAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import * as metricasBroadcast from "../src/lib/metricas-broadcast.js";
import {
  findLeadById,
  findLeads,
  listRedesSocialesVisibles,
  transitionEtapa,
} from "../src/services/leads.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

// D-M3 (mismo patrón que deduplicacion.service.test.ts): delega a la
// implementación real por defecto, solo se reemplaza puntualmente para forzar
// un fallo a mitad de transacción.
vi.mock("../src/repositories/lead-evento.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-evento.repository.js")>();
  return { ...actual, createEvento: vi.fn(actual.createEvento) };
});
// Mock puro: NO delega a la implementación real (que programaría un
// `setTimeout` real de 2s contra el `eventBroker` singleton de producción,
// sin que este archivo use fake timers) — solo registra la llamada.
vi.mock("../src/lib/metricas-broadcast.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/metricas-broadcast.js")>();
  return { ...actual, scheduleMetricasBroadcast: vi.fn() };
});

let contador = 0;

async function crearUsuario(rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR"): Promise<UsuarioAcceso> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario LS ${contador}`,
      correo: `usuario-ls-${contador}@integracion.test`,
      passwordHash: await hashPassword("clave-de-prueba-123456"),
      rol,
      activo: true,
    },
  });
  return { id: usuario.id, rol: usuario.rol };
}

async function crearLead(
  overrides: Partial<{
    etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
    semaforo: "ROJO" | "AMARILLO" | "VERDE" | null;
    asesorId: string | null;
    vendedorId: string | null;
    slaInicioEn: Date | null;
    cerradoEn: Date | null;
    ingresadoEn: Date;
    redSocial: "FACEBOOK" | "INSTAGRAM" | "X" | "LINKEDIN" | "GOOGLE_FORMS" | null;
  }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente LS ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      slaInicioEn: overrides.slaInicioEn ?? null,
      cerradoEn: overrides.cerradoEn ?? null,
      ingresadoEn: overrides.ingresadoEn ?? new Date(),
      redSocial: overrides.redSocial ?? null,
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

describe("services/leads.service — findLeads (spec: Listado filtrado por rol)", () => {
  it("un asesor ve solo su cartera, no la de otro asesor ni leads sin asignar", async () => {
    const asesorA = await crearUsuario("ASESOR");
    const asesorB = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorB.id });
    await crearLead(); // sin asignar

    const resultado = await findLeads(asesorA, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
    } as Parameters<typeof findLeads>[1]);

    expect(resultado.total).toBe(2);
    for (const lead of resultado.leads) {
      expect(lead.asesorId).toBe(asesorA.id);
    }
  });

  it("un supervisor ve todos los leads sin importar asesorId/vendedorId", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    const asesor = await crearUsuario("ASESOR");
    const totalAntes = await prisma.lead.count();
    await crearLead({ asesorId: asesor.id });
    await crearLead();

    const resultado = await findLeads(supervisor, {
      pagina: 1,
      limite: 100,
      direccion: "desc",
    } as Parameters<typeof findLeads>[1]);

    expect(resultado.total).toBe(totalAntes + 2);
  });

  it("filtro semaforo=sin_calificar devuelve únicamente leads con semaforo null", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    const marcador = `marcador-${Date.now()}`;
    const cliente = await prisma.cliente.create({ data: { nombre: marcador, telefonoValido: false } });
    await prisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", semaforo: null, ingresadoEn: new Date() },
    });
    await prisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", semaforo: "ROJO", ingresadoEn: new Date() },
    });

    const resultado = await findLeads(supervisor, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      semaforo: "sin_calificar",
    } as Parameters<typeof findLeads>[1]);

    const idsCliente = resultado.leads.filter((l) => l.clienteId === cliente.id);
    expect(idsCliente).toHaveLength(1);
    expect(idsCliente[0]?.semaforo).toBeNull();
  });

  it("filtro estadoSla=sin_iniciar devuelve únicamente leads con slaInicioEn null", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    const cliente = await prisma.cliente.create({ data: { nombre: `SLA-null-${Date.now()}`, telefonoValido: false } });
    const sinIniciar = await prisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", slaInicioEn: null, ingresadoEn: new Date() },
    });
    await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        slaInicioEn: new Date(),
        ingresadoEn: new Date(),
      },
    });

    const resultado = await findLeads(supervisor, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      estadoSla: "sin_iniciar",
    } as Parameters<typeof findLeads>[1]);

    const idsCliente = resultado.leads.filter((l) => l.clienteId === cliente.id);
    expect(idsCliente).toHaveLength(1);
    expect(idsCliente[0]?.id).toBe(sinIniciar.id);
  });

  it("un query param asesorId (no expuesto por el schema) no llega al where — DD5 estructural", async () => {
    const asesorA = await crearUsuario("ASESOR");
    const asesorB = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorB.id });

    const resultado = await findLeads(asesorA, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      // @ts-expect-error -- el schema no expone asesorId; simula un query param ajeno colado tras el parseo.
      asesorId: asesorB.id,
    });

    expect(resultado.total).toBe(1);
    expect(resultado.leads[0]?.asesorId).toBe(asesorA.id);
  });
});

describe("services/leads.service — findLeadById (spec: Detalle con verificación de acceso)", () => {
  it("403 (AppError) cuando un asesor sin relación con el lead intenta leerlo", async () => {
    const asesorAjeno = await crearUsuario("ASESOR");
    const otroAsesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: otroAsesor.id });

    await expect(findLeadById(asesorAjeno, lead.id)).rejects.toMatchObject({ statusHttp: 403 });
  });

  it("200: el asesor que traspasó el lead (ahora vendedorId=V) conserva lectura (D4)", async () => {
    const asesorOriginal = await crearUsuario("ASESOR");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ asesorId: asesorOriginal.id, vendedorId: vendedor.id });

    const resultado = await findLeadById(asesorOriginal, lead.id);
    expect(resultado.id).toBe(lead.id);
  });

  it("404 (AppError) cuando el lead no existe", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    await expect(
      findLeadById(supervisor, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ statusHttp: 404 });
  });
});

describe("services/leads.service — transitionEtapa (spec: Transición de etapa transaccional)", () => {
  it("transición exitosa a CONTACTADO: etapa cambia, respuestas_formulario y lead_eventos CAMBIO_ETAPA nuevos", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO" });

    const actualizado = await transitionEtapa(asesor, lead.id, {
      etapa: "CONTACTADO",
      respuestas: RESPUESTAS_ALTAS_NUEVO,
    });

    expect(actualizado.etapa).toBe("CONTACTADO");
    const respuestas = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
    expect(respuestas).toBe(1);
    const eventoEtapa = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "CAMBIO_ETAPA" },
    });
    expect(eventoEtapa?.etapaAnterior).toBe("NUEVO");
    expect(eventoEtapa?.etapaNueva).toBe("CONTACTADO");
  });

  it("409: una etapa terminal (VENTA) no se reabre", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "VENTA", semaforo: "VERDE" });

    await expect(
      transitionEtapa(asesor, lead.id, { etapa: "CONTACTADO", respuestas: {} }),
    ).rejects.toMatchObject({ statusHttp: 409 });

    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("VENTA");
  });

  it("409: no se puede retroceder de CITA a CONTACTADO", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CITA" });

    await expect(
      transitionEtapa(asesor, lead.id, { etapa: "CONTACTADO", respuestas: {} }),
    ).rejects.toMatchObject({ statusHttp: 409 });

    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("CITA");
  });

  it("409: no se puede saltar de NUEVO a CITA sin pasar por CONTACTADO", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO" });

    await expect(
      transitionEtapa(asesor, lead.id, { etapa: "CITA", respuestas: {} }),
    ).rejects.toMatchObject({ statusHttp: 409 });

    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("NUEVO");
  });

  it("403: el asesor original tras un traspaso no puede editar; el vendedor sí", async () => {
    const asesorOriginal = await crearUsuario("ASESOR");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ asesorId: asesorOriginal.id, vendedorId: vendedor.id, etapa: "NUEVO" });

    await expect(
      transitionEtapa(asesorOriginal, lead.id, { etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO }),
    ).rejects.toMatchObject({ statusHttp: 403 });

    const resultado = await transitionEtapa(vendedor, lead.id, {
      etapa: "CONTACTADO",
      respuestas: RESPUESTAS_ALTAS_NUEVO,
    });
    expect(resultado.etapa).toBe("CONTACTADO");
  });

  it("D17: bitácora doble cuando etapa y semáforo cambian juntos (CAMBIO_ETAPA + CAMBIO_SEMAFORO, misma tx)", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO", semaforo: null });

    await transitionEtapa(asesor, lead.id, { etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO });

    const eventos = await prisma.leadEvento.findMany({ where: { leadId: lead.id } });
    expect(eventos.some((e) => e.tipo === "CAMBIO_ETAPA")).toBe(true);
    expect(eventos.some((e) => e.tipo === "CAMBIO_SEMAFORO")).toBe(true);
  });

  it("VENTA fija verde sin cálculo, exige monto/producto/formaPago y marca cerradoEn", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO", semaforo: "AMARILLO" });

    const actualizado = await transitionEtapa(asesor, lead.id, {
      etapa: "VENTA",
      montoVenta: 2500,
      productoServicio: "Consultoría",
      formaPago: "CREDITO",
    });

    expect(actualizado.etapa).toBe("VENTA");
    expect(actualizado.semaforo).toBe("VERDE");
    expect(actualizado.cerradoEn).not.toBeNull();
    // sin recalcular: la puntuación previa (o su ausencia) queda intacta.
    expect(actualizado.puntuacion).toBeNull();
  });

  it("NO_VENTA fija rojo, exige observacionCierre >= 20 caracteres y marca cerradoEn", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO", semaforo: "VERDE" });

    const actualizado = await transitionEtapa(asesor, lead.id, {
      etapa: "NO_VENTA",
      observacionCierre: "El cliente decidió no continuar con la compra",
    });

    expect(actualizado.etapa).toBe("NO_VENTA");
    expect(actualizado.semaforo).toBe("ROJO");
    expect(actualizado.cerradoEn).not.toBeNull();
  });

  it("fallo inyectado tras actualizar la etapa pero antes de lead_eventos: cero estado parcial persistido", async () => {
    // Lead ya VERDE -> transición a VENTA no dispara CAMBIO_SEMAFORO (mismo
    // color), así la ÚNICA llamada a createEvento es CAMBIO_ETAPA, exactamente
    // después de `updateEtapa` — el punto de falla que exige el escenario.
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CONTACTADO", semaforo: "VERDE" });

    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado para probar rollback"));

    await expect(
      transitionEtapa(asesor, lead.id, {
        etapa: "VENTA",
        montoVenta: 1000,
        productoServicio: "Producto X",
        formaPago: "CONTADO",
      }),
    ).rejects.toThrow("fallo forzado para probar rollback");

    const sinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(sinCambios.etapa).toBe("CONTACTADO");
    expect(sinCambios.montoVenta).toBeNull();
    const eventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(eventos).toBe(0);
  });

  it("M9: programa la señal de métricas tras una transición exitosa (docs/08-dashboard-kpis.md §5, cambio de etapa/cierre)", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "NUEVO" });
    const llamadasAntes = vi.mocked(metricasBroadcast.scheduleMetricasBroadcast).mock.calls.length;

    await transitionEtapa(asesor, lead.id, { etapa: "CONTACTADO", respuestas: RESPUESTAS_ALTAS_NUEVO });

    expect(vi.mocked(metricasBroadcast.scheduleMetricasBroadcast).mock.calls.length).toBeGreaterThan(
      llamadasAntes,
    );
  });
});

describe("services/leads.service — listRedesSocialesVisibles (catálogo en cascada, reemplazo de GET /bridges/redes-activas)", () => {
  it("un ADMINISTRADOR ve las redes sociales de todos los leads", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    await crearLead({ redSocial: "FACEBOOK" });
    await crearLead({ redSocial: "GOOGLE_FORMS" });

    const redes = await listRedesSocialesVisibles(admin, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
    } as Parameters<typeof listRedesSocialesVisibles>[1]);

    expect(redes).toEqual(expect.arrayContaining(["FACEBOOK", "GOOGLE_FORMS"]));
  });

  it("un ASESOR solo ve las redes sociales de su propia cartera, no las de otro asesor", async () => {
    const asesorA = await crearUsuario("ASESOR");
    const asesorB = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id, redSocial: "FACEBOOK" });
    await crearLead({ asesorId: asesorB.id, redSocial: "GOOGLE_FORMS" });

    const redes = await listRedesSocialesVisibles(asesorA, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
    } as Parameters<typeof listRedesSocialesVisibles>[1]);

    expect(redes).toEqual(["FACEBOOK"]);
  });

  it("el filtro en cascada por etapa reduce las redes sociales devueltas", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente cascada ${Date.now()}`, telefonoValido: false },
    });
    await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "VENTA",
        redSocial: "FACEBOOK",
        ingresadoEn: new Date(),
      },
    });
    await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        redSocial: "GOOGLE_FORMS",
        ingresadoEn: new Date(),
      },
    });

    const redes = await listRedesSocialesVisibles(supervisor, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      etapa: "VENTA",
    } as Parameters<typeof listRedesSocialesVisibles>[1]);

    expect(redes).toEqual(expect.arrayContaining(["FACEBOOK"]));
    expect(redes).not.toContain("GOOGLE_FORMS");
  });

  it("el filtro redSocial ya activo en el query no se autolimita: sigue devolviendo esa misma red como opción", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    await crearLead({ redSocial: "GOOGLE_FORMS" });

    const redes = await listRedesSocialesVisibles(supervisor, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      redSocial: "GOOGLE_FORMS",
    } as Parameters<typeof listRedesSocialesVisibles>[1]);

    expect(redes).toContain("GOOGLE_FORMS");
  });

  it("el filtro en cascada por busqueda (nombre de cliente) reduce las redes sociales devueltas", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");
    const clienteBuscado = await prisma.cliente.create({
      data: { nombre: `Cliente busqueda cascada ${Date.now()}`, telefonoValido: false },
    });
    const otroCliente = await prisma.cliente.create({
      data: { nombre: `Otro cliente ${Date.now()}`, telefonoValido: false },
    });
    await prisma.lead.create({
      data: {
        clienteId: clienteBuscado.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        redSocial: "FACEBOOK",
        ingresadoEn: new Date(),
      },
    });
    await prisma.lead.create({
      data: {
        clienteId: otroCliente.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        redSocial: "GOOGLE_FORMS",
        ingresadoEn: new Date(),
      },
    });

    const redes = await listRedesSocialesVisibles(supervisor, {
      pagina: 1,
      limite: 20,
      direccion: "desc",
      busqueda: "busqueda cascada",
    } as Parameters<typeof listRedesSocialesVisibles>[1]);

    expect(redes).toEqual(expect.arrayContaining(["FACEBOOK"]));
    expect(redes).not.toContain("GOOGLE_FORMS");
  });
});
