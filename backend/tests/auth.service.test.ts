import { createHash } from "node:crypto";
import type { Membresia, RefreshToken, RolMembresia, RolUsuario, Usuario } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/usuario.repository.js", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
}));
vi.mock("../src/repositories/refresh-token.repository.js", () => ({
  create: vi.fn(),
  findByJti: vi.fn(),
  revoke: vi.fn(),
  revokeAllForUser: vi.fn(),
  rotate: vi.fn(),
}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findByEmail: vi.fn(),
}));
vi.mock("../src/lib/password.js", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));
vi.mock("../src/lib/jwt.js", () => ({
  signAccessToken: vi.fn(async () => "access.jwt.fake"),
  signRefreshToken: vi.fn(async () => ({
    token: "refresh.jwt.fake",
    jti: "nuevo-jti",
    expiraEn: new Date(Date.now() + 1000 * 60),
  })),
  verifyRefreshToken: vi.fn(),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const usuarioRepository = await import("../src/repositories/usuario.repository.js");
const refreshTokenRepository = await import(
  "../src/repositories/refresh-token.repository.js"
);
const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const passwordLib = await import("../src/lib/password.js");
const jwtLib = await import("../src/lib/jwt.js");
const { logger } = await import("../src/lib/logger.js");
const { login, logout, refresh } = await import("../src/services/auth.service.js");
const { AppError } = await import("../src/lib/app-error.js");

function usuarioFalso(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "usuario-1",
    nombre: "Ana",
    correo: "ana@crm.local",
    passwordHash: "hash-guardado",
    rol: "VENDEDOR" as RolUsuario,
    activo: true,
    ultimaAsignacionEn: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...overrides,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function filaRefreshFalsa(
  token: string,
  overrides: Partial<RefreshToken> = {},
): RefreshToken {
  return {
    jti: "jti-anterior",
    usuarioId: "usuario-1",
    hash: sha256(token),
    expiraEn: new Date(Date.now() + 1000 * 60 * 60),
    revocadoEn: null,
    creadoEn: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth.service.login", () => {
  it("emite un par de tokens cuando las credenciales son válidas", async () => {
    const usuario = usuarioFalso();
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(usuario);
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(true);

    const resultado = await login("ana@crm.local", "clave-correcta");

    expect(resultado.accessToken).toBe("access.jwt.fake");
    expect(resultado.refreshToken).toBe("refresh.jwt.fake");
    expect(resultado.user).toEqual({
      id: "usuario-1",
      nombre: "Ana",
      correo: "ana@crm.local",
      rol: "VENDEDOR",
    });
    expect(refreshTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ jti: expect.any(String), usuarioId: "usuario-1" }),
    );
  });

  it("rechaza con credenciales_invalidas cuando el usuario no existe", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);

    await expect(login("nadie@crm.local", "clave")).rejects.toMatchObject({
      code: "credenciales_invalidas",
      statusHttp: 401,
    });
    expect(passwordLib.verifyPassword).not.toHaveBeenCalled();
  });

  it("rechaza con credenciales_invalidas cuando la contraseña es incorrecta", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(usuarioFalso());
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(false);

    await expect(login("ana@crm.local", "clave-mala")).rejects.toBeInstanceOf(AppError);
    await expect(login("ana@crm.local", "clave-mala")).rejects.toMatchObject({
      code: "credenciales_invalidas",
      statusHttp: 401,
    });
  });

  it("rechaza con credenciales_invalidas cuando el usuario está inactivo (mismo mensaje, sin oráculo)", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(
      usuarioFalso({ activo: false }),
    );
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(true);

    await expect(login("ana@crm.local", "clave-correcta")).rejects.toMatchObject({
      code: "credenciales_invalidas",
      statusHttp: 401,
    });
  });
});

/** Bloque B (Fase 2, spec dual-login-routing). */
function membresiaFalsa(overrides: Partial<Membresia> = {}): Membresia {
  return {
    id: "membresia-1",
    usuarioId: "usuario-1",
    empresaId: "empresa-1",
    rol: "ASESOR" as RolMembresia,
    habilitadoParaVenta: false,
    correo: "ana@empresa.local",
    passwordHash: "hash-membresia",
    activa: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...overrides,
  };
}

describe("auth.service.login — dual-login-routing (Bloque B, Fase 2)", () => {
  it("resuelve por Membresia.correo cuando Usuario.correo no matchea, y emite membresiaId/empresaId en el access token", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(membresiaRepository.findByEmail).mockResolvedValue(membresiaFalsa());
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(true);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ id: "usuario-1" }));

    const resultado = await login("ana@empresa.local", "clave-correcta");

    expect(resultado.accessToken).toBe("access.jwt.fake");
    expect(resultado.user).toEqual({
      id: "usuario-1",
      nombre: "Ana",
      correo: "ana@crm.local",
      rol: "VENDEDOR",
    });
    expect(jwtLib.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: "usuario-1", membresiaId: "membresia-1", empresaId: "empresa-1" }),
    );
    expect(refreshTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usuario-1", membresiaId: "membresia-1" }),
    );
  });

  it("rechaza con credenciales_invalidas (mismo mensaje) cuando ninguna tabla tiene ese correo", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(membresiaRepository.findByEmail).mockResolvedValue(null);

    await expect(login("nadie@empresa.local", "clave")).rejects.toMatchObject({
      code: "credenciales_invalidas",
      statusHttp: 401,
    });
    expect(passwordLib.verifyPassword).not.toHaveBeenCalled();
  });

  it("rechaza con credenciales_invalidas cuando la contraseña de la Membresia es incorrecta", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(membresiaRepository.findByEmail).mockResolvedValue(membresiaFalsa());
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(false);

    await expect(login("ana@empresa.local", "clave-mala")).rejects.toMatchObject({
      code: "credenciales_invalidas",
      statusHttp: 401,
    });
  });

  it("rechaza con credenciales_invalidas cuando la Membresia no tiene passwordHash (backfill Fase 1, nunca autentica)", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(membresiaRepository.findByEmail).mockResolvedValue(
      membresiaFalsa({ passwordHash: null }),
    );

    await expect(login("ana@empresa.local", "cualquier-clave")).rejects.toMatchObject({
      code: "credenciales_invalidas",
    });
    expect(passwordLib.verifyPassword).not.toHaveBeenCalled();
  });

  it("rechaza con credenciales_invalidas cuando el Usuario dueño de la Membresia ya no está activo", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(membresiaRepository.findByEmail).mockResolvedValue(membresiaFalsa());
    vi.mocked(passwordLib.verifyPassword).mockResolvedValue(true);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(
      usuarioFalso({ id: "usuario-1", activo: false }),
    );

    await expect(login("ana@empresa.local", "clave-correcta")).rejects.toMatchObject({
      code: "credenciales_invalidas",
    });
  });
});

describe("auth.service.refresh", () => {
  it("rota el par cuando el refresh token es válido y vigente", async () => {
    const token = "refresh-vigente";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-anterior",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token),
    );
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso());
    vi.mocked(refreshTokenRepository.rotate).mockResolvedValue(
      filaRefreshFalsa("refresh.jwt.fake", { jti: "nuevo-jti" }),
    );

    const resultado = await refresh(token);

    expect(resultado.accessToken).toBe("access.jwt.fake");
    expect(resultado.refreshToken).toBe("refresh.jwt.fake");
    expect(refreshTokenRepository.rotate).toHaveBeenCalledWith({
      previousJti: "jti-anterior",
      newToken: expect.objectContaining({ jti: expect.any(String), usuarioId: "usuario-1" }),
    });
  });

  it("D-D: revoca toda la familia del usuario si el jti ya estaba revocado (reutilización)", async () => {
    const token = "refresh-reutilizado";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-robado",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token, { jti: "jti-robado", revocadoEn: new Date() }),
    );

    await expect(refresh(token)).rejects.toMatchObject({
      code: "token_invalido",
      statusHttp: 401,
    });
    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
      "usuario-1",
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(refreshTokenRepository.rotate).not.toHaveBeenCalled();
  });

  it("rechaza un refresh token cuya fila expiró", async () => {
    const token = "refresh-expirado";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-anterior",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token, { expiraEn: new Date(Date.now() - 1000) }),
    );

    await expect(refresh(token)).rejects.toMatchObject({ code: "token_invalido" });
    expect(refreshTokenRepository.rotate).not.toHaveBeenCalled();
  });

  it("rechaza cuando el hash del token no coincide con la fila (enlace D-B)", async () => {
    const token = "refresh-con-hash-distinto";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-anterior",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa("otro-token-distinto"),
    );

    await expect(refresh(token)).rejects.toMatchObject({ code: "token_invalido" });
  });

  it("rechaza cuando el usuario ya no está activo (D4 aplicado también en refresh)", async () => {
    const token = "refresh-usuario-inactivo";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-anterior",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token),
    );
    vi.mocked(usuarioRepository.findById).mockResolvedValue(
      usuarioFalso({ activo: false }),
    );

    await expect(refresh(token)).rejects.toMatchObject({ code: "token_invalido" });
    expect(refreshTokenRepository.rotate).not.toHaveBeenCalled();
  });

  it("rechaza un refresh token con firma inválida sin tocar el repositorio", async () => {
    vi.mocked(jwtLib.verifyRefreshToken).mockRejectedValue(new Error("firma inválida"));

    await expect(refresh("token-malformado")).rejects.toMatchObject({
      code: "token_invalido",
    });
    expect(refreshTokenRepository.findByJti).not.toHaveBeenCalled();
  });

  it("rechaza un jti inexistente en la tabla", async () => {
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-fantasma",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(null);

    await expect(refresh("token-cualquiera")).rejects.toMatchObject({
      code: "token_invalido",
    });
  });
});

describe("auth.service.logout", () => {
  it("revoca el jti cuando el refresh pertenece al usuario autenticado (D-E)", async () => {
    const token = "refresh-propio";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-1",
      jti: "jti-propio",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token, { jti: "jti-propio", usuarioId: "usuario-1" }),
    );

    await logout("usuario-1", token);

    expect(refreshTokenRepository.revoke).toHaveBeenCalledWith("jti-propio");
  });

  it("no revoca (pero tampoco falla) cuando el refresh pertenece a otro usuario", async () => {
    const token = "refresh-ajeno";
    vi.mocked(jwtLib.verifyRefreshToken).mockResolvedValue({
      sub: "usuario-2",
      jti: "jti-ajeno",
      type: "refresh",
    } as never);
    vi.mocked(refreshTokenRepository.findByJti).mockResolvedValue(
      filaRefreshFalsa(token, { jti: "jti-ajeno", usuarioId: "usuario-2" }),
    );

    await expect(logout("usuario-1", token)).resolves.toBeUndefined();
    expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
  });

  it("es idempotente cuando el token es inválido o inexistente (sin oráculo)", async () => {
    vi.mocked(jwtLib.verifyRefreshToken).mockRejectedValue(new Error("inválido"));

    await expect(logout("usuario-1", "token-basura")).resolves.toBeUndefined();
    expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
  });
});

