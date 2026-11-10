# clubOS — Gestión de socios y reservas deportivas

Especificación técnica · v1.0

> Escrita para el primer club que usó la aplicación. Donde dice "el club" vale para cualquier
> club; la identidad de cada uno se configura en Ajustes (ver README).

---

## 1. Objetivo

Sustituir la dependencia de Playtomic con una plataforma propia del club que cubra:

1. **Socios**: registro, verificación, aprobación por la junta, altas/bajas, tipos de socio.
2. **Reservas**: pádel, tenis y croquet, con configuración de pistas, horarios y precios.
3. **Explotación**: bloqueos de pista para torneos, clases, mantenimiento y eventos.
4. **Cobros**: estado de pago por reserva desde el día 1; pasarela Stripe en fase 2, con el
   club como emisor directo de la factura (ver §9, el motivo por el que se abandona Playtomic).

### 1.1 Principios de diseño

| Principio | Implicación concreta |
|---|---|
| El club es el prestador del servicio | No hay intermediario en el cobro. La factura y el IVA son del club (§9). |
| Imposible reservar dos veces la misma pista | Garantía en la **base de datos**, no en el código de aplicación (§6.1). |
| Seguro por defecto | Toda ruta es privada salvo lista blanca explícita (§8). |
| El socio mayor también reserva | Sin contraseñas (magic link), interfaz grande, flujo de 3 toques. |
| Auditable | Toda acción sensible deja rastro con actor, IP y momento. |

---

## 2. Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript estricto | Web y API en un solo despliegue; Server Actions evitan exponer endpoints innecesarios. |
| Estilos | Tailwind CSS 4 | Responsive móvil-primero sin dependencias de UI pesadas. |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) | Migraciones versionadas; SQL manual donde hace falta (constraint de exclusión). |
| Base de datos | PostgreSQL 17 (Neon serverless) | `tstzrange` + `EXCLUDE` = anti-solape real. Backups y branching gestionados. |
| Autenticación | Propia: contraseña Argon2id + magic link, sesión opaca en cookie httpOnly | Sin dependencia de terceros ni de un modelo RLS externo. |
| Email | Resend (SMTP alternativo configurable) | Envío transaccional con dominio propio (SPF/DKIM/DMARC). |
| Validación | Zod en **todos** los límites de confianza | Un solo esquema valida cliente y servidor. |
| Fechas | `date-fns-tz`, todo en UTC en BD, `Europe/Madrid` en presentación | Evita el error clásico de horario de verano en reservas. |
| Pagos (fase 2) | Stripe (cuenta propia del club, sin Connect) | §9. |
| Despliegue | Vercel + Neon | Cero servidores que mantener para la junta. |

---

## 3. Roles y ciclo de vida del socio

### 3.1 Roles

| Rol | Puede |
|---|---|
| `MEMBER` | Reservar, ver y cancelar **sus** reservas, editar su perfil. |
| `STAFF` | Todo lo anterior + ver todas las reservas, reservar en nombre de un socio, marcar pagos, crear bloqueos. |
| `ADMIN` | Todo lo anterior + aprobar socios, configurar pistas/horarios/precios, ver auditoría. |

La autorización es **acumulativa y comprobada en el servidor** en cada acción. El rol nunca
viaja en la cookie ni en el cliente: se lee de la BD en cada petición.

### 3.2 Estados del socio

```
        registro            aprobación junta
ANÓNIMO ─────────► PENDING ──────────────────► ACTIVE ◄──┐
                      │                          │       │
                      │ rechazo                  │ baja  │ reactivación
                      ▼                          ▼       │
                   REJECTED                   SUSPENDED ─┘
```

- `PENDING`: puede entrar y ver su perfil. **No puede reservar.**
- `ACTIVE`: operativo. Requiere `memberNumber` asignado por un administrador.
- `SUSPENDED`: impago de cuota o sanción. Login permitido, reserva bloqueada, se conservan
  sus reservas futuras para que la junta decida.
- `REJECTED`: no puede iniciar sesión.

### 3.3 Tipos de socio

`NUMERARIO`, `FAMILIAR`, `JUVENIL`, `ABONADO`, `INVITADO`. El tipo determina precio y límites
(§5), y también el tratamiento fiscal (§9): un `INVITADO` no socio no goza de la exención.

---

## 4. Modelo de datos

```
User ──< Session
 │   ──< MagicLinkToken
 │   ──< Booking >── Court >── CourtSchedule
 │                    │    ──< PriceRule
 │                    └──< CourtBlock
 └──< AuditLog                Booking ──< Payment
                              Booking ──o Invoice   (fase 2)
```

### 4.1 Entidades

**User** — `id`, `email` (único, normalizado), `emailVerifiedAt`, `passwordHash` (Argon2id,
nulo mientras el socio no elija contraseña), `passwordUpdatedAt`, `firstName`, `lastName`,
`phone`, `role`, `status`, `memberNumber` (único, nulo hasta aprobación), `memberType`,
`birthDate`, `notes` (interno), `acceptedTermsAt`, `createdAt`, `lastLoginAt`.

**Session** — `id`, `userId`, `tokenHash` (SHA-256 del token de 32 bytes; el token en claro
nunca se almacena), `expiresAt`, `lastSeenAt`, `ip`, `userAgent`, `revokedAt`.

**MagicLinkToken** — `id`, `email`, `tokenHash`, `expiresAt` (15 min), `consumedAt`,
`requestIp`. Un solo uso, atado al email solicitante.

**Court** (pista) — `id`, `sport` (`PADEL|TENIS|CROQUET`), `name`, `code`, `surface`,
`isIndoor`, `hasLighting`, `slotMinutes` (granularidad de la rejilla, p. ej. 30),
`allowedDurations` (p. ej. `[60, 90]`), `maxPlayers`, `isActive`, `sortOrder`.

**CourtSchedule** — `courtId`, `weekday` (0=domingo…6), `opensAt`, `closesAt` (minutos desde
medianoche), `isActive`. Varias franjas por día son posibles (mañana/tarde).

**PriceRule** — `courtId` (nulo ⇒ aplica a todo el deporte), `sport`, `memberType` (nulo ⇒
todos), `weekdayMask`, `fromMinute`, `toMinute`, `priceCents` (por hora), `taxTreatment`,
`validFrom`, `validTo`, `priority`. Gana la regla de mayor `priority` que case.

**Booking** (reserva) — `id`, `reference` (legible, p. ej. `TIR-2K4F7Q`), `courtId`, `userId`,
`createdById`, `startsAt`, `endsAt` (UTC), `status`, `paymentStatus`, `priceCents`,
`taxCents`, `taxTreatment` (**congelado** en el momento de reservar), `playerNames[]`,
`guestCount`, `notes`, `cancelledAt`, `cancelledById`, `cancelReason`.

**CourtBlock** (bloqueo/evento) — `id`, `courtId` (nulo ⇒ todas las pistas de `sport`),
`sport` (nulo ⇒ todo el club), `startsAt`, `endsAt`, `type`
(`MAINTENANCE|TOURNAMENT|CLASS|CLOSURE|EVENT`), `title`, `description`, `isPublic`,
`createdById`.

**Payment** — `bookingId`, `method` (`CASH|TRANSFER|CARD_STRIPE|CREDIT|MANUAL`),
`amountCents`, `status`, `stripePaymentIntentId`, `paidAt`, `registeredById`, `reference`.

**AuditLog** — `actorId`, `action`, `entityType`, `entityId`, `metadata` (JSON), `ip`,
`userAgent`, `createdAt`. Inmutable: sin `UPDATE` ni `DELETE` desde la aplicación.

**Setting** — clave/valor tipado para parámetros del club (§5), editable por `ADMIN` sin
tocar código ni redesplegar.

### 4.2 Estados de la reserva

| `status` | Significado |
|---|---|
| `PENDING_PAYMENT` | Creada, pendiente de cobro. Ocupa la pista y **caduca** si no se paga (fase 2). |
| `CONFIRMED` | Reservada. Este es el estado normal en el MVP (pago en pista). |
| `CANCELLED` | Anulada. Libera la pista de inmediato. |
| `COMPLETED` | Jugada (transición automática al pasar la hora). |
| `NO_SHOW` | Marcada por `STAFF`. Alimenta futuras sanciones. |

| `paymentStatus` | Significado |
|---|---|
| `NOT_REQUIRED` | Incluida en la cuota del socio. |
| `PENDING` | Reservada, no pagada → esto es el estado **"Reservado"** de la rejilla. |
| `PAID` | Cobrada → estado **"Pagado"** de la rejilla. |
| `REFUNDED` | Devuelta tras cancelación con derecho a reembolso. |

Se separan deliberadamente `status` y `paymentStatus`: una reserva puede estar confirmada y
sin pagar, o cancelada y ya pagada (pendiente de devolución). Mezclarlos en un solo campo es
la causa habitual de descuadres contables.

---

## 5. Reglas de negocio (parametrizables en `Setting`)

| Parámetro | Valor por defecto | Descripción |
|---|---|---|
| `booking.windowDays` | 7 | Antelación máxima con la que se abre el calendario. |
| `booking.minLeadMinutes` | 0 | Antelación mínima para reservar (0 = hasta el momento). |
| `booking.maxActivePerMember` | 2 | Reservas futuras simultáneas por socio. |
| `booking.maxActivePerSportPerDay` | 1 | Evita acaparar una pista el mismo día. |
| `booking.cancelDeadlineHours` | 12 | Cancelación libre hasta N horas antes. |
| `booking.lateCancelPolicy` | `ALLOW_WITH_FLAG` | Después del plazo: permitir marcando incidencia. |
| `club.timezone` | `Europe/Madrid` | Toda la presentación de horas. |
| `club.openingHour` / `closingHour` | 08:00 / 23:00 | Límite global, por encima del horario de pista. |

**Invariantes que el sistema garantiza**, no solo comprueba:

1. Una pista no puede tener dos reservas activas solapadas. *(constraint de BD, §6.1)*
2. Una reserva no puede solaparse con un bloqueo activo. *(transacción serializable)*
3. Una reserva debe caber íntegra en el horario de apertura de esa pista ese día.
4. La duración debe estar en `allowedDurations` y alinearse a la rejilla `slotMinutes`.
5. `startsAt < endsAt`, ambos en el futuro al crear.
6. Solo el titular, `STAFF` o `ADMIN` pueden cancelar una reserva.
7. Un socio `PENDING` o `SUSPENDED` no genera reservas por ninguna vía.

---

## 6. Concurrencia: el problema central de un sistema de reservas

Dos socios pulsando "reservar" sobre el mismo hueco a la vez es el escenario que rompe estos
sistemas. Comprobar "¿está libre?" y luego insertar **no es suficiente**: entre ambas
sentencias cabe la petición del otro socio.

### 6.1 Garantía en base de datos

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "courtId"  WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'));
```

Postgres rechaza físicamente el segundo `INSERT` solapado, sin importar cuántas instancias de
la aplicación haya ni en qué orden lleguen. La aplicación captura la violación de constraint y
responde "ese hueco acaba de ocuparse". El intervalo es `[)`: una reserva de 10:00–11:00 y otra
de 11:00–12:00 **no** se consideran solapadas.

### 6.2 Bloqueos y eventos

Un constraint de exclusión no puede abarcar dos tablas. La comprobación reserva↔bloqueo se
hace dentro de una transacción `SERIALIZABLE`, y la creación de bloqueos cancela o rechaza
explícitamente las reservas afectadas (decisión del administrador, nunca silenciosa).

---

## 7. Superficie funcional del MVP

### Socio
- `/entrar` — correo y contraseña · `/entrar/enlace` — solicitar magic link ·
  `/entrar/verificar` — consumir token.
- `/registro` — alta con datos personales y aceptación de condiciones.
- `/` — panel: próximas reservas y acceso rápido por deporte.
- `/reservar/[deporte]?fecha=` — rejilla de disponibilidad por pista y hora.
- `/reservar/[deporte]/confirmar` — resumen, jugadores, precio e IVA, confirmación.
- `/mis-reservas` — histórico y cancelación.
- `/perfil` — datos, cambio de contraseña y sesiones activas (con cierre remoto).

### Administración
- `/admin/socios` — cola de aprobación, alta/baja, asignación de número de socio.
- `/admin/pistas` — alta y configuración de pistas, horarios por día, precios.
- `/admin/reservas` — vista de día completo, reserva en nombre de socio, marcar pagado / no-show.
- `/admin/bloqueos` — bloquear franjas por torneo, clase, mantenimiento o evento.
- `/admin/ajustes` — parámetros de §5 y datos fiscales del club.
- `/admin/auditoria` — registro de acciones sensibles.

### Fuera del MVP (fase 2+)
Stripe y facturación electrónica (§9), cuotas periódicas de socio, listas de espera, partidas
abiertas y nivel de juego, torneos con cuadros, notificaciones push, app nativa.

---

## 8. Seguridad

La aplicación gestiona datos personales de socios (RGPD) y, en fase 2, cobros. Medidas:

### 8.1 Autenticación

Dos vías, y la segunda hace de recuperación de la primera:

- **Contraseña** (vía principal): hash **Argon2id** con los parámetros que recomienda OWASP
  (19 MiB de memoria, 2 pasadas). La política exige 10 caracteres y **no** exige mayúsculas,
  números ni símbolos: las reglas de composición empujan a `Club2024!` y al papelito bajo el
  teclado, y el NIST las desaconseja desde 2017. Sí se rechazan las contraseñas evidentes del
  club (`club123`, `padel123`) y usar el propio correo.
- **Magic link** (alternativa y recuperación): token de 32 bytes de `crypto.randomBytes`,
  comparado por hash SHA-256; vigencia 15 minutos; **un solo uso**; invalidación de los
  anteriores del mismo email. Es también el camino de "he olvidado la contraseña": quien entra
  por enlace puede fijar una nueva desde su perfil.
- **Respuesta uniforme en el acceso**: correo inexistente, cuenta sin contraseña y contraseña
  incorrecta devuelven el mismo mensaje y tardan aproximadamente lo mismo — cuando no hay hash
  contra el que comparar se verifica contra uno señuelo. De otro modo el formulario de acceso
  sería un comprobador de qué correos pertenecen a socios.
- Cambiar la contraseña exige la anterior y **cierra el resto de sesiones**.
- **Sin enumeración de usuarios**: `/entrar` y `/registro` responden siempre lo mismo exista o
  no la cuenta.
- **Rate limiting**: 8 intentos de contraseña / 15 min por email y 25 por IP; 5 solicitudes de
  enlace / 15 min por email; 20 verificaciones / hora por IP. El contador vive en Postgres, no
  en memoria: con varias instancias, un contador local no limita nada.
- **Sesiones**: identificador opaco, 30 días con renovación deslizante, cookie
  `httpOnly` + `Secure` + `SameSite=Lax` + `__Host-` prefix. Revocables desde el perfil y
  revocadas en bloque al cambiar rol o suspender al socio.

### 8.2 Autorización
- Middleware que **deniega por defecto**: solo `/entrar`, `/registro`, `/legal/*` y assets son
  públicos.
- Cada Server Action empieza por `requireMember()` / `requireStaff()` / `requireAdmin()`; el
  helper carga el usuario fresco de BD y comprueba `status` además del rol.
- Comprobación de propiedad en todo acceso por `id` (una reserva ajena devuelve 404, no 403,
  para no confirmar su existencia).

### 8.3 Aplicación
- Validación Zod de toda entrada, incluidos parámetros de URL y payloads de Server Action.
- Prisma con consultas parametrizadas; sin `$queryRawUnsafe` en el código de negocio.
- CSP con nonce por petición, `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva.
- CSRF: Server Actions con verificación de `Origin` + `SameSite=Lax`.
- Secretos solo por variables de entorno; `.env` fuera de git; `.env.example` documentado.
- Registro de auditoría de: login, aprobación/rechazo de socio, cambio de rol, creación y
  cancelación de reservas por terceros, bloqueos, cambios de configuración y pagos.

### 8.4 Datos personales (RGPD)
- Minimización: solo se pide lo necesario para la relación de socio.
- Base legal: ejecución del contrato de socio (art. 6.1.b) e interés legítimo del club.
- Derechos: exportación en JSON y borrado con **anonimización** de la reserva (se conserva la
  ocupación histórica de pista, se elimina la identidad).
- Retención: auditoría 3 años; reservas 5 años (obligación mercantil); sesiones 30 días.

---

## 9. Pagos e IVA — por qué el club factura directamente

> **Aviso**: lo que sigue es diseño técnico, no asesoramiento fiscal. El criterio final debe
> confirmarlo la gestoría del club; el sistema está construido para que ese criterio sea un
> **parámetro de configuración**, no una reescritura de código.

### 9.1 El problema con la solución actual

Con una plataforma intermediaria, quien cobra al socio es la plataforma, no el club. Eso
introduce un tercero en la cadena, con su propio domicilio fiscal y su propio tratamiento de
IVA, y el club deja de controlar qué IVA se repercute, quién emite la factura y con qué serie.
Para una **asociación deportiva sin ánimo de lucro** el efecto es doblemente malo, porque puede
perderse la exención que le corresponde y convertir en gravado un servicio que no debería serlo.

### 9.2 Diseño elegido

1. **Cuenta Stripe propia del club**, con el NIF y domicilio de la asociación. **Sin Stripe
   Connect ni modelo marketplace**: el club es el prestador y el vendedor de registro. El dinero
   va directo a la cuenta bancaria de la asociación.
2. **Stripe Tax desactivado.** El importe y su tratamiento fiscal los calcula la aplicación con
   las reglas del club; Stripe solo mueve el dinero. Se evita que un motor fiscal genérico
   aplique el IVA de otro país por geolocalización de la tarjeta.
3. **Tratamiento fiscal explícito por concepto** (`taxTreatment` en `PriceRule`, congelado en
   cada `Booking`):

   | Valor | Caso típico |
   |---|---|
   | `EXEMPT_SPORT` | Servicio deportivo a socio persona física por entidad de carácter social — exención del art. 20.Uno.13º LIVA. |
   | `STANDARD_21` | Uso por no socios / invitados, alquiler a terceros, patrocinios. |
   | `REDUCED_10` | Reservado para conceptos accesorios que lo requieran. |
   | `NOT_SUBJECT` | Cuotas de socio que no retribuyen un servicio concreto. |

4. **Facturación propia**: serie y numeración correlativa del club, con sus datos fiscales y los
   del socio; el importe exento se emite con la mención legal del artículo aplicado.
5. **Moneda EUR y cuenta española** siempre, para que no aparezcan conversiones ni reglas de
   IVA de otras jurisdicciones.
6. **Conciliación**: cada `Payment` guarda el `payment_intent` y el `balance_transaction` de
   Stripe, de modo que la comisión de Stripe se contabiliza como gasto propio del club y **no**
   se descuenta del importe facturado al socio.

### 9.3 En el MVP

No hay pasarela. Sí existe ya todo lo que la pasarela necesitará: estados de pago, importes
con su tratamiento fiscal congelado, registro de cobros manuales (efectivo/transferencia en
recepción) y auditoría. Activar Stripe será añadir un método de pago más, no rehacer el modelo.

---

## 10. Calidad y operación

- **Tests**: Vitest para el motor de disponibilidad, las reglas de negocio y — con Postgres
  real — la prueba de dos reservas concurrentes sobre el mismo hueco.
- **Migraciones**: Prisma Migrate, con el `EXCLUDE` en migración SQL versionada.
- **Semillas**: pistas reales del club, horarios, precios y un administrador inicial.
- **Entornos**: `local` (rama Neon de desarrollo) → `preview` (rama Neon por PR) → `production`.
- **Backups**: PITR de Neon, 7 días en el plan gratuito.
- **CI**: typecheck + lint + tests en cada push (GitHub Actions).

---

## 11. Plan de entrega

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Especificación y esqueleto del proyecto | ✅ |
| 1 | Autenticación (contraseña + magic link), registro, aprobación de socios | MVP |
| 2 | Pistas, horarios, motor de disponibilidad, reservas y cancelación | MVP |
| 3 | Panel de administración, bloqueos y eventos, estados de pago manuales | MVP |
| 4 | Stripe con el modelo fiscal de §9 y facturación | Siguiente |
| 5 | Cuotas de socio, listas de espera, partidas abiertas, notificaciones | Backlog |
