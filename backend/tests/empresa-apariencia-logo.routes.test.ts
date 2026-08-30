import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /empresas/actual/apariencia/logo (subida real de isotipo por Azure
 * Blob Storage): integración con DB real (mismo criterio que
 * `empresa-apariencia.routes.test.ts`, del que reusa el patrón de sesiones)
 * -- lo único que se mockea es el único punto de I/O externo real, `lib/
 * azure-blob-storage.ts::uploadImage`, para nunca pegarle a Azure real en la
 * suite.
 */
const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
}));

vi.mock("../src/lib/azure-blob-storage.js", () => ({
  uploadImage: mocks.uploadImage,
}));

import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

const app = createApp();

const UPLOADED_LOGO_URL = "https://nexuscorp.blob.core.windows.net/isotipos/generated.png";
const PNG_BUFFER = Buffer.from("contenido-png-de-prueba");

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadImage.mockResolvedValue(UPLOADED_LOGO_URL);
});

async function loginCompanySession(
  empresaId: string,
  rol: "ADMINISTRADOR" | "ASESOR" = "ADMINISTRADOR",
) {
  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Titular Logo Empresa",
      correo: `titular-logo-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-no-usada-logo"),
      rol,
      activo: true,
    },
  });
  const correoMembresia = `membresia-logo-${randomUUID()}@empresa.local`;
  const passwordMembresia = "clave-membresia-logo-123";
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol,
      correo: correoMembresia,
      passwordHash: await hashPassword(passwordMembresia),
      activa: true,
    },
  });

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: correoMembresia, password: passwordMembresia });
  return login.body.accessToken as string;
}

async function loginHoldingSession(rol: "ADMINISTRADOR" | "ASESOR" = "ADMINISTRADOR") {
  const correo = `holding-logo-${randomUUID()}@integracion.test`;
  const password = "clave-holding-logo-123";
  await prisma.usuario.create({
    data: {
      nombre: "Titular Logo Holding",
      correo,
      passwordHash: await hashPassword(password),
      rol,
      activo: true,
    },
  });

  const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
  return login.body.accessToken as string;
}

describe("POST /api/v1/empresas/actual/apariencia/logo", () => {
  it("200 ADMINISTRADOR de empresa sube el logo y persiste la URL devuelta por Azure Blob Storage", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa logo ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: UPLOADED_LOGO_URL,
    });
    expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", sizeBytes: PNG_BUFFER.length }),
    );

    const empresaActualizada = await prisma.empresa.findUnique({ where: { id: empresa.id } });
    expect(empresaActualizada?.logoUrl).toBe(UPLOADED_LOGO_URL);
    // Los colores existentes no deben tocarse -- a diferencia del PATCH de
    // texto libre, este endpoint nunca los recibe.
    expect(empresaActualizada?.colorPrimario).toBe("#111111");
  });

  it("400 sin ningún archivo adjunto", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa logo ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("400 con un tipo de archivo no permitido (rechazado por Multer antes del controller)", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa logo ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", Buffer.from("no-es-una-imagen"), {
        filename: "archivo.exe",
        contentType: "application/x-msdownload",
      });

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("400 con un archivo que supera el tamaño máximo (2 MB, rechazado por Multer)", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa logo ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);
    const archivoGrande = Buffer.alloc(2 * 1024 * 1024 + 1);

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", archivoGrande, { filename: "grande.png", contentType: "image/png" });

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("403 sesión holding (aunque el rol sea ADMINISTRADOR) -- mismo guard que el PATCH", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(403);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("403 rol no-ADMINISTRADOR dentro de una sesión company", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa logo ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id, "ASESOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(403);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(401);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("503 cuando lib/azure-blob-storage rechaza por falta de configuración", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa logo ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);
    const { AppError } = await import("../src/lib/app-error.js");
    mocks.uploadImage.mockRejectedValue(
      new AppError("almacenamiento_no_configurado", 503, "El almacenamiento de archivos no está configurado"),
    );

    const respuesta = await request(app)
      .post("/api/v1/empresas/actual/apariencia/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(503);
  });
});
