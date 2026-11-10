"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type Enlace = { href: string; label: string };

/**
 * Navegacion. En pantallas anchas los enlaces del socio van a la vista y los
 * de gestion se agrupan en un desplegable; por debajo de eso todo se pliega en
 * un menu de tres rayas, porque con permisos de administrador son diez
 * apartados y en un movil no caben ni de lejos.
 */
export function NavMenu({
  principales,
  gestion,
}: {
  principales: Enlace[];
  gestion: Enlace[];
}) {
  const pathname = usePathname();

  // Se guarda en que pagina se abrio el menu. Al navegar, el pathname cambia y
  // el menu se considera cerrado sin necesidad de un efecto: cerrarlo desde un
  // useEffect provocaria un render extra en cada navegacion.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const [gestionEn, setGestionEn] = useState<string | null>(null);

  const abierto = abiertoEn === pathname;
  const gestionAbierta = gestionEn === pathname;

  const setAbierto = (v: boolean) => setAbiertoEn(v ? pathname : null);
  const setGestionAbierta = (v: boolean) => setGestionEn(v ? pathname : null);

  const esActivo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const claseEnlace = (activo: boolean) =>
    `block whitespace-nowrap rounded px-3 py-2 text-[13px] font-bold uppercase tracking-wide transition-colors ${
      activo ? "bg-marca-700 text-white" : "text-marca-100 hover:bg-marca-700 hover:text-white"
    }`;

  return (
    <nav aria-label="Principal" className="bg-marca-800">
      <div className="mx-auto max-w-6xl px-4">
        {/* Barra estrecha: solo el boton de menu. */}
        <div className="flex items-center justify-between py-2 lg:hidden">
          <span className="text-[13px] font-bold uppercase tracking-wide text-marca-200">
            {principales.find((e) => esActivo(e.href))?.label ??
              gestion.find((e) => esActivo(e.href))?.label ??
              "Menu"}
          </span>
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-controls="menu-principal"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-marca-100 hover:bg-marca-700"
          >
            <span className="text-[13px] font-bold uppercase tracking-wide">Menu</span>
            <span aria-hidden className="flex w-5 flex-col gap-[3px]">
              <span className="h-[2px] w-full bg-current" />
              <span className="h-[2px] w-full bg-current" />
              <span className="h-[2px] w-full bg-current" />
            </span>
            <span className="sr-only">{abierto ? "Cerrar menu" : "Abrir menu"}</span>
          </button>
        </div>

        {/* Desplegado en movil. */}
        <ul id="menu-principal" className={`${abierto ? "block" : "hidden"} pb-3 lg:hidden`}>
          {[...principales, ...gestion].map((e) => (
            <li key={e.href}>
              <Link href={e.href} className={claseEnlace(esActivo(e.href))}>
                {e.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Pantalla ancha: enlaces del socio y gestion agrupada. */}
        <ul className="hidden items-center gap-1 py-1 lg:flex">
          {principales.map((e) => (
            <li key={e.href}>
              <Link href={e.href} className={claseEnlace(esActivo(e.href))}>
                {e.label}
              </Link>
            </li>
          ))}

          {gestion.length > 0 ? (
            <li className="relative ml-auto">
              <button
                type="button"
                onClick={() => setGestionAbierta(!gestionAbierta)}
                aria-expanded={gestionAbierta}
                className={claseEnlace(gestion.some((e) => esActivo(e.href)))}
              >
                Gestión del club{" "}
                <span aria-hidden className="ml-1 text-[10px]">
                  {gestionAbierta ? "▲" : "▼"}
                </span>
              </button>
              {gestionAbierta ? (
                <ul className="absolute right-0 z-20 mt-1 min-w-56 rounded-md border border-piedra-200 bg-white py-1 shadow-lg">
                  {gestion.map((e) => (
                    <li key={e.href}>
                      <Link
                        href={e.href}
                        className={`block px-4 py-2 text-sm font-bold ${
                          esActivo(e.href)
                            ? "bg-marca-50 text-marca-800"
                            : "text-marca-700 hover:bg-marca-50"
                        }`}
                      >
                        {e.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : null}
        </ul>
      </div>
    </nav>
  );
}
