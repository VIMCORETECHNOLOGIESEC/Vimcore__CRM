import { describe, expect, it } from "vitest";
import { adaptGoogleForms } from "../src/adapters/google-forms.adapter.js";
import { ingestaGenericaSchema } from "../src/schemas/ingesta.schema.js";

describe("adapters/google-forms — adaptGoogleForms (M4, PR2)", () => {
  it("deja nombreCampania en null cuando el payload no trae nombre de campaña (Scenario: Unfilled field is null)", () => {
    const body = ingestaGenericaSchema.parse({
      idExternoLead: "form-respuesta-1",
      nombre: "Ana Perez",
      telefono: "+54 9 11 5555-1234",
      correo: "ana@example.com",
      // idExternoCampania / nombreCampania / idExternoCuenta ausentes.
    });

    const leadEntrante = adaptGoogleForms(body, "bridge-id-1");

    expect(leadEntrante.nombreCampania).toBeNull();
    expect(leadEntrante.idExternoCampania).toBeNull();
    expect(leadEntrante.idExternoCuenta).toBeNull();
  });

  it("no usa placeholder ni cadena vacia para el campo ausente", () => {
    const body = ingestaGenericaSchema.parse({ idExternoLead: "form-respuesta-2" });

    const leadEntrante = adaptGoogleForms(body, "bridge-id-1");

    expect(leadEntrante.nombreCampania).not.toBe("");
    expect(leadEntrante.nombre).toBeNull();
  });

  it("traduce un envio completo de nombre/telefono/correo a un LeadEntrante totalmente poblado (Scenario: Form submission translated)", () => {
    const ahora = new Date("2026-08-14T12:00:00.000Z");
    const body = ingestaGenericaSchema.parse({
      idExternoLead: "form-respuesta-3",
      nombre: "Carla Gomez",
      telefono: "+54 9 11 4444-9876",
      correo: "carla@example.com",
      idExternoCampania: "camp-42",
      nombreCampania: "Campaña de invierno",
      idExternoCuenta: "cuenta-7",
      camposDinamicos: { presupuesto: "10000-15000" },
    });

    const leadEntrante = adaptGoogleForms(body, "bridge-id-2", ahora);

    expect(leadEntrante).toMatchObject({
      redSocial: "GOOGLE_FORMS",
      bridgeId: "bridge-id-2",
      nombre: "Carla Gomez",
      telefono: "+54 9 11 4444-9876",
      correo: "carla@example.com",
      idExternoLead: "form-respuesta-3",
      idExternoCampania: "camp-42",
      nombreCampania: "Campaña de invierno",
      idExternoCuenta: "cuenta-7",
      camposDinamicos: { presupuesto: "10000-15000" },
    });
    expect(leadEntrante.ingresadoEn).toEqual(ahora);
    expect(leadEntrante.payloadOriginal).toEqual(body);
  });

  it("usa el momento de recepcion del servidor cuando la plataforma no envia ingresadoEn", () => {
    const antes = Date.now();
    const body = ingestaGenericaSchema.parse({ idExternoLead: "form-respuesta-4" });

    const leadEntrante = adaptGoogleForms(body, "bridge-id-3");

    expect(leadEntrante.ingresadoEn.getTime()).toBeGreaterThanOrEqual(antes);
  });
});
