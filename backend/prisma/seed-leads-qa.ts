import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/lib/password.js";

/**
 * Siembra manual de QA (no forma parte de `prisma db seed`): crea leads de
 * prueba repartidos en las 5 etapas del embudo (docs/02-reglas-negocio.md
 * §4), abiertos y cerrados, para ejercitar filtros/listado antes de simular
 * ingreso real vía bridges. Idempotente por `telefono_normalizado` — se
 * puede re-ejecutar sin duplicar.
 *
 * Autosuficiente: hace upsert de los asesores/vendedores que referencian los
 * fixtures de `LEADS` (nunca asume que ya existen por fuera de este script,
 * ni de `prisma/seed.ts` ni de altas manuales por la UI) usando el mismo
 * `SEED_PASSWORD` que `seed.ts`.
 *
 * Uso: docker compose exec backend pnpm exec tsx prisma/seed-leads-qa.ts
 */

const seedEnvSchema = z.object({
  SEED_PASSWORD: z.string().min(12, "SEED_PASSWORD: mínimo 12 caracteres"),
});

interface LeadFixture {
  telefono: string;
  nombre: string;
  redSocial: "FACEBOOK" | "INSTAGRAM" | "GOOGLE_FORMS";
  etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
  asesorCorreo: string;
  vendedorCorreo?: string;
  semaforo?: "ROJO" | "AMARILLO" | "VERDE";
  puntuacion?: number;
  diasIngreso: number;
  montoVenta?: number;
  productoServicio?: string;
  formaPago?: "CONTADO" | "CREDITO" | "FINANCIAMIENTO";
  observacionCierre?: string;
}

const LEADS: LeadFixture[] = [
  // Abiertos — Nuevo (responsable: asesor, sin calificar todavía)
  {
    telefono: "+50588880001",
    nombre: "Carla Rivas (QA)",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    asesorCorreo: "mateo@crm.local",
    diasIngreso: 0,
  },
  {
    telefono: "+50588880002",
    nombre: "Diego Salas (QA)",
    redSocial: "INSTAGRAM",
    etapa: "NUEVO",
    asesorCorreo: "mike@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 55,
    diasIngreso: 1,
  },
  // Abiertos — Contactado
  {
    telefono: "+50588880003",
    nombre: "Elena Mora (QA)",
    redSocial: "GOOGLE_FORMS",
    etapa: "CONTACTADO",
    asesorCorreo: "mateo@crm.local",
    semaforo: "VERDE",
    puntuacion: 85,
    diasIngreso: 2,
  },
  {
    telefono: "+50588880004",
    nombre: "Franco Núñez (QA)",
    redSocial: "FACEBOOK",
    etapa: "CONTACTADO",
    asesorCorreo: "mike@crm.local",
    semaforo: "ROJO",
    puntuacion: 25,
    diasIngreso: 2,
  },
  // Abiertos — Cita (responsable pasa a vendedor tras traspaso)
  {
    telefono: "+50588880005",
    nombre: "Gina Torres (QA)",
    redSocial: "INSTAGRAM",
    etapa: "CITA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 78,
    diasIngreso: 3,
  },
  {
    telefono: "+50588880006",
    nombre: "Hugo Paredes (QA)",
    redSocial: "GOOGLE_FORMS",
    etapa: "CITA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 60,
    diasIngreso: 3,
  },
  // Cerrados — Venta (terminal, requiere datos de cierre)
  {
    telefono: "+50588880007",
    nombre: "Irene Campos (QA)",
    redSocial: "FACEBOOK",
    etapa: "VENTA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 90,
    diasIngreso: 5,
    montoVenta: 1500,
    productoServicio: "Plan Premium",
    formaPago: "CONTADO",
  },
  {
    telefono: "+50588880008",
    nombre: "Julián Vega (QA)",
    redSocial: "INSTAGRAM",
    etapa: "VENTA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 95,
    diasIngreso: 6,
    montoVenta: 3200.5,
    productoServicio: "Plan Anual",
    formaPago: "CREDITO",
  },
  // Cerrados — No Venta (terminal, observación de cierre obligatoria)
  {
    telefono: "+50588880009",
    nombre: "Karla Solís (QA)",
    redSocial: "GOOGLE_FORMS",
    etapa: "NO_VENTA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "ROJO",
    puntuacion: 20,
    diasIngreso: 7,
    observacionCierre: "Cliente indicó que ya no está interesado por motivos de presupuesto.",
  },
  {
    telefono: "+50588880010",
    nombre: "Leo Duarte (QA)",
    redSocial: "FACEBOOK",
    etapa: "NO_VENTA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 45,
    diasIngreso: 4,
    observacionCierre: "No respondió a los intentos de contacto durante el plazo del SLA.",
  },
];

const ETAPAS_TERMINALES = new Set(["VENTA", "NO_VENTA"]);

function daysAgo(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

function nombreDesdeCorreo(correo: string): string {
  const usuario = correo.split("@")[0] ?? correo;
  return `${usuario.charAt(0).toUpperCase()}${usuario.slice(1)} (QA)`;
}

/**
 * Upsert de los asesores/vendedores que referencian los fixtures de `LEADS`
 * — nunca asume que ya existen por fuera de este script (ni por `seed.ts` ni
 * por altas manuales), para que el script sea reproducible desde una base
 * vacía sin pasos previos no documentados.
 */
async function ensureUsuarios(prisma: PrismaClient, passwordHash: string): Promise<void> {
  const porCorreo = new Map<string, "ASESOR" | "VENDEDOR">();
  for (const fixture of LEADS) {
    porCorreo.set(fixture.asesorCorreo, "ASESOR");
    if (fixture.vendedorCorreo) porCorreo.set(fixture.vendedorCorreo, "VENDEDOR");
  }

  for (const [correo, rol] of porCorreo) {
    await prisma.usuario.upsert({
      where: { correo },
      update: {},
      create: { nombre: nombreDesdeCorreo(correo), correo, rol, passwordHash },
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Siembra de QA abortada — nunca se siembran datos de prueba en producción.");
    process.exit(1);
  }

  const seedEnv = seedEnvSchema.safeParse(process.env);
  if (!seedEnv.success) {
    console.error(
      `Siembra de QA abortada — falta SEED_PASSWORD válida: ${seedEnv.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    await ensureUsuarios(prisma, await hashPassword(seedEnv.data.SEED_PASSWORD));

    let creados = 0;
    let existentes = 0;

    for (const fixture of LEADS) {
      const yaExiste = await prisma.cliente.findUnique({
        where: { telefonoNormalizado: fixture.telefono },
      });
      if (yaExiste) {
        existentes += 1;
        continue;
      }

      const asesor = await prisma.usuario.findUniqueOrThrow({ where: { correo: fixture.asesorCorreo } });
      const vendedor = fixture.vendedorCorreo
        ? await prisma.usuario.findUniqueOrThrow({ where: { correo: fixture.vendedorCorreo } })
        : null;

      const ingresadoEn = daysAgo(fixture.diasIngreso);
      const slaInicioEn = new Date(ingresadoEn.getTime() + 5 * 60 * 1000);
      const esTerminal = ETAPAS_TERMINALES.has(fixture.etapa);
      const cerradoEn = esTerminal ? new Date() : null;

      const eventos: Array<{
        tipo: "INGRESO" | "ASIGNACION" | "CAMBIO_ETAPA" | "TRASPASO" | "CIERRE";
        etapaAnterior?: typeof fixture.etapa | null;
        etapaNueva?: typeof fixture.etapa | null;
        ocurridoEn: Date;
        usuarioId?: string | null;
        detalle?: Record<string, unknown>;
      }> = [
        { tipo: "INGRESO", ocurridoEn: ingresadoEn, detalle: { redSocial: fixture.redSocial } },
        { tipo: "ASIGNACION", ocurridoEn: slaInicioEn, usuarioId: asesor.id },
      ];
      if (fixture.etapa !== "NUEVO") {
        eventos.push({
          tipo: "CAMBIO_ETAPA",
          etapaAnterior: "NUEVO",
          etapaNueva: fixture.etapa,
          ocurridoEn: new Date(slaInicioEn.getTime() + 60 * 60 * 1000),
          usuarioId: asesor.id,
        });
      }
      if (vendedor) {
        eventos.push({
          tipo: "TRASPASO",
          ocurridoEn: new Date(slaInicioEn.getTime() + 2 * 60 * 60 * 1000),
          usuarioId: asesor.id,
          detalle: { vendedorId: vendedor.id },
        });
      }
      if (esTerminal && cerradoEn) {
        eventos.push({ tipo: "CIERRE", etapaNueva: fixture.etapa, ocurridoEn: cerradoEn, usuarioId: vendedor?.id });
      }

      // Cliente + lead + su historial de lead_eventos se escriben atómicos:
      // un corte a mitad de la siembra nunca debe dejar un lead sin su
      // evento INGRESO/ASIGNACION correspondiente (misma invariante que el
      // flujo real de ingesta, docs/06-modulos-backend.md).
      await prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.create({
          data: {
            nombre: fixture.nombre,
            telefonoOriginal: fixture.telefono,
            telefonoNormalizado: fixture.telefono,
            telefonoValido: true,
          },
        });

        const lead = await tx.lead.create({
          data: {
            clienteId: cliente.id,
            origen: "NUEVO",
            etapa: fixture.etapa,
            redSocial: fixture.redSocial,
            camposDinamicos: { origen_seed: "qa-manual", campania: "QA local" },
            payloadOriginal: { seed: true, redSocial: fixture.redSocial },
            semaforo: fixture.semaforo ?? null,
            puntuacion: fixture.puntuacion ?? null,
            asesorId: asesor.id,
            vendedorId: vendedor?.id ?? null,
            slaInicioEn,
            ingresadoEn,
            cerradoEn,
            montoVenta: fixture.montoVenta ?? null,
            productoServicio: fixture.productoServicio ?? null,
            formaPago: fixture.formaPago ?? null,
            observacionCierre: fixture.observacionCierre ?? null,
          },
        });

        for (const evento of eventos) {
          await tx.leadEvento.create({
            data: {
              leadId: lead.id,
              usuarioId: evento.usuarioId ?? null,
              tipo: evento.tipo,
              etapaAnterior: evento.etapaAnterior ?? null,
              etapaNueva: evento.etapaNueva ?? null,
              ocurridoEn: evento.ocurridoEn,
              detalle: evento.detalle ?? undefined,
            },
          });
        }
      });

      creados += 1;
    }

    console.log(`Siembra de QA aplicada: ${creados} leads nuevos, ${existentes} ya existían.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al sembrar leads de QA:", error);
  process.exit(1);
});
