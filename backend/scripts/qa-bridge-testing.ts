import { createHmac } from "node:crypto";

/**
 * QA local (test/integration) — orquesta el testing de ingreso de leads vía
 * bridges pedido por el usuario: crea 5 asesores + 3 vendedores nuevos, envía
 * leads de prueba por el bridge Google Forms (flujo genérico real,
 * end-to-end) y por el webhook de Meta (recepción real + un caso de éxito
 * simulado contra el mock de Graph API, `meta-graph-mock.ts`).
 *
 * Requiere el mock de Meta arriba (docker-compose.qa.yml, no el compose
 * normal):
 *   docker compose -f docker-compose.yml -f docker-compose.qa.yml up -d
 *   docker compose exec backend pnpm exec tsx scripts/qa-bridge-testing.ts
 */

const BASE_URL = "http://localhost:3000/api/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno`);
  return value;
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

interface NuevoUsuario {
  nombre: string;
  correo: string;
  rol: "ASESOR" | "VENDEDOR";
}

const NUEVOS_ASESORES: NuevoUsuario[] = [
  { nombre: "Nadia Asesor", correo: "nadia@crm.local", rol: "ASESOR" },
  { nombre: "Oscar Asesor", correo: "oscar@crm.local", rol: "ASESOR" },
  { nombre: "Paula Asesor", correo: "paula@crm.local", rol: "ASESOR" },
  { nombre: "Quique Asesor", correo: "quique@crm.local", rol: "ASESOR" },
  { nombre: "Rosa Asesor", correo: "rosa@crm.local", rol: "ASESOR" },
];

const NUEVOS_VENDEDORES: NuevoUsuario[] = [
  { nombre: "Sara Vendedor", correo: "sara@crm.local", rol: "VENDEDOR" },
  { nombre: "Tomas Vendedor", correo: "tomas@crm.local", rol: "VENDEDOR" },
  { nombre: "Uma Vendedor", correo: "uma@crm.local", rol: "VENDEDOR" },
];

async function crearUsuario(token: string, usuario: NuevoUsuario, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...usuario, password }),
  });
  if (res.status === 201) {
    console.log(`  creado: ${usuario.nombre} (${usuario.rol})`);
    return;
  }
  const body = await res.json().catch(() => ({}));
  if ((body as { code?: string }).code === "correo_ya_registrado") {
    console.log(`  ya existía: ${usuario.nombre}`);
    return;
  }
  throw new Error(`No se pudo crear ${usuario.correo} (${res.status}): ${JSON.stringify(body)}`);
}

interface LeadGoogleForms {
  idExternoLead: string;
  nombre: string;
  telefono: string;
  correo: string;
  nombreCampania: string;
}

const LEADS_GOOGLE_FORMS: LeadGoogleForms[] = [
  { idExternoLead: "qa-gf-101", nombre: "Valentina Rey", telefono: "+50588881101", correo: "valentina.rey@qa.local", nombreCampania: "QA Bridges — Google Forms" },
  { idExternoLead: "qa-gf-102", nombre: "William Soto", telefono: "+50588881102", correo: "william.soto@qa.local", nombreCampania: "QA Bridges — Google Forms" },
  { idExternoLead: "qa-gf-103", nombre: "Ximena Cruz", telefono: "+50588881103", correo: "ximena.cruz@qa.local", nombreCampania: "QA Bridges — Google Forms" },
  { idExternoLead: "qa-gf-104", nombre: "Yerson Paz", telefono: "+50588881104", correo: "yerson.paz@qa.local", nombreCampania: "QA Bridges — Google Forms" },
  { idExternoLead: "qa-gf-105", nombre: "Zoe Fonseca", telefono: "+50588881105", correo: "zoe.fonseca@qa.local", nombreCampania: "QA Bridges — Google Forms" },
  { idExternoLead: "qa-gf-106", nombre: "Andres Lima", telefono: "+50588881106", correo: "andres.lima@qa.local", nombreCampania: "QA Bridges — Google Forms" },
];

async function enviarLeadGoogleForms(bridgeKey: string, lead: LeadGoogleForms): Promise<void> {
  const res = await fetch(`${BASE_URL}/ingesta/generico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bridge-Key": bridgeKey },
    body: JSON.stringify({
      idExternoLead: lead.idExternoLead,
      nombre: lead.nombre,
      telefono: lead.telefono,
      correo: lead.correo,
      idExternoCampania: "qa-camp-gforms-001",
      nombreCampania: lead.nombreCampania,
      idExternoCuenta: null,
      camposDinamicos: { origen: "qa-bridge-testing" },
    }),
  });
  if (!res.ok) throw new Error(`Ingesta Google Forms falló (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { recepcionId: string; estado: string };
  console.log(`  recibido: ${lead.nombre} -> recepcionId=${data.recepcionId}`);
}

function firmarMeta(rawBody: string): string {
  const secret = requireEnv("META_APP_SECRET");
  const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hmac}`;
}

async function enviarWebhookMeta(pageId: string, leadgenId: string): Promise<void> {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        time: Math.floor(Date.now() / 1000),
        changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId } }],
      },
    ],
  });
  const res = await fetch(`${BASE_URL}/ingesta/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firmarMeta(body) },
    body,
  });
  console.log(`  webhook Meta (page=${pageId}, leadgen=${leadgenId}) -> HTTP ${res.status}`);
}

async function crearCuentaPublicitariaFacebook(token: string, bridgeId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/bridges/${bridgeId}/cuentas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      idExterno: "qa-page-001",
      nombre: "Página QA Meta (mock)",
      instagramAccountId: "qa-ig-001",
    }),
  });
  if (!res.ok) throw new Error(`Crear CuentaPublicitaria falló (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { cuenta: { id: string } };
  console.log(`  CuentaPublicitaria creada: ${data.cuenta.id} (idExterno=qa-page-001)`);
  return data.cuenta.id;
}

async function cargarTokenCuenta(token: string, bridgeId: string, cuentaId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/bridges/${bridgeId}/cuentas/${cuentaId}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: "mock-page-access-token-qa" }),
  });
  if (!res.ok) throw new Error(`Cargar token falló (${res.status}): ${await res.text()}`);
  console.log("  token cargado y verificado contra el mock (estadoToken=VALIDO)");
}

async function findBridgeIdByRedSocial(token: string, redSocial: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/bridges?limite=50`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Listar bridges falló (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { bridges: Array<{ id: string; redSocial: string; estado: string }> };
  const bridge = data.bridges.find((b) => b.redSocial === redSocial);
  if (!bridge) throw new Error(`No se encontró bridge ${redSocial}`);
  if (bridge.estado !== "ACTIVO") throw new Error(`Bridge ${redSocial} no está ACTIVO (estado=${bridge.estado})`);
  return bridge.id;
}

async function main(): Promise<void> {
  const seedPassword = requireEnv("SEED_PASSWORD");
  const bridgeGoogleFormsKey = requireEnv("SEED_BRIDGE_CLAVE_API");

  console.log("== Login admin ==");
  const adminToken = await login("admin@crm.local", seedPassword);

  console.log("\n== Creando 5 asesores + 3 vendedores nuevos ==");
  for (const usuario of [...NUEVOS_ASESORES, ...NUEVOS_VENDEDORES]) {
    await crearUsuario(adminToken, usuario, `${seedPassword}Aa1`);
  }

  console.log("\n== Enviando leads de prueba vía bridge Google Forms (X-Bridge-Key) ==");
  for (const lead of LEADS_GOOGLE_FORMS) {
    await enviarLeadGoogleForms(bridgeGoogleFormsKey, lead);
  }

  console.log("\n== Preparando bridge Facebook para el webhook de Meta ==");
  const bridgeFacebookId = await findBridgeIdByRedSocial(adminToken, "FACEBOOK");
  const cuentaId = await crearCuentaPublicitariaFacebook(adminToken, bridgeFacebookId);
  await cargarTokenCuenta(adminToken, bridgeFacebookId, cuentaId);

  console.log("\n== Webhook Meta — caso A: página sin CuentaPublicitaria (demuestra el error) ==");
  await enviarWebhookMeta("qa-page-sin-registrar", "leadgen-error-001");

  console.log("\n== Webhook Meta — caso B: página registrada + token válido (bypass exitoso vía mock) ==");
  await enviarWebhookMeta("qa-page-001", "leadgen-success-001");

  console.log("\nListo. Esperá ~2s y revisá leads_recibidos/leads/bridge_logs/notificaciones.");
}

main().catch((error: unknown) => {
  console.error("Error en qa-bridge-testing:", error);
  process.exit(1);
});
