import type { Metadata } from "next";
import { deportesGestionados, requireGestorDeDeportes } from "@/lib/auth/guards";
import { deportesElegibles } from "@/lib/auth/ambito";
import { DEPORTE_A_SLUG, DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { BotonEnlace, TituloPagina } from "@/components/ui";
import { PanelGolf } from "../golf/panel";
import { PanelPistas } from "./panel";

export const metadata: Metadata = { title: "Gestión deportes" };

export default async function GestionDeportesPage({
  searchParams,
}: {
  searchParams: Promise<{ deporte?: string | string[] }>;
}) {
  const user = await requireGestorDeDeportes();
  const ambito = deportesGestionados(user);
  const esAdmin = user.role === "ADMIN";
  const esRecepcion = user.role === "STAFF";
  const { deporte } = await searchParams;
  const deportes = deportesElegibles(ambito);
  const deportePista = deportes.find((sport) => DEPORTE_A_SLUG[sport] === deporte);
  const seleccionado = esRecepcion || (esAdmin && deporte === "golf")
    ? "golf"
    : deportePista ? DEPORTE_A_SLUG[deportePista] : "";

  const opciones = [
    { slug: "", nombre: "Todos" },
    ...deportes.map((sport) => ({ slug: DEPORTE_A_SLUG[sport], nombre: DEPORTE_NOMBRE[sport] })),
    ...(esAdmin ? [{ slug: "golf", nombre: "Golf" }] : []),
  ];
  const mostrarGolf = esRecepcion || (esAdmin && (seleccionado === "" || seleccionado === "golf"));

  return (
    <>
      <TituloPagina
        titulo="Gestión deportes"
        descripcion={esAdmin
          ? "Gestiona pistas, recorridos y tarifas por deporte."
          : esRecepcion
            ? "Consulta salidas, registra cobros y gestiona los bloqueos de golf."
            : "Configura las pistas y los horarios de tus deportes asignados."}
      />

      {!esRecepcion ? (
        <nav aria-label="Filtrar por deporte" className="mb-8 flex flex-wrap gap-2">
          {opciones.map(({ slug, nombre }) => (
            <BotonEnlace
              key={slug}
              href={slug ? `/admin/pistas?deporte=${slug}` : "/admin/pistas"}
              variante={seleccionado === slug ? "primario" : "secundario"}
              aria-current={seleccionado === slug ? "page" : undefined}
              tamano="sm"
            >
              {nombre}
            </BotonEnlace>
          ))}
        </nav>
      ) : null}

      {!esRecepcion && seleccionado !== "golf" ? <PanelPistas deporte={deportePista} ambito={ambito} esAdmin={esAdmin} /> : null}
      {mostrarGolf ? (
        <div className={seleccionado === "" ? "mt-10 border-t border-piedra-200 pt-8" : undefined}>
          <PanelGolf esAdmin={esAdmin} />
        </div>
      ) : null}
    </>
  );
}
