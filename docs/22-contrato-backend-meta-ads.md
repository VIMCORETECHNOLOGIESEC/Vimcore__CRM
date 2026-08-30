# 22 — Contrato backend Meta Ads

Este contrato describe el backend implementado para conectar una cuenta de
anuncios de Meta (`act_<id>`), sincronizar campañas/Insights y calcular CPC,
CPL y CAC con datos reales del CRM.

> **Estado:** implementado localmente con mocks y pruebas estáticas. La
> verificación contra una cuenta real de Meta queda pendiente porque Meta aún
> bloquea la verificación por SMS de la cuenta usada para habilitar el acceso.

## Ruta rápida

1. Configurar `META_ADS_OAUTH_REDIRECT_URI` en `.env` y registrar esa URL en
   la Meta App.
2. Un administrador inicia `GET /api/v1/meta-ads/conectar`.
3. Meta redirige a `GET /api/v1/meta-ads/callback`.
4. El frontend muestra las cuentas descubiertas y reenvía el `seleccion`
   opaco a `POST /api/v1/meta-ads/conexion`.
5. El job `meta-ads-sync` sincroniza campañas e Insights; el dashboard consume
   `GET /api/v1/metricas/rendimiento-campanias`.

## Endpoints

| Endpoint | Auth | Resultado |
|---|---|---|
| `GET /api/v1/meta-ads/conectar?empresaId=<uuid>` | `ADMINISTRADOR` | Devuelve `authorizationUrl` y vencimiento del `state`. Si falta `META_ADS_OAUTH_REDIRECT_URI`, responde `503 meta_ads_oauth_no_configurado`. |
| `GET /api/v1/meta-ads/callback` | Público, validado por `state` | Consume el `state` una sola vez, intercambia `code`, descubre cuentas `act_<id>` y devuelve cuentas seguras + `seleccion` cifrado. |
| `POST /api/v1/meta-ads/conexion` | `ADMINISTRADOR` | Persiste una cuenta seleccionada si pertenece al `seleccion` cifrado y al mismo usuario/empresa. |
| `GET /api/v1/meta-ads/conexion?empresaId=<uuid>` | `ADMINISTRADOR` | Devuelve la conexión segura de la empresa o `null`; nunca devuelve tokens ni ciphertext. |
| `GET /api/v1/metricas/rendimiento-campanias` | Autenticado | Devuelve gasto, impresiones, clics, alcance, leads, ventas, CPC, CPL y CAC por campaña, red social y moneda. |

`empresaId` solo aplica para usuarios holding-wide (`usuario.empresaId ===
null`). Un usuario ya scopeado a empresa siempre usa su propia empresa.

## Seguridad

- `CuentaPublicitaria` sigue representando una **Página de Facebook** para
  leadgen/webhooks/Page Access Token. No guarda tokens de Marketing API ni
  IDs `act_<id>`.
- `CuentaAnunciosConexion` representa una **cuenta de anuncios Meta** para
  Marketing/Insights API.
- El `state` OAuth es aleatorio de 32 bytes, se almacena solo como SHA-256,
  vence en 10 minutos y se consume con `UPDATE ... RETURNING` atómico.
- El `seleccion` es un payload AES-256-GCM con empresa, usuario, access token,
  cuentas descubiertas y vencimiento. El cliente lo trata como opaco.
- El permiso mínimo solicitado es `ads_read`.
- Los errores HTTP no exponen códigos de autorización, access tokens, App
  Secret, ciphertext ni payloads crudos de Meta.
- RLS está habilitado y forzado en `cuentas_anuncios_conexiones`,
  `cuentas_anuncios_oauth_states` y `campania_metricas_diarias`.

## Modelo de datos

| Modelo | Regla |
|---|---|
| `CuentaAnunciosConexion` | Una conexión por empresa (`empresaId` único). El mismo `act_<id>` puede existir en varias empresas con credenciales propias. |
| `CuentaAnunciosOAuthState` | Estado efímero para OAuth, con RLS por empresa. |
| `Campania` | Tiene exactamente un dueño: `cuentaPublicitariaId` legacy **o** `cuentaAnunciosConexionId`; la migración agrega un `CHECK` XOR y dos índices únicos parciales. |
| `CampaniaMetricaDiaria` | Serie diaria por campaña, fecha, red social y moneda. Facebook/Instagram se separan por `publisher_platform`. |

## Sincronización

El scheduler se registra en `backend/src/index.ts` y se detiene en shutdown.
Evita ejecuciones solapadas dentro del mismo proceso.

- Primera sincronización: últimos 30 días.
- Sincronizaciones posteriores: solapamiento de 3 días.
- Descubrimiento global: `runAsBypassJob("meta-ads-sync")` solo lee IDs y
  `empresaId` de conexiones activas.
- Trabajo por conexión: cada empresa corre bajo
  `runWithTenantContext({ empresaId })`; el token se descifra recién dentro de
  ese contexto.
- `401` o error Graph `190`: marca `TOKEN_EXPIRADO`.
- `429`, `5xx` o red: error transitorio; no marca token expirado.

## Métricas y reportes

`metricas.service.ts` calcula:

- `CPC = gasto / clics`
- `CPL = gasto / leads`
- `CAC = gasto / ventas`

Si el denominador es `0`, el valor es `null`, nunca `Infinity` ni `0` engañoso.
No hay conversión de moneda: los resultados se separan por `moneda`. Los
renderers PDF/XLSX de reportes reutilizan el mismo servicio y muestran esas
métricas reales cuando existen datos sincronizados.

## Verificación disponible

- Mocks locales cubren paginación, timeout, `Retry-After`, error 190/401 y
  split Facebook/Instagram.
- `git diff --check` pasa sin errores de whitespace.
- Las pruebas Docker no se pudieron ejecutar en esta sesión porque el socket de
  Docker no está disponible para el agente y `sudo` requiere contraseña.
