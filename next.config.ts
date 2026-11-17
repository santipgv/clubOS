import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El proyecto vive dentro de una carpeta con otros repos; sin esto Turbopack
  // busca el lockfile mas arriba y avisa en cada build.
  turbopack: { root: path.resolve(".") },

  // Cabecera de seguridad que no depende de la peticion. La CSP con nonce y
  // el resto de cabeceras por respuesta se emiten desde src/proxy.ts.
  poweredByHeader: false,

  typedRoutes: false,
};

export default nextConfig;
