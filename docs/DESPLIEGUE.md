# Despliegue en Vercel

## Por que fallaba el primer despliegue

El build moria en `Collecting page data` con este mensaje:

```
- DATABASE_URL: Falta DATABASE_URL
- APP_URL: Invalid URL
- AUTH_SECRET: AUTH_SECRET debe tener al menos 32 caracteres
- SEED_ADMIN_EMAIL: Invalid email address
```

Las claves **existian** en Vercel, pero con el valor vacio: es lo que pasa al crear las
variables a partir de `.env.example`, que las trae vacias a proposito. Una clave vacia no es
lo mismo que una clave sin definir, asi que los valores por defecto no se aplicaban.

Corregido en `src/lib/env.ts`: una variable vacia se trata como no definida, y el mensaje de
error dice donde ponerla. Ademas `SEED_ADMIN_EMAIL` sale de la validacion de la aplicacion —
solo la usa `prisma/seed.ts`, no tenia por que tumbar un despliegue.

## Variables de entorno

En **Project Settings → Environment Variables**, para *Production*, *Preview* y *Development*:

| Variable | Valor | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Cadena de Neon **con** `-pooler` en el host | Si |
| `DIRECT_URL` | La misma **sin** `-pooler`. La usan las migraciones | Si |
| `APP_URL` | URL publica completa, con `https://` | Si |
| `AUTH_SECRET` | `openssl rand -base64 48` | Si |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`. Cifra los IBAN | Si |
| `RESEND_API_KEY` | Clave de Resend | Para enviar correo |
| `EMAIL_FROM` | `Mi Club <no-reply@tudominio.es>` | Para enviar correo |
| `CRON_SECRET` | `openssl rand -hex 24` | Para las cuotas automaticas |
| `NEXT_PUBLIC_CLUB_TIMEZONE` | Zona IANA del club, p. ej. `Europe/Madrid`. **No cambiarla con reservas hechas** | No (por defecto `Europe/Madrid`) |

**No crees ninguna clave vacia.** Si una variable no se va a usar todavia, no la crees: con el
arreglo de `env.ts` una clave vacia y una ausente son lo mismo, pero es una fuente de confusion.

> `ENCRYPTION_KEY` cifra los numeros de cuenta de los socios. **Si se pierde, los IBAN
> guardados dejan de poder descifrarse.** Guardala tambien fuera de Vercel.

## Migraciones

`vercel.json` fija el build a `node scripts/migrar-en-produccion.mjs && next build`: cada
despliegue **de produccion** lleva la base de datos al esquema del codigo antes de compilar. Es
lo que evita desplegar una aplicacion contra una base de datos sin tablas.

**Los despliegues de vista previa no migran nada.** En Vercel, `DIRECT_URL` es una sola variable
compartida por Production y Preview, asi que los dos entornos apuntan a la misma base de datos:
sin ese filtro, la vista previa de cualquier rama —incluidas las que abre dependabot sola—
migraria el esquema de la base real antes de que nadie hubiera revisado el cambio.

Si algun dia quieres que las vistas previas tengan su propia base de datos, crea una rama en
Neon y define `DATABASE_URL` y `DIRECT_URL` **solo para Preview** apuntando a ella.

La contrapartida de migrar en el build: una migracion mala rompe el despliegue en lugar de
romper la aplicacion en caliente. Es el orden correcto, pero conviene saberlo.

Las migraciones necesitan `DIRECT_URL`: el pooler de Neon no soporta los advisory locks que usa
Prisma Migrate.

## Errores tipicos al configurar las variables

| Sintoma en el log | Causa |
|---|---|
| `Falta DATABASE_URL` / `Invalid URL` | La clave existe pero con el valor vacio. |
| `Connection url is empty` | `DATABASE_URL` y `DIRECT_URL` vacias: Prisma Migrate no tiene a donde conectarse. |
| `ENCRYPTION_KEY: expected string, received undefined` | La clave no existe **con ese nombre exacto**. Cuidado con `ENCRIPTION_KEY`, sin la Y. |

Vercel **no deja cambiar el nombre** de una variable marcada como *Sensitive*: si te equivocas al
escribirlo, hay que borrarla y crearla de nuevo.

Y revisa el **ambito** de cada una. Una variable creada solo para *Production* deja los
despliegues de *Preview* fallando con el mismo error de configuracion incompleta.

## Vistas previas

Vercel crea un despliegue de vista previa por cada rama que se sube y lo enlaza en la PR. Para
que funcionen, **todas las variables obligatorias tienen que existir tambien en el entorno
*Preview***: una creada solo para *Production* deja la vista previa fallando con el mismo error
de configuracion incompleta.

`APP_URL` es una sola variable compartida por los dos entornos, asi que en una vista previa
apunta a produccion. La aplicacion lo corrige sola: cuando `VERCEL_ENV` es `preview`, la
direccion publica se toma de `VERCEL_BRANCH_URL`, de modo que un enlace de acceso pedido desde la
vista previa se queda en la vista previa. Para que esas variables lleguen, **Settings →
Environment Variables → "Enable access to System Environment Variables" debe estar marcado**.

Las vistas previas comparten la base de datos de produccion salvo que se les de una propia. Si
se quiere aislarlas, se crea una rama en Neon y se definen `DATABASE_URL` y `DIRECT_URL` **solo
para Preview** apuntando a ella.

## Region

Las funciones se ejecutan en `fra1` (Frankfurt), fijado en `vercel.json`, para que estén junto a
la base de datos europea. Si algun dia se mueve la base, hay que mover esto tambien: cada
consulta que cruce el Atlantico se paga dos veces en cada peticion.

## Estrenar una base de datos nueva

Al cambiar de proyecto de Neon, la base nueva esta vacia. Dos comandos, una sola vez, desde tu
maquina. Las variables van **delante del comando**: `process.loadEnvFile` no pisa lo que ya
viene del entorno, asi que estas mandan sobre tu `.env` y no hay riesgo de tocar la base
equivocada.

```bash
# 1. Crear el esquema (tablas, indices y el constraint anti-solape)
DATABASE_URL='<cadena con -pooler>' \
DIRECT_URL='<la misma sin -pooler>' \
  npx prisma migrate deploy

# 2. Sembrar pistas, horarios, tarifas y tu usuario administrador
DATABASE_URL='<cadena con -pooler>' \
DIRECT_URL='<la misma sin -pooler>' \
NODE_ENV=production \
SEED_ADMIN_EMAIL='tu@correo.es' \
SEED_ADMIN_PASSWORD='<contraseña larga>' \
  npm run db:seed
```

`NODE_ENV=production` no es decorativo: **impide** que se creen los socios de prueba, cuya
contraseña esta escrita en este repositorio. La semilla avisa y los omite aunque
`SEED_DEMO_USERS` este a `true`.

La semilla es idempotente: se puede repetir sin duplicar nada. Lo unico que pisa es la
contraseña del administrador, y solo si pasas `SEED_ADMIN_PASSWORD`.

Los despliegues de produccion aplican las migraciones solos, asi que el paso 1 solo hace falta
para poder sembrar antes del primer despliegue.

## Cuotas automaticas
## Cuotas automaticas

`vercel.json` programa `/api/cron/cuotas` el 1 de enero a las 03:00. La ruta responde 404 si
`CRON_SECRET` no esta configurado, para que una direccion que crea recibos a todos los socios no
quede abierta por descuido.
