import { prisma } from "@/lib/db";

/**
 * Control de frecuencia con ventana deslizante, persistido en Postgres.
 * Un contador en memoria no serviria: en Vercel cada peticion puede caer en
 * una instancia distinta, y a un atacante le bastaria con insistir.
 */
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

type Fila = { insertado: number; mas_antiguo: Date | null };

/**
 * Contar y registrar ocurren bajo un cerrojo de aviso sobre el nombre del
 * contador, dentro de una unica transaccion enviada en bloque.
 *
 * Hubo dos intentos anteriores que conviene no repetir:
 *
 *  - Una transaccion **serializable interactiva** por comprobacion. Correcta,
 *    pero esta funcion corre en cada intento de acceso: ante una rafaga —justo
 *    cuando el limitador hace falta— una docena de transacciones abiertas a la
 *    vez agotaban el pool, y Postgres devolvia "Unable to start a transaction
 *    in the given time", que no es un fallo de serializacion y por tanto ni se
 *    reintentaba ni se rechazaba: reventaba la peticion.
 *
 *  - Una **sentencia unica** con el cerrojo en un CTE. Rapida, pero incorrecta:
 *    Postgres no garantiza en que orden evalua los CTE, asi que el recuento
 *    podia leerse antes de tomar el cerrojo y dejaba pasar 4 o 5 peticiones
 *    donde el maximo era 3.
 *
 * La forma de array de `$transaction` manda las dos sentencias juntas en un
 * solo viaje: el cerrojo se toma **antes**, de forma garantizada, y la conexion
 * no queda retenida entre `await` de JavaScript como en una transaccion
 * interactiva.
 */
export async function rateLimit(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSeconds * 1000);

  try {
    const [, filas] = await prisma.$transaction([
      // El cerrojo se libera solo al terminar la transaccion.
      prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bucket}))`,
      prisma.$queryRaw<Fila[]>`
        WITH conteo AS (
          SELECT
            count(*)::int AS n,
            min("createdAt") AS mas_antiguo
          FROM "RateLimitHit"
          WHERE bucket = ${bucket} AND "createdAt" >= ${since}
        ),
        insercion AS (
          INSERT INTO "RateLimitHit" ("id", "bucket", "createdAt")
          SELECT gen_random_uuid()::text, ${bucket}, now()
          FROM conteo
          WHERE conteo.n < ${max}
          RETURNING 1
        )
        SELECT
          (SELECT count(*)::int FROM insercion) AS insertado,
          conteo.mas_antiguo
        FROM conteo
      `,
    ]);

    const fila = filas[0];
    if (!fila || fila.insertado > 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const retryAfterSeconds = fila.mas_antiguo
      ? Math.max(
          1,
          Math.ceil((fila.mas_antiguo.getTime() + windowSeconds * 1000 - Date.now()) / 1000),
        )
      : windowSeconds;

    return { allowed: false, retryAfterSeconds };
  } catch (error) {
    // Ante un fallo de base de datos se cierra la puerta. Un limitador que se
    // cae abierto no limita nada, que es justo lo contrario de para lo que esta.
    console.error("[rate-limit] no se pudo comprobar el contador", error);
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }
}

/** Limpieza de registros caducados. Se invoca de forma oportunista. */
export async function purgeRateLimits(olderThanSeconds = 3600): Promise<void> {
  await prisma.rateLimitHit.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanSeconds * 1000) } },
  });
}
