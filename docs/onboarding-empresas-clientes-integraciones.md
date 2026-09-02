# Onboarding de empresas cliente — integraciones WhatsApp/Meta Ads/LinkedIn

> Informe pedido por Mateo (2026-08-31) tras probar con cuentas personales:
> qué necesita una empresa cliente nueva para usar estas integraciones en
> producción. **Corrige una premisa equivocada de partida** — no hace falta
> que cada empresa cree su propio Facebook Developers/LinkedIn App ni tenga
> sus propias variables de entorno. Verificado contra el código real y la
> documentación oficial de Meta/LinkedIn (Tech Provider Program).

## La arquitectura real: un solo App, muchos clientes (Tech Provider / Embedded Signup)

Meta y LinkedIn definen dos roles distintos:

- **Tech Provider / Solution Partner** (vos, Vimcore): tiene UN SOLO App
  registrado en cada plataforma. Ese App es el que queda verificado/aprobado.
- **Cliente final** (Arcano, y las próximas empresas): nunca crea nada en
  Meta ni LinkedIn. Solo hace clic en "Conectar WhatsApp"/"Conectar
  LinkedIn" dentro del CRM, autoriza con SU PROPIA cuenta (OAuth), y listo —
  su número/cuenta queda conectado.

Esto ya está construido así en el código, confirmado en `backend/src/config/env.ts`
(comentario explícito: *"whatsappMessages: OAuth 'Facebook Login for
Business' reusa `META_APP_ID`/`META_APP_SECRET` (misma Meta App que ya
sirve los webhooks de Ads)"*) y en `backend/prisma/schema.prisma` — no existe
NINGÚN campo para guardar credenciales de App por empresa, solo el token de
CONEXIÓN de cada empresa (`WhatsAppConexion.tokenCifrado`,
`LinkedInConexion.accessTokenCifrado`), que se genera automático al conectar.

**Por qué importa:** si cada empresa tuviera que crear su propio App, cada
una necesitaría pasar su propia Verificación de Negocio / App Review — meses
de trámite por cliente, en vez de una sola vez para toda la plataforma.

## Lo que VOS (Vimcore) hacés una sola vez, para toda la plataforma

### Meta (WhatsApp Business + Meta Ads)
1. Un solo Facebook Developers App (ya existe, `META_APP_ID`/`META_APP_SECRET`
   ya configurados en producción).
2. **Verificación de Negocio** de tu empresa (Vimcore) en Meta Business
   Suite — en trámite, requiere RUC/constitución + un segundo documento
   (estado de cuenta o factura de servicios, NO celular), 48hs–varios días.
3. **App Review** para acceso avanzado a los permisos que ya pide el código
   (`whatsapp_business_management`, `whatsapp_business_messaging`,
   `business_management`) — normalmente se habilita después de (2).
4. **Publicar la App** — mientras esté "sin publicar", Meta solo entrega
   webhooks de PRUEBA (botón "Probar" del panel), nunca datos reales, ni
   siquiera de admins/testers agregados a la App.
5. Un número propio de WhatsApp Business agregado en el paso "Configura para
   producción" del wizard — es un requisito de Meta para que VOS demuestres
   que sabés usar la API, no es "el" número de ningún cliente.

### LinkedIn (Lead Sync API)
1. Un solo LinkedIn Developer App (ya existe, `LINKEDIN_CLIENT_ID`/
   `LINKEDIN_CLIENT_SECRET` configurados).
2. Tu **Company Page verificada** en LinkedIn (requisito previo, sin esto ni
   te dejan aplicar al producto).
3. Solicitar acceso al producto **"Lead Sync API"** (scope
   `r_marketing_leadgen_automation`) desde el Developer Portal → pestaña
   Products → describiendo el caso de uso real (ya enviado). **Tarda 2-4
   semanas** en aprobarse — no es instantáneo.

Hasta que (2)/(4) de Meta y (3) de LinkedIn estén aprobados, solo funcionan
cuentas agregadas manualmente como Admin/Developer/Tester de cada App — es
la fase en la que estamos hoy, probando con cuentas personales porque
todavía no hay clientes reales habilitados por Meta/LinkedIn.

## Lo que CADA EMPRESA CLIENTE hace (nada técnico, ya construido)

1. Un Administrador de la empresa entra a **Bridges** en el CRM.
2. Clic en "Conectar WhatsApp" (o "Conectar LinkedIn").
3. Se abre el flujo de autorización de Meta/LinkedIn — la empresa inicia
   sesión con SU PROPIA cuenta de WhatsApp Business / LinkedIn (no con
   ninguna credencial de Vimcore).
4. Si tiene varios números/páginas, elige cuál conectar.
5. Listo — el token queda cifrado y guardado en `WhatsAppConexion`/
   `LinkedInConexion` de ESA empresa específica, aislado del resto.

Ninguna empresa cliente necesita: cuenta de desarrollador, App propio,
variables de entorno propias, ni tocar ningún panel técnico. Esa fue la
razón de construir Embedded Signup en vez de pedir credenciales manuales.

## Variables de entorno actuales — alcance de plataforma, no por cliente

Todas viven en el Container App (`arcano-crm`), una sola vez para todo el
sistema:

| Variable | Para qué |
|---|---|
| `META_APP_ID` / `META_APP_SECRET` | App único de Meta (Ads leadgen + WhatsApp OAuth + WhatsApp webhook) |
| `META_WEBHOOK_VERIFY_TOKEN` | Verifica el handshake del webhook de Meta/WhatsApp |
| `WHATSAPP_OAUTH_REDIRECT_URI` | A dónde vuelve el navegador tras autorizar WhatsApp — apunta al FRONTEND (`https://crm.nexuscorpec.com/whatsapp/callback`) |
| `META_ADS_OAUTH_REDIRECT_URI` | Igual, para el flujo de conexión de cuenta de Meta Ads |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | App único de LinkedIn |
| `LINKEDIN_API_VERSION` / `LINKEDIN_API_BASE_URL` | Config de la API de LinkedIn |
| `LINKEDIN_REDIRECT_URI` | A dónde vuelve el navegador tras autorizar LinkedIn — apunta al BACKEND (el flujo de LinkedIn se autocompleta server-side, no necesita pantalla de frontend intermedia) |

Ninguna de estas cambia ni se duplica al agregar una empresa cliente nueva.

## Checklist real de lo pendiente (no técnico, son trámites)

- [ ] Verificación de Negocio de Meta (en trámite, según lo último que
      registraste)
- [ ] App Review de Meta para los permisos avanzados de WhatsApp
- [ ] Publicar la App de Meta
- [ ] Aprobación del producto Lead Sync API de LinkedIn (2-4 semanas,
      solicitud ya enviada)

Cuando estos 4 estén aprobados, cualquier empresa cliente nueva puede
conectar su WhatsApp/LinkedIn real el mismo día, sin ningún cambio de
código ni de configuración de plataforma.
