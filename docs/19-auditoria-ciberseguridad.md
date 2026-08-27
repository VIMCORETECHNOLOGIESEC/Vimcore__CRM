# 19 — Auditoría de ciberseguridad y plan de fortalecimiento

> **Estado:** vigente con reservas — diagnóstico de seguridad verificado en la
> rama `test/gpt` (`e04ea2c`), 2026-08-26. No es una certificación, un pentest
> externo ni una autorización para modificar la arquitectura.
>
> **Alcance:** AS-IS single-company por despliegue. Las secciones **TO-BE** son
> controles de entrada para los bloques multi-tenant; no describen capacidades
> implementadas.

## Lectura rápida

El CRM ya tiene una base de seguridad útil: autenticación JWT, contraseñas con
Argon2id, refresh tokens rotados y hasheados, cifrado AES-256-GCM de tokens de
bridges, validación Zod, autorización en backend, firmas HMAC de Meta y SQL
parametrizado. No obstante, **no está listo para producción expuesta a Internet
sin un bloque de hardening**: hay una dependencia vulnerable, no existen límites
de abuso ni cabeceras de navegador suficientes, y la rotación de refresh token
no es atómica bajo concurrencia.

**Ruta de decisión:** resolver los P0/P1 AS-IS mediante una SDD de hardening;
después diseñar RLS, roles DB y runtime distribuido antes del Bloque B.

## Evidencia disponible y límites

| Actividad | Resultado | Interpretación |
|---|---|---|
| Docker local | Backend y PostgreSQL `healthy`; frontend disponible | Verifica el entorno de desarrollo, no el despliegue productivo. |
| Suite integrada inicial | 715/717 pruebas aprobaron; 2 expiraron a 5 s | No se aceptó como gate final. |
| Repetición de los timeout | 21/21 aprobaron aisladas | Apunta a contención/paralelismo, no a fallo funcional reproducible; falta estabilizar la suite completa. |
| Auth, roles, acceso, bridges y Meta | 116/116 aprobaron | Evidencia de regresión funcional de controles ya existentes. |
| Builds TypeScript | Frontend y backend aprobaron | No sustituye SAST/DAST. |
| Dependencias de producción | `pnpm audit --prod --json`: 1 hallazgo **high** | `deepmerge-ts@7.1.5`, transitiva por Prisma, GHSA-ggr8-5vv4-36mx. |
| Revisión estática/manual | Backend, frontend, Prisma, Compose y documentos | No se ejecutó pentest, DAST autenticado, prueba de carga ni escaneo de imagen. |

> El aviso de pnpm 11 indica que `pnpm.onlyBuiltDependencies` dentro de
> `package.json` se ignora. La política de builds permitidos debe vivir en la
> configuración compatible de workspace y validarse en CI.

## Ventajas de seguridad implementadas

| Concepto | Implementación actual | Beneficio | Mantener/verificar |
|---|---|---|---|
| Hash de contraseñas | Argon2id en backend | Resiste mejor ataques offline que hashes rápidos | Parámetros de coste revisados y test de login. |
| Sesión y tokens | JWT con `issuer`, `audience`, tipo y expiración; refresh rotado, hasheado y revocable por familia | Limita reutilización y permite invalidar una familia | Mantener access token corto y revocación. |
| Cifrado en reposo | AES-256-GCM para `tokenCifrado` de plataformas | Confidencialidad e integridad de tokens de bridge | No loguear texto plano ni claves; incorporar rotación. |
| Webhooks | Verificación HMAC y comparación temporalmente segura para Meta | Reduce suplantación del emisor | Exigir la misma regla para cada proveedor futuro. |
| Autorización | Rol y acceso al recurso se validan en backend | Reduce IDOR y acciones no autorizadas | El frontend sólo mejora UX; nunca es la barrera. |
| Validación y mass assignment | Zod en el borde y esquemas de campos permitidos | Rechaza payloads malformados/campos no soportados | Usar esquemas estrictos y allowlists en rutas nuevas. |
| SQL e inyección | Prisma y consultas raw con `Prisma.sql` parametrizado | Evita interpolación SQL directa | Prohibir `$queryRawUnsafe`/`$executeRawUnsafe` en CI. |
| Transacciones e ingesta | Eventos de lead con la mutación y cola/inbox con leases + `SKIP LOCKED` | Reduce duplicados y pérdida de eventos | Conservar publicación SSE posterior al commit. |
| Errores | `AppError` y handler central | Evita stack traces y detalles técnicos al usuario | Añadir logging seguro de los 5xx. |
| XSS básico | React sin `dangerouslySetInnerHTML`; bearer no viaja en URL SSE | Reduce XSS reflejado/robo por URL | Añadir CSP y no introducir HTML sin sanitización. |
| Secretos | `.env` no versionado, valores de desarrollo separados | Evita exponer credenciales en Git | Migrar secretos de producción a un secret manager. |

## Riesgos y correcciones del AS-IS

### P0 — bloquear producción hasta tratar

| Hallazgo | Riesgo | Corrección y evidencia de cierre |
|---|---|---|
| `deepmerge-ts@7.1.5` vulnerable transitiva por Prisma | Denegación de servicio por recursión/stack exhaustion según GHSA-ggr8-5vv4-36mx | Actualizar el árbol Prisma con SDD, revisar lockfile, ejecutar pruebas, `pnpm audit --prod`, SBOM y escaneo de imagen sin vulnerabilidades high/critical aceptadas. |

### P1 — próximo bloque de hardening

| Área | Hallazgo | Corrección requerida |
|---|---|---|
| DDoS, bots y rate limiting | Login, refresh, webhooks y SSE no tienen cuota/tamaño/conexiones explícitos | WAF/proxy y límites por IP, usuario, bridge/API key y endpoint; body limits por ruta; timeout, backpressure y máximo SSE por usuario/IP; métricas y alertas de rechazo. |
| Amplificación de alertas | Firma Meta o bridge key inválida puede generar log/notificación por petición | No crear notificación individual por rechazo no autenticado; agrupar, muestrear y limitar logs/alertas. |
| Concurrencia de refresh | Revocación read-then-update permite dos sucesores ante refresh simultáneo | CAS transaccional: `UPDATE ... WHERE revocado_en IS NULL RETURNING`; sólo el ganador crea sucesor y el perdedor revoca la familia idempotentemente. |
| Cookie, XSS y CSRF | Refresh token está en `localStorage`; faltan CSP/cabeceras | Migrar refresh a cookie `HttpOnly; Secure; SameSite=Lax/Strict`, de scope mínimo. Con cookie, añadir token CSRF u origen estricto y pruebas negativas. |
| Cabeceras/TLS/caché | No hay baseline de CSP, anti-frame, nosniff, referrer/permissions policy, HSTS o `no-store` para PII | Definirlos en proxy/app de producción; HSTS sólo detrás de HTTPS y con proxy confiable. |
| Observabilidad | El usuario no recibe stack trace, pero falta trazabilidad segura de 5xx y ataques | Correlation ID, logs allowlist/redactados, alertas de auth/webhook/rate-limit/jobs. Nunca registrar password, JWT, refresh token, payload completo, `tokenCifrado`, secreto Meta o llave AES. |

### P2 — consistencia y operación

- Aplicar bloqueo pesimista o versión optimista/CAS a transición/asignación de
  leads y cancelación/resultado de citas; probar dos solicitudes simultáneas.
- Separar Compose de desarrollo del despliegue: imagen multi-stage, usuario no
  root, filesystem read-only cuando aplique, `cap_drop`, límites de recursos,
  política de reinicio/logs, red segmentada y secretos gestionados.
- Crear política de rotación/versionado de claves AES/JWT, revocación, backup,
  restore probado, PITR, RPO/RTO y retención/minimización de PII.
- Traducir 403 y errores conocidos en UI a mensajes seguros y acciones claras;
  no mostrar operaciones que el backend ya sabe imposibles o mostrar la
  capability derivada del servidor.

## OWASP Top 10: mapa de cobertura

| Categoría OWASP 2025 | Estado actual | Próximo control verificable |
|---|---|---|
| A01 Control de acceso | Roles y recurso en backend; sin aislamiento por tenant | Pruebas por recurso y, TO-BE, RLS/cross-tenant. |
| A02 Configuración incorrecta | CORS explícito; faltan hardening de proxy, cabeceras y Compose prod | Baseline de headers, TLS y exposición de red. |
| A03 Cadena de suministro | pnpm lockfile; advisory high abierto | Audit/SBOM/escaneo de imagen en CI. |
| A04 Criptografía | Argon2id, AES-GCM, hashes de refresh | Gestión y rotación de claves, cookie segura. |
| A05 Inyección | Zod y SQL parametrizado | Regla CI contra SQL unsafe, fuzzing de entradas. |
| A06 Diseño inseguro | Inbox transaccional; carreras en mutaciones | CAS/locks, threat model por flujo. |
| A07 Autenticación | JWT/rotación/revocación | Throttling, anti-bot, lockout progresivo y MFA si el riesgo lo exige. |
| A08 Integridad software/datos | Eventos y commits transaccionales | CI reproducible, imágenes inmutables y firmas/attestation según plataforma. |
| A09 Logging/alertas | Redacción parcial | Telemetría segura, alertas y retención. |
| A10 Manejo de excepciones | Errores genéricos hacia cliente | Pruebas de 400/413/5xx y logs internos redaccionados. |

## Requisitos de seguridad para el TO-BE multi-tenant

No implementar estos cambios fuera del change SDD de los bloques B–F.

1. **Aislamiento DB (P0).** Rol de migración separado del rol de aplicación,
   sin `BYPASSRLS`; `ENABLE` + `FORCE ROW LEVEL SECURITY`, políticas `USING` y
   `WITH CHECK`, y contexto de empresa sólo dentro de la transacción con
   `set_config('app.empresa_id', ..., true)`. Nunca aceptar `empresaId` del
   cliente como autoridad: derivarlo de la membresía activa del servidor.
2. **Invariantes del modelo (P0).** Resolver identidad global por correo,
   unicidad de membresías con NULL y FKs compuestas empresa-producto-
   oportunidad. La validación de aplicación no sustituye constraints de BD.
3. **Escalado seguro (P0).** El EventBroker SSE y locks de jobs en memoria no
   funcionan entre réplicas. Separar API/worker, usar outbox/cola durable,
   pub/sub compartido y lock distribuido/advisory lock. SSE sólo es UX, nunca
   la fuente de estado.
4. **Scope integral (P1).** Repositories, raw SQL, notificaciones, caché de
   frontend, métricas y eventos deben incluir empresa/membresía de origen
   servidor; probar explícitamente A→B en lectura, escritura, jobs y SSE.

## Plan de pruebas y registro de evidencia

Las pruebas siguientes **no se han ejecutado**, salvo donde el estado diga
"hecho". Cada SDD de seguridad debe registrar comando, versión de herramienta,
fecha, entorno aislado, resultado y evidencia redaccionada en
Engram (`sdd/<change>/apply-progress` o `verify`, artifact store — no `openspec/`); los resultados consolidados se reflejan
en este documento, no en handoffs temporales.

| Prioridad | Prueba | Estado | Evidencia mínima de aceptación |
|---|---|---|---|
| P0 | Repetir suite completa con concurrencia/timeout estabilizado | Pendiente | 100% verde; duración y configuración registradas. |
| P0 | Audit de dependencias, SBOM y escaneo de imagen | Parcial: audit hecho | Sin high/critical no aceptados; SBOM adjunto/ubicación de artefacto. |
| P1 | Prueba de refresh concurrente | Pendiente | Dos requests simultáneos producen un solo sucesor válido. |
| P1 | Límites anti-abuso | Pendiente | 429 consistente, no hay amplificación de DB/notificaciones y el servicio se recupera. |
| P1 | DAST autenticado en entorno aislado | Pendiente | Hallazgos clasificados, falsos positivos justificados, remediación enlazada a SDD. |
| P1 | Pruebas CSRF/cookie y CSP | Pendiente hasta adoptar cookie | Origen cruzado/CSRF falla; flujo legítimo funciona; CSP bloquea inyección de prueba. |
| P2 | Fuzzing de schemas, headers y payloads de webhook | Pendiente | 4xx seguro sin crash, timeout ni PII en respuesta/log. |
| P2 | Carga de login/webhook/SSE | Pendiente | Presupuesto de latencia, conexiones, 429 y consumo de recursos respetados. |
| P2 | Restore y prueba de backup | Pendiente | Restore íntegro en entorno desechable contra RPO/RTO declarados. |
| TO-BE P0 | Aislamiento RLS cross-tenant | Pendiente hasta Bloque B | Empresa A no lee/escribe A través de ORM, raw SQL, job, SSE ni cache. |
| TO-BE P0 | Dos réplicas API/worker | Pendiente | No se duplican jobs/notificaciones ni se pierden eventos. |

## Criterio de mantenimiento documental

- `docs/17-seguridad-y-ciberseguridad.md` es la **guía operativa** para cambios
  cotidianos y checklist previo a merge.
- Este documento es el **único informe consolidado** de hallazgos, evidencia y
  plan de pruebas de seguridad.
- Los handoffs temporales de auditoría fueron eliminados para no competir con
  estas fuentes. La cronología técnica queda en Git y la evidencia de cada SDD
  en su `verify.md`.

## Referencias

- [OWASP Top 10 2025](https://owasp.org/Top10/2025/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
