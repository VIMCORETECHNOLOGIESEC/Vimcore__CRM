import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeLinkedInChallengeResponse, verifyFirmaLinkedIn } from "../src/lib/firma-linkedin.js";

const CLIENT_SECRET = "linkedin-client-secret-de-prueba";

describe("lib/firma-linkedin — computeLinkedInChallengeResponse (learn.microsoft.com webhook-validation)", () => {
  it("calcula el HMAC-SHA256 hex del challengeCode con el clientSecret", () => {
    const challengeCode = "b1a7e5c2-1111-4aaa-9999-abcdef012345";
    const esperado = createHmac("sha256", CLIENT_SECRET).update(challengeCode).digest("hex");

    expect(computeLinkedInChallengeResponse(challengeCode, CLIENT_SECRET)).toBe(esperado);
  });

  it("triangulación: un challengeCode distinto produce un challengeResponse distinto", () => {
    const primero = computeLinkedInChallengeResponse("challenge-a", CLIENT_SECRET);
    const segundo = computeLinkedInChallengeResponse("challenge-b", CLIENT_SECRET);

    expect(primero).not.toBe(segundo);
  });
});

describe("lib/firma-linkedin — verifyFirmaLinkedIn (X-LI-Signature)", () => {
  function firmar(cuerpo: Buffer, secreto: string = CLIENT_SECRET): string {
    return createHmac("sha256", secreto).update(Buffer.concat([Buffer.from("hmacsha256="), cuerpo])).digest("hex");
  }

  it("acepta una firma válida calculada sobre el cuerpo crudo exacto", () => {
    const cuerpo = Buffer.from(JSON.stringify({ type: "LEAD_ACTION" }), "utf8");

    expect(verifyFirmaLinkedIn(cuerpo, firmar(cuerpo), CLIENT_SECRET)).toBe(true);
  });

  it("rechaza una firma calculada con un clientSecret distinto al configurado", () => {
    const cuerpo = Buffer.from(JSON.stringify({ type: "LEAD_ACTION" }), "utf8");

    expect(verifyFirmaLinkedIn(cuerpo, firmar(cuerpo, "otro-secreto"), CLIENT_SECRET)).toBe(false);
  });

  it("rechaza cuando el cuerpo fue alterado después de calcular la firma (detecta tampering)", () => {
    const cuerpoOriginal = Buffer.from(JSON.stringify({ type: "LEAD_ACTION" }), "utf8");
    const firma = firmar(cuerpoOriginal);
    const cuerpoAlterado = Buffer.from(JSON.stringify({ type: "LEAD_ACTION", extra: true }), "utf8");

    expect(verifyFirmaLinkedIn(cuerpoAlterado, firma, CLIENT_SECRET)).toBe(false);
  });

  it("rechaza cuando falta el encabezado de firma", () => {
    expect(verifyFirmaLinkedIn(Buffer.from("{}", "utf8"), undefined, CLIENT_SECRET)).toBe(false);
  });

  it("rechaza cuando falta el cuerpo crudo", () => {
    expect(verifyFirmaLinkedIn(undefined, "deadbeef", CLIENT_SECRET)).toBe(false);
  });

  it("rechaza cuando no hay clientSecret configurado", () => {
    const cuerpo = Buffer.from("{}", "utf8");

    expect(verifyFirmaLinkedIn(cuerpo, firmar(cuerpo), undefined)).toBe(false);
  });

  it("rechaza un encabezado con hex inválido", () => {
    expect(verifyFirmaLinkedIn(Buffer.from("{}", "utf8"), "no-es-hex", CLIENT_SECRET)).toBe(false);
  });
});
