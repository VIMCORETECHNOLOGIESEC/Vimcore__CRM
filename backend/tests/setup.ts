/**
 * `globalSetup` de vitest (D-H). Corre una sola vez antes de toda la
 * suite. Trunca `refresh_tokens`, `usuarios`, `clientes` y `bridges` contra
 * la BD real de compose para que cada corrida arranque desde un estado
 * limpio y determinista. `clientes CASCADE` arrastra también
 * `correos_cliente`, `leads` y `lead_eventos` (M3); `bridges CASCADE`
 * arrastra `bridge_logs` y `leads_recibidos` (M4) — todo lo que cuelga por
 * FK desaparece igual, aunque no se nombre explícitamente en la sentencia.
 *
 * Guarda de seguridad no negociable: si `NODE_ENV !== "test"`, el proceso
 * aborta ANTES de tocar la base de datos. Sin esta guarda, un `pnpm test`
 * distraído contra `.env` de desarrollo borraría datos reales.
 *
 * Riesgo residual documentado (D-H): la suite destruye los datos sembrados.
 * Ejecuta `pnpm --filter backend exec prisma db seed` de nuevo después de
 * correr las pruebas si necesitas los usuarios de desarrollo.
 */
export default async function setup(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(
      `Abortado: NODE_ENV="${process.env.NODE_ENV}" — las pruebas de integración solo corren con NODE_ENV=test (D-H).`,
    );
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "refresh_tokens", "usuarios", "clientes", "bridges" CASCADE',
    );
  } finally {
    await prisma.$disconnect();
  }
}
