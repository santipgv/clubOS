"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeMagicLink } from "@/lib/auth/magic-link";

const tokenSchema = z.string().min(20).max(200);

/** El canje solo ocurre tras una confirmacion POST consciente del usuario. */
export async function confirmarAcceso(formData: FormData): Promise<never> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) redirect("/entrar?error=invalido");

  const resultado = await consumeMagicLink(parsed.data);
  if (!resultado.ok) redirect(`/entrar?error=${encodeURIComponent(resultado.reason)}`);

  redirect(resultado.status === "ACTIVE" ? "/" : "/pendiente");
}
