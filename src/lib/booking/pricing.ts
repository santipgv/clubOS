import type { MemberType, PriceRule, Sport, TaxTreatment } from "@/lib/types";

/**
 * Precios y fiscalidad. Ver docs/ESPECIFICACIONES.md §9.
 *
 * `priceCents` de una regla es el **importe final por hora** que paga el socio.
 * `taxCents` es la cuota de IVA contenida en ese importe, no un recargo: en un
 * club los precios se anuncian con impuestos incluidos.
 *
 * El tratamiento fiscal se decide aqui y se congela en la reserva, de modo que
 * cambiar la tarifa manana no reescribe la fiscalidad de lo ya reservado.
 */

export const TAX_RATES: Record<TaxTreatment, number> = {
  EXEMPT_SPORT: 0,
  NOT_SUBJECT: 0,
  REDUCED_10: 0.1,
  STANDARD_21: 0.21,
};

export const TAX_LABELS: Record<TaxTreatment, string> = {
  EXEMPT_SPORT: "Exento (art. 20.Uno.13 LIVA)",
  NOT_SUBJECT: "No sujeto",
  REDUCED_10: "IVA 10 %",
  STANDARD_21: "IVA 21 %",
};

export type Quote = {
  priceCents: number;
  taxCents: number;
  taxTreatment: TaxTreatment;
  label: string | null;
};

/** Extrae la cuota de IVA contenida en un importe con impuestos incluidos. */
export function taxIncludedIn(totalCents: number, treatment: TaxTreatment): number {
  const rate = TAX_RATES[treatment];
  if (rate === 0) return 0;
  return Math.round(totalCents - totalCents / (1 + rate));
}

function ruleMatches(
  rule: PriceRule,
  ctx: { courtId: string; sport: Sport; memberType: MemberType; weekday: number; startMinute: number; endMinute: number; now: Date },
): boolean {
  if (rule.courtId !== null && rule.courtId !== ctx.courtId) return false;
  if (rule.sport !== null && rule.sport !== ctx.sport) return false;
  if (rule.memberType !== null && rule.memberType !== ctx.memberType) return false;
  if ((rule.weekdayMask & (1 << ctx.weekday)) === 0) return false;
  if (ctx.startMinute < rule.fromMinute || ctx.endMinute > rule.toMinute) return false;
  if (rule.validFrom && rule.validFrom > ctx.now) return false;
  if (rule.validTo && rule.validTo < ctx.now) return false;
  return true;
}

/**
 * Gana la regla mas especifica: primero por prioridad declarada y, a igualdad,
 * la que apunta a una pista concreta antes que la generica del deporte.
 */
export function quote(
  rules: PriceRule[],
  ctx: {
    courtId: string;
    sport: Sport;
    memberType: MemberType;
    weekday: number;
    startMinute: number;
    endMinute: number;
    now?: Date;
  },
): Quote {
  const now = ctx.now ?? new Date();
  const candidatas = rules
    .filter((r) => ruleMatches(r, { ...ctx, now }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const espA = (a.courtId ? 2 : 0) + (a.memberType ? 1 : 0);
      const espB = (b.courtId ? 2 : 0) + (b.memberType ? 1 : 0);
      return espB - espA;
    });

  const regla = candidatas[0];
  if (!regla) {
    // Sin tarifa aplicable: incluido en la cuota de socio.
    return { priceCents: 0, taxCents: 0, taxTreatment: "EXEMPT_SPORT", label: null };
  }

  const horas = (ctx.endMinute - ctx.startMinute) / 60;
  const priceCents = Math.round(regla.priceCents * horas);

  return {
    priceCents,
    taxCents: taxIncludedIn(priceCents, regla.taxTreatment),
    taxTreatment: regla.taxTreatment,
    label: regla.label,
  };
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}
