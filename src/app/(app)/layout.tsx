import { Nav } from "@/components/nav";
import { getIdentidad } from "@/lib/club";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const club = await getIdentidad();
  return (
    <div className="min-h-dvh">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-marca-500">
        {club["club.nombre"]} · Reservas de socios
      </footer>
    </div>
  );
}
