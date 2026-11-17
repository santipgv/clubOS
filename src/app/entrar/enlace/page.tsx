import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { FormularioEnlace } from "./formulario";
import { Cabecera } from "../cabecera";

export const metadata: Metadata = { title: "Entrar con enlace" };

export default async function EnlacePage() {
  if (await getSessionUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Cabecera texto="Entra sin contraseña con un enlace enviado a tu correo." />
      <FormularioEnlace />
    </main>
  );
}
