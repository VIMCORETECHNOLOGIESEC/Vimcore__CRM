import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as bridgeLogRepository from "../src/repositories/bridge-log.repository.js";

describe("repositories/bridge-log — registrarLog (M4, PR2)", () => {
  it("escribe una fila de bitacora contra el cliente global, sin bridge asociado (fallo de autenticacion)", async () => {
    await bridgeLogRepository.registrarLog({
      bridgeId: null,
      nivel: "ERROR",
      mensaje: "X-Bridge-Key ausente o invalida",
      payload: { headers: { "x-bridge-key": null } },
    });

    const fila = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, mensaje: "X-Bridge-Key ausente o invalida" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(fila).not.toBeNull();
    expect(fila?.nivel).toBe("ERROR");
    expect(fila?.payload).toMatchObject({ headers: { "x-bridge-key": null } });
  });

  it("persiste sin payload cuando no se provee ninguno", async () => {
    await bridgeLogRepository.registrarLog({ bridgeId: null, nivel: "INFO", mensaje: "sin payload" });

    const fila = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, mensaje: "sin payload" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(fila?.payload).toBeNull();
  });

  it(
    "DD5 (diseño M4): pasar un cliente de transaccion a registrarLog es un error de tipos, " +
      "no una convencion — prueba de compilacion, sin aserciones en tiempo de ejecucion",
    async () => {
      await prisma.$transaction(async (tx) => {
        // @ts-expect-error — DD5: registrarLog nunca acepta un segundo
        // argumento de cliente/transaccion; siempre ata al `prisma` global.
        await bridgeLogRepository.registrarLog(
          { bridgeId: null, nivel: "INFO", mensaje: "no deberia compilar" },
          tx,
        );
      });
    },
  );
});
