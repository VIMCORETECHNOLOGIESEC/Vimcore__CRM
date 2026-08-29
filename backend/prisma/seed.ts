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
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Datos de
 * demostración"): dos empresas del mismo tenant holding -- esta instancia no
 * tiene un modelo `Holding` separado (`schema.prisma::Empresa`), así que
 * "mismo tenant holding" simplemente significa "dos filas `Empresa` en el
 * mismo despliegue", sin nada adicional que sembrar para eso. Ids fijos
 * (mismo patrón que `EMPRESA_BOOTSTRAP_ID` arriba) para que reejecutar el
 * seed sea idempotente.
 */
const EMPRESA_D0_A_ID = "00000000-0000-0000-0000-0000000000a1";
const EMPRESA_D0_B_ID = "00000000-0000-0000-0000-0000000000b1";

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

    // Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Datos de
    // demostración"): dos empresas del mismo tenant holding, cada una con
    // una credencial de login company-scoped propia (`Membresia.correo` --
    // dual-login-routing, Bloque B), y un bridge + un lead propios y
    // distinguibles -- para poder iniciar sesión por separado como Empresa A
    // / Empresa B y comprobar visualmente que cada sesión solo ve lo suyo.
    const empresasDemoD0 = [
      {
        empresaId: EMPRESA_D0_A_ID,
        empresaNombre: "Empresa A (demo D0)",
        usuarioNombre: "Empresa A Demo",
        usuarioCorreo: "empresa-a-demo@crm.local",
        membresiaCorreo: "empresa-a@crm.local",
        bridgeNombre: "Bridge Empresa A (demo D0)",
        clienteNombre: "Cliente Empresa A (demo D0)",
        clienteTelefono: "+10000000001",
        // tema-empresarial-integracion (Parte 2): paleta cálida terracota,
        // deliberadamente distinta tanto de Empresa B (fría, abajo) como del
        // default global de la instancia (`CONFIGURACION_EMPRESA_DEFAULT`,
        // indigo/azul `#1e2a5e`/`#2563eb`) — para poder demostrar el theming
        // real por empresa al loguearse como cada una.
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
      },
      {
        empresaId: EMPRESA_D0_B_ID,
        empresaNombre: "Empresa B (demo D0)",
        usuarioNombre: "Empresa B Demo",
        usuarioCorreo: "empresa-b-demo@crm.local",
        membresiaCorreo: "empresa-b@crm.local",
        bridgeNombre: "Bridge Empresa B (demo D0)",
        clienteNombre: "Cliente Empresa B (demo D0)",
        clienteTelefono: "+10000000002",
        // Paleta fría verde esmeralda -- distinta de Empresa A y del default global.
        colorPrimario: "#065f46",
        colorSecundario: "#10b981",
      },
    ] as const;

    for (const demo of empresasDemoD0) {
      await prisma.empresa.upsert({
        where: { id: demo.empresaId },
        update: { colorPrimario: demo.colorPrimario, colorSecundario: demo.colorSecundario },
        create: {
          id: demo.empresaId,
          nombre: demo.empresaNombre,
          colorPrimario: demo.colorPrimario,
          colorSecundario: demo.colorSecundario,
        },
      });

      // Usuario "portador" de la membresía company-scoped -- su propio
      // `Usuario.correo` no se usa para iniciar sesión en esta demo (eso
      // sería un login holding-wide); el login de Empresa A/B real es
      // `membresiaCorreo`, resuelto por el segundo camino de
      // `auth.service.ts::login` (`Membresia.correo`, solo si no matchea
      // ningún `Usuario.correo` primero).
      const usuarioDemo = await prisma.usuario.upsert({
        where: { correo: demo.usuarioCorreo },
        update: {},
        create: {
          nombre: demo.usuarioNombre,
          correo: demo.usuarioCorreo,
          passwordHash,
          rol: "ASESOR",
        },
      });

      await prisma.membresia.upsert({
        where: {
          usuarioId_empresaId_rol: {
            usuarioId: usuarioDemo.id,
            empresaId: demo.empresaId,
            rol: "ASESOR",
          },
        },
        update: { correo: demo.membresiaCorreo, passwordHash, activa: true },
        create: {
          usuarioId: usuarioDemo.id,
          empresaId: demo.empresaId,
          rol: "ASESOR",
          correo: demo.membresiaCorreo,
          passwordHash,
          activa: true,
        },
      });

      const bridgeExistente = await prisma.bridge.findFirst({
        where: { nombre: demo.bridgeNombre },
      });
      if (!bridgeExistente) {
        const claveApi = generarClaveBridge();
        await prisma.bridge.create({
          data: {
            redSocial: "GOOGLE_FORMS",
            nombre: demo.bridgeNombre,
            claveApiHash: hashClaveBridge(claveApi),
            estado: "INACTIVO",
            empresaId: demo.empresaId,
          },
        });
        console.log(`Bridge ${demo.bridgeNombre} — X-Bridge-Key: ${claveApi}`);
      }

      const cliente = await prisma.cliente.upsert({
        where: { telefonoNormalizado: demo.clienteTelefono },
        update: {},
        create: {
          nombre: demo.clienteNombre,
          telefonoOriginal: demo.clienteTelefono,
          telefonoNormalizado: demo.clienteTelefono,
          telefonoValido: true,
        },
      });

      const leadExistente = await prisma.lead.findFirst({
        where: { clienteId: cliente.id, empresaId: demo.empresaId },
      });
      if (!leadExistente) {
        await prisma.lead.create({
          data: {
            clienteId: cliente.id,
            empresaId: demo.empresaId,
            origen: "NUEVO",
            ingresadoEn: new Date(),
          },
        });
      }
    }

    console.log(
      `Semillas aplicadas: ${usuarios.length} usuarios (uno por rol) + ${usuariosParaMembresia.length} membresias (Bloque B) + 3 bridges + ` +
        `Bloque D0 (${empresasDemoD0.length} empresas demo, ${empresasDemoD0.length} membresías company-scoped, ${empresasDemoD0.length} bridges, ${empresasDemoD0.length} leads).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al aplicar semillas:", error);
  process.exit(1);
});

