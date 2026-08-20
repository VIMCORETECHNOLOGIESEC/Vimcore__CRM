import { createServer } from "node:http";

/**
 * QA local (test/integration): mock mínimo de Graph API para poder ejercitar
 * el flujo completo del webhook de Meta (`meta-webhook.service.ts`) sin
 * credenciales reales. Solo lo consumen `GRAPH_API_BASE_URL` cuando
 * `META_GRAPH_API_BASE_URL` apunta acá (docker-compose, servicio `meta-mock`).
 * Nunca se usa fuera de este entorno de pruebas.
 */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://meta-mock");
  res.setHeader("Content-Type", "application/json");

  if (url.pathname === "/debug_token") {
    res.end(JSON.stringify({ data: { is_valid: true, expires_at: 0 } }));
    return;
  }

  const leadgenId = url.pathname.replace(/^\//, "");
  res.end(
    JSON.stringify({
      id: leadgenId,
      field_data: [
        { name: "full_name", values: ["Lead QA Meta"] },
        { name: "phone_number", values: ["+50588887777"] },
        { name: "email", values: ["qa.meta@prueba.local"] },
      ],
      ad_id: "ad_qa_meta_001",
      form_id: "form_qa_meta_001",
      campaign_id: "camp_qa_meta_001",
      campaign_name: "Campaña QA Meta (mock)",
      ad_name: "Anuncio QA Meta",
    }),
  );
});

server.listen(4000, () => console.log("meta-mock listening on :4000"));
