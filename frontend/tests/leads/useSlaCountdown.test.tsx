import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSlaCountdown } from "@/funcionalidades/leads/useSlaCountdown";

function Reloj({ slaInicioEn, cerradoEn }: { slaInicioEn: string | null; cerradoEn: string | null }) {
  const { etiqueta } = useSlaCountdown(slaInicioEn, cerradoEn);
  return <span>{etiqueta}</span>;
}

describe("useSlaCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("actualiza el contador cada segundo sin volver a pedir datos al servidor", () => {
    render(<Reloj slaInicioEn="2026-08-13T12:00:00.000Z" cerradoEn={null} />);

    expect(screen.getByText("A tiempo (24:00:00)")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("A tiempo (23:59:59)")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("A tiempo (23:59:54)")).toBeInTheDocument();
  });

  it("no arranca ningún intervalo para un lead cerrado (el reloj está detenido)", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    render(<Reloj slaInicioEn="2026-08-12T12:00:00.000Z" cerradoEn="2026-08-13T00:00:00.000Z" />);

    expect(screen.getByText("Cerrado")).toBeInTheDocument();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });
});
