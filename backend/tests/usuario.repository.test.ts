import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";

afterAll(async () => {
  await prisma.$disconnect();
});

// crm-gateway-proxy (CRM Gateway Trust, "Tenant and User Identity Resolution
// From Forwarded Ids"): lookup usado por `requireGatewayTrust` para resolver
// el `Usuario` linkeado a partir del id de Auth reenviado por el Gateway.
describe("usuario.repository::findByAuthUserId", () => {
  it("resuelve un Usuario linkeado por su authUserId", async () => {
    const authUserId = randomUUID();
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Usuario gateway trust",
        correo: `usuario-gateway-trust-${randomUUID()}@integracion.test`,
        passwordHash: "x",
        rol: "ADMINISTRADOR",
        authUserId,
      },
    });

    const encontrado = await usuarioRepository.findByAuthUserId(authUserId);

    expect(encontrado?.id).toBe(usuario.id);
  });

  it("devuelve null cuando ningún Usuario tiene ese authUserId (identidad no vinculada)", async () => {
    const encontrado = await usuarioRepository.findByAuthUserId(randomUUID());

    expect(encontrado).toBeNull();
  });
});
