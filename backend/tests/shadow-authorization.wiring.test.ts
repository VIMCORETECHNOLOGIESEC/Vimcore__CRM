import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque B (Fase 2, diseño "Shadow authorizer call sites"): verifica que
 * `requireRole` (ya cubierto en `require-role.middleware.test.ts`) y, sobre
 * todo, los TRES call sites de recurso — `canReassign`/`canTransfer`
 * (`asignacion.service.ts`) y `canClose` (`leads.service.ts`) — disparan el
 * comparador en sombra fire-and-forget. `shadow-authorization.service.js` se
 * mockea ACÁ (hoisted por vitest antes de `createApp`); el resto de la app
 * corre real contra la BD de pruebas, mismo patrón que
 * `asignacion.routes.test.ts`.
 */
vi.mock("../src/services/shadow-authorization.service.js", () => ({
  compareRequireRole: vi.fn(async () => undefined),
  compareCanReassign: vi.fn(async () => undefined),
  compareCanTransfer: vi.fn(async () => undefined),
  compareCanClose: vi.fn(async () => undefined),
}));

const shadowAuthorizationService = await import(
  "../src/services/shadow-authorization.service.js"
);
const { createApp } = await import("../src/app.js");
const { hashPassword } = await import("../src/lib/password.js");
const { prisma } = await import("../src/lib/prisma.js");

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";
let contador = 0;

async function crearUsuarioConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario Shadow ${contador}`,
      correo: `usuario-shadow-${contador}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

async function crearLead(overrides: {
  etapa?: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
  semaforo?: "ROJO" | "AMARILLO" | "VERDE" | null;
  asesorId?: string | null;
  vendedorId?: string | null;
}): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente Shadow ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "CONTACTADO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      ingresadoEn: new Date(),
    },
  });
  return { id: lead.id };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Bloque B (Fase 2) — comparador en sombra en canReassign (POST /leads/:id/reasignar)", () => {
  it("invoca compareCanReassign con la decisión legada, sin alterar la respuesta 200", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const asesorOrigen = await crearUsuarioConToken("ASESOR");
    const asesorDestino = await crearUsuarioConToken("ASESOR");
    const lead = await crearLead({ asesorId: asesorOrigen.id, semaforo: "ROJO" });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/reasignar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ asesorId: asesorDestino.id });

    expect(respuesta.status).toBe(200);
    expect(shadowAuthorizationService.compareCanReassign).toHaveBeenCalledWith(
      admin.id,
      expect.objectContaining({ asesorId: asesorOrigen.id }),
      null,
    );
  });
});

describe("Bloque B (Fase 2) — comparador en sombra en canTransfer (POST /leads/:id/traspasar)", () => {
  it("invoca compareCanTransfer con la decisión legada, sin alterar la respuesta 200", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const asesor = await crearUsuarioConToken("ASESOR");
    const vendedor = await crearUsuarioConToken("VENDEDOR");
    const lead = await crearLead({ etapa: "CONTACTADO", asesorId: asesor.id });

    const respuesta = await request(app)
      .post(`/api/v1/leads/${lead.id}/traspasar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ vendedorId: vendedor.id });

    expect(respuesta.status).toBe(200);
    expect(shadowAuthorizationService.compareCanTransfer).toHaveBeenCalledWith(
      admin.id,
      expect.objectContaining({ etapa: "CONTACTADO" }),
      null,
    );
  });
});

describe("Bloque B (Fase 2) — comparador en sombra en canClose (PATCH /leads/:id/etapa -> VENTA/NO_VENTA)", () => {
  it("invoca compareCanClose con la decisión legada, sin alterar la respuesta 200", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const lead = await crearLead({ etapa: "CITA" });

    const respuesta = await request(app)
      .patch(`/api/v1/leads/${lead.id}/etapa`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ etapa: "VENTA", montoVenta: 100, productoServicio: "x", formaPago: "CONTADO" });

    expect(respuesta.status).toBe(200);
    expect(shadowAuthorizationService.compareCanClose).toHaveBeenCalledWith(
      admin.id,
      expect.objectContaining({ etapa: "CITA" }),
      null,
    );
  });
});

