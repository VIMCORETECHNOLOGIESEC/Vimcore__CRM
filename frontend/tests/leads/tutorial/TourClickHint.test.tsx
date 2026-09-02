import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TourClickHint } from "@/funcionalidades/leads/tutorial/TourClickHint";

describe("TourClickHint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("no renderiza nada si el selector no matchea ningún elemento", () => {
    const { container } = render(<TourClickHint targetSelector='[data-tour="inexistente"]' />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza el ícono con el elemento raíz oculto para lectores de pantalla cuando el selector sí matchea", () => {
    const target = document.createElement("div");
    target.setAttribute("data-tour", "lead-whatsapp");
    document.body.appendChild(target);

    const { container } = render(<TourClickHint targetSelector='[data-tour="lead-whatsapp"]' />);

    const raiz = container.firstElementChild;
    expect(raiz).not.toBeNull();
    expect(raiz).toHaveAttribute("aria-hidden", "true");
    expect(raiz).toHaveClass("pointer-events-none");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("TourClickHint -- recalcula posición al hacer resize/scroll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("no rompe si se dispara resize/scroll estando montado", () => {
    const target = document.createElement("div");
    target.setAttribute("data-tour", "lead-workspace-tabs");
    document.body.appendChild(target);

    render(<TourClickHint targetSelector='[data-tour="lead-workspace-tabs"]' />);

    expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow();
  });
});
