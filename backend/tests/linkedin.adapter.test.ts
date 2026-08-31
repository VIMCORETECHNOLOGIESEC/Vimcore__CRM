import { describe, expect, it } from "vitest";
import { adaptLinkedIn } from "../src/adapters/linkedin.adapter.js";
import type { LinkedInLeadFormResponseBody } from "../src/schemas/linkedin/linkedin-leads.schema.js";

const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";

function detalleBase(overrides: Partial<LinkedInLeadFormResponseBody> = {}): LinkedInLeadFormResponseBody {
  return {
    id: "1a2b3c-4",
    submittedAt: new Date("2026-08-30T12:00:00.000Z"),
    owner: { organization: "urn:li:organization:123" },
    leadType: "EVENT",
    versionedLeadGenFormUrn: "urn:li:versionedLeadGenForm:(urn:li:leadGenForm:1, 1)",
    formResponse: {
      answers: [
        { questionId: 1, answer: "Juan Pérez" },
        { questionId: 2, answer: "juan@example.com" },
      ],
      consents: [],
      consentResponses: [],
    },
    ...overrides,
  };
}

describe("adapters/linkedin — adaptLinkedIn", () => {
  it("nombre/telefono/correo quedan null cuando ningún answer trae predefinedField inline; TODAS las respuestas van a camposDinamicos sin traducir", () => {
    const detalle = detalleBase();

    const entrada = adaptLinkedIn(detalle, BRIDGE_ID, "urn:li:leadGenFormResponse:1a2b3c-4:123456789");

    expect(entrada.nombre).toBeNull();
    expect(entrada.telefono).toBeNull();
    expect(entrada.correo).toBeNull();
    expect(entrada.camposDinamicos).toEqual({
      "1": { questionId: 1, answer: "Juan Pérez" },
      "2": { questionId: 2, answer: "juan@example.com" },
    });
    expect(entrada.redSocial).toBe("LINKEDIN");
    expect(entrada.bridgeId).toBe(BRIDGE_ID);
    expect(entrada.idExternoLead).toBe("urn:li:leadGenFormResponse:1a2b3c-4:123456789");
    expect(entrada.idExternoCuenta).toBe("urn:li:organization:123");
    expect(entrada.payloadOriginal).toBe(detalle);
    expect(entrada.ingresadoEn).toEqual(new Date("2026-08-30T12:00:00.000Z"));
  });

  it("triangulación: mapea nombre/correo/telefono oportunistamente cuando SÍ viene predefinedField inline, y sigue preservando esas mismas respuestas en camposDinamicos", () => {
    const detalle = detalleBase({
      formResponse: {
        answers: [
          { questionId: 10, predefinedField: "FIRST_NAME", answer: "Ana" },
          { questionId: 11, predefinedField: "LAST_NAME", answer: "Gómez" },
          { questionId: 12, predefinedField: "EMAIL", answer: "ana@example.com" },
          { questionId: 13, predefinedField: "PHONE_NUMBER", answer: "+5491100000001" },
          { questionId: 14, answer: "Respuesta custom" },
        ],
        consents: [],
        consentResponses: [],
      },
    });

    const entrada = adaptLinkedIn(detalle, BRIDGE_ID, "urn:li:leadGenFormResponse:1a2b3c-4:987654321");

    expect(entrada.nombre).toBe("Ana Gómez");
    expect(entrada.correo).toBe("ana@example.com");
    expect(entrada.telefono).toBe("+5491100000001");
    expect(Object.keys(entrada.camposDinamicos)).toHaveLength(5);
    expect(entrada.camposDinamicos["10"]).toMatchObject({ predefinedField: "FIRST_NAME" });
  });

  it("idExternoCampania/nombreCampania quedan null cuando leadMetadataInfo no trae esos campos", () => {
    const entrada = adaptLinkedIn(detalleBase(), BRIDGE_ID, "cualquier-id");

    expect(entrada.idExternoCampania).toBeNull();
    expect(entrada.nombreCampania).toBeNull();
  });

  it("mapea idExternoCampania/nombreCampania cuando leadMetadataInfo los trae", () => {
    const detalle = detalleBase({
      leadMetadataInfo: { campaignUrn: "urn:li:campaign:999", campaignName: "Campaña LinkedIn" },
    });

    const entrada = adaptLinkedIn(detalle, BRIDGE_ID, "cualquier-id");

    expect(entrada.idExternoCampania).toBe("urn:li:campaign:999");
    expect(entrada.nombreCampania).toBe("Campaña LinkedIn");
  });

  it("resuelve idExternoCuenta desde sponsoredAccount cuando el owner no es organization", () => {
    const detalle = detalleBase({ owner: { sponsoredAccount: "urn:li:sponsoredAccount:456" } });

    const entrada = adaptLinkedIn(detalle, BRIDGE_ID, "cualquier-id");

    expect(entrada.idExternoCuenta).toBe("urn:li:sponsoredAccount:456");
  });
});
