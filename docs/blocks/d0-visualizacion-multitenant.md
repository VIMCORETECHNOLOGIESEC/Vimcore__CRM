# Bloque D0 — Visualización de la separación multiempresa

> **Decisión de calendario:** D0 es el único slice multi-tenant que se
> implementa antes del despliegue. Hace visible el aislamiento empresarial
> ya existente en Bloques B/C; no incorpora comportamiento de Bloque D.

## Ruta rápida de revisión

1. Confirmar la secuencia canónica `login → tokens → perfil → estado UI`.
2. Verificar que `empresaNombre` se resuelve en el servidor desde el
   `empresaId` canónico de la sesión.
3. Probar dos empresas del mismo tenant holding y observar que cada sesión
   identifica su scope y solo muestra sus propios datos.
4. Confirmar que no hay cambios Prisma, routing, autoridad ni dashboards.

## Estado (2026-08-29, actualizado)

Backend implementado y probado: `a5d7c4f` (`feat(bloque-d0): resolver
empresaNombre server-side en GET /auth/perfil`) agrega
`empresa.repository.ts::findById` y extiende `auth.controller.ts::getPerfil`
para incluir `empresaNombre`; falla cerrada si una sesión company no puede
resolver su `Empresa`. 5 tests nuevos, suite completa 899/899.

Frontend implementado y probado:

1. **Tipado** (`frontend/src/tipos/usuario.ts`): `AuthenticatedUser` ahora
   extiende un nuevo `PublicUser` (forma exacta de `POST /auth/login`) con
   `sessionScope`/`empresaId`/`empresaNombre`/`membresiaId?`, calcado del
   contrato de este doc y verificado contra `PerfilResponse`
   (`auth.controller.ts`). `autenticacion.api.ts::LoginResponse.user` pasó a
   `PublicUser` (antes reusaba `AuthenticatedUser`, que ya no es su forma
   real desde que se amplió).
2. **`AuthContext.tsx` — auditoría contra la tabla de estados**: el manejo de
   401 (purga de tokens vía `httpClient.ts::expireSession`,
   `httpClient.test.ts`) y de fallo transitorio (tokens intactos, `user`
   pasa a `null`) ya cumplían el contrato sin cambios. Se encontraron y
   corrigieron dos brechas reales:
   - `login()` hidrataba el estado autenticado con `response.user` de
     `POST /auth/login` — que nunca trae `sessionScope`/`empresaId`/
     `empresaNombre` (decisión explícita de este doc). Se corrigió para que,
     igual que la rehidratación de arranque, `login()` llame también a
     `GET /auth/perfil` y construya la sesión ÚNICAMENTE con esa respuesta
     ("Secuencia obligatoria"). Diseño propio no 100% explicitado en el doc:
     si el perfil post-login falla o es inconsistente, los tokens ya
     emitidos por el login válido se conservan (mismo criterio que "fallo
     transitorio") y se propaga un error para que `LoginPage` lo muestre.
   - Fila "Perfil incompleto o inconsistente": se agregó
     `esPerfilConsistente()` como guarda defensiva del lado cliente
     (independiente del fallo cerrado que ya hace el backend) — una sesión
     `company` sin `empresaId`/`empresaNombre` resueltos, o una `holding` que
     sí trae empresa atribuida, resuelve a `user: null` en vez de hidratar un
     scope ambiguo.
3. **UI** (`frontend/src/layouts/Header.tsx`): una línea nueva dentro del
   `DropdownMenuLabel` existente (mismos tokens `text-xs`/
   `text-muted-foreground` que ya usaba el correo) — `"Empresa:
   <empresaNombre>"` para sesión `company`, `"Alcance: Holding"` para
   `holding`. No comparte terreno de datos con `configuracion-empresa` (ver
   sección de colisión conceptual abajo) ni usa `--marca-color`/
   `.tema-empresarial` (Header no está envuelto en esa clase).
4. **Seed** (`backend/prisma/seed.ts`): dos empresas demo (`Empresa A`/
   `Empresa B (demo D0)`, mismo tenant holding — esta instancia no tiene un
   modelo `Holding` separado), cada una con una `Membresia.correo`
   company-scoped propia (dual-login-routing), un bridge `GOOGLE_FORMS`
   inactivo y un cliente + lead propios y distinguibles por empresa.
5. **Tests**: `frontend/tests/AuthContext.test.tsx` (7 tests nuevos —
   hidratando, company listo, holding listo, 401, fallo transitorio, y 2 de
   perfil inconsistente — más ajustes a los tests preexistentes de login/
   logout/hasRole para el nuevo paso de `login()`) y
   `frontend/tests/layouts/Header.test.tsx` (2 tests nuevos del indicador).
   Suite frontend completa: 479/479. Backend: sin cambios de código de
   producción en este paso (solo `seed.ts`, no ejercitado por la suite
   automatizada); `tsc --noEmit` limpio en ambos paquetes.

Este contrato reemplaza, para efectos de qué se ejecuta antes del despliegue,
la entrada directa a Bloque D completo.

## Riesgo de colisión conceptual con `configuracion-empresa` (anotado 2026-08-29)

La rama `feature/tema-empresarial-integracion` ya tiene un módulo
`configuracion-empresa` (`backend/src/{controllers,repositories,routes,
schemas,services}/configuracion-empresa.*`,
`frontend/src/funcionalidades/configuracion-empresa/configuracion-empresa.api.ts`)
con un modelo **singleton sin `empresaId`** — una sola fila para toda la
instancia, con un campo `nombre` (string, ≤80 chars) pensado como nombre de
marca de la instancia/pantalla de bienvenida post-login, junto a
`colorPrimario`/`colorSecundario`.

No hay relación de datos entre ambos: `ConfiguracionEmpresa.nombre` es texto
de marca global de la instancia; `empresaNombre` (este bloque) es el nombre
real de la empresa-tenant, resuelto por fila desde `Empresa`. No es una
violación de alcance de D0 — ninguno de los dos objetivos se pisa a nivel de
dato o de autoridad — pero ambos van a convivir en el mismo terreno visual
(`LoginPage`/`Header`) y comparten vocabulario ("empresa", "nombre"), lo que
se presta a confusión de usuario si no se etiqueta explícitamente en la UI
cuál es cuál (p. ej. "Empresa: <empresaNombre>" vs. el nombre de marca de la
instancia en la pantalla de bienvenida). Dejar esto resuelto en el diseño del
indicador antes de integrarlo, no como ajuste posterior.

**Verificado en código (2026-08-29):** `configuracion-empresa.api.ts` y
`ConfiguracionEmpresaPage.tsx` documentan explícitamente "App single-tenant
(AGENTS.md §1): esta es la ÚNICA configuración para todo el despliegue... a
propósito NO se agrega lógica multi-tenant acá". El commit `78635db` en
`feature/tema-empresarial-integracion` ya mergeó el backend de D0
(`sessionScope`/`empresaId` multi-tenant) en la misma rama donde vive ese
módulo deliberadamente single-tenant — no es solo un choque de UI, es una
premisa de diseño escrita que convive con código multi-tenant real en el
mismo árbol. No bloquea D0 (el indicador va en el shell autenticado
post-login, `configuracion-empresa` solo se lee en el splash de login), pero
alguien debería dejar registrada la decisión de que `configuracion-empresa`
sigue siendo instancia-global a propósito y no se reconvierte a per-tenant
como parte de D0.

## Objetivo

Hidratar en el frontend el scope tenant canónico que el backend ya expone y
mostrar un indicador persistente del alcance de la sesión. La demostración
debe usar dos empresas o scopes empresariales distintos dentro del **mismo
tenant holding**, no presentarlos como fronteras tenant separadas.

## No objetivos

- No scopear el pool de asignación por empresa (D3).
- No cambiar autoridad de cierre ni reemplazar `Usuario.rol` (D7/F).
- No crear `Oportunidad`, `Producto`, dashboards jerárquicos ni
  superadministración de holding.
- No agregar claims al token ni aceptar `empresaId` enviado por el cliente
  como fuente de autoridad.
- No modificar schema, migraciones ni archivos de alto riesgo enumerados en
  `docs/06-modulos-backend.md`.

## Contrato de autenticación e hidratación

### Decisión: `POST /auth/login` no se amplía

`POST /auth/login` conserva su contrato actual: devuelve tokens y
`PublicUser { id, nombre, correo, rol }`. D0 no duplica el scope tenant en esa
respuesta ni inventa claims nuevos. La fuente canónica para hidratar la sesión
es `GET /auth/perfil`, que ya devuelve el `AuthenticatedUser` resuelto por el
backend con `sessionScope`/`empresaId` y, para sesiones company,
`membresiaId`.

Secuencia obligatoria:

1. El usuario envía credenciales a `POST /auth/login`.
2. El cliente conserva los tokens mediante el mecanismo vigente.
3. Antes de montar contenido protegido o ejecutar queries de negocio,
   `AuthContext` solicita `GET /auth/perfil` con el token recibido.
4. El frontend construye su estado autenticado únicamente con la respuesta
   de perfil y muestra el indicador de scope.

Una recarga con tokens vigentes comienza directamente en el paso 3. Ni el
storage del navegador, ni parámetros de ruta, ni payloads del cliente pueden
sobrescribir `empresaId`, `membresiaId` o `sessionScope`.

### Extensión mínima de `GET /auth/perfil`

El backend agrega `empresaNombre` a la respuesta de perfil:

- Sesión `company`: usa el `empresaId` canónico ya resuelto server-side para
  leer `Empresa.nombre`; devuelve ese nombre junto con `empresaId` y
  `membresiaId`.
- Sesión `holding`: devuelve `empresaId = null`, `empresaNombre = null` y un
  scope de holding; `membresiaId` está ausente porque no existe una membresía
  holding-wide. La UI muestra un label estable como **“Alcance: Holding”** sin
  inventar ni elegir una empresa concreta.

Si una sesión `company` no puede resolver la `Empresa` asociada a su
`empresaId` canónico, el perfil falla de forma cerrada; no se degrada a un
nombre aportado por el cliente ni a un scope ambiguo.

## Contrato frontend

Tipos mínimos:

```ts
type SessionScope = "company" | "holding";

interface AuthenticatedUser extends PublicUser {
  sessionScope: SessionScope;
  empresaId: string | null;
  empresaNombre: string | null;
  membresiaId?: string;
}
```

Estados observables de `AuthContext`:

| Estado | Comportamiento requerido |
|---|---|
| Hidratando perfil | Mostrar estado de carga autenticada; no montar vistas ni queries de negocio. |
| Perfil company listo | Mostrar `Empresa: <empresaNombre>` y habilitar la aplicación protegida. |
| Perfil holding listo | Mostrar `Alcance: Holding`, sin empresa concreta. |
| Perfil responde 401 | Invalidar y purgar la sesión, incluidos tokens y scope hidratado, y volver a login. |
| Fallo transitorio de perfil | No reutilizar scope/empresa anterior ni montar queries de negocio; permitir reintentar el perfil. Conservar tokens solo si el fallo no indica que la autenticación es inválida. |
| Perfil incompleto o inconsistente | Tratarlo como fallo cerrado: no mostrar datos de negocio ni construir un scope ambiguo. |

El indicador debe permanecer visible en el shell autenticado (`Header` o
`Sidebar`) y no depender de que el usuario recuerde con qué credencial entró.
El frontend lo usa para orientación; la autorización sigue siendo exclusiva
del backend.

## Datos de demostración

El seed debe incluir:

- dos empresas A/B pertenecientes al mismo tenant holding;
- un usuario con membresía company-scoped para cada empresa;
- al menos un bridge y leads propios por empresa, con datos distinguibles.

No se modifica el schema. Los datos deben permitir iniciar sesión por separado
y reconocer visualmente tanto el nombre de empresa como la ausencia de datos
de la empresa hermana.

## Pruebas y criterios observables

### Contrato backend

- `POST /auth/login` conserva `PublicUser { id, nombre, correo, rol }`; no se
  agregan `empresaId`, `membresiaId`, `sessionScope` ni `empresaNombre`.
- `GET /auth/perfil` de una sesión company devuelve el scope canónico y
  `empresaNombre` leído desde `Empresa` mediante ese `empresaId`.
- `GET /auth/perfil` de una sesión holding devuelve `sessionScope = holding`
  y no atribuye una empresa concreta ni incluye `membresiaId`.
- Una empresa inexistente o inconsistente en una sesión company falla de
  forma cerrada.

### Contrato frontend

- La aplicación respeta `login → tokens → perfil → estado UI`; no ejecuta
  queries de negocio antes de completar el perfil.
- Los estados company, holding, carga y fallo son verificables en pruebas de
  `AuthContext` y del indicador visual.
- Un 401 de perfil purga la sesión y vuelve a login.
- Un error transitorio bloquea queries de negocio, no deja visible información
  ni scope anterior y permite reintentar el perfil sin purgar tokens válidos.

### Demostración de aislamiento visible

- El usuario de Empresa A ve `Empresa: A` y solo datos de A.
- El usuario de Empresa B ve `Empresa: B` y solo datos de B.
- Ambas empresas se describen como scopes empresariales distintos dentro del
  mismo tenant holding.
- La demostración prueba aislamiento de **lectura visible** ya garantizado por
  Bloque C; no afirma que routing o autoridad estén scopeados por empresa.

## Archivos permitidos y límites de riesgo

Cambios esperados y acotados:

- resolución server-side de `empresaNombre` en autenticación/perfil;
- tipos y estado de autenticación frontend;
- indicador visual en el shell autenticado;
- seed/fixtures y pruebas específicas de D0.

Permanecen sin cambios `backend/prisma/schema.prisma`, migraciones y todos los
archivos de alto riesgo de `docs/06-modulos-backend.md`, en particular
`asignacion.service.ts`, `leads.access.ts`, `jwt.ts`, middlewares de rol,
`event-broker.ts`, `httpClient.ts`, `router.tsx` y `layouts/navigation.ts`.
Si la implementación real exigiera tocar uno de ellos, D0 se detiene y el
alcance se vuelve a revisar; no se amplía silenciosamente.

> **Excepción explícita (tema-empresarial-integracion, Parte 2, 2026-08-29)**:
> el usuario decidió que cada `Empresa` tenga su propio color de marca REAL,
> no un fallback derivado ni un color compartido. Esto agrega
> `Empresa.colorPrimario`/`colorSecundario` (nullable) al schema y una
> migración nueva (`20260829050000_empresa_color_marca`) -- la única
> excepción puntual a la restricción de arriba, acotada a esas dos columnas.
> `ConfiguracionEmpresa` (branding global de la instancia) sigue intacta y
> sigue siendo la fuente para el boot pre-login y para cualquier empresa sin
> color propio -- la restricción original sobre `schema.prisma`/migraciones
> sigue vigente para todo lo demás.

> **Excepción explícita (tema-empresarial-integracion, Tarea 3 + Parte 3/PASO
> 5-7, 2026-08-29)**: sobre la misma base de la excepción anterior, se agregó
> autoridad de ESCRITURA acotada, siempre scoped a la sesión, nunca a un
> `empresaId`/id que venga del cliente:
> - `PATCH /empresas/actual/apariencia` -- self-service, exclusivo
>   `ADMINISTRADOR` de una sesión `company` sobre SU PROPIA `Empresa`
>   (`colorPrimario`/`colorSecundario`/`logoUrl`, 403 para sesión `holding`).
>   Sin UI todavía a propósito (backend + capa de datos frontend,
>   fundacional para el "gestor de empresas" del holding, tarea aparte).
> - `logoUrl` (nullable) agregado a `Empresa` y a `ConfiguracionEmpresa`
>   (migración `20260829060000_marca_logo_url`), mismo patrón que los
>   colores, misma jerarquía de 3 niveles (empresa propia -> holding en
>   vivo -> sin logo/default de fábrica).
> - `GET /marca-publica` (nuevo, SIN `requireAuthentication`, rate-limited):
>   expone únicamente `nombre`/`colorPrimario`/`colorSecundario`/`logoUrl`
>   de `ConfiguracionEmpresa` para el boot pre-login y el panel de login,
>   que todavía no tienen sesión. Verificado y aceptado por el usuario: no
>   existe modelo `Holding` todavía, cada instancia desplegada es un solo
>   holding, así que esto no es una fuga entre holdings distintos.
>
> Sigue sin tocarse ningún archivo de alto riesgo de la lista de arriba, y
> la restricción original sobre `schema.prisma`/migraciones sigue vigente
> para todo lo que no sea branding de marca.

## Dependencia satisfecha

- **Bloque C** está cerrado en `052e811` con 894/894 tests. D0 consume el
  aislamiento, TenantContext y RLS existentes; no los reemplaza.

## Siguiente bloque

Bloque D completo (`docs/blocks/d-routing-oportunidad.md`) se retoma después
del despliegue. Sus artefactos Engram #83-#86 siguen siendo la base y deben
ajustarse al calendario vigente antes de `apply`, no rehacerse desde cero.

## Credenciales de demostración

Documento de referencia, no una pantalla real de la app -- exponer
contraseñas de seed en una UI en vivo (aunque sea de demo) es un
antipatrón de seguridad, incluso en desarrollo. Datos de `backend/prisma/seed.ts`
(Bloque D0 + tema-empresarial-integracion, Parte 2). La contraseña es la
MISMA para todos: el valor de desarrollo de `SEED_PASSWORD` en `.env.example`
(`dev_local_password_123`), nunca un secreto real.

| Correo | Rol | Contexto | Password (`SEED_PASSWORD`) |
| --- | --- | --- | --- |
| `admin@crm.local` | ADMINISTRADOR | Holding (sin empresa atribuida) | `dev_local_password_123` |
| `supervisor@crm.local` | SUPERVISOR | Holding (sin empresa atribuida) | `dev_local_password_123` |
| `asesor@crm.local` | ASESOR | Holding (sin empresa atribuida) | `dev_local_password_123` |
| `vendedor@crm.local` | VENDEDOR | Holding (sin empresa atribuida) | `dev_local_password_123` |
| `empresa-a@crm.local` | ASESOR (`Membresia`) | Empresa A (demo D0) -- color propio `#7c2d12`/`#f97316` | `dev_local_password_123` |
| `empresa-b@crm.local` | ASESOR (`Membresia`) | Empresa B (demo D0) -- color propio `#065f46`/`#10b981` | `dev_local_password_123` |

Las dos últimas filas inician sesión por el camino `Membresia.correo`
(dual-login-routing, Bloque B) -- `empresa-a-demo@crm.local`/
`empresa-b-demo@crm.local` (`Usuario.correo` "portador" de esa membresía) NO
son credenciales de login, solo la fila `Usuario` subyacente.
