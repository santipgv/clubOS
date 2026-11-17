# clubOS — socios y reservas para clubes deportivos

Aplicacion de **marca blanca** para gestionar clubes con socios y pistas: altas, cuotas, reservas,
torneos, cobros y monedero. Nacio como la plataforma de un club de campo y se ha separado para que
cualquier club la use con su nombre, su logotipo y sus colores.

- Especificacion tecnica completa: [`docs/ESPECIFICACIONES.md`](docs/ESPECIFICACIONES.md)
- Estado: **MVP funcional**. Sin pasarela de pago todavia (fase 2, ver §9 de la especificacion).

## Un club, una instalacion

Cada club tiene **su propio despliegue y su propia base de datos**. No hay datos de varios clubes
mezclados, y cada club cobra y factura con sus propias claves.

Lo que cambia de un club a otro:

| Que | Donde se configura |
|---|---|
| Nombre, nombre corto, lema, localidad, provincia, correo de contacto | **Admin → Ajustes → Identidad del club** |
| Logotipo (PNG, JPG, WebP o SVG, hasta 150 KB) | Admin → Ajustes → Identidad del club |
| Color principal y color de acento | Admin → Ajustes → Identidad del club |
| Reglas de reserva y horario general | Admin → Ajustes |
| Pistas, horarios y tarifas | Admin → Gestion deportes |
| Zona horaria | Variable `NEXT_PUBLIC_CLUB_TIMEZONE` (por defecto `Europe/Madrid`) |
| Remitente de los correos | Variable `EMAIL_FROM`, por ejemplo `Club Ejemplo <no-reply@clubejemplo.es>` |

La zona horaria va por variable de entorno, no en Ajustes, a proposito: cambiarla con reservas ya
hechas moveria la hora de todas ellas. Se fija al dar de alta el club y no se toca.

El color principal se usa de fondo en los botones con texto blanco, asi que Ajustes rechaza un
color demasiado claro (contraste por debajo de 4,5:1). El resto de la paleta se deriva de los dos
colores elegidos (`src/app/globals.css`).

**Todavia no es configurable** (siguientes fases): la lista de deportes (padel, tenis, croquet y
golf son fijos en el esquema), activar o desactivar modulos como golf, torneos o monedero, y las
categorias de socio.

---

## Que hace hoy

**Socio**

- Acceso con correo y contrasena (Argon2id), o con enlace magico al correo si la ha olvidado
  o todavia no ha elegido ninguna.
- Alta con datos personales; queda pendiente hasta que la junta la aprueba.
- Rejilla de disponibilidad por deporte, dia y pista, con estados **Libre / Reservado / Pagado /
  Evento del club**.
- Reserva con duracion variable, jugadores, invitados, precio e IVA visibles antes de confirmar.
- Inscripcion a torneos, para si mismo o trayendo a un invitado si el torneo lo admite.
- Cancelacion, historico, cambio de contrasena y control de las sesiones abiertas.
- Estado de sus cuotas, cambio de cuenta bancaria y alta o baja en los correos del club.

**Club (STAFF / ADMIN)**

- Cola de aprobacion de altas, asignacion de numero de socio, suspension y cambio de rol.
- Vista de reservas del dia con total cobrado y pendiente; cobro en efectivo, transferencia o
  cargo en cuota; marcado de no presentado; cancelacion.
- Reserva en nombre de un socio (clases, invitados, telefono).
- Bloqueo de franjas por torneo, clase, mantenimiento, cierre o evento — sobre una pista, sobre
  todas las de un deporte o sobre el club entero.
- Configuracion de pistas, horario semanal por pista y parametros de reserva.
- Cuotas: tarifa por categoria de socio y generacion semestral automatica.
- Torneos: convocatoria, plazas, lista de espera, precios distintos para socio e invitado.
- Tarifas de pista por deporte, pista, tipo de socio y franja horaria.
- Registro de auditoria de todas las acciones sensibles.
- Panel de indicadores (`/admin/panel`, solo ADMIN): ingresos cobrados y pendientes, reservas,
  ocupacion por pista y por franja horaria, cancelaciones, cuotas por periodo con la lista de
  socios con recibos vencidos, socios y torneos. Se filtra por periodo, deporte, pista, tipo de
  socio y periodo de cuotas, y la URL con los filtros se puede guardar o enviar.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # rellenar DATABASE_URL, DIRECT_URL y AUTH_SECRET
npx prisma migrate deploy
npm run db:seed           # pistas, horarios, tarifas y primer administrador
npm run dev
```

Genera el secreto de sesiones con:

```bash
openssl rand -base64 48
```

Sin `RESEND_API_KEY` los enlaces de acceso **se imprimen en la consola del servidor**, que es lo
que hace falta para desarrollar sin montar un dominio de correo.

### Cuentas para probar

Con `SEED_DEMO_USERS="true"` la semilla crea tres cuentas con la contrasena de
`SEED_DEMO_PASSWORD`:

| Correo | Rol | Para probar |
|---|---|---|
| `socio@club.test` | Socio activo | El recorrido normal: reservar, cancelar, perfil. |
| `recepcion@club.test` | Personal | Cobros, no presentados, bloqueos, reserva por telefono. |
| `pendiente@club.test` | Socio sin aprobar | La pantalla de espera y el flujo de aprobacion. |

Tu propia cuenta (`SEED_ADMIN_EMAIL`) se crea como **administrador**, con la contrasena de
`SEED_ADMIN_PASSWORD` si la defines. Volver a sembrar no pisa una contrasena que hayas cambiado
a mano, salvo que esa variable siga puesta.

> Deja `SEED_DEMO_USERS="false"` en produccion: son cuentas con contrasena conocida.

### Scripts

| Script | Que hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm run build` | Compilacion de produccion |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm test` | Vitest — incluye la prueba de concurrencia contra Postgres real |
| `npm run db:migrate` | Nueva migracion de Prisma |
| `npm run db:seed` | Datos iniciales del club |
| `npm run db:studio` | Explorador de la base de datos |

---

## Decisiones que conviene conocer antes de tocar el codigo

**El anti-solape no esta en el codigo, esta en Postgres.** `prisma/migrations/*_init` crea un
constraint `EXCLUDE USING gist` sobre `(courtId, tstzrange(startsAt, endsAt))`. Comprobar
disponibilidad y luego insertar deja una ventana de carrera; el constraint la cierra sea cual sea
el numero de instancias de la aplicacion. La aplicacion solo traduce el error `23P01` a
"ese hueco acaba de ocuparse". Hay una prueba que lo demuestra con dos reservas simultaneas.

**Todo se guarda en UTC y se razona en hora local del club.** El unico puente es `src/lib/time.ts`.
Los minutos se aplican sobre la hora de pared, no sumando milisegundos a la medianoche: el dia en
que entra el horario de verano dura 23 horas.

**Las contrasenas se guardan con Argon2id y la politica no exige simbolos.** Se exige longitud
(10 caracteres) y se rechazan las obvias del club. Exigir "una mayuscula, un numero y un simbolo"
produce `Club2024!` y un papel bajo el teclado; el NIST lo desaconseja desde 2017. El acceso
responde lo mismo ante correo inexistente, cuenta sin contrasena y contrasena incorrecta, y tarda
lo mismo en los tres casos.

**El rol nunca viaja en la cookie.** La sesion es un identificador opaco; el rol y el estado del
socio se leen de la base de datos en cada peticion. Suspender a un socio o cambiarle el rol cierra
sus sesiones en el acto.

**`src/proxy.ts` no autoriza.** Emite cabeceras de seguridad y hace un primer filtro por presencia
de cookie. La autorizacion real vive en `requireActiveMember()` / `requireStaff()` /
`requireAdmin()`, dentro de cada pagina y cada Server Action.

**Las URLs y los nombres de campo van siempre en ASCII.** Estan centralizados en
`src/lib/rutas.ts` y hay pruebas que lo comprueban. No es una mania: una correccion ortografica
automatica convirtio `?dia=` en `?día=` en los enlaces mientras el servidor seguia leyendo `dia`,
y el calendario dejo de funcionar sin dar el menor error.

**El club factura directamente.** No hay intermediario en el cobro: el tratamiento de IVA de cada
tarifa lo decide el club y queda **congelado** en cada reserva. Ver §9 de la especificacion, que
explica por que se abandona el modelo de plataforma intermediaria.

---

## Cuotas de socio

El club gira **dos cuotas al año**, con vencimiento el **5 de enero** y el **5 de julio**. Los
recibos no se escriben a mano: se generan desde `/admin/cuotas` a partir de la tarifa de cada
categoria de socio. La generacion es idempotente, asi que lanzarla dos veces no duplica nada.

Para que se generen solas cada enero, hay una tarea programada en `/api/cron/cuotas`, protegida
por `CRON_SECRET`. En Vercel, `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/cuotas", "schedule": "0 3 1 1 *" }] }
```

Sin `CRON_SECRET` la ruta responde 404: una direccion publica que crea recibos a todos los socios
no puede quedar abierta por descuido. **Mientras no configures la tarea, la generacion es el boton
de `/admin/cuotas`.**

## Despliegue

Pensado para Vercel + Neon.

Variables de entorno necesarias en produccion: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`.

> **Region de la base de datos**: Neon no tiene hardware propio, alquila regiones de AWS y Azure
> (de ahi nombres como `aws-eu-central-1`). El proyecto debe crearse en una region de la Union
> Europea — `aws-eu-central-1` (Frankfurt) o `aws-eu-west-2` (Londres) — porque aqui se tratan
> datos personales de socios. **La region no se puede cambiar despues de crear el proyecto.**

Para apuntar el proyecto a una base de datos nueva:

```bash
# 1. Poner DATABASE_URL y DIRECT_URL en .env
#    (DIRECT_URL es el mismo host sin el sufijo "-pooler")
npx prisma migrate deploy
npm run db:seed
```

---

## Que falta

**Marca blanca**

1. Deportes como tabla configurable en lugar de enum, con migracion de los datos existentes.
2. Modulos activables por club: golf, torneos, monedero, noticias, cuotas.
3. Categorias de socio configurables y enlazadas a su tarifa de cuota.
4. Script para dar de alta un club nuevo (migraciones, administrador, identidad, deportes).

**Producto**

1. Stripe con la cuenta de la asociacion y facturacion propia (§9 de la especificacion).
2. Remesa SEPA de las cuotas a partir de los IBAN guardados.
3. Cuadros de torneo, emparejamientos y resultados.
4. Envio de la cadena de correos desde la propia aplicacion (hoy se exportan las direcciones).
5. Notificaciones de recordatorio de reserva.
