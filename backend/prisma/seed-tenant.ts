import type { PrismaClient, RolMembresia, RolUsuario } from "@prisma/client";

/**
 * Bloque B (Fase 5, diseño "seed.ts strategy"): mismo id fijo que el
 * bootstrap de la migración `bloque_b_tenant_fundacion` — el seed de
 * desarrollo REUTILIZA esa misma `Empresa`, nunca crea una segunda.
 */
export const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

export interface UsuarioParaMembresia {
  id: string;
  rol: RolUsuario;
}

/**
 * Mapeo FIJO, idéntico al backfill de producción (spec membership-backfill,
 * `migration.sql` de `bloque_b_tenant_fundacion`): ADMINISTRADOR/SUPERVISOR
 * 1:1; VENDEDOR -> ASESOR con `habilitadoParaVenta:true`; ASESOR -> ASESOR
 * con `habilitadoParaVenta:false`.
 */
function membresiaDesdeRolUsuario(rol: RolUsuario): {
  rol: RolMembresia;
  habilitadoParaVenta: boolean;
} {
  switch (rol) {
    case "ADMINISTRADOR":
      return { rol: "ADMINISTRADOR", habilitadoParaVenta: false };
    case "SUPERVISOR":
      return { rol: "SUPERVISOR", habilitadoParaVenta: false };
    case "VENDEDOR":
      return { rol: "ASESOR", habilitadoParaVenta: true };
    case "ASESOR":
      return { rol: "ASESOR", habilitadoParaVenta: false };
  }
}

/**
 * Extraído de `seed.ts::main()` para ser testeable en aislamiento (importar
 * `seed.ts` directamente ejecutaría su `main()` de tope de módulo, que exige
 * `SEED_PASSWORD`/`SEED_BRIDGE_CLAVE_API` y llama `process.exit`). Idempotente
 * de punta a punta — upsert por clave natural en ambos pasos: reejecutar
 * `prisma db seed` nunca duplica la Empresa bootstrap ni las Membresia por
 * usuario. `correo`/`passwordHash` de `Membresia` quedan NULL — el seed de
 * desarrollo no escribe credenciales de `Membresia` en este cambio.
 */
export async function seedTenant(
  prisma: PrismaClient,
  usuarios: readonly UsuarioParaMembresia[],
): Promise<void> {
  await prisma.empresa.upsert({
    where: { id: BOOTSTRAP_EMPRESA_ID },
    update: {},
    create: { id: BOOTSTRAP_EMPRESA_ID, nombre: "Empresa Bootstrap" },
  });

  for (const usuario of usuarios) {
    const { rol, habilitadoParaVenta } = membresiaDesdeRolUsuario(usuario.rol);

    await prisma.membresia.upsert({
      where: {
        usuarioId_empresaId_rol: {
          usuarioId: usuario.id,
          empresaId: BOOTSTRAP_EMPRESA_ID,
          rol,
        },
      },
      update: {},
      create: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol,
        habilitadoParaVenta,
      },
    });
  }
}

