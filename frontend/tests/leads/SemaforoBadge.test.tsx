import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemaforoBadge } from "@/funcionalidades/leads/SemaforoBadge";

describe("SemaforoBadge", () => {
  it("renderiza color y etiqueta de texto para cada valor calificado", () => {
    const { rerender } = render(<SemaforoBadge semaforo="VERDE" />);
    expect(screen.getByText("Lead caliente")).toBeInTheDocument();

    rerender(<SemaforoBadge semaforo="AMARILLO" />);
    expect(screen.getByText("Lead tibio")).toBeInTheDocument();

    rerender(<SemaforoBadge semaforo="ROJO" />);
    expect(screen.getByText("Lead frío")).toBeInTheDocument();
  });

  it("un lead sin calificar (semaforo null, D14) muestra un estado neutro en vez de romper", () => {
    render(<SemaforoBadge semaforo={null} />);

    expect(screen.getByText("Sin calificar")).toBeInTheDocument();
  });
});
