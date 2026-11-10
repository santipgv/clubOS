"use server";

import { redirect } from "next/navigation";
import { requestMagicLink } from "@/lib/auth/magic-link";
import { loginWithPassword } from "@/lib/auth/login";
import { accesoSchema, loginSchema, erroresDeCampo } from "@/lib/validation";

export type EstadoAcceso = {
  ok?: boolean;
  errores?: Record<string, string>;
  mensaje?: string;
};

/** Acceso normal: correo y contrasena. */
export async function entrarConContrasena(
  _previo: EstadoAcceso,
  formData: FormData,
): Promise<EstadoAcceso> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const resultado = await loginWithPassword(parsed.data.email, parsed.data.password);

  if (!resultado.ok) {
    if (resultado.reason === "limite") {
      const minutos = Math.ceil((resultado.retryAfterSeconds ?? 900) / 60);
      return {
        mensaje: `Demasiados intentos fallidos. Prueba de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      };
    }
    return {
      mensaje:
        "Correo o contraseña incorrectos. Si aún no has elegido contraseña, entra con el enlace por correo.",
    };
  }

  redirect(resultado.status === "ACTIVE" ? "/" : "/pendiente");
}

/** Alternativa sin contrasena: enlace de un solo uso al correo. */
export async function solicitarAcceso(
  _previo: EstadoAcceso,
  formData: FormData,
): Promise<EstadoAcceso> {
  const parsed = accesoSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const resultado = await requestMagicLink(parsed.data.email);

  if (!resultado.ok) {
    const minutos = Math.ceil(resultado.retryAfterSeconds / 60);
    return {
      mensaje: `Demasiados intentos. Vuelve a probar en ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
    };
  }

  // Respuesta identica exista o no la cuenta: ver src/lib/auth/magic-link.ts
  return { ok: true };
}
