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
  reactivateUsuarioApi,
  getCargaActivaDeUsuario,
} = await import("@/funcionalidades/usuarios/usuarios.api");

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

function leadBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead-01",
    clienteId: "cliente-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      telefonoValido: true,
    },
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesorId: "asesor-1",
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedorId: null,
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    montoVenta: null,
    productoServicio: null,
    formaPago: null,
    observacionCierre: null,
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

  it("reactivateUsuarioApi llama a PATCH /usuarios/:id con `{ activo: true }` y devuelve `user`", async () => {
    const reactivado = usuarioFake({ activo: true });
    patchMock.mockResolvedValue({ user: reactivado });

    const resultado = await reactivateUsuarioApi("u1");

    expect(patchMock).toHaveBeenCalledWith("/usuarios/u1", { activo: true });
    expect(resultado).toEqual(reactivado);
  });
});

describe("usuarios.api — carga activa de leads (integración F3/F4, backend real de leads)", () => {
  it("getCargaActivaDeUsuario cuenta los leads no terminales devueltos por GET /leads?responsableId=", async () => {
    getMock.mockResolvedValue({
      leads: [
        leadBackendFake({ id: "lead-01", etapa: "CONTACTADO" }),
        leadBackendFake({ id: "lead-02", etapa: "VENTA" }), // terminal, no cuenta
        leadBackendFake({ id: "lead-03", etapa: "NUEVO" }),
      ],
      total: 3,
      pagina: 1,
      limite: 100,
    });

    const carga = await getCargaActivaDeUsuario("asesor-1");

    expect(getMock).toHaveBeenCalledWith(
      "/leads",
      expect.objectContaining({ params: expect.objectContaining({ responsableId: "asesor-1", limite: 100 }) }),
    );
    expect(carga).toBe(2);
  });

  it("getCargaActivaDeUsuario devuelve 0 cuando el backend no reporta leads para ese responsable", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 100 });

    expect(await getCargaActivaDeUsuario("00000000-0000-0000-0000-000000000000")).toBe(0);
  });
});
