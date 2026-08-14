import { beforeEach, describe, expect, it } from "vitest";
import {
  fetchLeadDetalleApi,
  handoffToVendedorApi,
  markCitaResultApi,
  reassignApi,
  rescheduleCitaApi,
  scheduleCitaApi,
  submitCierreNoVentaApi,
  submitCierreVentaApi,
  submitFormularioEtapaApi,
} from "@/funcionalidades/leads/detalle/leadDetalle.api";

const LEAD_NUEVO_ID = "lead-08"; // etapa NUEVO en el fixture de leads.api.ts
const LEAD_CONTACTADO_ID = "lead-01"; // etapa CONTACTADO, asesor asesor-1

describe("fetchLeadDetalleApi", () => {
  it("devuelve el lead por id", async () => {
    const lead = await fetchLeadDetalleApi(LEAD_NUEVO_ID);
    expect(lead.id).toBe(LEAD_NUEVO_ID);
  });

  it("rechaza cuando el lead no existe", async () => {
    await expect(fetchLeadDetalleApi("lead-no-existe")).rejects.toThrow();
  });
});

describe("submitFormularioEtapaApi — 'sin formulario no hay transición' (docs/02-reglas-negocio.md §6)", () => {
  it("cambiar de etapa solo ocurre al enviar el formulario de la etapa destino", async () => {
    const antes = await fetchLeadDetalleApi(LEAD_NUEVO_ID);
    expect(antes.etapa).toBe("NUEVO");

    const despues = await submitFormularioEtapaApi(LEAD_NUEVO_ID, "CONTACTADO", {
      medioContacto: "SI",
      resultadoConversacion: "POSITIVA",
      necesidadIdentificada: "SI",
      capacidadPago: "SI",
      objecionPrincipal: "SI",
      proximaAccionAcordada: "SI",
    });

    expect(despues.etapa).toBe("CONTACTADO");
    expect(despues.puntuacion).toBe(100);
    expect(despues.semaforo).toBe("VERDE");
  });

  it("el cambio de etapa persiste: una consulta posterior refleja la nueva etapa", async () => {
    await submitFormularioEtapaApi(LEAD_NUEVO_ID, "CITA", {});
    const releido = await fetchLeadDetalleApi(LEAD_NUEVO_ID);
    expect(releido.etapa).toBe("CITA");
    expect(releido.puntuacion).toBe(0);
    expect(releido.semaforo).toBe("ROJO");
  });

  it("permite saltar o retroceder de etapa libremente (sin restricción de secuencia)", async () => {
    // De CITA (dejado por el test anterior) retrocede a NUEVO sin error.
    const resultado = await submitFormularioEtapaApi(LEAD_NUEVO_ID, "NUEVO", { contactabilidad: "SI" });
    expect(resultado.etapa).toBe("NUEVO");
  });
});

describe("handoffToVendedorApi (docs/02 §5)", () => {
  it("asigna el primer vendedor del catálogo cuando no se elige uno (simplificación de 'menor carga')", async () => {
    const resultado = await handoffToVendedorApi(LEAD_CONTACTADO_ID);
    expect(resultado.vendedor).not.toBeNull();
  });

  it("asigna el vendedor indicado cuando se elige manualmente", async () => {
    const resultado = await handoffToVendedorApi(LEAD_CONTACTADO_ID, "vendedor-2");
    expect(resultado.vendedor?.id).toBe("vendedor-2");
  });

  it("reinicia slaInicioEn al traspasar", async () => {
    const antes = Date.now();
    const resultado = await handoffToVendedorApi(LEAD_CONTACTADO_ID, "vendedor-1");
    expect(new Date(resultado.slaInicioEn as string).getTime()).toBeGreaterThanOrEqual(antes);
  });
});

describe("reassignApi (docs/02 §5)", () => {
  it("reasigna a un asesor distinto y reinicia slaInicioEn", async () => {
    const antes = Date.now();
    const resultado = await reassignApi(LEAD_CONTACTADO_ID, "asesor-2");
    expect(resultado.asesor?.id).toBe("asesor-2");
    expect(new Date(resultado.slaInicioEn as string).getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("reasigna a un vendedor cuando el responsableId corresponde a uno", async () => {
    const resultado = await reassignApi(LEAD_CONTACTADO_ID, "vendedor-1");
    expect(resultado.vendedor?.id).toBe("vendedor-1");
  });

  it("rechaza cuando el responsable no existe en el catálogo", async () => {
    await expect(reassignApi(LEAD_CONTACTADO_ID, "no-existe")).rejects.toThrow();
  });
});

describe("citas: agendar, reprogramar y marcar resultado", () => {
  let citaId: string;

  beforeEach(async () => {
    const cita = await scheduleCitaApi({
      leadId: LEAD_CONTACTADO_ID,
      usuarioId: "asesor-1",
      programadaPara: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      modalidad: "VIRTUAL",
    });
    citaId = cita.id;
  });

  it("agendar rechaza una fecha ya pasada", async () => {
    await expect(
      scheduleCitaApi({
        leadId: LEAD_CONTACTADO_ID,
        usuarioId: "asesor-1",
        programadaPara: new Date(Date.now() - 1000).toISOString(),
        modalidad: "TELEFONICA",
      }),
    ).rejects.toThrow();
  });

  it("reprogramar cambia la fecha y pasa a estado REPROGRAMADA", async () => {
    const nuevaFecha = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const resultado = await rescheduleCitaApi(citaId, nuevaFecha);
    expect(resultado.programadaPara).toBe(nuevaFecha);
    expect(resultado.estado).toBe("REPROGRAMADA");
  });

  it("reprogramar rechaza una fecha ya pasada", async () => {
    await expect(rescheduleCitaApi(citaId, new Date(Date.now() - 1000).toISOString())).rejects.toThrow();
  });

  it("marcar resultado cambia el estado a CUMPLIDA", async () => {
    const resultado = await markCitaResultApi(citaId, "CUMPLIDA");
    expect(resultado.estado).toBe("CUMPLIDA");
  });
});

describe("cierre — Venta y No Venta (docs/02, sin puntuación, semáforo fijo)", () => {
  it("cierre en Venta fija semáforo verde y persiste los campos de cierre", async () => {
    const resultado = await submitCierreVentaApi(LEAD_CONTACTADO_ID, {
      fechaCierre: new Date().toISOString(),
      montoVenta: 1200,
      productoVendido: "Plan Estándar",
      formaPago: "CONTADO",
    });
    expect(resultado.etapa).toBe("VENTA");
    expect(resultado.semaforo).toBe("VERDE");
    expect(resultado.montoVenta).toBe(1200);
    expect(resultado.productoVendido).toBe("Plan Estándar");
    expect(resultado.formaPago).toBe("CONTADO");
  });

  it("cierre en No Venta fija semáforo rojo y persiste la observación del motivo", async () => {
    const resultado = await submitCierreNoVentaApi(LEAD_CONTACTADO_ID, {
      fechaCierre: new Date().toISOString(),
      observacionMotivo: "El cliente decidió posponer la compra indefinidamente por motivos personales.",
    });
    expect(resultado.etapa).toBe("NO_VENTA");
    expect(resultado.semaforo).toBe("ROJO");
    expect(resultado.observacionCierre).toContain("posponer");
  });
});
