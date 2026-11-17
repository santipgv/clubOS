"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

const tokenSchema = z.string().min(20).max(200);

/** La baja se ejecuta por POST; visitar o previsualizar el enlace no la activa. */
export async function confirmarBajaBoletin(formData: FormData): Promise<never> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) redirect("/baja-boletin?error=invalido");

  const baja = await prisma.user.updateMany({
    where: { newsletterUnsubToken: parsed.data, newsletterOptIn: true },
    data: { newsletterOptIn: false, newsletterUpdatedAt: new Date(), newsletterUnsubToken: null },
  });

  if (baja.count === 0) redirect("/baja-boletin?error=invalido");

  await recordAudit({
    action: "newsletter.changed",
    entityType: "User",
    metadata: { alta: false, via: "enlace del correo" },
  });
  redirect("/baja-boletin?hecho=1");
}
