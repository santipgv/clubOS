import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AsistenteAlta } from "./asistente";
import { Cabecera } from "../entrar/cabecera";
import { getIdentidad } from "@/lib/club";

export const metadata: Metadata = { title: "Solicitar alta" };

export default async function RegistroPage() {
  if (await getSessionUser()) redirect("/");
  const club = await getIdentidad();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Cabecera texto="Solicitud de alta como socio. Un responsable del club revisará tus datos." />
      <AsistenteAlta localidad={club["club.localidad"]} provincia={club["club.provincia"]} />
      <p className="mt-6 text-center text-sm text-piedra-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/entrar" className="font-bold text-marca-700 underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </main>
  );
}
