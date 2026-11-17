import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Solo las pruebas del proyecto. Sin esto, un worktree de git dentro de la
    // carpeta hace que se ejecute dos veces la misma suite contra la misma
    // base de datos, y las pruebas de concurrencia se estorban entre si.
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**"],
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // Las pruebas de concurrencia tocan la misma base de datos: no deben
    // ejecutarse en paralelo entre ficheros.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
