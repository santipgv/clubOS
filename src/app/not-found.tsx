import { getIdentidad } from "@/lib/club";
import Link from "next/link";

export default async function NoEncontrado() {
  const club = await getIdentidad();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marca-600">{club["club.nombreCorto"]}</p>
      <h1 className="mt-2 text-3xl font-bold text-marca-900">Página no encontrada</h1>
      <p className="mt-3 text-sm text-marca-600">
        El enlace no existe o ya no esta disponible.
      </p>
      <Link
        href="/"
        className="mx-auto mt-6 inline-block rounded-lg bg-marca-700 px-5 py-2.5 text-sm font-semibold text-piedra-50"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
