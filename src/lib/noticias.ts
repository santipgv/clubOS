import { prisma } from "@/lib/db";

/**
 * Tablon del club. Junta dos cosas que el socio vive igual: lo que publica la
 * junta (Post) y los eventos que ya ocupan pista (CourtBlock publico), para que
 * un torneo no haya que anunciarlo dos veces.
 */

export type EntradaTablon = {
  id: string;
  tipo: "post" | "bloqueo";
  titulo: string;
  resumen: string | null;
  categoria: "NOTICIA" | "EVENTO" | "AVISO";
  fecha: Date;
  /** Fecha del evento, si la tiene. */
  fechaEvento: Date | null;
  slug: string | null;
  fijado: boolean;
};

export async function tablonDelClub(limite = 8): Promise<EntradaTablon[]> {
  const ahora = new Date();

  const [posts, eventos] = await Promise.all([
    prisma.post.findMany({
      where: { publishedAt: { not: null, lte: ahora } },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: limite,
    }),
    prisma.courtBlock.findMany({
      where: {
        isPublic: true,
        endsAt: { gt: ahora },
        type: { in: ["TOURNAMENT", "EVENT", "CLASS", "CLOSURE"] },
      },
      orderBy: { startsAt: "asc" },
      take: limite,
      include: { court: { select: { name: true } } },
    }),
  ]);

  const entradas: EntradaTablon[] = [
    ...posts.map((p) => ({
      id: p.id,
      tipo: "post" as const,
      titulo: p.title,
      resumen: p.excerpt,
      categoria: p.category,
      fecha: p.publishedAt ?? p.createdAt,
      fechaEvento: p.eventDate,
      slug: p.slug,
      fijado: p.isPinned,
    })),
    ...eventos.map((b) => ({
      id: b.id,
      tipo: "bloqueo" as const,
      titulo: b.title,
      resumen: b.description ?? (b.court ? `Pista: ${b.court.name}` : "Afecta a varias pistas"),
      categoria: b.type === "CLOSURE" ? ("AVISO" as const) : ("EVENTO" as const),
      fecha: b.startsAt,
      fechaEvento: b.startsAt,
      slug: null,
      fijado: false,
    })),
  ];

  return entradas
    .sort((a, b) => {
      if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
      // Lo que esta por venir primero; lo pasado, por fecha descendente.
      const futuroA = a.fechaEvento && a.fechaEvento > ahora;
      const futuroB = b.fechaEvento && b.fechaEvento > ahora;
      if (futuroA !== futuroB) return futuroA ? -1 : 1;
      return b.fecha.getTime() - a.fecha.getTime();
    })
    .slice(0, limite);
}

/** Genera un identificador de URL a partir del titulo. */
export function slugify(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}
