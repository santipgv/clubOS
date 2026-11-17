import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { fromZonedTime } from "date-fns-tz";
import { CLUB_TZ, clubToday, formatClubDate, formatClubDateLong } from "@/lib/time";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { DEPORTE_TORNEO, TIPO_SOCIO } from "@/lib/vocabulario";
import { rutaFichaSocio } from "@/lib/rutas";
import {
  AGRUPACIONES,
  DIAS_SEMANA_LUNES,
  PRESETS,
  TODOS_LOS_PERIODOS,
  resolverFiltros,
} from "@/lib/panel";
import { cargarPanel } from "@/lib/panel-datos";
import { Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import { FiltrosPanel } from "./filtros";
import {
  BarraSegmentada,
  COLOR_ESTADO,
  COLOR_SERIE,
  Columnas,
  Leyenda,
  Medidor,
  RAMPA_OCUPACION,
  VerDatos,
  colorOcupacion,
  euros,
  eurosCompacto,
  numero,
  porcentaje,
} from "./graficos";
import type { MemberType, PaymentMethod, Sport } from "@/lib/types";

export const metadata: Metadata = { title: "Panel de indicadores" };

const METODO: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia / domiciliación",
  CARD_STRIPE: "Tarjeta",
  CREDIT: "Cargo en cuota",
  WALLET: "Monedero",
  MANUAL: "Otro / manual",
};

function fechaCorta(dia: string): string {
  return formatClubDate(fromZonedTime(`${dia}T12:00:00`, CLUB_TZ));
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const f = resolverFiltros(params, clubToday());

  const pistasTodas = await prisma.court.findMany({
    where: { isActive: true },
    orderBy: [{ sport: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sport: true },
  });
  // Una pista de otro deporte que el elegido no tiene sentido: se ignora.
  const pista = pistasTodas.find((p) => p.id === f.pistaId && (!f.deporte || p.sport === f.deporte));
  const filtros = { ...f, pistaId: pista?.id ?? null };

  const d = await cargarPanel(filtros);

  const textoRango =
    filtros.rango.desde === filtros.rango.hasta
      ? fechaCorta(filtros.rango.desde)
      : `${fechaCorta(filtros.rango.desde)} – ${fechaCorta(filtros.rango.hasta)}`;
  const textoAnterior = `${fechaCorta(d.anterior.desde)} – ${fechaCorta(d.anterior.hasta)}`;
  const ambito = [
    pista ? pista.name : filtros.deporte ? DEPORTE_NOMBRE[filtros.deporte] : null,
    filtros.tipoSocio ? `socios ${TIPO_SOCIO[filtros.tipoSocio].label.toLowerCase()}` : null,
  ].filter(Boolean);

  const pendienteTotal = d.dinero.pendientePistas + d.dinero.pendienteTorneos;
  const cuotas = d.cuotas.total;
  const tasaCobroCuotas = cuotas.giradoCents ? cuotas.cobradoCents / cuotas.giradoCents : null;

  return (
    <>
      <TituloPagina
        titulo="Panel de indicadores"
        descripcion={`${textoRango}${ambito.length ? ` · ${ambito.join(" · ")}` : ""}`}
      />

      <FiltrosPanel
        // El formulario guarda estado propio (periodo, deporte) y valores por
        // defecto en los campos. Al navegar sin recargar, p. ej. con "Limpiar",
        // React conservaria lo anterior: la clave lo vuelve a montar con la URL.
        key={JSON.stringify([filtros.rango, filtros.deporte, filtros.pistaId, filtros.tipoSocio, params.agrupar, f.periodoCuota])}
        valores={{
          rango: filtros.rango.preset,
          desde: filtros.rango.desde,
          hasta: filtros.rango.hasta,
          deporte: filtros.deporte ?? "",
          pista: filtros.pistaId ?? "",
          tipo: filtros.tipoSocio ?? "",
          agrupar: typeof params.agrupar === "string" && params.agrupar in AGRUPACIONES ? params.agrupar : "",
          periodo: f.periodoCuota ?? "",
        }}
        presets={Object.entries(PRESETS).map(([valor, texto]) => ({ valor, texto }))}
        agrupaciones={Object.entries(AGRUPACIONES).map(([valor, texto]) => ({ valor, texto }))}
        deportes={(Object.keys(DEPORTE_NOMBRE) as Sport[]).map((s) => ({ valor: s, texto: DEPORTE_NOMBRE[s] }))}
        pistas={pistasTodas.map((p) => ({ valor: p.id, texto: `${p.name} (${DEPORTE_NOMBRE[p.sport]})`, deporte: p.sport }))}
        tipos={(Object.keys(TIPO_SOCIO) as MemberType[]).map((t) => ({ valor: t, texto: TIPO_SOCIO[t].label }))}
        periodos={[
          { valor: TODOS_LOS_PERIODOS, texto: "Todos los periodos" },
          ...d.cuotas.periodos.map((p) => ({ valor: p, texto: p })),
        ]}
      />

      {/* ------------------------------------------------------------ ingresos */}
      <section className="mb-10">
        <Seccion>Ingresos</Seccion>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Tarjeta className="p-5 lg:row-span-2">
            <p className="text-sm text-piedra-500">Cobrado en el periodo</p>
            <p className="mt-1 text-5xl font-bold text-marca-900">{euros(d.dinero.cobradoTotal, false)}</p>
            <Delta valor={d.dinero.variacionCobrado} frente={textoAnterior} nota="pistas y cuotas" />
            <dl className="mt-5 space-y-2 border-t border-piedra-100 pt-4 text-sm">
              <Linea termino="Pistas" valor={euros(d.dinero.cobradoPistas)} color={COLOR_SERIE[0]} />
              <Linea termino="Cuotas" valor={euros(d.dinero.cobradoCuotas)} color={COLOR_SERIE[1]} />
              <Linea termino="Torneos" valor={euros(d.dinero.cobradoTorneos)} />
              <Linea termino="IVA contenido" valor={euros(d.dinero.ivaCents)} tenue />
            </dl>
          </Tarjeta>

          <Ficha
            etiqueta="Pendiente de cobro"
            valor={euros(pendienteTotal)}
            detalle={`Reservas ${euros(d.dinero.pendientePistas)} · torneos ${euros(d.dinero.pendienteTorneos)}`}
            alerta={pendienteTotal > 0}
          />
          <Ficha
            etiqueta="Facturado en pistas"
            valor={euros(d.dinero.facturadoPistas)}
            detalle="Importe de las reservas jugadas en el periodo, cobradas o no"
          />
          <Ficha
            etiqueta="Importe medio por reserva de pago"
            valor={d.reservas.importeMedioCents === null ? "—" : euros(d.reservas.importeMedioCents)}
            detalle="Sin contar las reservas incluidas en la cuota"
          />
          <Tarjeta className="p-5">
            <p className="text-sm text-piedra-500">Cobros por medio de pago</p>
            {d.dinero.porMetodo.length === 0 ? (
              <p className="mt-2 text-sm text-piedra-400">Sin cobros en el periodo.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {d.dinero.porMetodo.map(([metodo, cents]) => (
                  <li key={metodo}>
                    <div className="flex justify-between gap-2">
                      <span className="text-marca-800">{METODO[metodo]}</span>
                      <span className="font-bold tabular-nums text-marca-900">{euros(cents)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-marca-100">
                      <div
                        className="h-full rounded-full bg-marca-600"
                        style={{ width: `${(cents / Math.max(1, d.dinero.porMetodo[0][1])) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <Tarjeta className="mt-4 p-5">
          <h3 className="mb-4 text-sm font-bold text-marca-800">
            Cobros de pistas y cuotas, {AGRUPACIONES[filtros.agrupacion].toLowerCase()}
          </h3>
          <Columnas
            titulo="Cobros de pistas y cuotas"
            datos={d.series.ingresos}
            series={[
              { nombre: "Pistas", color: COLOR_SERIE[0] },
              { nombre: "Cuotas", color: COLOR_SERIE[1] },
            ]}
            formato={(v) => (v === 0 ? "0 €" : eurosCompacto(v))}
          />
          <p className="mt-3 text-xs text-piedra-400">
            Por fecha de cobro. Los torneos no guardan la fecha en que se cobra cada inscripción, así que
            cuentan en el total por la fecha del torneo y no aparecen en esta gráfica.
            {filtros.deporte || pista ? " El deporte y la pista no se aplican a las cuotas." : ""}
          </p>
        </Tarjeta>
      </section>

      {/* ------------------------------------------------------------ reservas */}
      <section className="mb-10">
        <Seccion>Reservas</Seccion>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Ficha
            etiqueta="Reservas"
            valor={numero(d.reservas.total)}
            detalle={<Delta valor={d.reservas.variacion} frente={`${numero(d.reservas.anterior)} en ${textoAnterior}`} />}
          />
          <Ficha etiqueta="Horas de pista reservadas" valor={numero(d.reservas.horas, 1)} />
          <Ficha
            etiqueta="Ocupación"
            valor={porcentaje(d.reservas.ocupacion, 1)}
            detalle="Horas reservadas sobre horas de apertura"
          />
          <Ficha
            etiqueta="Cancelaciones"
            valor={numero(d.reservas.canceladas)}
            detalle={`${porcentaje(d.reservas.tasaCancelacion, 1)} de las reservas · ${numero(d.reservas.noPresentados)} no presentados (${porcentaje(d.reservas.tasaNoPresentados, 1)})`}
          />
        </div>

        <Tarjeta className="mb-4 p-5">
          <h3 className="mb-4 text-sm font-bold text-marca-800">
            Reservas, {AGRUPACIONES[filtros.agrupacion].toLowerCase()}
          </h3>
          <Columnas
            titulo="Reservas por periodo"
            datos={d.series.reservas}
            series={[{ nombre: "Reservas", color: COLOR_SERIE[0] }]}
            formato={(v) => numero(v)}
          />
        </Tarjeta>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Tarjeta className="self-start overflow-x-auto lg:col-span-3">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Pista</th>
                  <th className="px-3 py-2.5 text-right font-bold">Reservas</th>
                  <th className="px-3 py-2.5 text-right font-bold">Horas</th>
                  <th className="px-3 py-2.5 font-bold">Ocupación</th>
                  <th className="px-3 py-2.5 text-right font-bold">Facturado</th>
                  <th className="px-4 py-2.5 text-right font-bold">Cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-piedra-100 tabular-nums">
                {d.deportes.map((dep) => (
                  <FilasDeporte key={dep.deporte} deporte={dep} pistas={d.pistas.filter((p) => p.deporte === dep.deporte)} />
                ))}
              </tbody>
            </table>
            {d.pistas.length === 0 ? <p className="p-4 text-sm text-piedra-400">No hay pistas activas con este filtro.</p> : null}
          </Tarjeta>

          <Tarjeta className="p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-marca-800">Ocupación por día y hora</h3>
            <p className="mb-3 text-xs text-piedra-400">Qué franjas se llenan y cuáles quedan libres.</p>
            <MapaCalor horas={d.calor.horas} filas={d.calor.filas} />
          </Tarjeta>
        </div>
      </section>

      {/* ------------------------------------------------------------ cuotas */}
      <section className="mb-10">
        <Seccion
          accion={
            <Link href="/admin/cuotas" className="text-xs font-bold text-marca-700 underline">
              Gestionar cuotas
            </Link>
          }
        >
          Cuotas {d.cuotas.periodo ? d.cuotas.periodo : "· todos los periodos"}
        </Seccion>

        {cuotas.recibos === 0 ? (
          <Vacio>No hay cuotas generadas{d.cuotas.periodo ? ` para ${d.cuotas.periodo}` : ""} con este filtro.</Vacio>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Ficha etiqueta="Girado" valor={euros(cuotas.giradoCents)} detalle={`${numero(cuotas.recibos)} recibos`} />
              <Ficha etiqueta="Cobrado" valor={euros(cuotas.cobradoCents)} detalle={`${porcentaje(tasaCobroCuotas, 1)} de lo girado`} />
              <Ficha etiqueta="Pendiente en plazo" valor={euros(cuotas.pendienteCents)} />
              <Ficha
                etiqueta="Vencido sin cobrar"
                valor={euros(cuotas.vencidoCents)}
                detalle={`${numero(d.cuotas.deudores.length)} socios`}
                alerta={cuotas.vencidoCents > 0}
              />
            </div>

            <Tarjeta className="mb-4 p-5">
              <BarraSegmentada
                titulo="Reparto de lo girado"
                formato={(v) => euros(v)}
                partes={[
                  { nombre: "Cobrado", valor: cuotas.cobradoCents, color: COLOR_ESTADO.bien, icono: "✓" },
                  { nombre: "Pendiente en plazo", valor: cuotas.pendienteCents, color: COLOR_ESTADO.atencion, textoOscuro: true, icono: "◷" },
                  { nombre: "Vencido", valor: cuotas.vencidoCents, color: COLOR_ESTADO.mal, icono: "!" },
                  { nombre: "Exento o devuelto", valor: cuotas.exentoCents, color: COLOR_ESTADO.neutro, textoOscuro: true },
                ]}
              />
            </Tarjeta>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Tarjeta className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Categoría</th>
                      <th className="px-3 py-2.5 text-right font-bold">Recibos</th>
                      <th className="px-3 py-2.5 text-right font-bold">Girado</th>
                      <th className="px-3 py-2.5 text-right font-bold">Vencido</th>
                      <th className="px-4 py-2.5 font-bold">Cobro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-piedra-100 tabular-nums">
                    {d.cuotas.porTipo.map((t) => (
                      <tr key={t.tipo}>
                        <td className="px-4 py-2 font-bold text-marca-900">{TIPO_SOCIO[t.tipo].label}</td>
                        <td className="px-3 py-2 text-right">{numero(t.recibos)}</td>
                        <td className="px-3 py-2 text-right">{euros(t.giradoCents)}</td>
                        <td className={`px-3 py-2 text-right ${t.vencidoCents ? "font-bold text-granate-500" : "text-piedra-400"}`}>
                          {euros(t.vencidoCents)}
                        </td>
                        <td className="px-4 py-2">
                          <Medidor
                            valor={t.giradoCents ? t.cobradoCents / t.giradoCents : null}
                            etiqueta={`Cobrado de ${TIPO_SOCIO[t.tipo].label}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tarjeta>

              <Tarjeta>
                <h3 className="border-b border-piedra-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-piedra-400">
                  Socios con cuotas vencidas
                </h3>
                {d.cuotas.deudores.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-piedra-400">Nadie tiene cuotas vencidas.</p>
                ) : (
                  <ul className="max-h-80 divide-y divide-piedra-100 overflow-y-auto text-sm">
                    {d.cuotas.deudores.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
                        <div className="min-w-0">
                          <Link href={rutaFichaSocio(s.id)} className="font-bold text-marca-800 hover:underline">
                            {s.nombre}
                          </Link>
                          <p className="text-xs text-piedra-400">
                            {s.numero ? `N.º ${s.numero} · ` : ""}
                            {TIPO_SOCIO[s.tipo].label} · {s.recibos} recibo{s.recibos === 1 ? "" : "s"} · desde el{" "}
                            {formatClubDateLong(s.desde, true)}
                          </p>
                        </div>
                        <span className="shrink-0 font-bold tabular-nums text-granate-500">{euros(s.importeCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------ socios y torneos */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <Seccion
            accion={
              <Link href="/admin/socios" className="text-xs font-bold text-marca-700 underline">
                Ver socios
              </Link>
            }
          >
            Socios
          </Seccion>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <Ficha etiqueta="Activos" valor={numero(d.socios.activos)} detalle={`${numero(d.socios.suspendidos)} suspendidos`} />
            <Ficha
              etiqueta="Altas pendientes de aprobar"
              valor={numero(d.socios.pendientes)}
              alerta={d.socios.pendientes > 0}
            />
            <Ficha etiqueta="Altas en el periodo" valor={numero(d.socios.altas)} />
            <Ficha etiqueta="Bajas en el periodo" valor={numero(d.socios.bajas)} />
          </div>
          {d.socios.porTipo.length > 0 ? (
            <Tarjeta className="p-5">
              <h3 className="mb-3 text-sm font-bold text-marca-800">Socios activos por categoría</h3>
              <ul className="space-y-2 text-sm">
                {d.socios.porTipo.map((t) => (
                  <li key={t.tipo} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
                    <span className="truncate text-marca-800">{TIPO_SOCIO[t.tipo].label}</span>
                    <div className="h-2 rounded-full bg-marca-100">
                      <div
                        className="h-full rounded-full bg-marca-600"
                        style={{ width: `${(t.n / d.socios.porTipo[0].n) * 100}%` }}
                      />
                    </div>
                    <span className="text-right font-bold tabular-nums text-marca-900">{numero(t.n)}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}
        </section>

        <section>
          <Seccion
            accion={
              <Link href="/admin/torneos" className="text-xs font-bold text-marca-700 underline">
                Ver torneos
              </Link>
            }
          >
            Torneos del periodo
          </Seccion>
          {d.torneos.length === 0 ? (
            <Vacio>No hay torneos con inscripciones en estas fechas.</Vacio>
          ) : (
            <Tarjeta className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Torneo</th>
                    <th className="px-3 py-2.5 text-right font-bold">Inscritos</th>
                    <th className="px-3 py-2.5 text-right font-bold">Facturado</th>
                    <th className="px-4 py-2.5 text-right font-bold">Cobrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-piedra-100 tabular-nums">
                  {d.torneos.map((t) => (
                    <tr key={`${t.nombre}-${t.fecha.toISOString()}`}>
                      <td className="px-4 py-2">
                        <span className="font-bold text-marca-900">{t.nombre}</span>
                        <span className="block text-xs text-piedra-400">
                          {DEPORTE_TORNEO[t.deporte]} · {formatClubDate(t.fecha)}
                          {t.cancelado ? " · cancelado" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.inscritos}
                        {t.plazas ? <span className="text-piedra-400">/{t.plazas}</span> : null}
                        {t.espera ? <span className="block text-xs text-piedra-400">{t.espera} en espera</span> : null}
                        {t.invitados ? <span className="block text-xs text-piedra-400">{t.invitados} invitados</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">{euros(t.facturadoCents)}</td>
                      <td className="px-4 py-2 text-right font-bold text-marca-900">{euros(t.cobradoCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          )}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- piezas locales

function Ficha({
  etiqueta,
  valor,
  detalle,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  alerta?: boolean;
}) {
  return (
    <Tarjeta className="p-5">
      <p className="text-sm text-piedra-500">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold ${alerta ? "text-granate-500" : "text-marca-900"}`}>{valor}</p>
      {detalle ? <div className="mt-1 text-xs text-piedra-400">{detalle}</div> : null}
    </Tarjeta>
  );
}

function Delta({ valor, frente, nota }: { valor: number | null; frente: string; nota?: string }) {
  if (valor === null) {
    return <p className="mt-1 text-xs text-piedra-400">Sin datos con que comparar ({frente})</p>;
  }
  const sube = valor > 0;
  const igual = Math.abs(valor) < 0.005;
  return (
    <p className="mt-1 text-xs text-piedra-500">
      <span className={`font-bold ${igual ? "text-piedra-500" : sube ? "text-marca-600" : "text-granate-500"}`}>
        {igual ? "=" : sube ? "▲" : "▼"} {igual ? "igual" : porcentaje(Math.abs(valor), 1)}
      </span>{" "}
      frente a {frente}
      {nota ? ` (${nota})` : ""}
    </p>
  );
}

function Linea({ termino, valor, color, tenue }: { termino: string; valor: string; color?: string; tenue?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`flex items-center gap-2 ${tenue ? "text-piedra-400" : "text-marca-800"}`}>
        {color ? <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} /> : null}
        {termino}
      </dt>
      <dd className={`tabular-nums ${tenue ? "text-piedra-400" : "font-bold text-marca-900"}`}>{valor}</dd>
    </div>
  );
}

type Fila = {
  reservas: number;
  minutos: number;
  ocupacion: number | null;
  facturadoCents: number;
  cobradoCents: number;
};

function Celdas({ fila, nombre }: { fila: Fila; nombre: string }) {
  return (
    <>
      <td className="px-3 py-2 text-right">{numero(fila.reservas)}</td>
      <td className="px-3 py-2 text-right">{numero(fila.minutos / 60, 1)}</td>
      <td className="px-3 py-2">
        <Medidor valor={fila.ocupacion} etiqueta={`Ocupación de ${nombre}`} />
      </td>
      <td className="px-3 py-2 text-right">{euros(fila.facturadoCents)}</td>
      <td className="px-4 py-2 text-right">{euros(fila.cobradoCents)}</td>
    </>
  );
}

function FilasDeporte({
  deporte,
  pistas,
}: {
  deporte: Fila & { deporte: Sport };
  pistas: (Fila & { id: string; nombre: string })[];
}) {
  const nombre = DEPORTE_NOMBRE[deporte.deporte];
  return (
    <>
      <tr className="bg-piedra-50 font-bold text-marca-900">
        <td className="px-4 py-2">{nombre}</td>
        <Celdas fila={deporte} nombre={nombre} />
      </tr>
      {pistas.length > 1
        ? pistas.map((p) => (
            <tr key={p.id} className="text-marca-800">
              <td className="py-2 pl-8 pr-4">{p.nombre}</td>
              <Celdas fila={p} nombre={p.nombre} />
            </tr>
          ))
        : null}
    </>
  );
}

function MapaCalor({
  horas,
  filas,
}: {
  horas: number[];
  filas: { minutos: number; abiertos: number; ocupacion: number | null }[][];
}) {
  if (horas.length === 0) return <p className="text-sm text-piedra-400">Sin horario de apertura en estas fechas.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[11px]">
          <caption className="sr-only">Ocupación por día de la semana y hora de inicio</caption>
          <thead>
            <tr>
              <th />
              {horas.map((h) => (
                <th key={h} scope="col" className="px-0.5 font-normal tabular-nums text-piedra-400">
                  {h % 2 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={DIAS_SEMANA_LUNES[i]}>
                <th scope="row" className="pr-1.5 text-left font-normal text-piedra-500">
                  {DIAS_SEMANA_LUNES[i]}
                </th>
                {fila.map((c, j) => {
                  const texto =
                    c.ocupacion === null
                      ? `${DIAS_SEMANA_LUNES[i]} ${horas[j]}:00 · cerrado`
                      : `${DIAS_SEMANA_LUNES[i]} ${horas[j]}:00 · ${porcentaje(c.ocupacion)} ocupado (${numero(c.minutos / 60, 1)} de ${numero(c.abiertos / 60, 1)} h)`;
                  return (
                    <td
                      key={horas[j]}
                      title={texto}
                      aria-label={texto}
                      className={`h-5 w-5 min-w-5 rounded-sm ${c.ocupacion === null ? "bg-[repeating-linear-gradient(45deg,#e6e6e2_0_2px,transparent_2px_5px)]" : ""}`}
                      style={c.ocupacion === null ? undefined : { backgroundColor: colorOcupacion(c.ocupacion) }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Leyenda
          elementos={[
            ...RAMPA_OCUPACION.map((r) => ({ nombre: r.texto, color: r.color })),
          ]}
        />
      </div>
      <VerDatos>
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-piedra-100 text-piedra-500">
            <tr>
              <th className="px-2 py-1">Hora</th>
              {DIAS_SEMANA_LUNES.map((dia) => (
                <th key={dia} className="px-2 py-1 text-right">{dia}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100 tabular-nums">
            {horas.map((h, j) => (
              <tr key={h}>
                <td className="px-2 py-1">{h}:00</td>
                {filas.map((fila, i) => (
                  <td key={i} className="px-2 py-1 text-right">{fila[j].ocupacion === null ? "—" : porcentaje(fila[j].ocupacion)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </VerDatos>
    </>
  );
}
