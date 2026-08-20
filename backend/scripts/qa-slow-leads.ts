import { PrismaClient } from "@prisma/client";

/**
 * QA local (test/integration) — inserción lenta de 6 leads (1 cada 10s) vía
 * bridge Google Forms, para observar en vivo: aparición en el listado (SSE),
 * notificación de asignación (Asesor Demo) y actualización desde la vista
 * admin. El lead #4 además dispara una carrera real contra la asignación
 * automática: apenas el lead existe en BD, intenta una asignación manual
 * (admin) al mismo tiempo que corre `assignAfterCommit` — se reporta quién
 * ganó, sin asumir nada de antemano.
 *
 * Uso: docker compose exec backend pnpm exec tsx scripts/qa-slow-leads.ts
 */

const BASE_URL = "http://localhost:3000/api/v1";
const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(correo: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, password }),
  });
  if (!res.ok) throw new Error(`Login falló (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

interface LeadFixture {
  idExternoLead: string;
  nombre: string;
  telefono: string;
  correo: string;
}

const LEADS: LeadFixture[] = [
  { idExternoLead: "qa-slow-201", nombre: "Bruno Herrera", telefono: "+50588882201", correo: "bruno.herrera@qa.local" },
  { idExternoLead: "qa-slow-202", nombre: "Carmen Ibarra", telefono: "+50588882202", correo: "carmen.ibarra@qa.local" },
  { idExternoLead: "qa-slow-203", nombre: "Diego Jimenez", telefono: "+50588882203", correo: "diego.jimenez@qa.local" },
  { idExternoLead: "qa-slow-204", nombre: "Elisa Kant", telefono: "+50588882204", correo: "elisa.kant@qa.local" },
  { idExternoLead: "qa-slow-205", nombre: "Franco Lara", telefono: "+50588882205", correo: "franco.lara@qa.local" },
  { idExternoLead: "qa-slow-206", nombre: "Gina Mora", telefono: "+50588882206", correo: "gina.mora@qa.local" },
];

async function enviarLeadGoogleForms(bridgeKey: string, lead: LeadFixture): Promise<void> {
  const res = await fetch(`${BASE_URL}/ingesta/generico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bridge-Key": bridgeKey },
    body: JSON.stringify({
      idExternoLead: lead.idExternoLead,
      nombre: lead.nombre,
      telefono: lead.telefono,
      correo: lead.correo,
      idExternoCampania: "qa-camp-slow-001",
      nombreCampania: "QA Bridges — inserción lenta",
      idExternoCuenta: null,
      camposDinamicos: { origen: "qa-slow-race" },
    }),
  });
  if (!res.ok) throw new Error(`Ingesta falló (${res.status}): ${await res.text()}`);
}

/** Polling directo a BD (la vía más rápida posible desde afuera) hasta encontrar el lead recién creado. */
async function esperarLeadCreado(telefonoNormalizado: string, timeoutMs = 3000): Promise<{ id: string; asesorId: string | null } | null> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const cliente = await prisma.cliente.findUnique({ where: { telefonoNormalizado } });
    if (cliente) {
      const lead = await prisma.lead.findFirst({ where: { clienteId: cliente.id } });
      if (lead) return { id: lead.id, asesorId: lead.asesorId };
    }
    await sleep(3);
  }
  return null;
}

async function intentarAsignacionManual(adminToken: string, leadId: string, asesorId: string): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/leads/${leadId}/asignar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ asesorId }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, ms: Date.now() - t0 };
}

async function reportarEstadoFinal(leadId: string): Promise<void> {
  const eventos = await prisma.leadEvento.findMany({
    where: { leadId },
    orderBy: { ocurridoEn: "asc" },
    include: { usuario: { select: { nombre: true } } },
  });
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { asesor: { select: { nombre: true } } } });
  console.log(`\n  >> Estado final del lead #4: asesor=${lead?.asesor?.nombre ?? "SIN ASIGNAR"} (asesorId=${lead?.asesorId})`);
  console.log("  >> Eventos lead_eventos (orden real de escritura):");
  for (const evento of eventos) {
    const detalle = evento.detalle as { motivo?: string; responsableId?: string } | null;
    console.log(
      `     - ${evento.tipo} @ ${evento.ocurridoEn.toISOString()} motivo=${detalle?.motivo ?? "-"} responsableId=${detalle?.responsableId ?? "-"} ejecutadoPor=${evento.usuario?.nombre ?? "sistema"}`,
    );
  }
}

async function main(): Promise<void> {
  const seedPassword = requireEnv("SEED_PASSWORD");
  const bridgeGoogleFormsKey = requireEnv("SEED_BRIDGE_CLAVE_API");

  console.log("== Login admin ==");
  const adminToken = await login("admin@crm.local", seedPassword);

  // Un candidato de carga baja distinto del que el algoritmo probablemente
  // elegiría, para que la asignación manual (si gana) sea visiblemente
  // distinta de la automática — sin forzar el resultado, solo el objetivo.
  const objetivoManual = await prisma.usuario.findUnique({ where: { correo: "asesor@crm.local" } });
  if (!objetivoManual) throw new Error("No se encontró asesor@crm.local");

  for (let i = 0; i < LEADS.length; i++) {
    const lead = LEADS[i] as LeadFixture;
    console.log(`\n== Lead ${i + 1}/${LEADS.length}: ${lead.nombre} (${lead.idExternoLead}) ==`);

    if (i === 3) {
      // Lead #4: dispara ingesta y polling de carrera en paralelo.
      const tEnvio = Date.now();
      const envio = enviarLeadGoogleForms(bridgeGoogleFormsKey, lead);
      const creado = await esperarLeadCreado(lead.telefono);
      await envio;
      if (!creado) {
        console.log("  No se pudo detectar el lead a tiempo por polling — se pierde la ventana de carrera.");
      } else {
        const tDetectado = Date.now();
        console.log(`  Lead detectado por polling a los ${tDetectado - tEnvio}ms (asesorId=${creado.asesorId ?? "null"})`);
        if (creado.asesorId !== null) {
          console.log("  La asignación automática YA había committeado antes de que pudiéramos leerlo — no hay ventana para competir externamente.");
        } else {
          console.log(`  Ventana abierta — disparando asignación manual a ${objetivoManual.nombre}...`);
          const intento = await intentarAsignacionManual(adminToken, creado.id, objetivoManual.id);
          console.log(`  Respuesta asignación manual: HTTP ${intento.status} en ${intento.ms}ms — ${JSON.stringify(intento.body)}`);
        }
      }
      await sleep(1500); // margen para que el worker automático termine su ciclo si aún no corrió
      await reportarEstadoFinal(creado?.id ?? "");
    } else {
      await enviarLeadGoogleForms(bridgeGoogleFormsKey, lead);
      console.log("  enviado.");
    }

    if (i < LEADS.length - 1) {
      console.log("  esperando 10s...");
      await sleep(10_000);
    }
  }

  console.log("\nListo — 6 leads insertados.");
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error("Error en qa-slow-leads:", error);
  await prisma.$disconnect();
  process.exit(1);
});
