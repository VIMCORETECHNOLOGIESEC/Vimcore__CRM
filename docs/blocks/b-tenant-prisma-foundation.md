# Bloque B — Fundación tenant y esquema Prisma

> **Estado:** ✅ CERRADO — 2026-08-26
> **Commit:** 2526af7
> **Criterios de salida:** Todos cumplidos — Empresa/Membresia con backfill
> idempotente verificado, login dual, autorizador en sombra (Fase 2) y
> comparador de dedupe en sombra (Fase 3) implementados y verificados con
> 115/115 tests propios + suite completa 777/777.

> Fase 3 de `docs/16-hallazgos-y-preguntas.md` §7 ("Fundación tenant
> aditiva"). Cubre Fase 1-3 de `docs/14-evolucion-multitenant.md` §13
> ("Fundación aditiva", "Membresías y autorización en sombra",
> "Procedencia y deduplicación").

## Alcance

Introducir `Empresa` y `Membresia` en el esquema, reemplazar el enum plano
`Usuario.rol` por membresías por empresa, y resolver el ruteo de login
multi-empresa. Backfill aditivo sobre el esquema existente — sin retirar
columnas legacy todavía (eso es Bloque F).

## Requiere cerrado

- **Bloque A** (endurecimiento single-company) — migrar sobre atribución
  todavía rota duplica trabajo.

## Decisiones que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D1 — Frontera tenant**: Holding como tenant principal, empresas
  internas como scope funcional del lead.
- **D2 — Identidad y deduplicación**: Cliente compartido a nivel holding;
  Lead con scope por empresa; reingreso evaluado por (cliente, empresa).
- **D5 — Roles múltiples**: jerarquía de membresía (super admin / admin de
  holding / admin de empresa / supervisor / asesor con flag
  `habilitadoParaVenta`) reemplaza `enum RolUsuario`.
- **D11 — Topología física**: esquema compartido, una sola base de datos
  para todo el holding, sin `Holding` como tabla propia todavía.

## Esquema Prisma (implementado — reconciliado contra `backend/prisma/schema.prisma`, commit `2526af7`)

> Lo que sigue es el esquema TAL COMO quedó implementado, no el diseño TO-BE
> original de `docs/16` §8.2. Difiere del diseño original en varios puntos
> señalados abajo con "(desvío vs. diseño original)".

```prisma
model Empresa {
  id       String   @id @default(uuid()) @db.Uuid
  nombre   String   @db.Text
  creadoEn DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  membresias Membresia[]
  bridges    Bridge[]
  leads      Lead[]

  @@map("empresas")
}

enum RolMembresia {
  ADMINISTRADOR
  SUPERVISOR
  ASESOR

  @@map("rol_membresia")
}

model Membresia {
  id                  String       @id @default(uuid()) @db.Uuid
  usuarioId           String       @map("usuario_id") @db.Uuid
  empresaId           String       @map("empresa_id") @db.Uuid
  rol                 RolMembresia
  habilitadoParaVenta Boolean      @default(false) @map("habilitado_para_venta")
  correo              String?      @unique @db.Citext
  passwordHash        String?      @map("password_hash") @db.Text
  activa              Boolean      @default(true)
  creadoEn            DateTime     @default(now()) @map("creado_en") @db.Timestamptz(6)

  usuario       Usuario        @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  empresa       Empresa        @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]

  @@unique([usuarioId, empresaId, rol])
  @@index([usuarioId, activa])
  @@index([empresaId, rol])
  @@map("membresias")
}
```

**(desvío vs. diseño original) `Empresa` no tiene `activa` ni `slaHoras`.**
Ninguno de los dos campos se necesitó para lo que Bloque B implementó
(fundación aditiva + sombra); no se incluyeron en esta implementación. Quedan
disponibles para un bloque posterior si el diseño los sigue requiriendo.

**(desvío vs. diseño original) `Membresia.empresaId` es `String` (NOT NULL),
no `String?`.** El concepto de membresía holding-wide (`empresaId: null`)
descrito en el diseño original NO se implementó en este cambio — el acceso
holding-wide sigue siendo puramente `Usuario.rol`, sin cambios. Toda
`Membresia` real está scopeada a una `Empresa` concreta.

Cambios sobre modelos existentes: `Bridge.empresaId` (nuevo, **nullable** —
**(desvío vs. diseño original)** el diseño original decía "NOT NULL"; en la
implementación real un bridge sin empresa asignada no falla la ingesta y
`Lead.empresaId` simplemente queda `null`. Se vuelve NOT NULL recién en
Bloque F); `Lead.empresaId` (nuevo, nullable, con índice simple — **(desvío
vs. diseño original)** NO existe un unique compuesto de "lead abierto" por
cliente+empresa en el esquema; la comparación (cliente, empresa) es
puramente en sombra vía la tabla nueva `LeadAbiertoRevisionPendiente`, que
registra colisiones detectadas sin bloquear ni modificar el lead existente).
`Usuario.rol` y `enum RolUsuario` NO se tocan en este change — siguen siendo
la única autoridad real de autorización en producción; `Membresia` opera en
modo sombra (compara y loguea divergencias, nunca bloquea) hasta que Bloque
C/D corten el switch.

Ciclo de vida: quitar a alguien de una empresa es `Membresia.activa = false`,
nunca `DELETE`. `Usuario.activo` se recalcula automáticamente cuando pierde
su última membresía de empresa activa (excepto si conserva una membresía
holding-wide).

## Ruteo de login por membresía (movido desde `docs/16` §8.3)

- `Membresia.correo` (`String? @unique @db.Citext`) y
  `Membresia.passwordHash` (`String?`) — obligatorios cuando
  `empresaId != null`; credencial completamente independiente por empresa,
  nunca comparte contraseña con `Usuario` ni con otras empresas de la misma
  persona.
- Resolución en login: se busca primero en `Usuario.correo` (holding-wide);
  si no matchea, se busca en `Membresia.correo` con `activa = true` y se
  valida contra el `passwordHash` de esa fila. Mismo mensaje genérico de
  error en ambos casos fallidos (sin oráculo de cuentas).
- `RefreshToken` necesita `membresiaId` nullable (nulo si la sesión es
  holding-wide).
- La identidad de negocio sigue siendo `Usuario.id`; lo que se fragmenta por
  empresa es la credencial de acceso, no la identidad.
- **Riesgo de migración a resolver:** Postgres no garantiza unicidad entre
  `Usuario.correo` y `Membresia.correo` con un solo `UNIQUE` — requiere
  chequeo de aplicación en transacción antes de crear un correo nuevo.

## Backfill y migración (de `docs/14` §13, Fase 1-3)

**Fase 1 — Fundación aditiva:**
- Crear `Empresa`, `Membresia` y las claves de ownership como nullable.
- Backfill determinista del dataset existente (una `Empresa` para los datos
  actuales, membresías equivalentes al `rol` legacy de cada `Usuario`).
- Añadir índices y constraints sin retirar columnas antiguas.

**Fase 2 — Membresías y autorización en sombra:**
- Crear membresías equivalentes a `Usuario.rol` sin habilitar roles
  múltiples todavía.
- Comparar el autorizador nuevo (basado en `Membresia`) contra el
  comportamiento legacy antes de cortar el switch.
- Mantener `Usuario.rol` como compatibilidad temporal (se retira en
  Bloque F).

**Fase 3 — Procedencia y deduplicación:**
- Derivar `empresaId` desde el bridge autenticado.
- Aplicar dedup de "lead abierto" con scope (cliente, empresa).
- Dual-write de ownership y atribución durante la transición.
- Reprocesar datos ambiguos mediante cola de revisión, nunca con supuestos.

## Criterios de salida

- `Empresa` y `Membresia` existen en el esquema con backfill verificado.
- Login resuelve correctamente ambos tipos de credencial (holding-wide y
  por empresa).
- `Usuario.rol` sigue existiendo y sigue siendo la única fuente de
  autorización activa en producción; `Membresia` opera en modo sombra
  (comparación no bloqueante) hasta que un bloque posterior corte el switch.

## Siguiente bloque

Bloque C (`docs/blocks/c-aislamiento.md`) — requiere `Membresia` ya
poblada para poder scopear consultas por empresa.
