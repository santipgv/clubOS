import { spawnSync } from "node:child_process";

/**
 * Aplica las migraciones solo en despliegues de produccion.
 *
 * En Vercel, DIRECT_URL es una unica variable compartida por Production y
 * Preview, asi que ambos entornos apuntan a la misma base de datos. Sin este
 * filtro, el despliegue de vista previa de cualquier rama —incluidas las que
 * abre dependabot sola— migraria el esquema de la base real antes de que nadie
 * hubiera revisado el cambio.
 *
 * VERCEL_ENV vale "production", "preview" o "development". Fuera de Vercel no
 * existe, y entonces tampoco se migra: en local se usa `npm run db:migrate`.
 */
const entorno = process.env.VERCEL_ENV ?? "local";

if (entorno !== "production") {
  console.log(`Entorno "${entorno}": no se aplican migraciones.`);
  process.exit(0);
}

console.log("Entorno de produccion: aplicando migraciones pendientes…");
const resultado = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(resultado.status ?? 1);
