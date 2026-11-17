import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Boton, Tarjeta } from "@/components/ui";
import { Cabecera } from "../cabecera";
import { confirmarAcceso } from "./acciones";

export const metadata: Metadata = { title: "Confirmar acceso" };

export default async function VerificarAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getSessionUser()) redirect("/");

  const { token } = await searchParams;
  if (!token || token.length < 20 || token.length > 200) redirect("/entrar?error=invalido");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Cabecera texto="Confirma que quieres entrar en tu cuenta del club." />
      <Tarjeta className="p-6">
        <p className="text-sm leading-relaxed text-piedra-500">
          Por seguridad, el enlace no se consume hasta que pulses el boton. Así evitamos que un
          analizador automático del correo lo utilice antes que tú.
        </p>
        <form action={confirmarAcceso} className="mt-5">
          <input type="hidden" name="token" value={token} />
          <Boton type="submit" tamano="lg" className="w-full">
            Entrar en mi cuenta
          </Boton>
        </form>
      </Tarjeta>
    </main>
  );
}
