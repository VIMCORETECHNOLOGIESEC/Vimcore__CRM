import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
 * Guarda de seguridad no negociable, TRES pasos independientes, en orden:
 * 0. Forzar `.env.dev` (raíz del repo) por encima de CUALQUIER variable ya
 *    presente en `process.env` -- ver `forzarEnvDev()` más abajo. Esto es
 *    lo que hace que los pasos 1 y 2 sean confiables sin depender de con
 *    qué `--env-file` se haya levantado `docker compose`.
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
 * Mismo día, hallazgo posterior: `.env` (raíz, gitignored) puede tener
 * `DATABASE_URL` apuntando a Azure/producción, y `docker-compose.yml`
 * (servicio `backend`) inyecta `${DATABASE_URL}` resuelto por Docker Compose
 * desde CUALQUIER env-file usado en `docker compose up` (default: `.env` si
 * no se pasa `--env-file`). Los chequeos (1)/(2) por sí solos ya lo
 * hubieran abortado, pero para no depender de "el humano se acordó de pasar
 * `--env-file .env.dev`", el paso (0) fuerza `.env.dev` sin condición antes
 * de evaluarlos -- defensa en profundidad, no reemplaza los otros dos.
 *
 * Riesgo residual documentado (D-H): la suite destruye los datos sembrados.
 * Ejecuta `pnpm --filter backend exec prisma db seed` de nuevo después de
 * correr las pruebas si necesitas los usuarios de desarrollo.
 */
const ALLOWED_TEST_DB_HOSTS = new Set(["db", "localhost", "127.0.0.1", "::1"]);

/** Ruta a `.env.dev` en la raíz del repo, resuelta relativa a este archivo
 * (no al cwd) para que funcione sin importar desde dónde se invoque vitest. */
const ENV_DEV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.dev");

/**
 * Parser manual mínimo de `.env.dev` (sin agregar `dotenv` como dependencia
 * nueva para algo así de chico). A diferencia de `process.loadEnvFile()` de
 * Node -- que NO pisa keys ya presentes en `process.env`, mismo comportamiento
 * que `--env-file` -- esta función SOBREESCRIBE sin condición cada key que
 * encuentra, porque `DATABASE_URL` (y el resto) puede llegar ya poblado por
 * Docker Compose con el `.env` equivocado y necesitamos ganarle sí o sí.
 *
 * Excepción: `NODE_ENV`. `.env.dev` trae `NODE_ENV=development` (uso normal
 * de desarrollo), pero vitest ya setea `process.env.NODE_ENV = "test"` por su
 * cuenta -- si lo pisáramos con "development" nos rompemos el chequeo (1)
 * nosotros mismos. Se ignora esa key acá y se refuerza explícitamente al
 * final, así el estado resultante es siempre "test" sin importar qué diga
 * `.env.dev`.
 */
function forzarEnvDev(): void {
  let contenido: string;
  try {
    contenido = readFileSync(ENV_DEV_PATH, "utf-8");
  } catch {
    // eslint-disable-next-line no-console
    console.error(`Abortado: no se pudo leer "${ENV_DEV_PATH}" — las pruebas requieren .env.dev en la raíz del repo.`);
    process.exit(1);
  }

  for (const linea of contenido.split("\n")) {
    const recortada = linea.trim();
    if (recortada === "" || recortada.startsWith("#")) continue;

    const indiceIgual = recortada.indexOf("=");
    if (indiceIgual === -1) continue;

    const clave = recortada.slice(0, indiceIgual).trim();
    if (clave === "" || clave === "NODE_ENV") continue;

    let valor = recortada.slice(indiceIgual + 1).trim();
    const envuelveEnComillas =
      (valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"));
    if (envuelveEnComillas && valor.length >= 2) {
      valor = valor.slice(1, -1);
    }

    // `.env.dev` deja en blanco varias integraciones opcionales (LinkedIn,
    // WhatsApp OAuth redirect, Meta Ads redirect, META_GRAPH_API_BASE_URL --
    // este último usado por config/env.ts como `z.string().min(1).optional()`,
    // ver meta-webhook.service.ts). Para ese esquema, "unset" (undefined) y
    // "" NO son equivalentes: `.optional()` acepta lo primero pero `.min(1)`
    // rechaza lo segundo. `docker-compose.yml` (el normal, no el de QA) nunca
    // inyecta `META_GRAPH_API_BASE_URL` -- queda `undefined` a propósito. Si
    // acá copiáramos el `""` de `.env.dev` tal cual, se lo estaríamos
    // forzando distinto de cómo lo ve la app hoy y tumbaríamos la validación
    // de config/env.ts en decenas de archivos de test (confirmado corriendo
    // la suite). Por eso una key en blanco en `.env.dev` se trata como "no
    // configurada" y se borra en vez de copiarse como cadena vacía -- el
    // resto de las keys (DATABASE_URL, NODE_ENV, etc.) sigue pisándose sin
    // condición.
    if (valor === "") {
      delete process.env[clave];
      continue;
    }

    process.env[clave] = valor;
  }

  process.env.NODE_ENV = "test";
}

export default async function setup(): Promise<void> {
  forzarEnvDev();

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
