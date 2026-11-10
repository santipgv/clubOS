"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cobrarPeriodo, generarCuotas, guardarTarifasCuota, type EstadoCuotas } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "secundario" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

type Tarifa = {
  tipo: string;
  label: string;
  descripcion: string;
  euros: string;
  girar: boolean;
  fiscal: string;
};

export function TarifasCuota({ tarifas }: { tarifas: Tarifa[] }) {
  const [estado, accion] = useActionState<EstadoCuotas, FormData>(guardarTarifasCuota, {});

  return (
    <Tarjeta className="p-5">
      <form action={accion}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
              <tr>
                <th className="py-2 font-bold">Categoria</th>
                <th className="py-2 font-bold">Importe por semestre</th>
                <th className="py-2 font-bold">Tratamiento fiscal</th>
                <th className="py-2 font-bold">Se le gira cuota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {tarifas.map((t) => (
                <tr key={t.tipo}>
                  <td className="py-3 pr-4">
                    <span className="block font-bold text-marca-900">{t.label}</span>
                    <span className="block text-xs text-piedra-400">{t.descripcion}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1">
                      <input
                        name={`importe_${t.tipo}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={t.euros}
                        className="w-28 rounded-md border border-piedra-300 px-2 py-1.5 text-right"
                      />
                      <span className="text-piedra-400">€</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      name={`fiscal_${t.tipo}`}
                      defaultValue={t.fiscal}
                      className="rounded-md border border-piedra-300 bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="NOT_SUBJECT">No sujeta</option>
                      <option value="EXEMPT_SPORT">Exenta (art. 20.Uno.13)</option>
                      <option value="STANDARD_21">IVA 21 %</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <input
                      type="checkbox"
                      name={`girar_${t.tipo}`}
                      defaultChecked={t.girar}
                      className="size-4 accent-[var(--color-marca-700)]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 border-t border-piedra-200 pt-4">
          <Enviar>Guardar tarifas</Enviar>
        </div>

        {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
      </form>
    </Tarjeta>
  );
}

export function GenerarCuotas({ anoActual }: { anoActual: number }) {
  const [estado, accion] = useActionState<EstadoCuotas, FormData>(generarCuotas, {});

  return (
    <>
      <form action={accion} className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Año">
          <input name="ano" type="number" min={2020} max={2100} defaultValue={anoActual} className={`${INPUT_CLASS} w-32`} />
        </Campo>
        <Campo etiqueta="Que generar">
          <select name="alcance" defaultValue="ANO" className={INPUT_CLASS}>
            <option value="ANO">Los dos semestres del ano</option>
            <option value="S1">Solo el primer semestre (5 de enero)</option>
            <option value="S2">Solo el segundo semestre (5 de julio)</option>
          </select>
        </Campo>
        <Enviar>Generar cuotas</Enviar>
      </form>

      {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
      {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
    </>
  );
}

export function CobrarPeriodo({ periodo }: { periodo: string }) {
  const [estado, accion] = useActionState<EstadoCuotas, FormData>(cobrarPeriodo, {});

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm(`¿Marcar como cobradas todas las cuotas pendientes de ${periodo}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="periodo" value={periodo} />
      <Enviar variante="secundario">Cobrar remesa</Enviar>
      {estado.error ? <p className="mt-1 text-xs text-granate-500">{estado.error}</p> : null}
    </form>
  );
}
