import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /configuracion-empresa/logo (subida real de isotipo por Azure Blob
 * Storage, nivel holding/singleton) -- mismo criterio que
 * `empresa-apariencia-logo.routes.test.ts`: integración con DB real, solo se
 * mockea `lib/azure-blob-storage.ts::uploadImage` para nunca pegarle a Azure
 * real en la suite.
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

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-logo-config-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-logo-config-1234";
const UPLOADED_LOGO_URL = "https://nexuscorp.blob.core.windows.net/isotipos/generated.png";
const PNG_BUFFER = Buffer.from("contenido-png-de-prueba");

let adminAccessToken: string;
let vendedorAccessToken: string;

beforeAll(async () => {
  // Mismo criterio que `configuracion-empresa.routes.test.ts`: no depender
  // del orden de ejecución entre archivos de test para la tabla singleton.
  await prisma.configuracionEmpresa.deleteMany();

  await prisma.usuario.create({
    data: {
      nombre: "Admin Logo Config Empresa",
      correo: "admin-logo-config-empresa@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Vendedor Logo Config Empresa",
      correo: "vendedor-logo-config-empresa@integracion.test",
      passwordHash: await hashPassword(VENDEDOR_PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-logo-config-empresa@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const vendedorLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "vendedor-logo-config-empresa@integracion.test", password: VENDEDOR_PASSWORD });
  vendedorAccessToken = vendedorLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.configuracionEmpresa.deleteMany();
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadImage.mockResolvedValue(UPLOADED_LOGO_URL);
});

describe("POST /api/v1/configuracion-empresa/logo", () => {
  it("200 ADMINISTRADOR sube el logo y persiste la URL devuelta por Azure Blob Storage", async () => {
    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.logoUrl).toBe(UPLOADED_LOGO_URL);
    expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", sizeBytes: PNG_BUFFER.length }),
    );

    const siguienteGet = await request(app)
      .get("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(siguienteGet.body.logoUrl).toBe(UPLOADED_LOGO_URL);
  });

  it("400 sin ningún archivo adjunto", async () => {
    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("400 con un tipo de archivo no permitido (rechazado por Multer antes del controller)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .attach("logo", Buffer.from("no-es-una-imagen"), {
        filename: "archivo.exe",
        contentType: "application/x-msdownload",
      });

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("400 con un archivo que supera el tamaño máximo (2 MB, rechazado por Multer)", async () => {
    const archivoGrande = Buffer.alloc(2 * 1024 * 1024 + 1);

    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .attach("logo", archivoGrande, { filename: "grande.png", contentType: "image/png" });

    expect(respuesta.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("403 cuando un VENDEDOR intenta subir el logo", async () => {
    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(403);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app)
      .post("/api/v1/configuracion-empresa/logo")
      .attach("logo", PNG_BUFFER, { filename: "logo.png", contentType: "image/png" });

    expect(respuesta.status).toBe(401);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });
});
