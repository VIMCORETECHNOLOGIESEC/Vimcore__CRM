import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generarClaveBridge, hashClaveBridge } from "../src/lib/clave-bridge.js";
import { hashPassword } from "../src/lib/password.js";
import { seedTenant, type UsuarioParaMembresia } from "./seed-tenant.js";

/**
 * Bloque C (Etapa 3 — fix pre-existente, no relacionado a esta etapa): mismo
 * id fijo que `tests/fixtures/empresa.ts::EMPRESA_BOOTSTRAP_ID` — la
 * migración `20260827113454_bloque_c_empresa_id_not_null` (previa a este
 * cambio) volvió `bridges.empresa_id` NOT NULL pero este script nunca se
 * actualizó; sin este id, `prisma.bridge.upsert`/`create` fallaban con
 * "Argument `empresa` is missing" en toda corrida de siembra.
 */
const EMPRESA_BOOTSTRAP_ID = "00000000-0000-0000-0000-000000000001";

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

    // Bloque B (Fase 5, diseño "seed.ts strategy"): captura los ids/roles
    // reales de las filas upserteadas (incluida una fila ya existente de una
    // corrida previa) — `seedTenant` los necesita para el mapeo por usuario.
    const usuariosParaMembresia: UsuarioParaMembresia[] = [];
    for (const usuario of usuarios) {
      // upsert por correo (idempotente): re-ejecutar el script no duplica.
      const fila = await prisma.usuario.upsert({
        where: { correo: usuario.correo },
        update: {},
        create: { ...usuario, passwordHash },
      });
      usuariosParaMembresia.push({ id: fila.id, rol: fila.rol });
    }

    // Bloque B (Fase 5): Empresa bootstrap + una Membresia por usuario de
    // demo, mismo mapeo VENDEDOR->ASESOR que el backfill de producción.
    await seedTenant(prisma, usuariosParaMembresia);

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
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });

    // Bridges de pruebas Facebook/Instagram (docs/05-bridges.md §3): la clave
    // en claro solo existe en memoria durante la siembra, igual que en el
    // flujo real de creación — se imprime una única vez para uso manual de QA.
    const bridgesMeta = [
      { redSocial: "FACEBOOK" as const, nombre: "Facebook (pruebas)" },
      { redSocial: "INSTAGRAM" as const, nombre: "Instagram (pruebas)" },
    ];

    for (const bridge of bridgesMeta) {
      // findFirst + create (no upsert): la clave se genera de nuevo en cada
      // corrida, así que el hash nunca coincidiría con el de una fila previa.
      // Re-ejecutar el script no debe duplicar el bridge — se identifica por
      // nombre, que es exclusivo de este seed.
      const existente = await prisma.bridge.findFirst({ where: { nombre: bridge.nombre } });
      if (existente) {
        continue;
      }

      const claveApi = generarClaveBridge();
      await prisma.bridge.create({
        data: {
          redSocial: bridge.redSocial,
          nombre: bridge.nombre,
          claveApiHash: hashClaveBridge(claveApi),
          estado: "INACTIVO",
          empresaId: EMPRESA_BOOTSTRAP_ID,
        },
      });
      console.log(`Bridge ${bridge.nombre} — X-Bridge-Key: ${claveApi}`);
    }

    console.log(
      `Semillas aplicadas: ${usuarios.length} usuarios (uno por rol) + ${usuariosParaMembresia.length} membresias (Bloque B) + 3 bridges.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al aplicar semillas:", error);
  process.exit(1);
});

