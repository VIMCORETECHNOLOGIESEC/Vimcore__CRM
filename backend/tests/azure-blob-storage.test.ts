import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/azure-blob-storage.ts (subida de isotipo de empresa): unit test puro —
 * nunca le pega a Azure real. Mockea tanto el SDK oficial (`@azure/storage-blob`)
 * como `config/env.ts` vía un objeto mutable compartido (`mocks.env`), así
 * cada test puede simular "falta la cadena de conexión" sin reiniciar el
 * registro de módulos.
 */
const mocks = vi.hoisted(() => ({
  createIfNotExists: vi.fn(),
  uploadData: vi.fn(),
  getBlockBlobClient: vi.fn(),
  getContainerClient: vi.fn(),
  fromConnectionString: vi.fn(),
  env: {
    AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true" as string | undefined,
    AZURE_STORAGE_CONTAINER_ISOTIPOS: "isotipos",
    AZURE_STORAGE_PUBLIC_BASE_URL: undefined as string | undefined,
  },
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: { fromConnectionString: mocks.fromConnectionString },
}));

vi.mock("../src/config/env.js", () => ({
  env: mocks.env,
}));

import { uploadImage } from "../src/lib/azure-blob-storage.js";

const BLOCK_BLOB_URL = "https://nexuscorp.blob.core.windows.net/isotipos/generated.png";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
  mocks.env.AZURE_STORAGE_PUBLIC_BASE_URL = undefined;
  mocks.getBlockBlobClient.mockReturnValue({
    uploadData: mocks.uploadData,
    url: BLOCK_BLOB_URL,
  });
  mocks.getContainerClient.mockReturnValue({
    createIfNotExists: mocks.createIfNotExists,
    getBlockBlobClient: mocks.getBlockBlobClient,
  });
  mocks.fromConnectionString.mockReturnValue({
    getContainerClient: mocks.getContainerClient,
  });
  mocks.createIfNotExists.mockResolvedValue(undefined);
  mocks.uploadData.mockResolvedValue(undefined);
});

describe("lib/azure-blob-storage — uploadImage", () => {
  it("sube un PNG válido y devuelve la URL pública del blob", async () => {
    const url = await uploadImage({
      buffer: Buffer.from("contenido-png"),
      mimeType: "image/png",
      sizeBytes: 13,
    });

    expect(url).toBe(BLOCK_BLOB_URL);
    expect(mocks.fromConnectionString).toHaveBeenCalledWith("UseDevelopmentStorage=true");
    expect(mocks.getContainerClient).toHaveBeenCalledWith("isotipos");
    expect(mocks.createIfNotExists).toHaveBeenCalledWith({ access: "blob" });
    expect(mocks.uploadData).toHaveBeenCalledWith(expect.any(Buffer), {
      blobHTTPHeaders: { blobContentType: "image/png" },
    });
  });

  it("sube un SVG válido y nombra el blob con uuid + extensión derivada del mimeType (nunca del nombre del archivo)", async () => {
    await uploadImage({
      buffer: Buffer.from("<svg/>"),
      mimeType: "image/svg+xml",
      sizeBytes: 6,
    });

    const [nombreBlob] = mocks.getBlockBlobClient.mock.calls[0] as [string];
    expect(nombreBlob).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.svg$/,
    );
  });

  it("rechaza un tipo de archivo no permitido sin llegar a llamar a Azure", async () => {
    await expect(
      uploadImage({ buffer: Buffer.from("x"), mimeType: "application/pdf", sizeBytes: 1 }),
    ).rejects.toMatchObject({ code: "tipo_archivo_invalido", statusHttp: 400 });

    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it("rechaza un archivo que supera el tamaño máximo (2 MB) sin llegar a llamar a Azure", async () => {
    await expect(
      uploadImage({
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
        mimeType: "image/png",
        sizeBytes: 2 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ code: "archivo_demasiado_grande", statusHttp: 400 });

    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it("reescribe solo el origin de la URL cuando AZURE_STORAGE_PUBLIC_BASE_URL está seteado (Azurite local)", async () => {
    mocks.env.AZURE_STORAGE_PUBLIC_BASE_URL = "http://localhost:10000";
    mocks.getBlockBlobClient.mockReturnValue({
      uploadData: mocks.uploadData,
      url: "http://azurite:10000/devstoreaccount1/isotipos/generated.png",
    });

    const url = await uploadImage({
      buffer: Buffer.from("contenido-png"),
      mimeType: "image/png",
      sizeBytes: 13,
    });

    expect(url).toBe("http://localhost:10000/devstoreaccount1/isotipos/generated.png");
  });

  it("no reescribe la URL cuando AZURE_STORAGE_PUBLIC_BASE_URL no está seteado (Azure real)", async () => {
    const url = await uploadImage({
      buffer: Buffer.from("contenido-png"),
      mimeType: "image/png",
      sizeBytes: 13,
    });

    expect(url).toBe(BLOCK_BLOB_URL);
  });

  it("rechaza por tamaño usando el buffer real, aunque sizeBytes mienta y diga que es chico", async () => {
    await expect(
      uploadImage({
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
        mimeType: "image/png",
        sizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "archivo_demasiado_grande", statusHttp: 400 });

    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it("responde 503 cuando falta AZURE_STORAGE_CONNECTION_STRING", async () => {
    mocks.env.AZURE_STORAGE_CONNECTION_STRING = undefined;

    await expect(
      uploadImage({ buffer: Buffer.from("x"), mimeType: "image/png", sizeBytes: 1 }),
    ).rejects.toMatchObject({ code: "almacenamiento_no_configurado", statusHttp: 503 });

    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });
});
