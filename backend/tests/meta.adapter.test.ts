import { describe, expect, it } from "vitest";
import { adaptMeta } from "../src/adapters/meta.adapter.js";
import type { MetaLeadgenDetalle } from "../src/schemas/meta-webhook.schema.js";

describe("adapters/meta — adaptMeta (M4)", () => {
  it("mapea full_name/email/phone_number a los campos fijos y el resto a camposDinamicos", () => {
    const detalle: MetaLeadgenDetalle = {
      id: "leadgen-1",
      field_data: [
        { name: "full_name", values: ["Ana Gómez"] },
        { name: "email", values: ["ana@example.com"] },
        { name: "phone_number", values: ["+5491100000000"] },
        { name: "ciudad", values: ["CABA"] },
      ],
      ad_id: "ad-1",
      form_id: "form-1",
      campaign_id: "campania-123",
      campaign_name: "Campaña Verano",
      ad_name: "Anuncio A",
      created_time: "2026-08-18T10:00:00+0000",
    };

    const entrada = adaptMeta(detalle, "bridge-1", "page-1", "FACEBOOK");

    expect(entrada).toMatchObject({
      redSocial: "FACEBOOK",
      bridgeId: "bridge-1",
      nombre: "Ana Gómez",
      telefono: "+5491100000000",
      correo: "ana@example.com",
      idExternoLead: "leadgen-1",
      idExternoCampania: "campania-123",
      nombreCampania: "Campaña Verano",
      idExternoCuenta: "page-1",
    });
    expect(entrada.camposDinamicos).toEqual({
      ciudad: ["CABA"],
      adId: "ad-1",
      formId: "form-1",
      adName: "Anuncio A",
    });
    expect(entrada.ingresadoEn).toEqual(new Date("2026-08-18T10:00:00+0000"));
    expect(entrada.payloadOriginal).toBe(detalle);
  });

  it("compone el nombre desde first_name+last_name cuando no hay full_name, y deja null lo que falta (Requirement: LeadEntrante contract)", () => {
    const detalle: MetaLeadgenDetalle = {
      id: "leadgen-2",
      field_data: [
        { name: "first_name", values: ["Juan"] },
        { name: "last_name", values: ["Pérez"] },
      ],
    };

    const entrada = adaptMeta(detalle, "bridge-1", "page-1", "INSTAGRAM");

    expect(entrada.nombre).toBe("Juan Pérez");
    expect(entrada.telefono).toBeNull();
    expect(entrada.correo).toBeNull();
    expect(entrada.redSocial).toBe("INSTAGRAM");
  });

  it("usa recibidoEn cuando Graph API no trae created_time, y nombre null sin ningún campo de nombre", () => {
    const detalle: MetaLeadgenDetalle = { id: "leadgen-3", field_data: [] };
    const recibidoEn = new Date("2026-08-18T12:00:00.000Z");

    const entrada = adaptMeta(detalle, "bridge-1", "page-1", "FACEBOOK", recibidoEn);

    expect(entrada.ingresadoEn).toBe(recibidoEn);
    expect(entrada.nombre).toBeNull();
    expect(entrada.camposDinamicos).toEqual({});
  });

  it("idExternoCampania queda null cuando Graph API no devuelve campaign_id para ese lead (Requirement: LeadEntrante contract, sin placeholder inventado)", () => {
    const detalle: MetaLeadgenDetalle = {
      id: "leadgen-4",
      field_data: [{ name: "email", values: ["sin-campania@example.com"] }],
      campaign_name: "Campaña sin id",
    };

    const entrada = adaptMeta(detalle, "bridge-1", "page-1", "FACEBOOK");

    expect(entrada.idExternoCampania).toBeNull();
    expect(entrada.nombreCampania).toBe("Campaña sin id");
  });
});
