import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /reportes/jobs/:id/descargar (Bloque E, exportación PDF/XLSX): el
 * backend ya NO proxea/streamea el archivo (decisión del usuario,
 * 2026-08-30) -- genera una URL firmada (SAS) de solo lectura contra el
 * blob PRIVADO de Azure y se la devuelve al cliente autenticado; el
 * navegador la consume directo contra Azure. Mismo criterio que
 * `configuracion-empresa-logo.routes.test.ts`: integración con DB real, solo
 * se mockea `lib/azure-blob-storage.ts::generarUrlTemporalReporte` para
 * nunca pegarle a Azure real en la suite.
 */
const mocks = vi.hoisted(() => ({
  generarUrlTemporalReporte: vi.fn(),
}));

vi.mock("../src/lib/azure-blob-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/azure-blob-storage.js")>();
  return { ...actual, generarUrlTemporalReporte: mocks.generarUrlTemporalReporte };
});

import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-reporte-descarga-1234";
const OTRO_ADMIN_PASSWORD = "clave-otro-admin-reporte-1234567";

let adminAccessToken: string;
let adminId: string;
let otroAdminAccessToken: string;

beforeAll(async () => {
  const admin = await prisma.usuario.create({
    data: {
      nombre: "Admin Reporte Descarga",
      correo: "admin-reporte-descarga@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });
  adminId = admin.id;

  await prisma.usuario.create({
    data: {
      nombre: "Otro Admin Reporte Descarga",
      correo: "otro-admin-reporte-descarga@integracion.test",
      passwordHash: await hashPassword(OTRO_ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-reporte-descarga@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const otroAdminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "otro-admin-reporte-descarga@integracion.test", password: OTRO_ADMIN_PASSWORD });
  otroAdminAccessToken = otroAdminLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function crearReporteJob(overrides: {
  estado?: "PENDIENTE" | "PROCESANDO" | "LISTO" | "ERROR";
  archivoUrl?: string | null;
  tipo?: "pdf" | "xlsx";
} = {}): Promise<{ id: string }> {
  const job = await prisma.reporteJob.create({
    data: {
      usuarioId: adminId,
      tipo: overrides.tipo ?? "pdf",
      parametros: { rango: "30d" },
      estado: overrides.estado ?? "LISTO",
      archivoUrl: overrides.archivoUrl === undefined ? "blob-de-prueba.pdf" : overrides.archivoUrl,
    },
  });
  return { id: job.id };
}

describe("GET /api/v1/reportes/jobs/:id/descargar", () => {
  it("200 devuelve una URL firmada (SAS) temporal, nunca el archivo en sí", async () => {
    const urlFirmada = "https://nexuscorp.blob.core.windows.net/reportes/un-blob-uuid.pdf?sv=2024&sig=abc";
    mocks.generarUrlTemporalReporte.mockResolvedValue(urlFirmada);
    const { id } = await crearReporteJob({ archivoUrl: "un-blob-uuid.pdf" });

    const respuesta = await request(app)
      .get(`/api/v1/reportes/jobs/${id}/descargar`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ url: urlFirmada });
    expect(mocks.generarUrlTemporalReporte).toHaveBeenCalledWith("un-blob-uuid.pdf");
  });

  it("404 cuando Azure Blob Storage ya no tiene el blob (generarUrlTemporalReporte rechaza con archivo_no_encontrado)", async () => {
    const { AppError } = await import("../src/lib/app-error.js");
    mocks.generarUrlTemporalReporte.mockRejectedValue(
      new AppError("archivo_no_encontrado", 404, "El archivo del reporte ya no está disponible"),
    );
    const { id } = await crearReporteJob();

    const respuesta = await request(app)
      .get(`/api/v1/reportes/jobs/${id}/descargar`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("409 cuando el job todavía no está LISTO -- nunca llega a llamar a Azure", async () => {
    const { id } = await crearReporteJob({ estado: "PROCESANDO", archivoUrl: null });

    const respuesta = await request(app)
      .get(`/api/v1/reportes/jobs/${id}/descargar`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(409);
    expect(mocks.generarUrlTemporalReporte).not.toHaveBeenCalled();
  });

  it("403 cuando el job pertenece a otro usuario -- nunca llega a llamar a Azure", async () => {
    const { id } = await crearReporteJob();

    const respuesta = await request(app)
      .get(`/api/v1/reportes/jobs/${id}/descargar`)
      .set("Authorization", `Bearer ${otroAdminAccessToken}`);

    expect(respuesta.status).toBe(403);
    expect(mocks.generarUrlTemporalReporte).not.toHaveBeenCalled();
  });

  it("401 sin token de acceso", async () => {
    const { id } = await crearReporteJob();

    const respuesta = await request(app).get(`/api/v1/reportes/jobs/${id}/descargar`);

    expect(respuesta.status).toBe(401);
    expect(mocks.generarUrlTemporalReporte).not.toHaveBeenCalled();
  });
});
