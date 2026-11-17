import { redirect } from "next/navigation";
import { RUTA_MONEDERO } from "@/lib/rutas";

/** El monedero vive en el perfil; esta ruta se conserva para enlaces antiguos. */
export default function MonederoPage() {
  redirect(RUTA_MONEDERO);
}
