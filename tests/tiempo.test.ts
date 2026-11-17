import { describe, expect, it } from "vitest";
import {
  addDaysToDay,
  clubDayMinutesToUtc,
  clubWeekday,
  daysBetween,
  isValidDay,
  minutesToHHMM,
} from "@/lib/time";

describe("horario local del club", () => {
  it("interpreta la hora en Europe/Madrid, no en UTC", () => {
    // 28 de marzo de 2026: todavia horario de invierno (UTC+1).
    expect(clubDayMinutesToUtc("2026-03-28", 10 * 60).toISOString()).toBe("2026-03-28T09:00:00.000Z");
  });

  it("sigue el cambio de hora: las 10:00 son las 10:00 tambien en verano", () => {
    // 29 de marzo de 2026: entra el horario de verano (UTC+2).
    expect(clubDayMinutesToUtc("2026-03-29", 10 * 60).toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("cuenta 24 horas de calendario aunque el dia dure 23", () => {
    // El dia del cambio de hora dura 23 horas reales, pero sigue siendo un dia.
    expect(daysBetween("2026-03-28", "2026-03-29")).toBe(1);
    expect(addDaysToDay("2026-03-28", 1)).toBe("2026-03-29");
  });

  it("calcula el dia de la semana local", () => {
    expect(clubWeekday("2026-08-23")).toBe(0); // domingo
    expect(clubWeekday("2026-08-24")).toBe(1); // lunes
  });

  it("rechaza fechas imposibles", () => {
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-13-01")).toBe(false);
    expect(isValidDay("2026-08-19")).toBe(true);
    expect(isValidDay("19/08/2026")).toBe(false);
  });

  it("formatea minutos como HH:MM", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(8 * 60 + 30)).toBe("08:30");
    expect(minutesToHHMM(23 * 60)).toBe("23:00");
  });
});
