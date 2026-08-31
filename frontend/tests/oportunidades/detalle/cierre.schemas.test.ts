import { describe, expect, it } from "vitest";
import {
  cierreNoVentaOportunidadSchema,
  cierreVentaOportunidadSchema,
} from "@/funcionalidades/oportunidades/detalle/cierre.schemas";

describe("cierreVentaOportunidadSchema (D7, POST /oportunidades/:id/cerrar VENTA)", () => {
  it("acepta un monto positivo y una forma de pago válida", () => {
    expect(
      cierreVentaOportunidadSchema.safeParse({ montoVenta: 1500, formaPago: "CONTADO" }).success,
    ).toBe(true);
  });

  it("rechaza un monto cero o negativo", () => {
    expect(
      cierreVentaOportunidadSchema.safeParse({ montoVenta: 0, formaPago: "CONTADO" }).success,
    ).toBe(false);
    expect(
      cierreVentaOportunidadSchema.safeParse({ montoVenta: -100, formaPago: "CONTADO" }).success,
    ).toBe(false);
  });

  it("rechaza sin monto", () => {
    expect(cierreVentaOportunidadSchema.safeParse({ formaPago: "CONTADO" }).success).toBe(false);
  });

  it("rechaza una forma de pago fuera del catálogo", () => {
    expect(
      cierreVentaOportunidadSchema.safeParse({ montoVenta: 1500, formaPago: "TRANSFERENCIA" })
        .success,
    ).toBe(false);
  });

  it("rechaza sin forma de pago", () => {
    expect(cierreVentaOportunidadSchema.safeParse({ montoVenta: 1500 }).success).toBe(false);
  });
});

describe("cierreNoVentaOportunidadSchema (D7, POST /oportunidades/:id/cerrar NO_VENTA)", () => {
  it("rechaza una observación de menos de 20 caracteres", () => {
    expect(
      cierreNoVentaOportunidadSchema.safeParse({ observacionCierre: "Muy corto." }).success,
    ).toBe(false);
  });

  it("acepta una observación de exactamente 20 caracteres", () => {
    const observacion = "a".repeat(20);
    expect(
      cierreNoVentaOportunidadSchema.safeParse({ observacionCierre: observacion }).success,
    ).toBe(true);
  });

  it("recorta espacios antes de contar la longitud mínima", () => {
    const observacionConEspacios = `   ${"a".repeat(20)}   `;
    const resultado = cierreNoVentaOportunidadSchema.safeParse({
      observacionCierre: observacionConEspacios,
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.observacionCierre).toBe("a".repeat(20));
    }

    const rellenoInsuficiente = cierreNoVentaOportunidadSchema.safeParse({
      observacionCierre: `   ${"a".repeat(19)}   `,
    });
    expect(rellenoInsuficiente.success).toBe(false);
  });
});
