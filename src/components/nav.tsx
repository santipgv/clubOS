import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { isStaff, puedeGestionarDeportes } from "@/lib/auth/guards";
import { cerrarSesion } from "@/app/acciones-sesion";
import { Marca } from "./marca";
import { NavMenu, type Enlace } from "./nav-menu";
import { formatEuros } from "@/lib/booking/pricing";
import { RUTA_MONEDERO } from "@/lib/rutas";

const PRINCIPALES: Enlace[] = [
  { href: "/", label: "Inicio" },
  { href: "/reservar", label: "Reservar" },
  { href: "/torneos", label: "Torneos" },
  { href: "/mis-reservas", label: "Mis reservas" },
  { href: "/perfil", label: "Mi perfil" },
];

const GESTION_DEPORTES: Enlace[] = [
  { href: "/admin/reservas", label: "Reservas del club" },
  { href: "/admin/bloqueos", label: "Bloqueos y eventos" },
  { href: "/admin/torneos", label: "Torneos" },
  { href: "/admin/pistas", label: "Gestión deportes" },
];

const GESTION_STAFF: Enlace[] = [{ href: "/admin/socios", label: "Socios" }];

const GESTION_ADMIN: Enlace[] = [
  { href: "/admin/panel", label: "Panel de indicadores" },
  { href: "/admin/cuotas", label: "Cuotas" },
  { href: "/admin/noticias", label: "Noticias" },
  { href: "/admin/ajustes", label: "Ajustes" },
  { href: "/admin/auditoria", label: "Auditoria" },
];

export async function Nav() {
  const user = await getSessionUser();
  if (!user) return null;

  const gestion = [
    ...(puedeGestionarDeportes(user) ? GESTION_DEPORTES : []),
    ...(isStaff(user) ? GESTION_STAFF : []),
    ...(user.role === "ADMIN" ? GESTION_ADMIN : []),
  ];

  return (
    <header>
      <div className="border-b border-piedra-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Marca />
          <div className="ml-auto flex items-center gap-3">
            <Link
              href={RUTA_MONEDERO}
              title="Ver mi monedero"
              className="rounded-md border border-marca-200 bg-marca-50 px-3 py-1 text-right leading-tight hover:border-marca-400"
            >
              <span className="block text-[11px] font-bold uppercase tracking-wide text-marca-600">Monedero</span>
              <span className="block text-sm font-bold tabular-nums text-marca-900">
                {formatEuros(user.walletBalanceCents)}
              </span>
            </Link>
            <Link href="/perfil" className="text-right text-sm leading-tight hover:underline">
              <span className="block font-bold text-marca-900">
                {user.firstName} {user.lastName}
              </span>
              <span className="hidden text-xs text-piedra-500 sm:block">
                {user.memberNumber ? `Socio n.º ${user.memberNumber}` : "Alta pendiente"}
              </span>
            </Link>
            <form action={cerrarSesion}>
              <button className="rounded-md border border-piedra-300 px-3 py-1.5 text-sm font-bold text-marca-700 hover:border-marca-400 hover:bg-marca-50">
                Salir
              </button>
            </form>
          </div>
        </div>
      </div>

      <NavMenu principales={PRINCIPALES} gestion={gestion} />
    </header>
  );
}
