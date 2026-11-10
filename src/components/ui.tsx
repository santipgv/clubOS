import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Piezas compartidas. Deliberadamente pocas: la aplicacion es pequena. */

const BOTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTES = {
  primario: "bg-marca-700 text-white hover:bg-marca-800",
  secundario: "bg-white text-marca-800 border border-piedra-300 hover:border-marca-400 hover:bg-marca-50",
  peligro: "bg-granate-500 text-white hover:bg-granate-600",
  fantasma: "text-marca-700 hover:bg-marca-50",
} as const;

const TAMANOS = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-[15px]",
  lg: "px-6 py-3.5 text-base",
} as const;

type Variante = keyof typeof VARIANTES;
type Tamano = keyof typeof TAMANOS;

export function Boton({
  variante = "primario",
  tamano = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: Variante; tamano?: Tamano }) {
  return <button {...props} className={`${BOTON_BASE} ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`} />;
}

export function BotonEnlace({
  variante = "primario",
  tamano = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return <Link {...props} className={`${BOTON_BASE} ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`} />;
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-piedra-200 bg-white shadow-[0_1px_2px_rgba(22,41,27,.05)] ${className}`}>
      {children}
    </div>
  );
}

const TONOS = {
  neutro: "bg-marca-100 text-marca-800",
  verde: "bg-marca-600 text-white",
  ambar: "bg-acento-200 text-acento-600",
  oro: "bg-acento-300 text-marca-900",
  granate: "bg-granate-500 text-white",
  tierra: "bg-granate-500 text-white",
  gris: "bg-piedra-200 text-piedra-500",
} as const;

export type Tono = keyof typeof TONOS;

export function Etiqueta({
  tono = "neutro",
  children,
  className = "",
}: {
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Aviso({
  tipo = "info",
  children,
}: {
  tipo?: "info" | "error" | "exito";
  children: ReactNode;
}) {
  const estilos = {
    info: "border-marca-200 bg-marca-50 text-marca-800",
    error: "border-granate-300 bg-granate-300/15 text-granate-600",
    exito: "border-marca-300 bg-marca-50 text-marca-800",
  }[tipo];
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${estilos}`}>
      {children}
    </div>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  obligatorio,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  obligatorio?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-marca-800">
        {etiqueta}
        {obligatorio ? <span className="ml-1 font-normal text-granate-500">*</span> : null}
      </span>
      {children}
      {ayuda ? <span className="mt-1 block text-xs text-piedra-500">{ayuda}</span> : null}
    </label>
  );
}

export const INPUT_CLASS =
  "w-full rounded-md border border-piedra-300 bg-white px-3.5 py-2.5 text-[15px] text-marca-900 placeholder:text-piedra-400 focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-500/20";

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-piedra-300 bg-piedra-50 px-6 py-10 text-center text-sm text-piedra-500">
      {children}
    </div>
  );
}

/** Titulo de seccion en el estilo del club: Lato ligera, mayusculas, espaciada. */
export function Seccion({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-piedra-200 pb-2">
      <h2 className="titulo-club text-lg text-marca-800">{children}</h2>
      {accion}
    </div>
  );
}

export function TituloPagina({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="titulo-club text-3xl text-marca-900 sm:text-4xl">{titulo}</h1>
        {descripcion ? <p className="mt-2 text-sm text-piedra-500">{descripcion}</p> : null}
      </div>
      {accion}
    </div>
  );
}

/** Fila de definicion: termino a la izquierda, valor a la derecha. */
export function Dato({
  termino,
  children,
  ayuda,
}: {
  termino: string;
  children: ReactNode;
  ayuda?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-piedra-100 py-2 last:border-0">
      <dt className="text-sm text-piedra-500">{termino}</dt>
      <dd className="text-sm font-bold text-marca-900">
        {children}
        {ayuda ? <span className="mt-0.5 block text-right text-xs font-normal text-piedra-400">{ayuda}</span> : null}
      </dd>
    </div>
  );
}
