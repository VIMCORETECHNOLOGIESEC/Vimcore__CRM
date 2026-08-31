import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OportunidadEncabezado } from "@/funcionalidades/oportunidades/detalle/OportunidadEncabezado";
import type { Oportunidad } from "@/tipos/oportunidad";

function oportunidadFake(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: "opp-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: "prod-1",
    etapa: "CONTACTADO",
    semaforo: null,
    puntuacion: null,
    asesorId: "asesor-1",
    vendedorId: null,
    montoVenta: null,
    observacionCierre: null,
    formaPago: null,
    slaInicioEn: null,
    cerradaEn: null,
    creadaEn: "2026-08-20T14:30:00.000Z",
    version: 1,
    lead: {
      id: "lead-1",
      etapa: "CONTACTADO",
      origen: "NUEVO",
      redSocial: null,
      cliente: {
        id: "cli-1",
        nombre: "Roberto Salazar",
        telefonoOriginal: "0991234567",
        telefonoNormalizado: "+593991234567",
        telefonoValido: true,
      },
    },
    producto: {
      id: "prod-1",
      empresaId: "emp-1",
      nombre: "Plan Premium",
      activo: true,
      creadoEn: "2026-01-01T00:00:00.000Z",
    },
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    ...overrides,
  };
}

/** Réplica de `formatFecha` (DD/MM/AAAA HH:mm, horario local del navegador). */
function fechaLocalEsperada(iso: string): string {
  const f = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

describe("OportunidadEncabezado", () => {
  it("formatea montoVenta (Decimal ya normalizado a número) como moneda USD", () => {
    render(<OportunidadEncabezado oportunidad={oportunidadFake({ montoVenta: 4500 })} />);

    const esperado = new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD",
    }).format(4500);
    expect(screen.getByText(esperado)).toBeInTheDocument();
  });

  it("muestra «—» cuando no hay monto", () => {
    render(<OportunidadEncabezado oportunidad={oportunidadFake({ montoVenta: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("cae a «Sin asignar» y «Sin producto» sin responsable ni producto", () => {
    render(
      <OportunidadEncabezado
        oportunidad={oportunidadFake({ asesor: null, vendedor: null, producto: null })}
      />,
    );
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    expect(screen.getByText("Sin producto")).toBeInTheDocument();
  });

  it("prefiere el vendedor sobre el asesor como responsable", () => {
    render(
      <OportunidadEncabezado
        oportunidad={oportunidadFake({
          vendedor: { id: "v1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" },
        })}
      />,
    );
    expect(screen.getByText("Sofía Vintimilla")).toBeInTheDocument();
  });

  it("muestra el nombre y el teléfono del cliente y la etiqueta de la etapa", () => {
    render(<OportunidadEncabezado oportunidad={oportunidadFake({ etapa: "CITA" })} />);
    expect(screen.getByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.getByText("0991234567")).toBeInTheDocument();
    expect(screen.getByText("Cita")).toBeInTheDocument();
  });

  it("usa «Sin nombre» cuando el cliente no tiene nombre", () => {
    const base = oportunidadFake();
    render(
      <OportunidadEncabezado
        oportunidad={{
          ...base,
          lead: { ...base.lead, cliente: { ...base.lead.cliente, nombre: "" } },
        }}
      />,
    );
    expect(screen.getByText("Sin nombre")).toBeInTheDocument();
  });

  it("muestra la fecha de cierre solo cuando la oportunidad es terminal", () => {
    const { rerender } = render(
      <OportunidadEncabezado oportunidad={oportunidadFake({ cerradaEn: null })} />,
    );
    expect(screen.queryByText("Cerrada")).not.toBeInTheDocument();

    rerender(
      <OportunidadEncabezado
        oportunidad={oportunidadFake({
          etapa: "VENTA",
          cerradaEn: "2026-08-25T16:45:00.000Z",
          montoVenta: 4500,
          formaPago: "CONTADO",
        })}
      />,
    );
    expect(screen.getByText("Cerrada")).toBeInTheDocument();
    expect(
      screen.getByText(fechaLocalEsperada("2026-08-25T16:45:00.000Z")),
    ).toBeInTheDocument();
  });
});
