import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { generarCuotasDelAno, marcarCuotasVencidas } from "@/lib/cuotas";
import { recordAudit } from "@/lib/audit";

/**
 * Generacion automatica de las cuotas del ano.
 *
 * Pensado para una tarea programada (Vercel Cron o similar) el 1 de enero:
 *
 *   {"crons":[{"path":"/api/cron/cuotas","schedule":"0 3 1 1 *"}]}
 *
 * Es idempotente, asi que da igual que se ejecute de mas. Si CRON_SECRET no
 * esta configurado, la ruta queda cerrada: una direccion publica que crea
 * recibos a todos los socios no es algo que deba quedar abierto por descuido.
 */
export async function GET(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Tarea no configurada" }, { status: 404 });
  }

  const cabecera = request.headers.get("authorization");
  if (cabecera !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ano = new Date().getFullYear();
  const resultados = await generarCuotasDelAno(ano);
  const vencidas = await marcarCuotasVencidas();

  const creadas = resultados.reduce((s, r) => s + r.creadas, 0);
  await recordAudit({
    action: "fee.generated",
    entityType: "MembershipFee",
    metadata: { ano, creadas, vencidas, origen: "tarea programada" },
  });

  return NextResponse.json({ ano, creadas, vencidas, periodos: resultados.map((r) => r.periodo) });
}
