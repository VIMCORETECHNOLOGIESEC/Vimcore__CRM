# 17 — Seguridad y ciberseguridad

> **Estado:** guía operativa de seguridad. No es un hallazgo de auditoría ni
> reemplaza una revisión de seguridad profesional externa; es el colchón de
> QA a correr antes de mergear cambios sensibles de front y back.
>
> **Corte:** 2026-08-25.

## 1. Mecanismo disponible: `/security-review` (nativo de Claude Code)

| Mecanismo | Cuándo corre | Alcance | Cómo se invoca |
|---|---|---|---|
| `/security-review` (slash command nativo de Claude Code) | A demanda, local, cuando el desarrollador lo pide | El diff pendiente en el working tree — sirve para revisar un módulo puntual de front o back antes de abrir PR | Ejecutar `/security-review` en este repo con Claude Code |

Detecta las mismas familias de vulnerabilidad que un análisis semántico
avanzado: inyección (SQL/NoSQL/comando), fallas de autenticación/
autorización, IDOR, exposición de secretos y PII, criptografía débil, XSS,
deserialización insegura, CORS permisivo y dependencias vulnerables. Corre
sobre la sesión de Claude Code ya activa — no requiere ninguna credencial ni
configuración adicional más allá del plan de suscripción existente.

**Uso previsto:** revisar un módulo específico *mientras se desarrolla*
(por ejemplo, antes de subir un cambio en `meta-webhook.service.ts` o en el
formulario de calificación del frontend) — no es automático, hay que
pedirlo.

## 2. GitHub Action evaluado, no instalado

Se evaluó `anthropics/claude-code-security-review` (revisión automática en
cada `pull_request`, mismo motor de análisis que el punto 1) y **se decidió
no instalarlo**, no por falta de utilidad técnica sino por una limitación
de acceso real de este proyecto:

- El Action requiere el input `claude-api-key`, una API key de **Anthropic
  Console/API** (facturación por token), habilitada tanto para la API de
  Claude como para uso de Claude Code.
- Este proyecto opera con un plan **Claude Pro**, no con una cuenta de
  API Console — son productos distintos. El plan Pro no emite ese tipo de
  API key, así que el secret `CLAUDE_API_KEY` no puede cargarse.
- Instalar el workflow sin esa credencial no es una instalación parcial
  útil: cada ejecución fallaría por autenticación, produciendo un check de
  CI en rojo de forma permanente — ruido y falsos negativos, peor que no
  tenerlo.

**Revisar esta decisión si** el proyecto adquiere acceso a Anthropic
Console/API en el futuro. En ese caso, la instalación es la del Quick
Start oficial del repositorio (`.github/workflows/`, ver
[README](https://github.com/anthropics/claude-code-security-review)) —
sin cambios de fondo respecto a lo ya investigado el 2026-08-25.

## 3. Lineamientos base de ciberseguridad de este proyecto

Puntos verificados contra el código real en `main` (no genéricos):

### 3.1 Secretos y tokens de bridges

- `CuentaPublicitaria.tokenCifrado` (`backend/prisma/schema.prisma:477`) ya
  se cifra/descifra vía `encrypt()`/`decrypt()`
  (`backend/src/services/cuenta-publicitaria.service.ts`,
  `meta-webhook.service.ts`) — nunca debe leerse ni loguearse en texto plano
  fuera de esas funciones.
- El webhook de Meta ya valida `X-Hub-Signature-256`
  (`backend/src/controllers/meta-webhook.controller.ts:58`,
  `verifyFirmaMeta`) y el handshake por `hub.verify_token`
  (`meta-webhook.service.ts:32`). Cualquier bridge nuevo (ver `docs/05`)
  debe replicar esta verificación de firma antes de aceptar el payload —
  no asumir que la URL del webhook siendo "secreta" alcanza.
- `refreshToken` se guarda hasheado (`hashRefreshToken`,
  `refresh-token.repository.ts`) y está en la lista de redacción del logger
  (`backend/src/lib/logger.ts:20-31`). Cualquier campo sensible nuevo
  (contraseñas por membresía de §8.3 de `docs/16`, tokens de reportes) debe
  sumarse a esa misma lista de redacción, no asumir que el logger lo cubre
  automáticamente.

### 3.2 Validación de entrada en ingesta pública

- Los endpoints de ingesta ya usan Zod (`backend/src/schemas/*.schema.ts`,
  ej. `ingesta.schema.ts`, `formularios.schema.ts`) — todo endpoint público
  nuevo (canal manual, sitio web, un bridge adicional) debe definir su propio
  schema Zod antes de tocar la base, nunca confiar en el shape que manda el
  proveedor externo.
- Prisma ya parametriza las queries (no hay SQL crudo detectado en
  `backend/src`), lo que descarta inyección SQL clásica — el riesgo real acá
  no es SQLi, es **autorización**: una query bien escrita pero sin el filtro
  correcto de scope (ver 3.4).

### 3.3 CORS y superficie HTTP

- `app.ts:16` fija `cors({ origin: env.CORS_ORIGIN })` — un solo origen
  permitido, no `origin: "*"`. Mantener ese patrón: cualquier nuevo frontend
  (portal de holding, subdominio por empresa) se agrega a `CORS_ORIGIN`
  explícitamente, nunca abriendo el wildcard para "que ande más rápido".
- **Gap detectado, no bloqueante hoy:** no se encontró middleware de rate
  limiting (`helmet`, `express-rate-limit` no están en
  `backend/package.json`). Los endpoints de ingesta pública (bridges,
  webhooks) son el punto más expuesto a abuso por volumen — evaluar antes de
  sumar el canal manual/sitio web de la evolución multiempresa.

### 3.4 Riesgo de aislamiento multi-tenant (D11, D14)

Este es el ítem de seguridad más importante de cara a la evolución
multiempresa, y todavía no aplica al código porque el modelo
`Empresa`/`Membresia`/`Producto` no existe implementado — solo como
propuesta en `docs/16`. Se deja documentado ahora para que el código que lo
introduzca nazca revisado:

- La decisión D11 (topología física) fijó **esquema compartido, una sola
  base de datos** para todo el holding — no aislamiento físico por empresa.
- Eso significa que la seguridad entre empresas depende 100% de que **cada
  query filtre por `empresaId`** (o por la membresía activa del usuario).
  Una sola consulta que omita ese filtro es una fuga de datos entre
  empresas del holding, no un bug cosmético.
- Lineamiento obligatorio para cualquier PR que toque el modelo
  multiempresa: centralizar el filtro de scope en una capa de
  servicio/middleware única (nunca repetido ad-hoc en cada repository), y
  que el checklist de QA de seguridad (§4) incluya explícitamente "probé
  que un usuario de la Empresa A no puede leer/escribir datos de la
  Empresa B" antes de mergear.
- Row-Level Security de Postgres queda anotado en `docs/16` como defensa
  adicional a evaluar — no depender solo de la disciplina de código de
  aplicación.
- El mismo lineamiento aplica al catálogo `Producto` de D14 y a cualquier
  query de `Oportunidad`: filtrar por empresa dueña del Lead, no solo por
  `leadId`.

### 3.5 JWT y sesiones

- Access token + refresh token con rotación (`auth.service.ts`) y
  revocación por `jti` ya implementados. Mantener: nunca extender la
  expiración del access token "para comodidad", y cualquier nuevo scope de
  sesión (login por membresía de empresa, `docs/16` §8.3) debe pasar por el
  mismo mecanismo de rotación/revocación, no uno paralelo.

### 3.6 PII de leads y clientes

- `Cliente`/`Lead` contienen teléfono, correo y datos de contacto real.
  Cualquier endpoint de exportación (reportes PDF/XLSX de `docs/16` §8.5) o
  de integración externa nueva debe pasar por la misma autorización por
  scope que ya aplica al resto de la API — nunca un endpoint "de solo
  lectura para debugging" sin auth.

## 4. Checklist de QA de seguridad por módulo (antes de mergear)

Correr `/security-review` sobre el diff del módulo y, además, verificar a mano:

- [ ] Todo input externo nuevo (body, query, header, payload de webhook) pasa
      por un schema Zod antes de tocar el service/repository.
- [ ] Ningún secreto, token o password se loguea en texto plano ni se
      devuelve en una respuesta HTTP.
- [ ] Si el cambio toca datos multiempresa: hay un test que prueba que un
      usuario de una empresa no accede a datos de otra (D11, §3.4).
- [ ] Todo endpoint nuevo valida el rol/membresía del usuario autenticado
      antes de leer o escribir, no solo que exista un JWT válido.
- [ ] Si se agrega una dependencia npm nueva, se revisó que no sea
      typosquatting y que tenga mantenimiento activo (riesgo de supply
      chain, §5).
- [ ] CORS sigue restringido a orígenes explícitos; no se agregó `*` ni se
      deshabilitó por comodidad de desarrollo.

## 5. Fuentes consultadas (2026-08-25)

- [anthropics/claude-code-security-review — README](https://github.com/anthropics/claude-code-security-review) —
  capacidades de detección, inputs del GitHub Action y motivo por el que no
  se instaló (§2: requiere API key de Anthropic Console, no de plan Pro).
- [Automated security reviews in Claude Code — Claude Support](https://support.claude.com/en/articles/11932705-automated-security-reviews-in-claude-code) —
  confirma que `/security-review` y el GitHub Action comparten el mismo
  motor de análisis; solo se usa acá la parte nativa por la limitación de
  acceso ya explicada.
- [OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) —
  marco de riesgos para aplicaciones que incorporan LLMs (prompt injection,
  exposición de información sensible, excessive agency); referencia para
  cuando el CRM incorpore capacidades de IA (ver "Diferir" en `docs/16`).
- [Vibe Coding Security Risks — Arnica](https://www.arnica.io/blog/vibe-coding-security-risks) y
  [OX Security — Vibe Coding Security](https://www.ox.security/blog/vibe-coding-security/) —
  evidencia de que 40-62% del código generado por IA introduce
  vulnerabilidades (accesos rotos, secretos hardcodeados, dependencias
  alucinadas); sustentan el criterio de tratar todo código generado por IA
  en este proyecto como código de tercero sin revisar hasta que pase por
  `/security-review`.

## 6. Relación con la evolución multiempresa

Este documento vive en `test/gpt`, la misma rama donde se está resolviendo
`docs/14-evolucion-multitenant.md` y `docs/16-hallazgos-y-preguntas.md`. La
referencia cruzada es directa, no conceptual: el riesgo D11/D14 de §3.4 se
documenta acá porque es un lineamiento de seguridad que debe respetarse
desde el primer commit que implemente `Empresa`/`Membresia`/`Producto` en
Prisma, sin importar en qué módulo del código aparezca primero.
