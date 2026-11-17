"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorApp({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // El detalle queda en el servidor; al socio no se le muestra la traza.
    console.error(error);
  }, [error]);

  const sinPermiso = error.message.includes("permiso");

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-bold text-marca-900">
        {sinPermiso ? "No tienes permiso para ver esto" : "Algo ha ido mal"}
      </h1>
      <p className="mt-3 text-sm text-marca-600">
        {sinPermiso
          ? "Si crees que deberias tener acceso, habla con la secretaría del club."
          : "Hemos registrado el problema. Puedes volver a intentarlo."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {!sinPermiso ? (
          <button onClick={reset} className="rounded-lg bg-marca-700 px-5 py-2.5 text-sm font-semibold text-piedra-50">
            Reintentar
          </button>
        ) : null}
        <Link href="/" className="rounded-lg border border-piedra-300 bg-white px-5 py-2.5 text-sm font-semibold text-marca-700">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
