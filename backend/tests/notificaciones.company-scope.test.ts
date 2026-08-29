import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/notificacion.repository.js", () => ({
  findActiveRecipientIds: vi.fn(),
  createNotificacion: vi.fn(),
  listByUsuario: vi.fn(),
  markOneRead: vi.fn(),
  markAllRead: vi.fn(),
}));

const repository = await import("../src/repositories/notificacion.repository.js");
const {
  createForActiveRoles,
  createForActiveSupervisorsAndAdmins,
  createHoldingForActiveRoles,
} = await import("../src/services/notificaciones.service.js");

const input = {
  tipo: "ERROR_BRIDGE" as const,
  titulo: "Error de bridge",
  mensaje: "Se detectó un error",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.findActiveRecipientIds).mockResolvedValue(["usuario-1"]);
  vi.mocked(repository.createNotificacion).mockImplementation(async (data) => data as never);
});

describe("notificaciones company scope", () => {
  it("persiste la empresa obligatoria en cada notificación derivada", async () => {
    await createForActiveRoles(["SUPERVISOR"], input, "empresa-A");

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["SUPERVISOR"],
      "empresa-A",
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: "empresa-A" },
      expect.anything(),
    );
  });

  it("aplica el mismo scope al fan-out de supervisores y administradores", async () => {
    await createForActiveSupervisorsAndAdmins(input, "empresa-B");

    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: "empresa-B" },
      expect.anything(),
    );
  });

  it("solo la API holding explícita puede persistir empresaId null", async () => {
    await createHoldingForActiveRoles(["ADMINISTRADOR"], input);

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["ADMINISTRADOR"],
      null,
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: null },
      expect.anything(),
    );
  });

  it("rechaza un scope de empresa ausente en vez de degradar a holding", async () => {
    await expect(
      createForActiveRoles(["SUPERVISOR"], input, undefined as never),
    ).rejects.toMatchObject({ code: "contexto_empresa_no_resuelto", statusHttp: 422 });
    expect(repository.createNotificacion).not.toHaveBeenCalled();
  });
});
