# Bloque F — Endurecimiento e integraciones compartidas

> Fase 7 de `docs/16-hallazgos-y-preguntas.md` §7 ("Retiro legacy"). Cubre
> Fase 7 de `docs/14-evolucion-multitenant.md` §13 ("Endurecimiento y retiro
> legacy").

## Alcance

Cerrar la migración multi-tenant: convertir a `NOT NULL` el ownership por
empresa que Bloque B introdujo como nullable, retirar la compatibilidad
legacy (`Usuario.rol`), y fijar la regla de credenciales por bridge cuando
una misma cuenta publicitaria de Meta se comparte entre empresas del mismo
holding.

## Requiere cerrado

- **Bloques B, C, D y E** — este bloque retira la compatibilidad temporal
  que esos bloques dejaron activa; retirarla antes rompería el rollback.

## Decisión que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D12 — Integraciones compartidas**: sin ownership compartido entre
  empresas — cada empresa registra y mantiene sus propias credenciales,
  siempre, aunque la cuenta publicitaria real de Meta detrás sea la misma
  para varias empresas del holding.

## Nota de esquema (movida desde `docs/16` §8, D12)

No hace falta ningún cambio de esquema adicional a lo ya introducido en
Bloque B: `CuentaPublicitaria` ya tiene `@@unique([bridgeId, idExterno])`
— único por bridge, no globalmente por `idExterno`. Una vez que `Bridge`
tenga `empresaId` NOT NULL (cierre de este bloque), el mismo `idExterno` de
Meta puede registrarse en más de una fila (una por empresa) sin conflicto.
Cada empresa configura su propio `tokenCifrado` para "su copia" de esa
cuenta; si el token se renueva, hay que actualizarlo en cada fila por
separado — costo operativo aceptado a cambio de aislamiento total entre
empresas, mismo criterio que las credenciales de login por empresa
(Bloque B, D-login).

## Migración (de `docs/14` §13, Fase 7)

- Convertir `Bridge.empresaId`, `Lead.empresaId` y el resto del ownership
  aditivo de Bloque B a `NOT NULL`.
- Retirar `Usuario.rol`, el `enum RolUsuario` y cualquier relación de
  responsabilidad no scopeada por empresa que haya quedado como
  compatibilidad temporal.
- Retirar endpoints v1 que dependían del rol plano, o fijar una fecha de
  deprecación explícita si todavía tienen consumidores.
- Validar backup, rollback, migración de producción y aislamiento de punta a
  punta antes de considerar cerrada la evolución multi-tenant.
- Actualizar el criterio de terminado y los documentos AS-IS
  (`docs/00`, `docs/03`, `docs/06`) para reflejar el esquema final.

## Criterios de salida

- Ninguna columna de ownership multi-empresa queda nullable por
  compatibilidad.
- `Usuario.rol` no existe más en el esquema ni en el código de autorización.
- Backup, rollback y migración de producción verificados con evidencia, no
  solo planificados.
- `docs/00-estado-documentacion.md` refleja el esquema multi-tenant como
  AS-IS vigente, no como TO-BE.

## Bloque anterior

Este es el último bloque de la migración multi-tenant. No hay bloque
siguiente dentro de este plan.
