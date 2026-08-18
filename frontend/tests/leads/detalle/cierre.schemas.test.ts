import { describe, expect, it } from "vitest";
import { cierreNoVentaSchema, cierreVentaSchema } from "@/funcionalidades/leads/detalle/cierre.schemas";

describe("cierreVentaSchema (docs/02-reglas-negocio.md 'Cierre Venta')", () => {
  const base = {
    fechaCierre: "2026-08-14",
    montoVenta: 1000,
    productoVendido: "Plan Estándar",
    formaPago: "CONTADO" as const,
  };

  it("acepta datos válidos completos", () => {
    expect(cierreVentaSchema.safeParse(base).success).toBe(true);
  });

  it("acepta sin observaciones (opcional)", () => {
    const { observaciones, ...sinObservaciones } = { ...base, observaciones: undefined };
    expect(cierreVentaSchema.safeParse(sinObservaciones).success).toBe(true);
  });

  it("rechaza sin fecha de cierre", () => {
    expect(cierreVentaSchema.safeParse({ ...base, fechaCierre: "" }).success).toBe(false);
  });

  it("rechaza monto negativo o cero", () => {
    expect(cierreVentaSchema.safeParse({ ...base, montoVenta: 0 }).success).toBe(false);
    expect(cierreVentaSchema.safeParse({ ...base, montoVenta: -50 }).success).toBe(false);
  });

  it("rechaza sin producto/servicio", () => {
    expect(cierreVentaSchema.safeParse({ ...base, productoVendido: "" }).success).toBe(false);
  });

  it("rechaza una forma de pago fuera del catálogo", () => {
    expect(cierreVentaSchema.safeParse({ ...base, formaPago: "TRANSFERENCIA" }).success).toBe(false);
  });
});

describe("cierreNoVentaSchema (docs/02-reglas-negocio.md 'Cierre No Venta')", () => {
  it("acepta una observación de motivo de al menos 20 caracteres", () => {
    const resultado = cierreNoVentaSchema.safeParse({
      fechaCierre: "2026-08-14",
      observacionMotivo: "El cliente ya no está interesado en el producto.",
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza una observación de menos de 20 caracteres", () => {
    const resultado = cierreNoVentaSchema.safeParse({
      fechaCierre: "2026-08-14",
      observacionMotivo: "Muy corto.",
    });
    expect(resultado.success).toBe(false);
  });

  it("rechaza sin fecha de cierre", () => {
    const resultado = cierreNoVentaSchema.safeParse({
      fechaCierre: "",
      observacionMotivo: "El cliente ya no está interesado en el producto.",
    });
    expect(resultado.success).toBe(false);
  });
});
