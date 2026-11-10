import { getIdentidad } from "@/lib/club";

export async function Cabecera({ texto }: { texto: string }) {
  const club = await getIdentidad();
  return (
    <div className="mb-8 text-center">
      {club["club.logo"] ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL guardada en Ajustes
        <img src={club["club.logo"]} alt="" className="mx-auto mb-4 h-16 w-auto" />
      ) : null}
      <h1 className="text-4xl font-bold tracking-tight text-marca-900">{club["club.nombre"]}</h1>
      <p className="mt-3 text-sm text-marca-600">{texto}</p>
    </div>
  );
}
