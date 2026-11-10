import type { UserStatus } from "@/lib/types";

/**
 * Estados que conservan acceso a la cuenta.
 *
 * PENDING necesita entrar para consultar su alta y SUSPENDED conserva acceso
 * limitado. BAJA y REJECTED son estados terminales para autenticacion.
 */
export function canAuthenticate(status: UserStatus): boolean {
  return status !== "BAJA" && status !== "REJECTED";
}
