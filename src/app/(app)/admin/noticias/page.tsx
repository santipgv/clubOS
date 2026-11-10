import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatClubDate, formatClubDateTime } from "@/lib/time";
import { CATEGORIA_POST } from "@/lib/vocabulario";
import { NuevaNoticia, ControlesNoticia, Suscriptores } from "./controles";
import { Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Noticias" };

export default async function NoticiasPage() {
  await requireAdmin();

  const [suscritos, sociosActivos] = await Promise.all([
    prisma.user.findMany({
      where: { newsletterOptIn: true, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
  ]);

  const posts = await prisma.post.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { author: { select: { firstName: true, lastName: true } } },
  });

  const publicadas = posts.filter((p) => p.publishedAt).length;

  return (
    <>
      <TituloPagina
        titulo="Noticias y eventos"
        descripcion={`${publicadas} publicadas · ${posts.length - publicadas} en borrador. Es lo que los socios ven al entrar.`}
      />

      <div className="mb-10">
        <NuevaNoticia />
      </div>

      <div className="mb-10">
        <Suscriptores
          total={sociosActivos}
          suscriptores={suscritos.map((s) => ({
            id: s.id,
            nombre: `${s.lastName}, ${s.firstName}`,
            email: s.email,
          }))}
        />
      </div>

      <section>
        <Seccion>Publicaciones</Seccion>
        {posts.length === 0 ? (
          <Vacio>Todavia no hay ninguna noticia.</Vacio>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Tarjeta className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Etiqueta tono={CATEGORIA_POST[p.category].tono}>
                          {CATEGORIA_POST[p.category].label}
                        </Etiqueta>
                        {p.isPinned ? <Etiqueta tono="neutro">Fijada</Etiqueta> : null}
                        <Etiqueta tono={p.publishedAt ? "verde" : "gris"}>
                          {p.publishedAt ? "Publicada" : "Borrador"}
                        </Etiqueta>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-marca-900">{p.title}</h3>
                      {p.excerpt ? <p className="mt-1 text-sm text-piedra-500">{p.excerpt}</p> : null}
                      <p className="mt-2 text-xs text-piedra-400">
                        {p.author.firstName} {p.author.lastName} ·{" "}
                        {p.publishedAt ? `publicada el ${formatClubDateTime(p.publishedAt)}` : `creada el ${formatClubDateTime(p.createdAt)}`}
                        {p.eventDate ? ` · evento el ${formatClubDate(p.eventDate)}` : ""}
                      </p>
                    </div>
                    <ControlesNoticia id={p.id} publicada={Boolean(p.publishedAt)} />
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
