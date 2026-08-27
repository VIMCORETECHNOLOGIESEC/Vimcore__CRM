import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as cuentaPublicitariaRepository from "../src/repositories/cuenta-publicitaria.repository.js";
import { resolverAtribucion, resolverEmpresaIdDesdeBridge } from "../src/services/atribucion.service.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";

const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

let contador = 0;

/**
 * Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante): `Bridge.empresaId` es
 * NOT NULL desde esta etapa — "Bridge without company" (Bloque B, Fase 3)
 * ya no es un estado alcanzable, así que este helper ya no acepta `null`
 * como override; por defecto usa la empresa bootstrap.
 */
async function crearBridge(overrides: { empresaId?: string } = {}): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge atribucion ${contador}`,
      claveApiHash: hashClaveBridge(`clave-atribucion-${contador}`),
      estado: "ACTIVO",
      empresaId: overrides.empresaId ?? BOOTSTRAP_EMPRESA_ID,
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

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

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

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

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

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

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

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

    expect(resultado.cuentaPublicitariaId).toBeNull();
    expect(resultado.campaniaId).toBeNull();
    expect(resultado.idExternoCuenta).toBe("cuenta-jamas-registrada");
  });

  it("sin idExternoCuenta: nunca lanza, ambas FK quedan null", async () => {
    const bridge = await crearBridge();
    const entrada = leadEntrante({ bridgeId: bridge.id, idExternoCuenta: null, idExternoCampania: null });

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

    expect(resultado.cuentaPublicitariaId).toBeNull();
    expect(resultado.campaniaId).toBeNull();
    expect(resultado.idExternoCuenta).toBeNull();
  });

  it("Bloque B (Fase 3, spec lead-empresa-derivation): incluye empresaId resuelto desde el Bridge (Bridge resolves a company)", async () => {
    const bridge = await crearBridge({ empresaId: BOOTSTRAP_EMPRESA_ID });
    const entrada = leadEntrante({ bridgeId: bridge.id, idExternoCuenta: null, idExternoCampania: null });

    const resultado = await resolverAtribucion(entrada, testAdminPrisma);

    expect(resultado.empresaId).toBe(BOOTSTRAP_EMPRESA_ID);
  });

  // "Bloque B (Fase 3): empresaId queda null cuando el Bridge no tiene
  // empresa resuelta (Bridge without company)" — RETIRADO por Bloque C (D4,
  // Fase 2/Stage 2): `Bridge.empresaId` es NOT NULL desde esta etapa, así
  // que un Bridge sin empresa ya no es un estado alcanzable. La rama
  // `empresaId: null` de `resolverAtribucion`/`resolverEmpresaIdDesdeBridge`
  // solo sobrevive para el caso "el bridge referenciado no existe" —
  // cubierto por "devuelve null (nunca lanza) cuando el bridge no existe"
  // abajo.
});

describe("services/atribucion — resolverEmpresaIdDesdeBridge (Bloque B, Fase 3)", () => {
  it("resuelve Bridge.empresaId cuando está presente", async () => {
    const bridge = await crearBridge({ empresaId: BOOTSTRAP_EMPRESA_ID });

    const empresaId = await resolverEmpresaIdDesdeBridge(bridge.id, testAdminPrisma);

    expect(empresaId).toBe(BOOTSTRAP_EMPRESA_ID);
  });

  // "devuelve null cuando el Bridge no tiene empresa asignada" — RETIRADO
  // por Bloque C (D4): `Bridge.empresaId` es NOT NULL, ver nota arriba.

  it("devuelve null (nunca lanza) cuando el bridge no existe", async () => {
    const empresaId = await resolverEmpresaIdDesdeBridge(
      "00000000-0000-0000-0000-000000000000",
      testAdminPrisma,
    );

    expect(empresaId).toBeNull();
  });
});

