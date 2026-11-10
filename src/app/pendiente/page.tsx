import { getIdentidad } from "@/lib/club";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { cerrarSesion } from "@/app/acciones-sesion";
import { Boton, Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Alta pendiente" };

const TEXTOS = {
  PENDING: {
    titulo: "Tu alta esta pendiente de aprobación",
    cuerpo:
      "Un responsable del club revisará tu solicitud. En cuanto la apruebe recibirás un correo y podrás reservar pista.",
  },
  SUSPENDED: {
    titulo: "Tu cuenta esta suspendida",
    cuerpo:
      "No puedes reservar en este momento. Ponte en contacto con la secretaría del club para regularizar tu situación.",
  },
} as const;

export default async function PendientePage() {
  const user = await requireUser();
  if (user.status === "ACTIVE") redirect("/");

  const texto = TEXTOS[user.status === "SUSPENDED" ? "SUSPENDED" : "PENDING"];
  const club = await getIdentidad();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Tarjeta className="p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marca-600">{club["club.nombreCorto"]}</p>
        <h1 className="mt-2 text-2xl font-bold text-marca-900">{texto.titulo}</h1>
        <p className="mt-3 text-sm leading-relaxed text-marca-600">{texto.cuerpo}</p>
        <p className="mt-6 text-sm text-marca-700">
          Has entrado como <strong>{user.email}</strong>
        </p>
        <form action={cerrarSesion} className="mt-4">
          <Boton variante="secundario" className="w-full">Cerrar sesion</Boton>
        </form>
      </Tarjeta>
    </main>
  );
}
