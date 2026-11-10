import { NextResponse, type NextRequest } from "next/server";

/**
 * El proxy (antes "middleware") hace dos cosas y ninguna de ellas es autorizar:
 *
 *  1. Cabeceras de seguridad, incluida una CSP con nonce por peticion.
 *  2. Un primer filtro barato: sin cookie de sesion, a la pantalla de acceso.
 *
 * La autorizacion real (rol, estado del socio, propiedad del recurso) se
 * comprueba contra la base de datos en cada pagina y en cada Server Action.
 * El proxy corre en el borde y no ve la BD: confiar en el para autorizar
 * seria confiar en una cookie.
 */

const RUTAS_PUBLICAS = [
  "/entrar",
  "/registro",
  "/legal",
  // Baja de los correos: no puede exigir iniciar sesion.
  "/baja-boletin",
  // Tareas programadas: no llevan cookie, se autentican con su propio secreto.
  "/api/cron",
];

const COOKIES_SESION = ["club_session", "__Host-club_session"];

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { pathname, search } = request.nextUrl;

  const tieneSesion = COOKIES_SESION.some((c) => request.cookies.has(c));

  if (!esPublica(pathname) && !tieneSesion) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = pathname === "/" ? "" : `?destino=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const dev = process.env.NODE_ENV === "development";
  const csp = [
    `default-src 'self'`,
    // En desarrollo Next inyecta scripts con eval para la recarga en caliente.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");

  // Next lee el nonce de la CSP de la **peticion** para firmar sus propios
  // scripts. Sin esta linea, 'strict-dynamic' bloquearia el bundle de la
  // aplicacion en produccion y la web se quedaria en blanco.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  if (!dev) {
    // Despliegue gradual y reversible. No cubrir subdominios ni solicitar
    // preload hasta completar el inventario HTTPS del dominio.
    response.headers.set("Strict-Transport-Security", "max-age=86400");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
