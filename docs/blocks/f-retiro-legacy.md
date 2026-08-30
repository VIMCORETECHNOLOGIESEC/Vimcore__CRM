# Bloque F — Endurecimiento e integraciones compartidas

> Fase 7 de `docs/16-hallazgos-y-preguntas.md` §7 ("Retiro legacy"). Cubre
> Fase 7 de `docs/14-evolucion-multitenant.md` §13 ("Endurecimiento y retiro
> legacy").

## Alcance

Cerrar la migración multi-tenant: retirar la compatibilidad legacy que aún
queda, especialmente `Usuario.rol`/`RolUsuario` y sus referencias asociadas,
y fijar la regla de credenciales por bridge cuando
una misma cuenta publicitaria de Meta se comparte entre empresas del mismo
holding.

## Requiere cerrado

- **Bloques B, C, D y E** — este bloque retira la compatibilidad temporal
  que esos bloques dejaron activa; retirarla antes rompería el rollback.

## Estado real (2026-08-30)

**Precondición de autoridad holding-wide resuelta de forma aditiva** — ver
sección siguiente para el detalle histórico de la decisión, esto documenta
el resultado real ya implementado sobre `dev-mateo`: `RolUsuario` ganó dos
valores nuevos, `SUPERVISOR_HOLDING` y `SUPER_ADMIN`, con el mismo alcance
máximo entre los dos (acceso total holding-wide, sin restricción de
`empresaId`, capacidad de asignación manual) — migración aditiva, ningún
valor existente se tocó. El bypass está conectado en un solo punto
(`require-role.middleware.ts`), cubriendo todas las rutas gateadas por rol
fijo sin tocar los ~17-19 archivos que referencian `RolUsuario` hoy, más el
bypass equivalente en los chequeos de "acceso total" reescritos por el
corte de Bloque D (`leads.access.ts`, `oportunidad.access.ts`,
`oportunidad.service.ts`, `asignacion.service.ts`) y en
`metricas.access.ts`.

**Esto NO cierra Bloque F.** Es solo la parte aditiva — resuelve la
precondición de que exista un mecanismo de autoridad holding-wide antes de
poder retirar el legacy. El retiro real (`Usuario.rol`/`enum RolUsuario`
fuera del esquema y del código) sigue sin arrancar, sigue bloqueado por la
otra precondición de este documento (congelar/mergear `dev-back`/
`dev-front`) — no verificada como cumplida en esta actualización.

## Precondición bloqueante — autoridad holding-wide sustituta (sin resolver)

`Usuario.rol` legacy es hoy la **única** autoridad holding-wide implementada
(super admin de holding, administrador de holding, supervisor de holding —
D5/D6, `docs/16` §8). `Membresia.empresaId` es `NOT NULL` desde Bloque B/C:
no existe una membresía holding-wide, y esa restricción **no cubre** el caso
de autoridad a nivel holding — cubre solo el scope por empresa.

Retirar `Usuario.rol` sin haber implementado antes un reemplazo funcional
para ese scope holding-wide dejaría sin autoridad implementada a super
admin/administrador/supervisor de holding. Esta nota **no propone** ese
reemplazo — sería una decisión de producto/esquema que nadie tomó todavía
(D5/D6 registran el rol de negocio, no el mecanismo de autoridad que lo
reemplace).

**Candidato a reemplazo, sin decidir todavía (agregado 2026-08-29, ver
`docs/blocks/d-routing-oportunidad.md` §"Estructura de usuarios para el
holding"):** un usuario holding-scoped con `Membresia` real auto-provisionada
en cada empresa del holding (incluidas las que se creen después) reduce
"autoridad holding-wide" a "suma de autoridad por empresa", evaluable sin
`Usuario.rol` para todo lo que ya se decide por membresía (visibilidad de
leads, bridges, usuarios dentro de empresa). Plausible resolución de esta
precondición para esos casos — **no** para todos: crear la primera `Empresa`
de un holding no puede depender de una `Membresia` en una empresa que
todavía no existe, ese bootstrap queda como hueco sin cubrir por este
mecanismo. Sigue sin ser una decisión tomada — necesita diseño, aprobación e
implementación igual que cualquier otra alternativa, esta nota solo registra
que existe un candidato concreto donde antes no había ninguno.

**Bloque F no puede ejecutarse hasta que exista una autoridad holding-wide
sustituta diseñada, aprobada, implementada y verificada** (tests incluidos).
Esta precondición es adicional a la dependencia de secuencia de "Enfoque de
implementación" más abajo (congelar/mergear `dev-back`/`dev-front`); ambas
deben cumplirse antes de iniciar este bloque.

## Decisión que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D12 — Integraciones compartidas**: sin ownership compartido entre
  empresas — cada empresa registra y mantiene sus propias credenciales,
  siempre, aunque la cuenta publicitaria real de Meta detrás sea la misma
  para varias empresas del holding.

## Nota de esquema (movida desde `docs/16` §8, D12)

No hace falta ningún cambio de esquema adicional a lo ya introducido en
Bloque B: `CuentaPublicitaria` ya tiene `@@unique([bridgeId, idExterno])`
— único por bridge, no globalmente por `idExterno`. Como `Bridge.empresaId`
ya es `NOT NULL` desde Bloque C, el mismo `idExterno` de
Meta puede registrarse en más de una fila (una por empresa) sin conflicto.
Cada empresa configura su propio `tokenCifrado` para "su copia" de esa
cuenta; si el token se renueva, hay que actualizarlo en cada fila por
separado — costo operativo aceptado a cambio de aislamiento total entre
empresas, mismo criterio que las credenciales de login por empresa
(Bloque B, D-login).

## Migración (de `docs/14` §13, Fase 7)

- Inventariar las referencias legacy todavía existentes al iniciar el bloque;
  no volver a incluir `Bridge.empresaId` ni `Lead.empresaId`, ambos ya
  `NOT NULL` desde Bloque C.
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

- La precondición bloqueante de arriba está cumplida: existe autoridad
  holding-wide sustituta diseñada, aprobada, implementada y verificada.
- `Usuario.rol` no existe más en el esquema ni en el código de autorización.
- No quedan referencias de código, tipos, fixtures o contratos HTTP que
  dependan de `RolUsuario` como autoridad legacy.
- Backup, rollback y migración de producción verificados con evidencia, no
  solo planificados.
- `docs/00-estado-documentacion.md` refleja el esquema multi-tenant como
  AS-IS vigente, no como TO-BE.

## Enfoque de implementación — capas existentes, sin reestructuración

Directiva vigente (2026-08-28): mismo criterio de capas que Bloques D/E —
sin embargo, este bloque tiene una **incompatibilidad estructural real**
con la premisa de "no afectar al resto de devs", no solo un riesgo de
archivo compartido.

**Incompatibilidad de secuencia, no de arquitectura.** El alcance de este
bloque es retirar `Usuario.rol`/`enum RolUsuario` — verificado: 17 archivos
backend todavía lo referencian hoy (`rg -l "RolUsuario|usuario\.rol"
backend/src`). Mientras otros developers (`dev-back`) sigan
"perfeccionando el funcionamiento actual del single" usando esa misma
autoridad de rol, retirarla no es un cambio de contenido coordinable como
en D/E — es quitarles el suelo bajo los pies: cualquier código nuevo que
escriban contra `Usuario.rol` dejaría de compilar o de tener efecto en
cuanto este bloque se mergee. No hay forma de "avisar antes del PR" que
resuelva esto, porque no es un conflicto de merge, es una dependencia dura
de secuencia.

**Regla de secuencia explícita:** Bloque F solo puede ejecutarse después de
que el trabajo de `dev-back`/`dev-front` sobre el single-company legacy
quede congelado o ya mergeado a la rama de integración — nunca en paralelo.
Esto ya era cierto por diseño (`docs/16` §8 documenta el corte de
`Usuario.rol` como el cierre final de la migración), pero esta sección lo
deja explícito como bloqueante de proceso, no solo de arquitectura.

**Cuando llegue su momento, dentro de las capas existentes:**

- Editar los 17 archivos backend que referencian `RolUsuario`/`usuario.rol`
  (no crear una capa de compatibilidad nueva ni un archivo puente) —
  reemplazo directo por `Membresia.rol`/`habilitadoParaVenta`, ya cutover
  funcionalmente por Bloque D en `leads.access.ts` y el pool de asignación.
- `backend/prisma/schema.prisma` — se retira `enum RolUsuario` y la columna
  `Usuario.rol`; `Bridge.empresaId`/`Lead.empresaId` no cambian porque ya son
  `NOT NULL` desde Bloque C.
  Mismo archivo único ya extendido por A/B/C/D/E.
- `backend/src/lib/jwt.ts` + middlewares de rol — listado como alto riesgo
  en `docs/06` por ser transversal a toda ruta protegida; acá no es
  "coordinar", es el punto final del cutover, se edita una sola vez cuando
  el resto del código ya no depende de `Usuario.rol`.
- Sin archivos nuevos de primer nivel: este bloque es retiro de código
  dentro de archivos ya existentes, no adición.

## Bloque anterior

Este es el último bloque de la migración multi-tenant. No hay bloque
siguiente dentro de este plan.
