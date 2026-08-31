import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEADS_NAVIGATION_TOUR_STEPS } from "@/funcionalidades/leads/tutorial/LeadsNavigationTutorial";

describe("LeadsNavigationTutorial", () => {
  it("incluye el paso del panel de WhatsApp antes de las pestañas y acciones finales", () => {
    const targets = LEADS_NAVIGATION_TOUR_STEPS.map((step) => step.target);

    expect(targets).toEqual([
      '[data-tour="leads-search"]',
      '[data-tour="leads-filters"]',
      '[data-tour="leads-table-columns"]',
      '[data-tour="leads-table-row"]',
      '[data-tour="lead-header"]',
      '[data-tour="lead-contact-origin-cards"]',
      '[data-tour="lead-summary"]',
      '[data-tour="lead-whatsapp"]',
      '[data-tour="lead-whatsapp-chat"]',
      '[data-tour="lead-workspace-tabs"]',
      '[data-tour="lead-workspace-progreso"]',
      '[data-tour="lead-workspace-cita"]',
      '[data-tour="lead-workspace-cierre"]',
      '[data-tour="lead-workspace-oportunidad"]',
    ]);
  });

  it("explica las columnas variables de la tabla sin confundir roles", () => {
    const step = LEADS_NAVIGATION_TOUR_STEPS.find(
      (candidate) => candidate.target === '[data-tour="leads-table-columns"]',
    );

    expect(step).toBeDefined();
    render(<>{step?.content}</>);

    expect(screen.getByText(/Cliente abre el detalle/i)).toBeInTheDocument();
    expect(screen.getByText(/Estado de SLA/i)).toBeInTheDocument();
    expect(screen.getByText(/Si tu rol lo permite también vas a ver la casilla de selección y la columna Responsable/i)).toBeInTheDocument();
  });
});
