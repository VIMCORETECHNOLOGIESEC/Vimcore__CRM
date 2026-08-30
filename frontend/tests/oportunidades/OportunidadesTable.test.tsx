import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { OportunidadesTable } from "@/funcionalidades/oportunidades/OportunidadesTable";
import type { Oportunidad } from "@/tipos/oportunidad";

function oportunidadFake(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: "op-1",
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

/** Réplica de `OportunidadesTable::formatFecha` (DD/MM/AAAA HH:mm, horario local). */
function fechaLocalEsperada(iso: string): string {
  const f = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

function renderTabla(oportunidades: Oportunidad[]) {
  return render(
    <MemoryRouter>
      <OportunidadesTable oportunidades={oportunidades} />
    </MemoryRouter>,
  );
}

describe("OportunidadesTable", () => {
  it("renderiza las columnas de una fila (cliente, producto, etapa, responsable, monto, creada)", () => {
    renderTabla([oportunidadFake({ montoVenta: 4500, vendedor: { id: "v1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" } })]);

    expect(screen.getByRole("link", { name: "Roberto Salazar" })).toBeInTheDocument();
    expect(screen.getByText("Plan Premium")).toBeInTheDocument();
    expect(screen.getByText("Contactado")).toBeInTheDocument();
    expect(screen.getByText("Sofía Vintimilla")).toBeInTheDocument();

    const montoEsperado = new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD",
    }).format(4500);
    expect(screen.getByText(montoEsperado)).toBeInTheDocument();
    expect(
      screen.getByText(fechaLocalEsperada("2026-08-20T14:30:00.000Z")),
    ).toBeInTheDocument();
  });

  it("enlaza el nombre del cliente al detalle /oportunidades/:id", () => {
    renderTabla([oportunidadFake({ id: "op-99" })]);
    expect(screen.getByRole("link", { name: "Roberto Salazar" })).toHaveAttribute(
      "href",
      "/oportunidades/op-99",
    );
  });

  it("muestra «Sin nombre» cuando el cliente no tiene nombre", () => {
    const base = oportunidadFake();
    renderTabla([
      {
        ...base,
        lead: { ...base.lead, cliente: { ...base.lead.cliente, nombre: "" } },
      },
    ]);
    expect(screen.getByRole("link", { name: "Sin nombre" })).toBeInTheDocument();
  });

  it("muestra «Sin asignar» cuando no hay vendedor ni asesor", () => {
    renderTabla([oportunidadFake({ asesor: null, vendedor: null })]);
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
  });

  it("cae al asesor cuando no hay vendedor", () => {
    renderTabla([oportunidadFake({ vendedor: null })]);
    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
  });

  it("muestra «—» para monto nulo y para producto nulo", () => {
    renderTabla([oportunidadFake({ montoVenta: null, producto: null })]);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
