"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { slugify } from "@/lib/noticias";
import { erroresDeCampo } from "@/lib/validation";
import { DAY_PATTERN } from "@/lib/time";

export type EstadoNoticia = { error?: string; ok?: string };

const noticiaSchema = z.object({
  title: z.string().trim().min(4, "Pon un título").max(140),
  excerpt: z.string().trim().max(280).optional(),
  body: z.string().trim().min(10, "Escribe el contenido").max(8000),
  category: z.enum(["NOTICIA", "EVENTO", "AVISO"]),
  eventDate: z.string().regex(DAY_PATTERN).optional().or(z.literal("")),
  isPinned: z.union([z.literal("on"), z.literal("")]).optional(),
  publicar: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function crearNoticia(_previo: EstadoNoticia, formData: FormData): Promise<EstadoNoticia> {
  const admin = await requireAdmin();

  const parsed = noticiaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };
  const d = parsed.data;

  // Slug unico: si ya existe, se le anade un sufijo en lugar de fallar.
  const base = slugify(d.title) || "noticia";
  for (let intento = 0; intento < 5; intento++) {
    const slug = intento === 0 ? base : `${base}-${intento + 1}`;
    try {
      const post = await prisma.post.create({
        data: {
          slug,
          title: d.title,
          excerpt: d.excerpt || null,
          body: d.body,
          category: d.category,
          eventDate: d.eventDate ? new Date(`${d.eventDate}T00:00:00Z`) : null,
          isPinned: d.isPinned === "on",
          publishedAt: d.publicar === "on" ? new Date() : null,
          authorId: admin.id,
        },
        select: { id: true },
      });

      await recordAudit({
        actorId: admin.id,
        action: "post.created",
        entityType: "Post",
        entityId: post.id,
        metadata: { titulo: d.title, publicada: d.publicar === "on" },
      });

      revalidatePath("/admin/noticias");
      revalidatePath("/");
      return { ok: d.publicar === "on" ? "Publicada en el tablon." : "Guardada como borrador." };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return { error: "No se ha podido crear: ya hay demasiadas noticias con ese título." };
}

export async function alternarPublicacion(_previo: EstadoNoticia, formData: FormData): Promise<EstadoNoticia> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const post = await prisma.post.findUnique({ where: { id }, select: { id: true, publishedAt: true } });
  if (!post) return { error: "Esa noticia ya no existe." };

  const publicar = post.publishedAt === null;
  await prisma.post.update({ where: { id }, data: { publishedAt: publicar ? new Date() : null } });

  await recordAudit({
    actorId: admin.id,
    action: publicar ? "post.published" : "post.unpublished",
    entityType: "Post",
    entityId: id,
  });

  revalidatePath("/admin/noticias");
  revalidatePath("/");
  return { ok: publicar ? "Publicada." : "Retirada del tablon." };
}

export async function eliminarNoticia(_previo: EstadoNoticia, formData: FormData): Promise<EstadoNoticia> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const borrada = await prisma.post.deleteMany({ where: { id } });
  if (borrada.count === 0) return { error: "Esa noticia ya no existe." };

  await recordAudit({ actorId: admin.id, action: "post.deleted", entityType: "Post", entityId: id });
  revalidatePath("/admin/noticias");
  revalidatePath("/");
  return { ok: "Noticia eliminada." };
}
