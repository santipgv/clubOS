import Link from "next/link";
import { getIdentidad } from "@/lib/club";

/**
 * Logotipo del club en la cabecera. Sin logotipo subido en Ajustes, el nombre
 * corto hace de logotipo.
 */
export async function Marca({ className = "" }: { className?: string }) {
  const club = await getIdentidad();
  const nombre = club["club.nombreCorto"];

  return (
    <Link href="/" className={`block shrink-0 ${className}`} aria-label={`${nombre}, inicio`}>
      {club["club.logo"] ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL guardada en Ajustes
        <img src={club["club.logo"]} alt={club["club.nombre"]} className="h-[46px] w-auto max-w-[180px] object-contain" />
      ) : (
        <span className="text-xl font-bold tracking-tight text-marca-800">{nombre}</span>
      )}
    </Link>
  );
}
