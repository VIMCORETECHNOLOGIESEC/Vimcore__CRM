import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUsuario } from "@/tipos/usuario";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const {
  fetchUsuariosApi,
  createUsuarioApi,
  updateUsuarioApi,
  resetPasswordApi,
  deactivateUsuarioApi,
  getCargaActivaDeUsuario,
  getCandidatosReasignacion,
  reassignCarteraActiva,
} = await import("@/funcionalidades/usuarios/usuarios.api");
const { fetchLeadsApi } = await import("@/funcionalidades/leads/leads.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);
const deleteMock = vi.mocked(httpClient.delete);

function usuarioFake(overrides: Partial<AdminUsuario> = {}): AdminUsuario {
  return {
    id: "u1",
    nombre: "Ana Gómez",
    correo: "ana@crm.test",
    rol: "ASESOR",
    activo: true,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usuarios.api — backend real (F7, distinto de F3-F6)", () => {
  it("fetchUsuariosApi llama a GET /usuarios con los params dados y devuelve la respuesta completa", async () => {
    const usuarios = [usuarioFake(), usuarioFake({ id: "u2" })];
    const respuesta = { users: usuarios, total: 2, pagina: 1, limite: 20 };
    getMock.mockResolvedValue(respuesta);

    const resultado = await fetchUsuariosApi({ pagina: 1, limite: 20 });

    expect(getMock).toHaveBeenCalledWith("/usuarios", { params: { pagina: 1, limite: 20 } });
    expect(resultado).toEqual(respuesta);
  });

  it("fetchUsuariosApi manda busqueda/rol/activo/dirección tal cual se le pasan", async () => {
    getMock.mockResolvedValue({ users: [], total: 0, pagina: 2, limite: 10 });

    await fetchUsuariosApi({
      pagina: 2,
      limite: 10,
      busqueda: "ana",
      rol: "ASESOR",
      activo: true,
      direccion: "desc",
    });

    expect(getMock).toHaveBeenCalledWith("/usuarios", {
      params: {
        pagina: 2,
        limite: 10,
        busqueda: "ana",
        rol: "ASESOR",
        activo: true,
        direccion: "desc",
      },
    });
  });

  it("createUsuarioApi llama a POST /usuarios con el cuerpo dado y devuelve `user`", async () => {
    const nuevo = usuarioFake({ id: "u3" });
    postMock.mockResolvedValue({ user: nuevo });

    const resultado = await createUsuarioApi({
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      password: "una-contraseña-larga-1",
      rol: "ASESOR",
    });

    expect(postMock).toHaveBeenCalledWith("/usuarios", {
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      password: "una-contraseña-larga-1",
      rol: "ASESOR",
    });
    expect(resultado).toEqual(nuevo);
  });

  it("updateUsuarioApi llama a PATCH /usuarios/:id con nombre/correo/rol, sin password", async () => {
    const actualizado = usuarioFake({ nombre: "Ana Actualizada" });
    patchMock.mockResolvedValue({ user: actualizado });

    const resultado = await updateUsuarioApi("u1", {
      nombre: "Ana Actualizada",
      correo: "ana@crm.test",
      rol: "ASESOR",
    });

    expect(patchMock).toHaveBeenCalledWith("/usuarios/u1", {
      nombre: "Ana Actualizada",
      correo: "ana@crm.test",
      rol: "ASESOR",
    });
    expect(resultado).toEqual(actualizado);
  });

  it("resetPasswordApi llama a PATCH /usuarios/:id solo con password (sin exigir la contraseña actual)", async () => {
    patchMock.mockResolvedValue({ user: usuarioFake() });

    await resetPasswordApi("u1", "una-contraseña-nueva-1");

    expect(patchMock).toHaveBeenCalledWith("/usuarios/u1", { password: "una-contraseña-nueva-1" });
  });

  it("deactivateUsuarioApi llama a DELETE /usuarios/:id (baja lógica real)", async () => {
    deleteMock.mockResolvedValue(undefined);

    await deactivateUsuarioApi("u1");

    expect(deleteMock).toHaveBeenCalledWith("/usuarios/u1");
  });
});

describe("usuarios.api — brecha documentada: carga activa y reasignación (mock de F3)", () => {
  it("getCargaActivaDeUsuario cuenta los leads activos del mock para un id sintético conocido", () => {
    expect(getCargaActivaDeUsuario("asesor-1")).toBe(2);
  });

  it("getCargaActivaDeUsuario devuelve 0 para un id real que no existe en el mock de leads", () => {
    expect(getCargaActivaDeUsuario("00000000-0000-0000-0000-000000000000")).toBe(0);
  });

  it("getCandidatosReasignacion solo ofrece usuarios del mismo rol operativo, sin incluir al propio usuario", () => {
    const candidatos = getCandidatosReasignacion("ASESOR", "asesor-1");
    expect(candidatos.map((c) => c.id)).toEqual(["asesor-2"]);
  });

  it("getCandidatosReasignacion devuelve una lista vacía para administrador/supervisor (no cargan cartera)", () => {
    expect(getCandidatosReasignacion("ADMINISTRADOR", "admin-1")).toEqual([]);
    expect(getCandidatosReasignacion("SUPERVISOR", "sup-1")).toEqual([]);
  });

  it("reassignCarteraActiva mueve los leads activos del usuario al nuevo responsable (mock)", async () => {
    await reassignCarteraActiva("asesor-1", "asesor-2");

    const respuesta = await fetchLeadsApi({ pagina: 1, porPagina: 50 });
    const deAsesor1 = respuesta.datos.filter((l) => l.id === "lead-01" || l.id === "lead-03");
    expect(deAsesor1.every((l) => l.asesor?.id === "asesor-2")).toBe(true);
  });
});
