import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/lib/password.js";

/**
 * Bootstrap de producción — DISTINTO de `seed.ts` a propósito: `seed.ts`
 * aborta si `NODE_ENV === "production"` (siembra datos de desarrollo, nunca
 * para un despliegue real). Este script es exactamente lo opuesto: solo
 * crea los dos usuarios holding-wide iniciales (director general y
 * administrador de sistemas) para que exista una primera cuenta con la cual
 * loguearse — `POST /usuarios` siempre exige ya estar autenticado como
 * ADMINISTRADOR, así que sin esto no hay forma de crear ningún usuario por
 * la API en una base de datos recién desplegada.
 *
 * Ninguno de los dos usuarios recibe ninguna `Membresia` — `Usuario.rol`
 * (SUPERVISOR_HOLDING/SUPER_ADMIN, Bloque F) alcanza para el acceso
 * holding-wide, y `auth.service.ts::login` ya resuelve `empresaId: null`
 * (sessionScope "holding") para cualquier Usuario sin Membresia asociada —
 * no hace falta ninguna fila de `Empresa` ni ningún modelo "Holding" (no
 * existe como tabla, es puramente conceptual, ver comentario de
 * `seed.ts::EMPRESA_D0_A_ID`).
 *
 * Idempotente (`upsert` por `correo`) — correr esto más de una vez no
 * duplica ni rompe nada, solo actualiza el hash si cambia la contraseña de
 * entorno.
 *
 * Uso (dentro del contenedor ya desplegado, nunca desde una máquina local
 * contra la DB de producción):
 *   az containerapp exec --name <container-app> --resource-group <rg> \
 *     --command "pnpm exec tsx prisma/bootstrap-produccion.ts"
 * con BOOTSTRAP_PASSWORD_HOLDING/BOOTSTRAP_PASSWORD_SISTEMAS ya exportadas
 * en el entorno del contenedor (nunca hardcodeadas acá).
 */

const bootstrapEnvSchema = z.object({
  BOOTSTRAP_PASSWORD_HOLDING: z.string().min(12, "BOOTSTRAP_PASSWORD_HOLDING: mínimo 12 caracteres"),
  BOOTSTRAP_PASSWORD_SISTEMAS: z.string().min(12, "BOOTSTRAP_PASSWORD_SISTEMAS: mínimo 12 caracteres"),
});

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const env = bootstrapEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error(
      `Bootstrap abortado — variables de entorno inválidas: ${env.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
    process.exit(1);
  }

  const [passwordHoldingHash, passwordSistemasHash] = await Promise.all([
    hashPassword(env.data.BOOTSTRAP_PASSWORD_HOLDING),
    hashPassword(env.data.BOOTSTRAP_PASSWORD_SISTEMAS),
  ]);

  const directorGeneral = await prisma.usuario.upsert({
    where: { correo: "directorgeneral@alimcogroup.com" },
    update: { passwordHash: passwordHoldingHash, rol: "SUPERVISOR_HOLDING", activo: true },
    create: {
      nombre: "Director General",
      correo: "directorgeneral@alimcogroup.com",
      passwordHash: passwordHoldingHash,
      rol: "SUPERVISOR_HOLDING",
      activo: true,
    },
  });

  const adminSistemas = await prisma.usuario.upsert({
    where: { correo: "admin@vimcoretechnologies.com" },
    update: { passwordHash: passwordSistemasHash, rol: "SUPER_ADMIN", activo: true },
    create: {
      nombre: "Administrador de Sistemas",
      correo: "admin@vimcoretechnologies.com",
      passwordHash: passwordSistemasHash,
      rol: "SUPER_ADMIN",
      activo: true,
    },
  });

  console.log(
    `Bootstrap aplicado: ${directorGeneral.correo} (SUPERVISOR_HOLDING), ${adminSistemas.correo} (SUPER_ADMIN).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Error al aplicar el bootstrap de producción:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
