# 17 — Política operativa de ciberseguridad

> **Estado:** vigente. Define los controles que deben conservarse o aplicarse
> al desarrollar. La evidencia y los hallazgos viven en
> [19-auditoria-ciberseguridad.md](19-auditoria-ciberseguridad.md).
>
> **Frontera:** el producto implementado es **single-company por despliegue**.
> Multi-tenant/holding es **TO-BE**; los controles de §2 son gates de los
> bloques B–F, no capacidades activas.

## Ruta rápida

1. Para el producto actual, aplicar §1 y el checklist de §3.
2. Para multi-tenant, implementar §2 sólo mediante el SDD del bloque B–F.
3. Registrar cada prueba en Engram (`sdd/<change>/apply-progress` o `verify`, artifact store — no `openspec/`, ver `docs/blocks/c-aislamiento.md`); actualizar
   `docs/19` únicamente con el resultado consolidado.
4. Nunca documentar, loguear ni incluir en fixtures contraseñas, secretos,
   tokens, payloads completos de webhook o PII innecesaria.

## 1. AS-IS — controles del CRM single-company

### 1.1 Controles implementados que no deben degradarse

| Control | Regla operativa |
|---|---|
| Contraseñas | Usar exclusivamente Argon2id en backend. Nunca devolver hashes ni registrar contraseñas. |
| Sesión | Access JWT con `issuer`, `audience`, tipo y expiración; refresh token rotado, hasheado y revocable por familia. |
| Tokens de plataformas | Cifrar tokens con AES-256-GCM; sólo servicios autorizados los descifran. Nunca devolver ni loguear el valor. |
| Webhooks | Validar firma del proveedor antes de procesar/persistir el payload; usar comparación temporalmente segura. |
| Autorización | El backend valida autenticación, rol y recurso en cada endpoint. La UI nunca es control de acceso. |
| Entrada | Validar `body`, `params`, `query`, `headers` y payload externo con Zod; preferir esquemas estrictos y allowlists. |
| SQL | Usar Prisma o `Prisma.sql` parametrizado. Prohibidos `$queryRawUnsafe`, `$executeRawUnsafe` e interpolar entrada externa. |
| Estado de negocio | Mantener mutación de lead y `lead_eventos` en la misma transacción; publicar SSE después del commit. |
| Errores | Responder con `AppError` o mensaje genérico sin stack trace, SQL, secretos ni detalles de infraestructura. |
| XSS | No usar `dangerouslySetInnerHTML` ni HTML sin sanitización aprobada. Mantener tokens fuera de URL. |

### 1.2 Gaps obligatorios antes de producción pública

| Prioridad | Control faltante | Regla de implementación |
|---|---|---|
| P0 | Dependencia vulnerable | Resolver el advisory de `deepmerge-ts` transitivo por Prisma; repetir audit, pruebas, SBOM y escaneo de imagen. |
| P1 | DDoS y bots | Límites en proxy/WAF y app por IP, usuario, bridge/API key y endpoint; body limit, máximo SSE, timeout y backpressure. |
| P1 | Login | Throttling progresivo, respuesta uniforme contra enumeración, anti-bot proporcional y alertas de abuso. |
| P1 | Refresh concurrente | Compare-and-swap transaccional: una carrera produce un único sucesor válido. |
| P1 | Cookie, XSS y CSRF | Mientras refresh esté en `localStorage`, reducir XSS con CSP. Si migra a cookie `HttpOnly; Secure; SameSite`, añadir CSRF y pruebas de origen cruzado. |
| P1 | Cabeceras/TLS/caché | CSP, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, `no-store` para PII y HSTS sólo sobre HTTPS. |
| P1 | Logs/alertas | Correlation ID, logs allowlist/redactados y alertas de 5xx, auth, rate limit, webhook y jobs. |
| P2 | Carreras de negocio | Lock/CAS para transiciones/asignación de leads y cambios de cita; pruebas simultáneas. |
| P2 | Operación | Imagen productiva no-root, secretos gestionados, red segmentada, backup/restore probado y rotación de claves. |

### 1.3 Privacidad y salida de red

- PII de `Cliente`/ `Lead`: exportaciones, soporte e integraciones respetan
  autorización y minimizan campos.
- CORS usa orígenes explícitos; nunca usar `*` para resolver un problema local.
- Las llamadas externas necesitan allowlist de dominios, timeout y cancelación;
  no construir URLs desde entrada no validada.
- No se detectó `exec`, `spawn` ni `eval`; mantener su prohibición salvo SDD
  con threat model y allowlist de argumentos.

## 2. TO-BE — gates de seguridad multi-tenant/holding

Estas reglas son precondiciones de los bloques B–F; no basta con filtros del
frontend o del repository.

### 2.1 Aislamiento y autorización

1. Derivar empresa activa de una membresía válida del servidor. Un `empresaId`
   enviado por cliente nunca autoriza.
2. Autorizar por membresía/rol/capacidad, no sólo por `usuarioId`; revocar
   membresía debe quitar el scope de sesión.
3. Todas las entidades, eventos, notificaciones, métricas, caché y SSE deben
   tener scoping empresarial verificable.
4. Probar Empresa A → Empresa B en lectura, escritura, asignación, exportación,
   raw SQL, jobs y SSE.

### 2.2 Row-Level Security en PostgreSQL

- Rol de migración separado del rol de aplicación; el rol app no puede ser dueño
  de tablas ni tener `BYPASSRLS`.
- `ENABLE` y `FORCE ROW LEVEL SECURITY` para toda tabla alcanzada; policies
  con `USING` y `WITH CHECK`.
- Contexto con `set_config('app.empresa_id', ..., true)` dentro de la misma
  transacción. Nunca usar estado global ni una conexión pooled sin reset.
- Probar RLS con ORM, `$queryRaw`, workers y conexiones reutilizadas.

### 2.3 Invariantes y runtime distribuido

- Materializar constraints para identidad por correo, membresías con NULL y
  relaciones Empresa–Producto–Oportunidad; un `find` previo no las sustituye.
- Antes de múltiples réplicas, reemplazar broker SSE y locks locales por
  outbox/cola durable, pub/sub compartido y lock distribuido/advisory lock.
- Incluir tenant/membresía en cache e invalidaciones; SSE sólo es UX, no fuente
  autoritativa de estado.

## 3. Checklist previo a merge

### Todo cambio

- [ ] Inputs externos validados con Zod y campos no permitidos rechazados.
- [ ] Autorización evaluada en backend para acción y recurso.
- [ ] No se exponen/loguean secretos, hashes, tokens o PII innecesaria.
- [ ] SQL parametrizado; no hay APIs unsafe ni comandos de sistema.
- [ ] Errores esperados tienen respuesta segura y 5xx conserva trazabilidad interna redaccionada.
- [ ] Hay pruebas de éxito, 401, 403, 404/409 y payload inválido.
- [ ] Dependencia nueva justificada en SDD, lockfile congelado y audit revisado.

### Autenticación, sesión o endpoint público

- [ ] Se definieron cuota, body limit, timeout y respuesta 429/413.
- [ ] Login/refresh no permite enumeración ni reutilización concurrente.
- [ ] Si hay cookies: CSRF y atributos `HttpOnly`, `Secure`, `SameSite` probados.
- [ ] CSP/CORS/caché revisados con el origen productivo.

### Multi-tenant

- [ ] Empresa derivada de membresía, no del payload.
- [ ] RLS y constraints DB cubren lectura y escritura; rol app sin bypass.
- [ ] Pruebas A→B fallan para API, raw SQL, job, SSE y cache.
- [ ] Eventos/auditoría/notificaciones conservan empresa y membresía origen.

## 4. Pruebas y evidencia mínima

| Prueba | Cuándo | Evidencia |
|---|---|---|
| Unitarias/integración | Cada SDD | Autorización, validación, transacción y carrera relevante. |
| Dependencias/imagen | CI y release | `pnpm audit --prod`, SBOM e imagen sin riesgos high/critical no aceptados. |
| DAST autenticado | Antes de producción pública | Entorno aislado, hallazgos clasificados y remediación enlazada. |
| Fuzzing/abuso | Endpoints públicos y webhooks | Rechazos 4xx/429 seguros, sin crash ni PII. |
| Carga | Login, refresh, webhook y SSE | Latencia, recursos, conexiones y recuperación documentadas. |
| RLS/multi-réplica | Bloques B–F | Matriz cross-tenant y dos réplicas API/worker. |
| Backup/restore | Antes de producción | Restore desechable contra RPO/RTO declarados. |

## 5. Fuente de evidencia y excepciones

- [19-auditoria-ciberseguridad.md](19-auditoria-ciberseguridad.md) es el informe
  único de hallazgos, resultados y plan global.
- Una excepción temporal requiere owner, alcance, vencimiento, mitigación y
  aceptación explícita en el SDD; no se oculta en código ni en un handoff.
- Un hallazgo conserva su prioridad hasta que su prueba de aceptación demuestre
  la corrección.
