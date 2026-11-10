import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * En desarrollo, Next recarga los modulos en caliente; sin este cache se
 * abririan conexiones nuevas en cada recarga hasta agotar el pool de Neon.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Codigo de Postgres para violacion de constraint de exclusion o unicidad. */
export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_SERIALIZATION_FAILURE = "40001";
export const PG_DEADLOCK_DETECTED = "40P01";

/**
 * Extrae el SQLSTATE original de Postgres.
 *
 * Prisma envuelve el error del driver en un `PrismaClientKnownRequestError`
 * con su propio codigo (P2002, P2039…) y esconde el de Postgres en
 * `meta.driverAdapterError.cause.code`. Sin desenterrarlo no se puede
 * distinguir "ese hueco acaba de ocuparse" de un fallo real del servidor.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const e = error as {
    code?: unknown;
    cause?: { code?: unknown };
    meta?: { code?: unknown; driverAdapterError?: { cause?: { code?: unknown } } };
  };

  const delDriver = e.meta?.driverAdapterError?.cause?.code;
  if (typeof delDriver === "string") return delDriver;

  if (typeof e.cause?.code === "string") return e.cause.code;

  if (e.meta && typeof e.meta.code === "string") return e.meta.code;
  // Ultimo recurso: el codigo propio de Prisma (P2002 = unicidad).
  if (typeof e.code === "string") return e.code;
  return undefined;
}

/** Codigos propios de Prisma, cuando no expone el SQLSTATE del driver. */
export const PRISMA_UNIQUE_VIOLATION = "P2002";
export const PRISMA_WRITE_CONFLICT = "P2034";

export function isUniqueViolation(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === PG_UNIQUE_VIOLATION || code === PRISMA_UNIQUE_VIOLATION;
}

/**
 * Conflicto de serialización o deadlock entre transacciones. No es un fallo:
 * Postgres pide reintentar. Prisma lo reporta a veces con el SQLSTATE 40001 y
 * a veces con su propio P2034, asi que hay que contemplar ambos.
 */
export function isSerializationFailure(error: unknown): boolean {
  const code = pgErrorCode(error);
  return (
    code === PG_SERIALIZATION_FAILURE ||
    code === PG_DEADLOCK_DETECTED ||
    code === PRISMA_WRITE_CONFLICT ||
    driverErrorKind(error) === "TransactionWriteConflict"
  );
}

/**
 * Con los driver adapters de Prisma 7, algunos errores llegan directamente
 * como `DriverAdapterError` y conservan el SQLSTATE solo como un `kind` ya
 * normalizado. Tambien pueden venir envueltos en `meta.driverAdapterError`.
 */
function driverErrorKind(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const e = error as {
    kind?: unknown;
    cause?: { kind?: unknown };
    meta?: { driverAdapterError?: { kind?: unknown; cause?: { kind?: unknown } } };
  };

  const kind =
    e.cause?.kind ??
    e.meta?.driverAdapterError?.cause?.kind ??
    e.meta?.driverAdapterError?.kind ??
    e.kind;

  return typeof kind === "string" ? kind : undefined;
}
