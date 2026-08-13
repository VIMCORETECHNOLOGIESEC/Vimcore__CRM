import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/lib/jwt.js";

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

describe("lib/jwt", () => {
  it("firma y verifica un access token de ida y vuelta", async () => {
    const token = await signAccessToken({ id: "user-1", rol: "ADMINISTRADOR" });

    const payload = await verifyAccessToken(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.rol).toBe("ADMINISTRADOR");
    expect(payload.type).toBe("access");
  });

  it("firma y verifica un refresh token de ida y vuelta, con jti propio", async () => {
    const { token, jti, expiraEn } = await signRefreshToken({ id: "user-1" });

    const payload = await verifyRefreshToken(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.jti).toBe(jti);
    expect(payload.type).toBe("refresh");
    expect(expiraEn.getTime()).toBeGreaterThan(Date.now());
  });

  it("rechaza un access token presentado como refresh (claim type cruzado)", async () => {
    const token = await signAccessToken({ id: "user-1", rol: "VENDEDOR" });

    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });

  it("rechaza un refresh token presentado como access (claim type cruzado)", async () => {
    const { token } = await signRefreshToken({ id: "user-1" });

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza un token firmado con un issuer distinto", async () => {
    const token = await new SignJWT({ type: "access", rol: "VENDEDOR" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("otro-emisor")
      .setAudience("crm-api")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretKey);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza un token firmado con una audience distinta", async () => {
    const token = await new SignJWT({ type: "access", rol: "VENDEDOR" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("crm-embudo-leads")
      .setAudience("otra-audiencia")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretKey);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza un token expirado", async () => {
    const token = await new SignJWT({ type: "access", rol: "VENDEDOR" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("crm-embudo-leads")
      .setAudience("crm-api")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secretKey);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("cada refresh token recibe un jti distinto salvo que se fuerce uno", async () => {
    const a = await signRefreshToken({ id: "user-1" });
    const b = await signRefreshToken({ id: "user-1" });
    expect(a.jti).not.toBe(b.jti);

    const forced = randomUUID();
    const c = await signRefreshToken({ id: "user-1", jti: forced });
    expect(c.jti).toBe(forced);
  });
});
