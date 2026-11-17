"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { registrarSocio, type EstadoRegistro } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

/**
 * Alta en cuatro pasos.
 *
 * Los campos de todos los pasos viven en el mismo formulario y solo se oculta
 * lo que no toca: asi, al enviar, el navegador manda todo de una vez y no hace
 * falta guardar nada a medias en el servidor. Los pasos ya recorridos siguen
 * montados, de modo que volver atras no pierde lo escrito.
 */

const PASOS = [
  { titulo: "Datos personales", descripcion: "Quien eres" },
  { titulo: "Contacto y domicilio", descripcion: "Como localizarte" },
  { titulo: "Domiciliación", descripcion: "Cuenta para la cuota" },
  { titulo: "Acceso", descripcion: "Contraseña y condiciones" },
] as const;

/** Campos que deben estar rellenos para poder pasar de cada paso. */
const OBLIGATORIOS: Record<number, string[]> = {
  0: ["firstName", "lastName", "nationalId", "birthDate"],
  1: ["email", "phone", "addressLine", "postalCode", "city", "province"],
  2: ["iban", "accountHolder"],
  3: ["password", "passwordRepeat"],
};

/** Campo → paso en el que aparece, para saltar al error que devuelve el servidor. */
const PASO_DE_CAMPO: Record<string, number> = {
  firstName: 0, lastName: 0, nationalId: 0, birthDate: 0,
  email: 1, phone: 1, altPhone: 1, addressLine: 1, postalCode: 1, city: 1, province: 1,
  iban: 2, accountHolder: 2,
  password: 3, passwordRepeat: 3, acceptTerms: 3, acceptData: 3,
};

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" disabled={pending}>
      {pending ? "Enviando…" : "Enviar solicitud"}
    </Boton>
  );
}

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return <p className="mt-1 text-sm font-bold text-granate-500">{mensaje}</p>;
}

export function AsistenteAlta({ localidad, provincia }: { localidad: string; provincia: string }) {
  const [estado, accion] = useActionState<EstadoRegistro, FormData>(registrarSocio, {});
  const [paso, setPaso] = useState(0);
  const [faltan, setFaltan] = useState<string[]>([]);

  // Si el servidor rechaza un campo, se vuelve al paso donde esta.
  const pasoConError = estado.errores
    ? Math.min(...Object.keys(estado.errores).map((c) => PASO_DE_CAMPO[c] ?? 3))
    : null;
  const pasoVisible = pasoConError ?? paso;

  if (estado.ok) {
    return (
      <Tarjeta className="p-6">
        <Aviso tipo="exito">
          <p className="font-bold">Solicitud recibida.</p>
          <p className="mt-1">
            Te hemos enviado un correo para confirmar tu dirección. Cuando la junta apruebe tu alta
            recibirás un segundo aviso con tu numero de socio y podrás empezar a reservar.
          </p>
        </Aviso>
      </Tarjeta>
    );
  }

  function siguiente(e: React.MouseEvent<HTMLButtonElement>) {
    const formulario = e.currentTarget.form;
    if (!formulario) return;

    const vacios = OBLIGATORIOS[pasoVisible].filter((nombre) => {
      const campo = formulario.elements.namedItem(nombre) as HTMLInputElement | null;
      return !campo?.value.trim();
    });

    setFaltan(vacios);
    if (vacios.length === 0) setPaso(pasoVisible + 1);
  }

  return (
    <Tarjeta className="p-6">
      <ol className="mb-6 flex flex-wrap gap-x-2 gap-y-1 border-b border-piedra-200 pb-4 text-xs">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full font-bold ${
                i < pasoVisible
                  ? "bg-marca-600 text-white"
                  : i === pasoVisible
                    ? "bg-marca-800 text-white"
                    : "bg-piedra-200 text-piedra-500"
              }`}
            >
              {i < pasoVisible ? "✓" : i + 1}
            </span>
            <span className={i === pasoVisible ? "font-bold text-marca-900" : "text-piedra-400"}>
              {p.titulo}
            </span>
            {i < PASOS.length - 1 ? <span className="text-piedra-300">›</span> : null}
          </li>
        ))}
      </ol>

      <form action={accion} className="space-y-5" noValidate>
        {estado.mensaje ? <Aviso tipo="error">{estado.mensaje}</Aviso> : null}
        {faltan.length > 0 ? (
          <Aviso tipo="error">Rellena los campos obligatorios de este paso para continuar.</Aviso>
        ) : null}

        {/* --- Paso 1: datos personales --- */}
        <div hidden={pasoVisible !== 0} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Campo etiqueta="Nombre" obligatorio>
                <input name="firstName" autoComplete="given-name" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.firstName} />
            </div>
            <div>
              <Campo etiqueta="Apellidos" obligatorio>
                <input name="lastName" autoComplete="family-name" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.lastName} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Campo etiqueta="DNI o NIE" obligatorio ayuda="Con la letra. Ejemplo: 12345678Z">
                <input name="nationalId" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.nationalId} />
            </div>
            <div>
              <Campo etiqueta="Fecha de nacimiento" obligatorio>
                <input type="date" name="birthDate" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.birthDate} />
            </div>
          </div>
        </div>

        {/* --- Paso 2: contacto y domicilio --- */}
        <div hidden={pasoVisible !== 1} className="space-y-4">
          <div>
            <Campo etiqueta="Correo electrónico" obligatorio ayuda="Será tu usuario para entrar.">
              <input name="email" type="email" autoComplete="email" inputMode="email" className={INPUT_CLASS} />
            </Campo>
            <Error mensaje={estado.errores?.email} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Campo etiqueta="Teléfono" obligatorio>
                <input name="phone" type="tel" autoComplete="tel" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.phone} />
            </div>
            <div>
              <Campo etiqueta="Otro teléfono">
                <input name="altPhone" type="tel" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.altPhone} />
            </div>
          </div>
          <div>
            <Campo etiqueta="Dirección" obligatorio>
              <input name="addressLine" autoComplete="street-address" className={INPUT_CLASS} />
            </Campo>
            <Error mensaje={estado.errores?.addressLine} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Campo etiqueta="Código postal" obligatorio>
                <input name="postalCode" inputMode="numeric" maxLength={5} autoComplete="postal-code" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.postalCode} />
            </div>
            <div>
              <Campo etiqueta="Localidad" obligatorio>
                <input name="city" autoComplete="address-level2" defaultValue={localidad} className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.city} />
            </div>
            <div>
              <Campo etiqueta="Provincia" obligatorio>
                <input name="province" autoComplete="address-level1" defaultValue={provincia} className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.province} />
            </div>
          </div>
        </div>

        {/* --- Paso 3: domiciliacion --- */}
        <div hidden={pasoVisible !== 2} className="space-y-4">
          <Aviso tipo="info">
            La cuota de socio se pasa por domiciliación bancaria. Tu numero de cuenta se guarda
            <strong> cifrado</strong>: ni el personal del club ve más que los cuatro últimos dígitos.
          </Aviso>
          <div>
            <Campo etiqueta="IBAN" obligatorio ayuda="Ejemplo: ES91 2100 0418 4502 0005 1332">
              <input name="iban" autoComplete="off" spellCheck={false} className={INPUT_CLASS} />
            </Campo>
            <Error mensaje={estado.errores?.iban} />
          </div>
          <div>
            <Campo etiqueta="Titular de la cuenta" obligatorio ayuda="Tal como figura en el banco.">
              <input name="accountHolder" className={INPUT_CLASS} />
            </Campo>
            <Error mensaje={estado.errores?.accountHolder} />
          </div>
        </div>

        {/* --- Paso 4: acceso y condiciones --- */}
        <div hidden={pasoVisible !== 3} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Campo etiqueta="Contraseña" obligatorio ayuda="Al menos 10 caracteres. Una frase corta va perfecta.">
                <input name="password" type="password" autoComplete="new-password" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.password} />
            </div>
            <div>
              <Campo etiqueta="Repite la contraseña" obligatorio>
                <input name="passwordRepeat" type="password" autoComplete="new-password" className={INPUT_CLASS} />
              </Campo>
              <Error mensaje={estado.errores?.passwordRepeat} />
            </div>
          </div>

          <div className="space-y-3 border-t border-piedra-200 pt-4">
            <div>
              <label className="flex items-start gap-3 text-sm text-marca-800">
                <input type="checkbox" name="acceptTerms" className="mt-1 size-4 accent-[var(--color-marca-700)]" />
                <span>Acepto las normas de uso de las instalaciones del club.</span>
              </label>
              <Error mensaje={estado.errores?.acceptTerms} />
            </div>
            <div>
              <label className="flex items-start gap-3 text-sm text-marca-800">
                <input type="checkbox" name="acceptData" className="mt-1 size-4 accent-[var(--color-marca-700)]" />
                <span>
                  Acepto que el club trate mis datos para gestionar mi condicion de socio, las
                  reservas y el cobro de la cuota.
                </span>
              </label>
              <Error mensaje={estado.errores?.acceptData} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-piedra-200 pt-5">
          <Boton
            type="button"
            variante="secundario"
            onClick={() => {
              setFaltan([]);
              setPaso(Math.max(0, pasoVisible - 1));
            }}
            disabled={pasoVisible === 0}
          >
            Atrás
          </Boton>

          {pasoVisible < PASOS.length - 1 ? (
            <Boton type="button" onClick={siguiente}>
              Siguiente: {PASOS[pasoVisible + 1].titulo}
            </Boton>
          ) : (
            <BotonEnviar />
          )}
        </div>
      </form>
    </Tarjeta>
  );
}
