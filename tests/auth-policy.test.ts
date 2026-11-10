import { describe, expect, it } from "vitest";
import { canAuthenticate } from "@/lib/auth/policy";
import type { UserStatus } from "@/lib/types";

describe("politica de estados de autenticacion", () => {
  it.each<[UserStatus, boolean]>([
    ["PENDING", true],
    ["ACTIVE", true],
    ["SUSPENDED", true],
    ["BAJA", false],
    ["REJECTED", false],
  ])("%s permite acceso: %s", (status, expected) => {
    expect(canAuthenticate(status)).toBe(expected);
  });
});
