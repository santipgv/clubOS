import { Resend } from "resend";
import { env, isProduction } from "./env";
import { getIdentidad, type IdentidadClub } from "./club";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!resend) {
    // Sin proveedor configurado (desarrollo): el enlace se imprime por consola
    // para poder probar el acceso sin montar un dominio de correo.
    console.info(`\n─── correo para ${to} ───\n${subject}\n${text}\n──────────────────────\n`);
    if (isProduction) throw new Error("RESEND_API_KEY no configurada en produccion");
    return;
  }
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (error) throw new Error(`Fallo al enviar correo: ${error.message}`);
}

/** Escapa texto que escribe el administrador antes de meterlo en el HTML. */
function html(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function boton(club: IdentidadClub, href: string, texto: string): string {
  return `<a href="${href}" style="background:${club["club.colorMarca"]};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;display:inline-block;font-weight:600">${texto}</a>`;
}

function layout(club: IdentidadClub, titulo: string, cuerpo: string): string {
  const contacto = club["club.emailContacto"]
    ? `<tr><td style="font-size:12px;color:#6b6b66;padding-top:24px">Dudas: ${html(club["club.emailContacto"])}</td></tr>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:${club["club.colorMarca"]};padding-bottom:8px">${html(club["club.nombre"])}</td></tr>
      <tr><td style="font-size:22px;font-weight:600;padding-bottom:16px">${titulo}</td></tr>
      <tr><td style="font-size:15px;line-height:1.6">${cuerpo}</td></tr>
      ${contacto}
    </table>
  </td></tr></table></body></html>`;
}

export async function sendMagicLinkEmail(to: string, url: string, esNuevo: boolean): Promise<void> {
  const club = await getIdentidad();
  const corto = club["club.nombreCorto"];
  const titulo = esNuevo ? "Confirma tu correo" : `Tu acceso a ${corto}`;
  const cuerpo = `
    <p>${esNuevo
      ? "Gracias por registrarte. Confirma tu correo con este enlace:"
      : "Pulsa el boton para entrar en tu cuenta:"}</p>
    <p style="padding:20px 0">${boton(club, url, "Entrar")}</p>
    <p style="color:#6b6b66;font-size:13px">El enlace caduca en 15 minutos y solo puede usarse una vez.
    Si no has sido tu, ignora este correo: nadie ha accedido a tu cuenta.</p>`;
  const text = `${titulo}\n\n${url}\n\nCaduca en 15 minutos y es de un solo uso.`;
  await send(to, `${titulo} — ${corto}`, layout(club, html(titulo), cuerpo), text);
}

export async function sendMemberApprovedEmail(to: string, nombre: string, numeroSocio: string): Promise<void> {
  const club = await getIdentidad();
  const cuerpo = `
    <p>Hola ${html(nombre)},</p>
    <p>Tu alta como socio ha sido aprobada. Tu número de socio es <strong>${numeroSocio}</strong>.</p>
    <p>Ya puedes reservar pistas desde la aplicación del club.</p>
    <p style="padding:20px 0">${boton(club, env.APP_URL, "Ir a reservar")}</p>`;
  await send(
    to,
    `Alta aprobada — ${club["club.nombreCorto"]}`,
    layout(club, "Bienvenido al club", cuerpo),
    `Hola ${nombre}, tu alta ha sido aprobada. Número de socio: ${numeroSocio}. ${env.APP_URL}`,
  );
}
