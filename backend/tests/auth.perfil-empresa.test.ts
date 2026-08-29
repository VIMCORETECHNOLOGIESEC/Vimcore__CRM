import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

vi.mock("../src/repositories/empresa.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/empresa.repository.js")>();
  return { ...actual, findById: vi.fn(actual.findById) };
});

const app = createApp();
const PASSWORD_HOLDING = "clave-perfil-holding-123";

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

async function loginCompanySession(empresaId: string) {
  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Titular Perfil D0",
      correo: `titular-perfil-d0-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-no-usada-perfil-d0"),
      rol: "ASESOR",
      activo: true,
    },
  });
  const correoMembresia = `membresia-perfil-d0-${randomUUID()}@empresa.local`;
  const passwordMembresia = "clave-membresia-perfil-d0-123";
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol: "ASESOR",
      correo: correoMembresia,
      passwordHash: await hashPassword(passwordMembresia),
      activa: true,
    },
  });

  return request(app)
    .post("/api/v1/auth/login")
    .send({ correo: correoMembresia, password: passwordMembresia });
}

describe("GET /api/v1/auth/perfil — Bloque D0 (empresaNombre)", () => {
  it("sesión company: resuelve empresaNombre server-side desde el empresaId canónico", async () => {
    const nombreEmpresa = `Empresa D0 ${randomUUID()}`;
    const empresa = await prisma.empresa.create({ data: { nombre: nombreEmpresa } });

    const login = await loginCompanySession(empresa.id);
    expect(login.status).toBe(200);

    const perfil = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(perfil.status).toBe(200);
    expect(perfil.body.sessionScope).toBe("company");
    expect(perfil.body.empresaId).toBe(empresa.id);
    expect(perfil.body.empresaNombre).toBe(nombreEmpresa);
  });

  it("sesión holding: empresaNombre es null y no atribuye una empresa concreta", async () => {
    const correo = `holding-perfil-d0-${randomUUID()}@integracion.test`;
    await prisma.usuario.create({
      data: {
        nombre: "Titular Holding Perfil D0",
        correo,
        passwordHash: await hashPassword(PASSWORD_HOLDING),
        rol: "VENDEDOR",
        activo: true,
      },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo, password: PASSWORD_HOLDING });
    expect(login.status).toBe(200);

    const perfil = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(perfil.status).toBe(200);
    expect(perfil.body.sessionScope).toBe("holding");
    expect(perfil.body.empresaId).toBeNull();
    expect(perfil.body.empresaNombre).toBeNull();
    expect(perfil.body.membresiaId).toBeUndefined();
  });

  it("falla de forma cerrada cuando una sesión company no puede resolver su Empresa", async () => {
    const login = await loginCompanySession(EMPRESA_BOOTSTRAP_ID);
    expect(login.status).toBe(200);

    // Simula el dato inconsistente descrito en el contrato (D0): la sesión
    // company ya resolvió un `empresaId` real vía Membresia, pero la lectura
    // de `Empresa` para ese id falla — nunca debe degradar a un 200 con
    // `empresaNombre: null` ni a un nombre aportado por el cliente.
    vi.mocked(empresaRepository.findById).mockResolvedValueOnce(null);

    const perfil = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(perfil.status).not.toBe(200);
    expect(perfil.body.empresaNombre).toBeUndefined();
  });
});
