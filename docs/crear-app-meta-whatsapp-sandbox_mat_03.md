# Crear la App de Meta para probar WhatsApp Business Platform — material de prueba

> **Estado:** material de trabajo/pruebas, fuera de la secuencia numerada de
> `docs/` y sin registrar en `docs/00-estado-documentacion.md` a propósito —
> no es documentación de producción. Pasos verificados contra la documentación
> oficial de Meta for Developers (agosto 2026); Meta puede cambiar su UI/flujo
> sin aviso, verificar si algo no coincide.

## 1. Developer Portal

Ir a [developers.facebook.com](https://developers.facebook.com), iniciar sesión
con una cuenta de Facebook/Meta y aceptar los términos de developer si es la
primera vez.

## 2. Crear la App — tipo obligatorio

**Crear App → tipo "Business"** — no "Consumer" ni otro tipo. La documentación
oficial de Meta es explícita: *"The Embedded Signup Integration Helper is
available only for Business-type apps"*, y Embedded Signup es el flujo que usa
el botón "Conectá tu WhatsApp" ya implementado en el backend
(`services/whatsappMessages/whatsapp-oauth.service.ts`).

Se asocia a una **Meta Business Account** (Business Manager) — si no existe
una, el mismo asistente la pide crear.

## 3. Agregar el producto WhatsApp

Dentro del dashboard de la App → sección de productos → buscar **"WhatsApp"**
→ **Set up**. Esto genera automáticamente:

- Un **número de prueba (sandbox)**, gratis — solo permite mandar mensajes a
  números que uno mismo verifique como destinatarios de prueba.
- Un **WABA ID** (WhatsApp Business Account).
- Un **Phone Number ID**.
- Un **token temporal** para probar llamadas a la API antes de integrar OAuth.

## 4. Credenciales que ya usa el backend de este proyecto

En **Configuración básica** de esa misma App están el **App ID** y **App
Secret** — son exactamente `META_APP_ID`/`META_APP_SECRET`, las mismas
variables que ya usa el bridge de leads de Meta. El módulo `whatsappMessages`
**reusa esas mismas variables** — no hace falta una App nueva, es la misma App
de Meta con el producto WhatsApp agregado además del de Leads Ads.

También hace falta (ya usadas por el código):

- `META_WEBHOOK_VERIFY_TOKEN` — el mismo mecanismo de verificación de webhook
  que ya usa Leads Ads sirve para el webhook de WhatsApp.
- `WHATSAPP_OAUTH_REDIRECT_URI` (variable nueva, específica de este módulo) —
  la URL de callback de Embedded Signup.

## 5. Probar el flujo con el sandbox

Con el número de prueba y el token temporal del paso 3 ya se puede ejercitar
el flujo completo de conexión/webhook sin esperar aprobación de Meta —
alcanza con agregar el propio número como destinatario verificado.

## 6. Lo que falta para producción (no para probar)

Para conectar números reales de clientes vía el botón OAuth hace falta:

- **App Review** de los permisos de WhatsApp Business (`whatsapp_business_messaging`,
  `whatsapp_business_management`) — es un review **separado** del de Leads
  Ads, no lo extiende.
- **Business Verification** del Business Manager.

Mismo tipo de riesgo de cronograma que ya está documentado para Leads Ads en
`docs/05-bridges.md` — iniciar el proceso cuanto antes si se planea ir a
producción.

## Fuentes verificadas

- [Embedded Signup — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Onboard WhatsApp Business app users — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [WhatsApp Business Accounts — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts)
