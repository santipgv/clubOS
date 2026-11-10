import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { FormularioAcceso } from "./formulario";
import { Cabecera } from "./cabecera";

export const metadata: Metadata = { title: "Entrar" };

const MENSAJES_ERROR: Record<string, string> = {
  invalido: "Ese enlace no es valido. Solicita uno nuevo.",
  caducado: "El enlace ha caducado. Solicita uno nuevo.",
  usado: "Ese enlace ya se habia utilizado. Solicita uno nuevo.",
  bloqueado: "Esta cuenta no tiene acceso. Contacta con el club.",
  limite: "Demasiados intentos desde esta conexion. Prueba dentro de un rato.",
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; error?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Cabecera texto="Reserva de pistas para los socios del club." />

      <FormularioAcceso mensajeError={error ? MENSAJES_ERROR[error] : undefined} />

      <p className="mt-6 text-center text-sm text-marca-600">
        ¿Aun no eres socio en la plataforma?{" "}
        <Link href="/registro" className="font-semibold text-marca-700 underline underline-offset-2">
          Solicita el alta
        </Link>
      </p>
    </main>
  );
}
