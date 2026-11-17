import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { getSettings, SETTING_LABELS } from "@/lib/settings";
import { FormularioAjustes } from "./formulario";
import { FormularioIdentidad } from "./formulario-identidad";
import { getIdentidad } from "@/lib/club";
import { Tarjeta, TituloPagina } from "@/components/ui";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  await requireAdmin();
  const [settings, identidad] = await Promise.all([getSettings(), getIdentidad()]);

  return (
    <>
      <TituloPagina
        titulo="Ajustes del club"
        descripcion="Identidad del club, reglas de reserva y horario general. Se aplican de inmediato a todos los socios."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <FormularioIdentidad identidad={identidad} />
          <FormularioAjustes settings={settings} etiquetas={SETTING_LABELS} />
        </div>

        <Tarjeta className="h-fit p-5 text-sm leading-relaxed text-marca-600">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-marca-700">
            Sobre los cobros
          </h2>
          <p>
            El club cobra y factura de forma directa: no hay ninguna plataforma intermediaria entre
            el socio y la asociacion. El tratamiento de IVA de cada tarifa se decide en la
            configuración de precios y queda congelado en cada reserva.
          </p>
          <p className="mt-3">
            La pasarela de pago con tarjeta llegara en una segunda fase sobre este mismo modelo, con
            la cuenta de la asociacion como destinataria de los cobros.
          </p>
        </Tarjeta>
      </div>
    </>
  );
}
