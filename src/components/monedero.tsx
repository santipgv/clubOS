import { formatEuros } from "@/lib/booking/pricing";
import { formatClubDateTime } from "@/lib/time";
import { WALLET_MOVEMENT_LABELS } from "@/lib/wallet";
import type { PaymentMethod } from "@/lib/types";
import { Vacio } from "./ui";

/** Piezas del monedero que comparten la vista del socio y su ficha en administracion. */

const METODO: Partial<Record<PaymentMethod, string>> = {
  CASH: "efectivo",
  TRANSFER: "transferencia",
  MANUAL: "otro medio",
  CARD_STRIPE: "tarjeta",
};

export type MovimientoMonedero = {
  id: string;
  type: keyof typeof WALLET_MOVEMENT_LABELS;
  amountCents: number;
  balanceAfterCents: number;
  method: PaymentMethod | null;
  concept: string;
  createdAt: Date;
};

export function SaldoMonedero({ balanceCents }: { balanceCents: number }) {
  return (
    <p className="text-3xl font-bold tabular-nums text-marca-900">
      {formatEuros(balanceCents)}
      <span className="ml-2 align-middle text-sm font-normal text-piedra-500">de saldo</span>
    </p>
  );
}

export function MovimientosMonedero({ movimientos }: { movimientos: MovimientoMonedero[] }) {
  if (movimientos.length === 0) return <Vacio>Todavía no hay movimientos en el monedero.</Vacio>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
          <tr>
            <th className="py-2 font-bold">Fecha</th>
            <th className="py-2 font-bold">Concepto</th>
            <th className="py-2 text-right font-bold">Importe</th>
            <th className="py-2 text-right font-bold">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="py-2.5 whitespace-nowrap text-piedra-500">{formatClubDateTime(m.createdAt)}</td>
              <td className="py-2.5">
                <span className="block font-bold text-marca-900">{WALLET_MOVEMENT_LABELS[m.type]}</span>
                <span className="block text-xs text-piedra-500">
                  {m.concept}
                  {m.method && METODO[m.method] ? ` · en ${METODO[m.method]}` : ""}
                </span>
              </td>
              <td
                className={`py-2.5 text-right font-bold tabular-nums ${
                  m.amountCents > 0 ? "text-marca-700" : "text-granate-600"
                }`}
              >
                {m.amountCents > 0 ? "+" : "−"}
                {formatEuros(Math.abs(m.amountCents))}
              </td>
              <td className="py-2.5 text-right tabular-nums text-piedra-500">{formatEuros(m.balanceAfterCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
