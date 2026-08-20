import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/tipos/lead";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/funcionalidades/leads/detalle/leadDetalle.api", () => ({
  fetchFormularioEtapaApi: vi.fn(),
  transicionEtapaApi: vi.fn(),
}));

const { fetchFormularioEtapaApi, transicionEtapaApi } = await import(
  "@/funcionalidades/leads/detalle/leadDetalle.api"
);
const { getFormularioEtapa } = await import("@/funcionalidades/leads/detalle/formulariosEtapa");
const { LeadTimeline } = await import("@/funcionalidades/leads/detalle/LeadTimeline");
const { FormularioEtapaLead } = await import("@/funcionalidades/leads/detalle/FormularioEtapaLead");

const fetchFormularioEtapaApiMock = vi.mocked(fetchFormularioEtapaApi);
const transicionEtapaApiMock = vi.mocked(transicionEtapaApi);

// Misma lógica de formato que `LeadTimeline.tsx::formatFecha` (hora local del
// navegador, docs/07 "Formato de fechas") -- calculado acá en vez de
// hardcodeado para no depender del huso horario de la máquina que corre los
// tests.
function formatFechaEsperada(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

function leadFake(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "roberto.salazar@mail.com",
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "ROJO",
    puntuacion: 0,
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: "2026-01-05T10:30:00.000Z",
    cerradoEn: null,
    ...overrides,
  };
}

function renderTimeline(lead: Lead) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LeadTimeline lead={lead} />
    </QueryClientProvider>,
  );
}

function renderFormulario(props: { etapaActual: "NUEVO" | "CONTACTADO" | "CITA"; etapaDestino: "NUEVO" | "CONTACTADO" | "CITA" }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FormularioEtapaLead leadId="lead-01" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchFormularioEtapaApiMock.mockReset();
  fetchFormularioEtapaApiMock.mockImplementation((etapa) => Promise.resolve(getFormularioEtapa(etapa)));
  transicionEtapaApiMock.mockReset();
  transicionEtapaApiMock.mockResolvedValue(undefined);
});

describe("LeadTimeline — progreso lineal hacia adelante (docs/02-reglas-negocio.md §6)", () => {
  it("no ofrece ningún control de selección libre de etapa (el <Select> de 5 opciones ya no existe)", () => {
    renderTimeline(leadFake({ etapa: "CONTACTADO" }));
    expect(screen.queryByRole("combobox", { name: "Etapa a registrar" })).not.toBeInTheDocument();
  });

  it("etapa NUEVO: el nodo actual expande el formulario de la etapa VIGENTE (Nuevo), no el de destino (Contactado) -- regresión del bug de semáforo siempre rojo", async () => {
    renderTimeline(leadFake({ etapa: "NUEVO" }));
    expect(await screen.findByText("Formulario — Nuevo")).toBeInTheDocument();
    expect(screen.queryByText("Formulario — Contactado")).not.toBeInTheDocument();
    // El botón sí debe referirse a la etapa destino, no a la vigente.
    expect(screen.getByRole("button", { name: "Guardar y pasar a Contactado" })).toBeInTheDocument();
  });

  it("etapa CONTACTADO: el nodo actual expande el formulario de la etapa VIGENTE (Contactado), no el de destino (Cita)", async () => {
    renderTimeline(leadFake({ etapa: "CONTACTADO" }));
    expect(await screen.findByText("Formulario — Contactado")).toBeInTheDocument();
    expect(screen.queryByText("Formulario — Cita")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y pasar a Cita" })).toBeInTheDocument();
  });

  it("etapa CITA: último paso lineal, sin formulario de avance lineal (el único destino restante es el cierre)", () => {
    renderTimeline(leadFake({ etapa: "CITA" }));
    expect(screen.queryByText(/^Formulario —/)).not.toBeInTheDocument();
  });

  it("un nodo completado distinto de 'Nuevo' no inventa una fecha de transición inexistente", () => {
    renderTimeline(leadFake({ etapa: "CITA" }));
    // "Contactado" queda completado al llegar a CITA; no hay historial de
    // transición en el mock (ver INTEGRACION-BACKEND en LeadTimeline.tsx).
    expect(screen.getByText("Fecha no disponible")).toBeInTheDocument();
  });

  it("el nodo 'Nuevo' sí muestra fecha real (ingresadoEn existe en el modelo)", () => {
    const ingresadoEn = "2026-01-05T10:30:00.000Z";
    renderTimeline(leadFake({ etapa: "CONTACTADO", ingresadoEn }));
    expect(screen.getByText(formatFechaEsperada(ingresadoEn))).toBeInTheDocument();
  });
});

describe("LeadTimeline — barra de acción persistente de cierre", () => {
  it("visible en cualquier etapa no terminal (NUEVO, CONTACTADO, CITA)", () => {
    for (const etapa of ["NUEVO", "CONTACTADO", "CITA"] as const) {
      const { unmount } = renderTimeline(leadFake({ etapa }));
      expect(screen.getByRole("button", { name: "Cerrar como venta" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cerrar como no venta" })).toBeInTheDocument();
      unmount();
    }
  });

  it("desaparece por completo cuando el lead ya está en etapa terminal (VENTA)", () => {
    renderTimeline(leadFake({ etapa: "VENTA", cerradoEn: "2026-02-01T15:00:00.000Z" }));
    expect(screen.queryByRole("button", { name: "Cerrar como venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar como no venta" })).not.toBeInTheDocument();
  });

  it("desaparece por completo cuando el lead ya está en etapa terminal (NO_VENTA)", () => {
    renderTimeline(leadFake({ etapa: "NO_VENTA", cerradoEn: "2026-02-01T15:00:00.000Z" }));
    expect(screen.queryByRole("button", { name: "Cerrar como venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar como no venta" })).not.toBeInTheDocument();
  });

  it("abre el formulario de cierre en Venta al pulsar el botón, con su propia confirmación", async () => {
    const user = userEvent.setup();
    renderTimeline(leadFake({ etapa: "CITA" }));

    await user.click(screen.getByRole("button", { name: "Cerrar como venta" }));
    expect(await screen.findByText("Cierre — Venta")).toBeInTheDocument();
  });

  it("abre el formulario de cierre en No Venta al pulsar el botón, con su propia confirmación", async () => {
    const user = userEvent.setup();
    renderTimeline(leadFake({ etapa: "CITA" }));

    await user.click(screen.getByRole("button", { name: "Cerrar como no venta" }));
    expect(await screen.findByText("Cierre — No Venta")).toBeInTheDocument();
  });
});

describe("LeadTimeline — etapa terminal (no se reabre)", () => {
  it("VENTA: los 3 nodos lineales quedan completados y el nodo de cierre muestra 'Venta cerrada' con su fecha", () => {
    const cerradoEn = "2026-02-01T15:00:00.000Z";
    renderTimeline(leadFake({ etapa: "VENTA", cerradoEn }));
    expect(screen.getByText("Venta cerrada")).toBeInTheDocument();
    expect(screen.getByText(formatFechaEsperada(cerradoEn))).toBeInTheDocument();
  });

  it("NO_VENTA: el nodo de cierre muestra 'No venta' con su fecha", () => {
    const cerradoEn = "2026-02-01T15:00:00.000Z";
    renderTimeline(leadFake({ etapa: "NO_VENTA", cerradoEn }));
    expect(screen.getByText("No venta")).toBeInTheDocument();
    expect(screen.getByText(formatFechaEsperada(cerradoEn))).toBeInTheDocument();
  });
});

describe("FormularioEtapaLead — regresión del bug de semáforo siempre rojo/0", () => {
  // Causa raíz: el backend puntúa las respuestas contra la rúbrica de la
  // etapa VIGENTE del lead (`formularios.service.ts::applyFormulario` usa
  // `lead.etapa`), no la etapa destino. Si el frontend pide/manda las
  // respuestas de la etapa destino, ninguna clave coincide con la rúbrica
  // real y `calculatePuntuacion` del backend nunca encuentra una respuesta
  // válida -> puntuación 0 -> ROJO siempre.
  it("con etapaActual=NUEVO y etapaDestino=CONTACTADO, muestra las preguntas de NUEVO (no las de CONTACTADO) y envía { etapa: CONTACTADO, respuestas: <claves de NUEVO> }", async () => {
    const user = userEvent.setup();
    renderFormulario({ etapaActual: "NUEVO", etapaDestino: "CONTACTADO" });

    // Las preguntas mostradas deben ser las de la rúbrica de NUEVO...
    expect(await screen.findByText("¿El contacto es localizable?")).toBeInTheDocument();
    expect(screen.getByText("¿Reconoce el anuncio o campaña de origen?")).toBeInTheDocument();
    expect(screen.getByText("¿Declaró interés concreto en el producto/servicio?")).toBeInTheDocument();
    expect(screen.getByText("¿Tiene un plazo de decisión definido?")).toBeInTheDocument();
    expect(screen.getByText("¿Es quien toma la decisión de compra?")).toBeInTheDocument();

    // ...y NUNCA las de la rúbrica de CONTACTADO (el bug original).
    expect(screen.queryByText("¿El medio de contacto usado fue efectivo?")).not.toBeInTheDocument();
    expect(screen.queryByText("¿Cómo resultó la conversación?")).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("group", { name: "¿El contacto es localizable?" })).getByLabelText("Sí"),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "¿Reconoce el anuncio o campaña de origen?" }),
      ).getByLabelText("Sí"),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "¿Declaró interés concreto en el producto/servicio?" }),
      ).getByLabelText("Sí"),
    );
    await user.click(
      within(screen.getByRole("group", { name: "¿Tiene un plazo de decisión definido?" })).getByLabelText(
        "Inmediato (menos de 30 días)",
      ),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "¿Es quien toma la decisión de compra?" }),
      ).getByLabelText("Sí"),
    );

    await user.click(screen.getByRole("button", { name: "Guardar y pasar a Contactado" }));

    expect(transicionEtapaApiMock).toHaveBeenCalledWith("lead-01", {
      etapa: "CONTACTADO",
      respuestas: {
        contactabilidad: "SI",
        reconocimientoAnuncio: "SI",
        interesDeclarado: "SI",
        plazoDecision: "INMEDIATO",
        esQuienDecide: "SI",
      },
    });
  });
});

describe("FormularioEtapaLead — migración a React Hook Form + Zod (AGENTS.md §4)", () => {
  it("la previsualización de puntuación se actualiza en vivo con cada respuesta, antes de enviar (watch reactivo, no solo al enviar)", async () => {
    const user = userEvent.setup();
    renderFormulario({ etapaActual: "NUEVO", etapaDestino: "CONTACTADO" });

    await screen.findByText("¿El contacto es localizable?");

    // Sin respuestas: previsualización en 0, ROJO.
    expect(screen.getByText("0")).toBeInTheDocument();

    // Responder "contactabilidad" (peso 3, puntaje 10 de un denominador de
    // 110) sube la previsualización a 27, todavía antes de tocar el botón de
    // envío.
    await user.click(
      within(screen.getByRole("group", { name: "¿El contacto es localizable?" })).getByLabelText("Sí"),
    );
    expect(await screen.findByText("27")).toBeInTheDocument();

    // El botón sigue deshabilitado: faltan preguntas por responder.
    expect(screen.getByRole("button", { name: "Guardar y pasar a Contactado" })).toBeDisabled();
  });

  it("el botón de envío está deshabilitado hasta responder todas las preguntas (isValid de RHF/Zod reemplaza a todasRespondidas)", async () => {
    const user = userEvent.setup();
    renderFormulario({ etapaActual: "NUEVO", etapaDestino: "CONTACTADO" });

    await screen.findByText("¿El contacto es localizable?");
    const boton = screen.getByRole("button", { name: "Guardar y pasar a Contactado" });
    expect(boton).toBeDisabled();

    for (const [pregunta, opcion] of [
      ["¿El contacto es localizable?", "Sí"],
      ["¿Reconoce el anuncio o campaña de origen?", "Sí"],
      ["¿Declaró interés concreto en el producto/servicio?", "Sí"],
      ["¿Tiene un plazo de decisión definido?", "Inmediato (menos de 30 días)"],
    ] as const) {
      await user.click(within(screen.getByRole("group", { name: pregunta })).getByLabelText(opcion));
    }
    expect(boton).toBeDisabled();

    await user.click(
      within(screen.getByRole("group", { name: "¿Es quien toma la decisión de compra?" })).getByLabelText("Sí"),
    );
    expect(boton).not.toBeDisabled();
  });
});
