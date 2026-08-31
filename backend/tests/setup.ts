/**
 * `globalSetup` de vitest (D-H). Corre una sola vez antes de toda la
 * suite. Trunca `refresh_tokens`, `usuarios`, `clientes`, `bridges` y
 * `configuracion_empresa` contra la BD real de compose para que cada corrida
 * arranque desde un estado limpio y determinista. `clientes CASCADE` arrastra
 * también `correos_cliente`, `leads` y `lead_eventos` (M3); `bridges CASCADE`
 * arrastra `bridge_logs` y `leads_recibidos` (M4) — todo lo que cuelga por
 * FK desaparece igual, aunque no se nombre explícitamente en la sentencia.
 * `configuracion_empresa` (integración tema-empresarial) es una tabla
 * singleton sin FK con nada más — se trunca aparte para que el caso de
 * "lazy init sin fila previa" sea reproducible en cada corrida.
 *
 * Guarda de seguridad no negociable, DOS chequeos independientes:
 * 1. Si `NODE_ENV !== "test"`, el proceso aborta ANTES de tocar la base.
 * 2. Allowlist de host de `DATABASE_URL` (`db`/`localhost`/`127.0.0.1`/
 *    `::1` -- los únicos hosts de desarrollo/test de este proyecto, ver
 *    `.env.dev`). Falla CERRADO: cualquier host que no esté en la lista
 *    aborta, incluido un typo o un host nuevo no contemplado -- nunca se
 *    intenta adivinar "esto parece producción", se exige coincidencia
 *    exacta con lo conocido como seguro.
 *
 * Incidente real (2026-08-31): el chequeo (1) solo, sin (2), no evitó que
 * este TRUNCATE corriera contra la base de producción real -- confirmado
 * por filas de fixture de test (`usuario-seed-N-*@t.local`) apareciendo ahí.
 * Sin datos reales todavía en ese momento (fase de pruebas), pero el hueco
 * era real: `NODE_ENV=test` con `DATABASE_URL` apuntando a Azure en vez de
 * a `.env.dev` pasaba esta guarda sin problema.
 *
 * Riesgo residual documentado (D-H): la suite destruye los datos sembrados.
 * Ejecuta `pnpm --filter backend exec prisma db seed` de nuevo después de
 * correr las pruebas si necesitas los usuarios de desarrollo.
 */
const ALLOWED_TEST_DB_HOSTS = new Set(["db", "localhost", "127.0.0.1", "::1"]);

export default async function setup(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(
      `Abortado: NODE_ENV="${process.env.NODE_ENV}" — las pruebas de integración solo corren con NODE_ENV=test (D-H).`,
    );
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    // eslint-disable-next-line no-console
    console.error("Abortado: DATABASE_URL ausente o no es una URL válida — no se puede validar el host antes de truncar.");
    process.exit(1);
  }
  if (!ALLOWED_TEST_DB_HOSTS.has(host)) {
    // eslint-disable-next-line no-console
    console.error(
      `Abortado: DATABASE_URL apunta a host "${host}", fuera de la allowlist de test/dev (${[...ALLOWED_TEST_DB_HOSTS].join(", ")}). ` +
        "Usá .env.dev, nunca el .env de la raíz (referencia de Azure/producción) para correr tests.",
    );
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "refresh_tokens", "usuarios", "clientes", "bridges", "configuracion_empresa" CASCADE',
    );
  } finally {
    await prisma.$disconnect();
  }
}
