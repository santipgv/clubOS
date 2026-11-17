import { describe, expect, it } from "vitest";
import { resolverUrlPublica } from "@/lib/env";

const APP_URL = "https://clubos.vercel.app";

describe("direccion publica de cada despliegue", () => {
  it("en produccion manda APP_URL", () => {
    expect(resolverUrlPublica({ appUrl: APP_URL, vercelEnv: "production" })).toBe(APP_URL);
  });

  it("en local, sin Vercel, manda APP_URL", () => {
    expect(resolverUrlPublica({ appUrl: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  /**
   * Lo que motiva todo esto: APP_URL es una sola variable compartida, asi que
   * en una vista previa apunta a produccion y el enlace de acceso te sacaba de
   * la vista previa que querias probar.
   */
  it("en una vista previa usa la direccion de la rama, no la de produccion", () => {
    const url = resolverUrlPublica({
      appUrl: APP_URL,
      vercelEnv: "preview",
      branchUrl: "clubos-git-mi-rama-mi-equipo.vercel.app",
      deploymentUrl: "clubos-abc123.vercel.app",
    });
    expect(url).toBe("https://clubos-git-mi-rama-mi-equipo.vercel.app");
    expect(url).not.toContain("clubos.vercel.app/");
  });

  it("prefiere la direccion de la rama a la del despliegue concreto", () => {
    // VERCEL_URL cambia en cada despliegue: un enlace enviado ayer apuntaria a
    // un despliegue que ya no es el ultimo de la rama.
    const url = resolverUrlPublica({
      appUrl: APP_URL,
      vercelEnv: "preview",
      branchUrl: "rama.vercel.app",
      deploymentUrl: "despliegue-concreto.vercel.app",
    });
    expect(url).toBe("https://rama.vercel.app");
  });

  it("si no hay direccion de rama, recurre a la del despliegue", () => {
    expect(
      resolverUrlPublica({ appUrl: APP_URL, vercelEnv: "preview", deploymentUrl: "d.vercel.app" }),
    ).toBe("https://d.vercel.app");
  });

  it("sin ninguna direccion de Vercel se queda con APP_URL", () => {
    expect(resolverUrlPublica({ appUrl: APP_URL, vercelEnv: "preview" })).toBe(APP_URL);
  });
});
