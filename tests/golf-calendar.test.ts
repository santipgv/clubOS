import { beforeEach, expect, it, vi } from "vitest";
import { addDaysToDay, clubToday } from "@/lib/time";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT ${destination}`); }),
  hoja: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: async () => ({ id: "socio", status: "ACTIVE" }),
  isStaff: () => false,
}));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ "booking.windowDays": 10 }) }));
vi.mock("@/lib/db", () => ({
  prisma: { golfCourse: { findMany: async () => [{
    id: "campo", name: "Campo", kind: "RECORRIDO", holes: 18,
    teeIntervalMinutes: 10, maxPlayers: 4, memberPriceCents: 1500,
  }] } },
}));
vi.mock("@/lib/golf/salidas", () => ({ hojaDeSalidas: mocks.hoja }));
import GolfPage from "@/app/(app)/reservar/golf/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hoja.mockResolvedValue({ ventanaDias: 10, salidas: [] });
});

it("permite navegar al décimo día cuando el club configura diez días", async () => {
  const day = addDaysToDay(clubToday(), 10);
  await GolfPage({ searchParams: Promise.resolve({ campo: "campo", dia: day }) });
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.hoja).toHaveBeenCalledWith(expect.objectContaining({ day }));
});

it("redirige las fechas que exceden la ventana configurada", async () => {
  await expect(GolfPage({ searchParams: Promise.resolve({ dia: addDaysToDay(clubToday(), 11) }) }))
    .rejects.toThrow("REDIRECT");
  expect(mocks.hoja).not.toHaveBeenCalled();
});
