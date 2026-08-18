import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { hashPassword } from "../src/lib/password.js";

/**
 * D11, D-G: la contraseña de semillas NUNCA está en el código ni en
 * `.env.example` con valor. Validación propia, fuera de `src/config/env.ts`
 * (D-G) — `env.ts` es configuración de runtime del servidor y aborta el
 * proceso principal si falta algo; `SEED_PASSWORD`/`SEED_BRIDGE_CLAVE_API`
 * solo las usa este script de desarrollo, que ni siquiera importa `app.ts`.
 *
 * Local:
 *   1) copia `.env.example` a `.env`
 *   2) define `SEED_PASSWORD=<mínimo 12 caracteres>` y
 *      `SEED_BRIDGE_CLAVE_API=<mínimo 20 caracteres>`
 *   3) `docker compose exec backend pnpm exec prisma db seed`
 */
const seedEnvSchema = z.object({
  SEED_PASSWORD: z.string().min(12, "SEED_PASSWORD: mínimo 12 caracteres"),
  SEED_BRIDGE_CLAVE_API: z
    .string()
    .min(20, "SEED_BRIDGE_CLAVE_API: mínimo 20 caracteres"),
});

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Semillas abortadas — nunca se siembran datos de desarrollo en producción.");
    process.exit(1);
  }

  const seedEnv = seedEnvSchema.safeParse(process.env);
  if (!seedEnv.success) {
    console.error(
      `Semillas abortadas — falta SEED_PASSWORD válida: ${seedEnv.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(seedEnv.data.SEED_PASSWORD);
  const prisma = new PrismaClient();

  try {
    const usuarios = [
      { nombre: "Administrador Demo", correo: "admin@crm.local", rol: "ADMINISTRADOR" as const },
      { nombre: "Supervisor Demo", correo: "supervisor@crm.local", rol: "SUPERVISOR" as const },
      { nombre: "Asesor Demo", correo: "asesor@crm.local", rol: "ASESOR" as const },
      { nombre: "Vendedor Demo", correo: "vendedor@crm.local", rol: "VENDEDOR" as const },
    ];

    for (const usuario of usuarios) {
      // upsert por correo (idempotente): re-ejecutar el script no duplica.
      await prisma.usuario.upsert({
        where: { correo: usuario.correo },
        update: {},
        create: { ...usuario, passwordHash },
      });
    }

    // docs/05-bridges.md §6: bridge de pruebas Google Forms, INACTIVO por
    // defecto — un administrador lo activa explícitamente cuando lo conecte.
    await prisma.bridge.upsert({
      where: { claveApiHash: hashClaveBridge(seedEnv.data.SEED_BRIDGE_CLAVE_API) },
      update: {},
      create: {
        redSocial: "GOOGLE_FORMS",
        nombre: "Google Forms (pruebas)",
        claveApiHash: hashClaveBridge(seedEnv.data.SEED_BRIDGE_CLAVE_API),
        estado: "INACTIVO",
      },
    });

    console.log(`Semillas aplicadas: ${usuarios.length} usuarios (uno por rol) + 1 bridge.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al aplicar semillas:", error);
  process.exit(1);
});
