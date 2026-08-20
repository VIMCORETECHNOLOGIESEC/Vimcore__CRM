import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/lib/password.js";

/**
 * Siembra de demo para la instancia ARCANO CRM (no forma parte de
 * `prisma db seed` ni de `seed-leads-qa.ts`): amplía el equipo comercial a 5
 * asesores y 3 vendedores, y reparte ~24 leads con nombres y montos
 * verosímiles en las 5 etapas del embudo (docs/02-reglas-negocio.md §4),
 * la mayoría ya asignados/traspasados, para presentación al cliente.
 * Idempotente por `telefono_normalizado` — se puede re-ejecutar sin duplicar.
 *
 * Autosuficiente: hace upsert de los asesores/vendedores que referencian los
 * fixtures de `LEADS` usando el mismo `SEED_PASSWORD` que `seed.ts`.
 *
 * Uso: docker compose exec backend pnpm exec tsx prisma/seed-leads-arcano-demo.ts
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

const ASESORES: Array<{ correo: string; nombre: string }> = [
  { correo: "mateo@crm.local", nombre: "Mateo Fernández" },
  { correo: "mike@crm.local", nombre: "Miguel Solano" },
  { correo: "camila@crm.local", nombre: "Camila Rojas" },
  { correo: "diego.asesor@crm.local", nombre: "Diego Herrera" },
  { correo: "sofia@crm.local", nombre: "Sofía Jiménez" },
];

const VENDEDORES: Array<{ correo: string; nombre: string }> = [
  { correo: "vendedor@crm.local", nombre: "Vendedor Demo" },
  { correo: "renata@crm.local", nombre: "Renata Ibarra" },
  { correo: "andres@crm.local", nombre: "Andrés Castillo" },
];

const LEADS: LeadFixture[] = [
  // Nuevo — recién ingresados, sin calificar todavía
  {
    telefono: "+50588881001",
    nombre: "Patricia Guevara",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    asesorCorreo: "mateo@crm.local",
    diasIngreso: 0,
  },
  {
    telefono: "+50588881002",
    nombre: "Roberto Sequeira",
    redSocial: "INSTAGRAM",
    etapa: "NUEVO",
    asesorCorreo: "camila@crm.local",
    semaforo: "VERDE",
    puntuacion: 72,
    diasIngreso: 0,
  },
  {
    telefono: "+50588881003",
    nombre: "Fernanda Alemán",
    redSocial: "GOOGLE_FORMS",
    etapa: "NUEVO",
    asesorCorreo: "sofia@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 50,
    diasIngreso: 1,
  },
  {
    telefono: "+50588881004",
    nombre: "Jonathan Espinoza",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    asesorCorreo: "diego.asesor@crm.local",
    diasIngreso: 1,
  },
  // Contactado — asesor ya calificó, esperando avanzar a cita
  {
    telefono: "+50588881005",
    nombre: "Mariana Castro",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    asesorCorreo: "mateo@crm.local",
    semaforo: "VERDE",
    puntuacion: 88,
    diasIngreso: 2,
  },
  {
    telefono: "+50588881006",
    nombre: "Esteban Rugama",
    redSocial: "GOOGLE_FORMS",
    etapa: "CONTACTADO",
    asesorCorreo: "mike@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 58,
    diasIngreso: 2,
  },
  {
    telefono: "+50588881007",
    nombre: "Nicole Baltodano",
    redSocial: "FACEBOOK",
    etapa: "CONTACTADO",
    asesorCorreo: "camila@crm.local",
    semaforo: "VERDE",
    puntuacion: 81,
    diasIngreso: 3,
  },
  {
    telefono: "+50588881008",
    nombre: "Óscar Membreño",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    asesorCorreo: "sofia@crm.local",
    semaforo: "ROJO",
    puntuacion: 30,
    diasIngreso: 3,
  },
  {
    telefono: "+50588881009",
    nombre: "Valentina Ortiz",
    redSocial: "GOOGLE_FORMS",
    etapa: "CONTACTADO",
    asesorCorreo: "diego.asesor@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 62,
    diasIngreso: 4,
  },
  // Cita — traspasado a vendedor, agendado
  {
    telefono: "+50588881010",
    nombre: "Ricardo Aguirre",
    redSocial: "FACEBOOK",
    etapa: "CITA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 84,
    diasIngreso: 4,
  },
  {
    telefono: "+50588881011",
    nombre: "Ana Lucía Blandón",
    redSocial: "INSTAGRAM",
    etapa: "CITA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "renata@crm.local",
    semaforo: "VERDE",
    puntuacion: 90,
    diasIngreso: 5,
  },
  {
    telefono: "+50588881012",
    nombre: "Kevin Chamorro",
    redSocial: "GOOGLE_FORMS",
    etapa: "CITA",
    asesorCorreo: "camila@crm.local",
    vendedorCorreo: "andres@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 65,
    diasIngreso: 5,
  },
  {
    telefono: "+50588881013",
    nombre: "Daniela Zapata",
    redSocial: "FACEBOOK",
    etapa: "CITA",
    asesorCorreo: "sofia@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 79,
    diasIngreso: 6,
  },
  {
    telefono: "+50588881014",
    nombre: "Pablo Larios",
    redSocial: "INSTAGRAM",
    etapa: "CITA",
    asesorCorreo: "diego.asesor@crm.local",
    vendedorCorreo: "renata@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 68,
    diasIngreso: 6,
  },
  // Venta — cerrados con éxito
  {
    telefono: "+50588881015",
    nombre: "Gabriela Pastora",
    redSocial: "FACEBOOK",
    etapa: "VENTA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 92,
    diasIngreso: 8,
    montoVenta: 2450,
    productoServicio: "Plan Premium Anual",
    formaPago: "CONTADO",
  },
  {
    telefono: "+50588881016",
    nombre: "Manuel Somarriba",
    redSocial: "INSTAGRAM",
    etapa: "VENTA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "renata@crm.local",
    semaforo: "VERDE",
    puntuacion: 95,
    diasIngreso: 9,
    montoVenta: 4200.75,
    productoServicio: "Plan Corporativo",
    formaPago: "FINANCIAMIENTO",
  },
  {
    telefono: "+50588881017",
    nombre: "Silvia Narváez",
    redSocial: "GOOGLE_FORMS",
    etapa: "VENTA",
    asesorCorreo: "camila@crm.local",
    vendedorCorreo: "andres@crm.local",
    semaforo: "VERDE",
    puntuacion: 87,
    diasIngreso: 10,
    montoVenta: 1800,
    productoServicio: "Plan Estándar",
    formaPago: "CREDITO",
  },
  {
    telefono: "+50588881018",
    nombre: "Álvaro Downs",
    redSocial: "FACEBOOK",
    etapa: "VENTA",
    asesorCorreo: "sofia@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "VERDE",
    puntuacion: 91,
    diasIngreso: 11,
    montoVenta: 3100,
    productoServicio: "Plan Premium Anual",
    formaPago: "CONTADO",
  },
  {
    telefono: "+50588881019",
    nombre: "Yolanda Cerda",
    redSocial: "INSTAGRAM",
    etapa: "VENTA",
    asesorCorreo: "diego.asesor@crm.local",
    vendedorCorreo: "renata@crm.local",
    semaforo: "VERDE",
    puntuacion: 89,
    diasIngreso: 12,
    montoVenta: 2650.25,
    productoServicio: "Plan Corporativo",
    formaPago: "FINANCIAMIENTO",
  },
  // No Venta — cerrados sin éxito
  {
    telefono: "+50588881020",
    nombre: "Bryan Talavera",
    redSocial: "GOOGLE_FORMS",
    etapa: "NO_VENTA",
    asesorCorreo: "mateo@crm.local",
    vendedorCorreo: "andres@crm.local",
    semaforo: "ROJO",
    puntuacion: 22,
    diasIngreso: 7,
    observacionCierre: "Cliente indicó que el presupuesto quedó fuera de rango para este trimestre.",
  },
  {
    telefono: "+50588881021",
    nombre: "Cindy Robleto",
    redSocial: "FACEBOOK",
    etapa: "NO_VENTA",
    asesorCorreo: "mike@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 40,
    diasIngreso: 8,
    observacionCierre: "No respondió a los intentos de contacto durante el plazo del SLA.",
  },
  {
    telefono: "+50588881022",
    nombre: "Ernesto Palacios",
    redSocial: "INSTAGRAM",
    etapa: "NO_VENTA",
    asesorCorreo: "camila@crm.local",
    vendedorCorreo: "renata@crm.local",
    semaforo: "ROJO",
    puntuacion: 18,
    diasIngreso: 9,
    observacionCierre: "Optó por la competencia por un plazo de entrega más corto.",
  },
  {
    telefono: "+50588881023",
    nombre: "Lorena Sandigo",
    redSocial: "GOOGLE_FORMS",
    etapa: "NO_VENTA",
    asesorCorreo: "sofia@crm.local",
    vendedorCorreo: "andres@crm.local",
    semaforo: "AMARILLO",
    puntuacion: 35,
    diasIngreso: 10,
    observacionCierre: "Postergó la decisión indefinidamente por reestructuración interna.",
  },
  {
    telefono: "+50588881024",
    nombre: "Iván Wheelock",
    redSocial: "FACEBOOK",
    etapa: "NO_VENTA",
    asesorCorreo: "diego.asesor@crm.local",
    vendedorCorreo: "vendedor@crm.local",
    semaforo: "ROJO",
    puntuacion: 15,
    diasIngreso: 13,
    observacionCierre: "Cliente indicó que ya no está interesado por motivos de presupuesto.",
  },
];

const ETAPAS_TERMINALES = new Set(["VENTA", "NO_VENTA"]);

function daysAgo(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

async function ensureUsuarios(prisma: PrismaClient, passwordHash: string): Promise<void> {
  for (const asesor of ASESORES) {
    await prisma.usuario.upsert({
      where: { correo: asesor.correo },
      update: {},
      create: { nombre: asesor.nombre, correo: asesor.correo, rol: "ASESOR", passwordHash },
    });
  }
  for (const vendedor of VENDEDORES) {
    await prisma.usuario.upsert({
      where: { correo: vendedor.correo },
      update: {},
      create: { nombre: vendedor.nombre, correo: vendedor.correo, rol: "VENDEDOR", passwordHash },
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Siembra de demo ARCANO abortada — nunca se siembran datos de prueba en producción.");
    process.exit(1);
  }

  const seedEnv = seedEnvSchema.safeParse(process.env);
  if (!seedEnv.success) {
    console.error(
      `Siembra de demo ARCANO abortada — falta SEED_PASSWORD válida: ${seedEnv.error.issues
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

      // Cliente + lead + su historial de lead_eventos se escriben atómicos,
      // igual que el flujo real de ingesta (docs/06-modulos-backend.md).
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
            camposDinamicos: { origen_seed: "arcano-demo", campania: "Presentación ARCANO CRM" },
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

    console.log(
      `Siembra de demo ARCANO aplicada: ${creados} leads nuevos, ${existentes} ya existían, ${ASESORES.length} asesores y ${VENDEDORES.length} vendedores disponibles.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al sembrar demo ARCANO:", error);
  process.exit(1);
});
