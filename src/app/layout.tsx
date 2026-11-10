import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import { estiloMarca, getIdentidad, ubicacion } from "@/lib/club";
import "./globals.css";

/**
 * Lato se sirve desde el propio dominio, no desde Google: la CSP no permite
 * hosts externos, y ademas evita una peticion de los socios a un tercero.
 */
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--fuente-lato",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const club = await getIdentidad();
  const donde = ubicacion(club);
  return {
    title: {
      default: `${club["club.nombreCorto"]} · Reservas`,
      template: `%s · ${club["club.nombreCorto"]}`,
    },
    description: `${club["club.lema"]} · ${club["club.nombre"]}${donde ? `, ${donde}` : ""}.`,
    robots: { index: false, follow: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const club = await getIdentidad();
  return {
    themeColor: club["club.colorMarca"],
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const club = await getIdentidad();
  return (
    <html lang="es" className={lato.variable} style={estiloMarca(club)}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
