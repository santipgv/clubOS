import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 ya no carga .env por su cuenta.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // En produccion las variables vienen del entorno.
}

/**
 * Una variable definida pero vacia es lo mismo que no definirla.
 *
 * `??` no vale aqui: solo salta con null o undefined, asi que un DIRECT_URL
 * creado con valor vacio en el panel de Vercel se tomaba como bueno y las
 * migraciones fallaban con "Connection url is empty".
 */
function primeraConValor(...valores: Array<string | undefined>): string | undefined {
  return valores.find((valor) => valor !== undefined && valor.trim() !== "");
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Las migraciones usan la conexion directa: el pooler no soporta
    // los advisory locks que necesita Prisma Migrate. Si no hay DIRECT_URL se
    // recurre a DATABASE_URL, que funciona salvo para migraciones largas.
    url: primeraConValor(process.env.DIRECT_URL, process.env.DATABASE_URL),
  },
});
