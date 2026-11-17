import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente de Prisma: generado, con su propio @ts-nocheck.
    "src/generated/**",
    // Worktrees de git dentro del proyecto: son otra copia del repositorio.
    ".claude/**",
    // Copias de la sincronizacion del sistema: "layout 2.tsx" y similares.
    "**/* [0-9].*",
  ]),
]);

export default eslintConfig;
