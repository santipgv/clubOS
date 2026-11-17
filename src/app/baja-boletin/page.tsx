import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Cabecera } from "../entrar/cabecera";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { confirmarBajaBoletin } from "./acciones";

export const metadata: Metadata = { title: "Baja de los correos" };

/**
 * Confirmacion de baja desde el enlace del pie.
 *
 * No pide iniciar sesion: obligar a entrar para dejar de recibir correos es
 * justo lo que el RGPD considera poner trabas. El token es de un solo uso por
 * suscripcion y no permite hacer nada mas que esto.
 */
export default async function BajaBoletinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; hecho?: string; error?: string }>;
}) {
  const { token, hecho, error } = await searchParams;
  const valido =
    !hecho &&
    !error &&
    Boolean(
      token &&
        token.length >= 20 &&
        token.length <= 200 &&
        (await prisma.user.findUnique({
          where: { newsletterUnsubToken: token },
          select: { newsletterOptIn: true },
        }))?.newsletterOptIn,
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Cabecera texto="Cadena de correos del club" />
      <Tarjeta className="p-6">
        {hecho === "1" ? (
          <Aviso tipo="exito">
            <p className="font-bold">Listo, te hemos dado de baja.</p>
            <p className="mt-1">
              No volverás a recibir novedades del club. Los correos de tus reservas y de tus cuotas
              si seguiran llegando, porque forman parte del servicio.
            </p>
          </Aviso>
        ) : valido ? (
          <>
            <Aviso tipo="info">
              <p className="font-bold">¿Quieres dejar de recibir las novedades del club?</p>
              <p className="mt-1">
                La baja solo se completará cuando pulses el boton. Seguirás recibiendo los correos
                necesarios sobre reservas y cuotas.
              </p>
            </Aviso>
            <form action={confirmarBajaBoletin} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <Boton type="submit" variante="secundario" className="w-full">
                Confirmar baja
              </Boton>
            </form>
          </>
        ) : (
          <Aviso tipo="info">
            <p className="font-bold">Este enlace ya no sirve.</p>
            <p className="mt-1">
              O ya te habias dado de baja, o el enlace ha caducado. Puedes revisarlo desde tu perfil.
            </p>
          </Aviso>
        )}
        <p className="mt-5 text-center text-sm">
          <Link href="/perfil" className="font-bold text-marca-700 underline underline-offset-2">
            Ir a mi perfil
          </Link>
        </p>
      </Tarjeta>
    </main>
  );
}
