import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/auth/rate-limit";

const bucket = `test:rate-limit:${Math.random().toString(36).slice(2)}`;

afterAll(async () => {
  await prisma.rateLimitHit.deleteMany({ where: { bucket: { startsWith: bucket } } });
  await prisma.$disconnect();
});

describe("rate limit concurrente", () => {
  it("no aprueba mas peticiones que el maximo", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => rateLimit(bucket, 3, 60)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(await prisma.rateLimitHit.count({ where: { bucket } })).toBe(3);
  });

  /**
   * Con poca concurrencia una implementacion incorrecta pasa casi siempre. Con
   * treinta peticiones a la vez, dejar el recuento fuera del cerrojo se nota
   * enseguida: es lo que delato a la version que contaba dentro de un CTE.
   */
  it("aguanta una rafaga de treinta peticiones simultaneas", async () => {
    const rafaga = `${bucket}:rafaga`;
    const resultados = await Promise.all(
      Array.from({ length: 30 }, () => rateLimit(rafaga, 5, 60)),
    );

    expect(resultados.filter((r) => r.allowed)).toHaveLength(5);
    expect(await prisma.rateLimitHit.count({ where: { bucket: rafaga } })).toBe(5);
  });

  it("los contadores no se estorban entre si", async () => {
    const [a, b] = await Promise.all([
      rateLimit(`${bucket}:a`, 1, 60),
      rateLimit(`${bucket}:b`, 1, 60),
    ]);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("al rechazar dice cuanto hay que esperar", async () => {
    const contador = `${bucket}:espera`;
    await rateLimit(contador, 1, 60);
    const rechazada = await rateLimit(contador, 1, 60);

    expect(rechazada.allowed).toBe(false);
    expect(rechazada.retryAfterSeconds).toBeGreaterThan(0);
    expect(rechazada.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
