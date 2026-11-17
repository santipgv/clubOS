import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActiveMember, isStaff } from "@/lib/auth/guards";
import { hojaDeSalidas } from "@/lib/golf/salidas";
import { formatClubDayLong, isValidDay } from "@/lib/time";
import { FormularioSalida } from "./formulario";
import { Aviso, Dato, Tarjeta, TituloPagina } from "@/components/ui";

export const metadata: Metadata = { title: "Confirmar salida" };

export default async function ConfirmarSalidaPage({
  searchParams,
}: {
  searchParams: Promise<{ campo?: string; dia?: string; salida?: string; jugadores?: string }>;
}) {
  const user = await requireActiveMember();
  const sp = await searchParams;

  const startMinute = Number(sp.salida);
  if (!sp.campo || !sp.dia || !isValidDay(sp.dia) || !Number.isInteger(startMinute)) {
    redirect("/reservar/golf");
  }

  const course = await prisma.golfCourse.findFirst({
    where: { id: sp.campo, isActive: true },
  });
  if (!course) notFound();

  const hoja = await hojaDeSalidas({
    courseId: course.id,
    day: sp.dia,
    viewerId: user.id,
    viewerIsStaff: isStaff(user),
  });
  const salida = hoja?.salidas.find((s) => s.startMinute === startMinute);

  if (!salida || (salida.estado !== "LIBRE" && salida.estado !== "PARCIAL")) {
    return (
      <>
        <TituloPagina titulo="Confirmar salida" />
        <Aviso tipo="error">
          Esa salida ya no tiene plazas libres.{" "}
          <Link href={`/reservar/golf?campo=${course.id}&dia=${sp.dia}`} className="font-bold underline">
            Volver a la hoja de salidas
          </Link>
        </Aviso>
      </>
    );
  }

  const pedidos = Number(sp.jugadores);
  const jugadores = Number.isInteger(pedidos) && pedidos >= 1 && pedidos <= salida.libres ? pedidos : 1;

  return (
    <>
      <TituloPagina
        titulo="Confirmar salida"
        descripcion={`${course.name} · ${formatClubDayLong(sp.dia)} a las ${salida.hora}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <FormularioSalida
          courseId={course.id}
          day={sp.dia}
          startMinute={startMinute}
          hora={salida.hora}
          libres={salida.libres}
          jugadoresActual={jugadores}
          buggiesDisponibles={course.buggiesAvailable}
          precioSocio={course.memberPriceCents}
          precioInvitado={course.guestPriceCents}
          precioBuggy={course.buggyPriceCents}
          yaOcupadas={salida.ocupados}
        />

        <Tarjeta className="h-fit p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-piedra-500">Resumen</h2>
          <dl className="mt-4">
            <Dato termino="Recorrido">{course.name}</Dato>
            <Dato termino="Día">{formatClubDayLong(sp.dia)}</Dato>
            <Dato termino="Salida">{salida.hora}</Dato>
            <Dato termino="Plazas libres">{salida.libres} de {salida.aforo}</Dato>
          </dl>
          <p className="mt-4 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-piedra-500">
            El pago se realiza en recepción.
          </p>
          {salida.ocupados > 0 ? (
            <p className="mt-3 rounded-md border border-acento-300 bg-acento-100 px-3 py-2 text-xs text-acento-600">
              Te unes a una salida que ya tiene {salida.ocupados} jugador(es).
            </p>
          ) : null}
        </Tarjeta>
      </div>
    </>
  );
}
