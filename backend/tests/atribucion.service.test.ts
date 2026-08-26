import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as cuentaPublicitariaRepository from "../src/repositories/cuenta-publicitaria.repository.js";
import { resolverAtribucion } from "../src/services/atribucion.service.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";

let contador = 0;

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge atribucion ${contador}`,
      claveApiHash: hashClaveBridge(`clave-atribucion-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

function leadEntrante(overrides: Partial<LeadEntrante>): LeadEntrante {
  return {
    redSocial: "FACEBOOK",
    bridgeId: "bridge-placeholder",
    nombre: "Lead atribucion",
    telefono: null,
    correo: null,
    idExternoLead: `lead-${Math.random()}`,
    idExternoCampania: null,
    nombreCampania: null,
    idExternoCuenta: null,
    camposDinamicos: {},
    ingresadoEn: new Date(),
    payloadOriginal: {},
    ...overrides,
  };
}

describe("services/atribucion — resolverAtribucion (M-hardening Bloque A, WU4, spec lead-attribution, D6)", () => {
  it("Scenario 'Known account and campaign': cuenta y campaña conocidas resuelven ambas FKs y conservan los escalares crudos", async () => {
    const bridge = await crearBridge();
    contador += 1;
    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `cuenta-conocida-${contador}`,
      nombre: "Cuenta conocida",
    });
    const campania = await prisma.campania.create({
      data: {
        cuentaPublicitariaId: cuenta.id,
        idExterno: `campania-conocida-${contador}`,
        nombre: "Campaña de invierno",
        redSocial: "FACEBOOK",
      },
    });

    const entrada = leadEntrante({
      bridgeId: bridge.id,
      idExternoCuenta: `cuenta-conocida-${contador}`,
      idExternoCampania: `campania-conocida-${contador}`,
      nombreCampania: "Campaña de invierno",
    });

    const resultado = await resolverAtribucion(entrada);

    expect(resultado.cuentaPublicitariaId).toBe(cuenta.id);
    expect(resultado.campaniaId).toBe(campania.id);
    expect(resultado.idExternoCuenta).toBe(`cuenta-conocida-${contador}`);
    expect(resultado.idExternoCampania).toBe(`campania-conocida-${contador}`);
    expect(resultado.nombreCampania).toBe("Campaña de invierno");
  });

  it("Scenario 'Unknown campaign (no match)': campaña sin match degrada a null sin lanzar, escalares crudos se conservan", async () => {
    const bridge = await crearBridge();
    contador += 1;
    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `cuenta-sin-campania-${contador}`,
      nombre: "Cuenta sin campaña registrada",
    });

    const entrada = leadEntrante({
      bridgeId: bridge.id,
      idExternoCuenta: `cuenta-sin-campania-${contador}`,
      idExternoCampania: "campania-jamas-registrada",
      nombreCampania: "Campaña fantasma",
    });

    const resultado = await resolverAtribucion(entrada);

    expect(resultado.cuentaPublicitariaId).toBe(cuenta.id);
    expect(resultado.campaniaId).toBeNull();
    expect(resultado.idExternoCampania).toBe("campania-jamas-registrada");
    expect(resultado.nombreCampania).toBe("Campaña fantasma");
  });

  it("TRIANGULACION: cuenta conocida + campaña desconocida en un bridge distinto también degrada solo la campaña", async () => {
    const bridge = await crearBridge();
    contador += 1;
    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `cuenta-mixta-${contador}`,
      nombre: "Cuenta mixta",
    });

    const entrada = leadEntrante({
      bridgeId: bridge.id,
      idExternoCuenta: `cuenta-mixta-${contador}`,
      idExternoCampania: "otra-campania-inexistente",
      nombreCampania: null,
    });

    const resultado = await resolverAtribucion(entrada);

    expect(resultado.cuentaPublicitariaId).toBe(cuenta.id);
    expect(resultado.campaniaId).toBeNull();
  });

  it("cuenta desconocida: ambas FK degradan a null sin intentar resolver campaña (D6, la campaña depende de la cuenta)", async () => {
    const bridge = await crearBridge();
    const entrada = leadEntrante({
      bridgeId: bridge.id,
      idExternoCuenta: "cuenta-jamas-registrada",
      idExternoCampania: "cualquier-campania",
    });

    const resultado = await resolverAtribucion(entrada);

    expect(resultado.cuentaPublicitariaId).toBeNull();
    expect(resultado.campaniaId).toBeNull();
    expect(resultado.idExternoCuenta).toBe("cuenta-jamas-registrada");
  });

  it("sin idExternoCuenta: nunca lanza, ambas FK quedan null", async () => {
    const bridge = await crearBridge();
    const entrada = leadEntrante({ bridgeId: bridge.id, idExternoCuenta: null, idExternoCampania: null });

    const resultado = await resolverAtribucion(entrada);

    expect(resultado.cuentaPublicitariaId).toBeNull();
    expect(resultado.campaniaId).toBeNull();
    expect(resultado.idExternoCuenta).toBeNull();
  });
});
