import { z } from "zod";

/**
 * Las variables de entorno se validan una sola vez, al arrancar. Un despliegue
 * mal configurado falla de inmediato en lugar de fallar mas tarde en la cara
 * de un socio.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "obligatoria: cadena de conexion a Postgres"),
  DIRECT_URL: z.string().optional(),
  APP_URL: z.string().url("debe ser una URL completa, por ejemplo https://reservas.tuclub.es"),
  AUTH_SECRET: z.string().min(32, "obligatoria: al menos 32 caracteres (openssl rand -base64 48)"),
  ENCRYPTION_KEY: z.string().min(32, "obligatoria: al menos 32 caracteres (openssl rand -base64 32)"),
  RESEND_API_KEY: z.string().optional().default(""),
  /// Protege /api/cron/cuotas. Sin esto, la ruta responde 404.
  CRON_SECRET: z.string().optional().default(""),
  /// Fuera de Vercel solo se acepta una IP reenviada si el proxy esta
  /// configurado y sanea expresamente esta cabecera.
  TRUSTED_PROXY_IP_HEADER: z.enum(["x-forwarded-for", "x-real-ip"]).optional(),
  EMAIL_FROM: z.string().default("Club <no-reply@localhost>"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Las publica Vercel en cada despliegue. Ver resolverUrlPublica().
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
});

/**
 * Direccion publica de esta instancia concreta.
 *
 * APP_URL es una sola variable compartida por produccion y vistas previas, asi
 * que en una vista previa apunta a produccion: pedir un enlace de acceso desde
 * la vista previa te mandaba a la aplicacion real y no habia forma de probar el
 * acceso antes de fusionar.
 *
 * Vercel publica la direccion estable de cada rama en VERCEL_BRANCH_URL. Se
 * prefiere esa a VERCEL_URL, que cambia en cada despliegue y dejaria caducados
 * los enlaces del despliegue anterior.
 */
export function resolverUrlPublica(entrada: {
  appUrl: string;
  vercelEnv?: string;
  branchUrl?: string;
  deploymentUrl?: string;
}): string {
  if (entrada.vercelEnv !== "preview") return entrada.appUrl;

  const host = entrada.branchUrl ?? entrada.deploymentUrl;
  return host ? `https://${host}` : entrada.appUrl;
}

/**
 * Una variable definida pero vacia es lo mismo que no definirla.
 *
 * Importa: al dar de alta el proyecto en Vercel es facil crear las claves a
 * partir del .env.example, que las trae con el valor vacio. Sin este filtro,
 * los valores por defecto no se aplican y el despliegue falla con mensajes
 * enganosos del tipo "Invalid URL" en vez de decir que falta el valor.
 */
const definidas = Object.fromEntries(
  Object.entries(process.env).filter(([, valor]) => valor !== undefined && valor !== ""),
);

const parsed = schema.safeParse(definidas);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
    .join("\n");

  throw new Error(
    `Configuracion de entorno incompleta.\n\n${detalle}\n\n` +
      `En local se definen en .env (ver .env.example).\n` +
      `En Vercel, en Project Settings → Environment Variables, con un valor real:\n` +
      `una clave creada con el valor vacio cuenta como no definida.\n`,
  );
}

export const env = {
  ...parsed.data,
  APP_URL: resolverUrlPublica({
    appUrl: parsed.data.APP_URL,
    vercelEnv: parsed.data.VERCEL_ENV,
    branchUrl: parsed.data.VERCEL_BRANCH_URL,
    deploymentUrl: parsed.data.VERCEL_URL,
  }),
};

export const isProduction = env.NODE_ENV === "production";
