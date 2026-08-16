import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/tipos/lead";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/funcionalidades/leads/detalle/leadDetalle.api", () => ({
  fetchFormularioEtapaApi: vi.fn(),
  submitFormularioEtapaApi: vi.fn(),
  submitCierreVentaApi: vi.fn(),
  submitCierreNoVentaApi: vi.fn(),
}));

const { fetchFormularioEtapaApi } = await import("@/funcionalidades/leads/detalle/leadDetalle.api");
const { getFormularioEtapa } = await import("@/funcionalidades/leads/detalle/formulariosEtapa");
const { LeadTimeline } = await import("@/funcionalidades/leads/detalle/LeadTimeline");

const fetchFormularioEtapaApiMock = vi.mocked(fetchFormularioEtapaApi);

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

beforeEach(() => {
  fetchFormularioEtapaApiMock.mockReset();
  fetchFormularioEtapaApiMock.mockImplementation((etapa) => Promise.resolve(getFormularioEtapa(etapa)));
});

describe("LeadTimeline — progreso lineal hacia adelante (docs/02-reglas-negocio.md §6)", () => {
  it("no ofrece ningún control de selección libre de etapa (el <Select> de 5 opciones ya no existe)", () => {
    renderTimeline(leadFake({ etapa: "CONTACTADO" }));
    expect(screen.queryByRole("combobox", { name: "Etapa a registrar" })).not.toBeInTheDocument();
  });

  it("etapa NUEVO: el nodo actual expande el formulario del siguiente paso lineal (Contactado), nunca uno anterior", async () => {
    renderTimeline(leadFake({ etapa: "NUEVO" }));
    expect(await screen.findByText("Formulario — Contactado")).toBeInTheDocument();
  });

  it("etapa CONTACTADO: el nodo actual expande el formulario del siguiente paso lineal (Cita), nunca Nuevo", async () => {
    renderTimeline(leadFake({ etapa: "CONTACTADO" }));
    expect(await screen.findByText("Formulario — Cita")).toBeInTheDocument();
    expect(screen.queryByText("Formulario — Contactado")).not.toBeInTheDocument();
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
