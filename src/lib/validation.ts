import { z } from "zod";
import { DAY_PATTERN } from "./time";
import { passwordSchema } from "./auth/password";
import { isValidIban } from "./iban";

/** Un unico juego de esquemas valida el formulario y la accion de servidor. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Introduce un correo valido")
  .max(254)
  .email("Introduce un correo valido");

const nombreSchema = z
  .string()
  .trim()
  .min(2, "Debe tener al menos 2 caracteres")
  .max(80)
  .regex(/^[\p{L}\p{M}'\-. ]+$/u, "Solo letras, espacios, apostrofes y guiones");

/**
 * Documento de identidad espanol. Se comprueba la letra: el DNI la lleva
 * calculada a partir del numero, asi que un error de tecleo se detecta aqui y
 * no en la asamblea.
 */
const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

export function esDocumentoValido(valor: string): boolean {
  const doc = valor.trim().toUpperCase().replace(/[\s-]/g, "");

  const dni = /^(\d{8})([A-Z])$/.exec(doc);
  if (dni) return LETRAS_DNI[Number(dni[1]) % 23] === dni[2];

  // NIE: la letra inicial se sustituye por 0, 1 o 2 y se calcula igual.
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(doc);
  if (nie) {
    const numero = Number(String("XYZ".indexOf(nie[1])) + nie[2]);
    return LETRAS_DNI[numero % 23] === nie[3];
  }
  return false;
}

const documentoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(esDocumentoValido, "Revisa el DNI o NIE: la letra no corresponde al número");

const ibanFieldSchema = z
  .string()
  .trim()
  .refine(isValidIban, "Ese IBAN no es valido. Revisa que esten todos los dígitos.");

export const registroSchema = z
  .object({
    // Paso 1: quien eres
    firstName: nombreSchema,
    lastName: nombreSchema,
    nationalId: documentoSchema,
    birthDate: z.string().regex(DAY_PATTERN, "Fecha no valida"),

    // Paso 2: como localizarte
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .regex(/^[+0-9 ()-]{6,20}$/, "Teléfono no valido"),
    altPhone: z
      .string()
      .trim()
      .regex(/^[+0-9 ()-]{6,20}$/, "Teléfono no valido")
      .optional()
      .or(z.literal("")),
    addressLine: z.string().trim().min(4, "Escribe la dirección").max(160),
    postalCode: z.string().trim().regex(/^\d{5}$/, "Código postal de 5 cifras"),
    city: z.string().trim().min(2, "Escribe la localidad").max(80),
    province: z.string().trim().min(2, "Escribe la provincia").max(80),

    // Paso 3: domiciliacion de la cuota
    iban: ibanFieldSchema,
    accountHolder: z.string().trim().min(4, "Nombre del titular de la cuenta").max(120),

    // Paso 4: acceso
    password: passwordSchema,
    passwordRepeat: z.string(),
    acceptTerms: z.literal("on", { message: "Debes aceptar las condiciones" }),
    acceptData: z.literal("on", { message: "Debes aceptar el tratamiento de datos" }),
  })
  .refine((v) => v.password === v.passwordRepeat, {
    message: "Las dos contraseñas no coinciden",
    path: ["passwordRepeat"],
  })
  .refine(
    (v) => {
      // Mayor de edad, o la ficha la crea secretaria como socio infantil.
      const nacimiento = new Date(`${v.birthDate}T00:00:00Z`);
      const edad = (Date.now() - nacimiento.getTime()) / (365.25 * 24 * 3600 * 1000);
      return edad >= 18 && edad < 120;
    },
    {
      message: "El alta por internet es para mayores de edad. Para socios infantiles, habla con secretaría.",
      path: ["birthDate"],
    },
  );

export const datosBancariosSchema = z.object({
  iban: ibanFieldSchema,
  accountHolder: z.string().trim().min(4, "Nombre del titular de la cuenta").max(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  // En el acceso no se aplica la politica de longitud: quien ya tiene una
  // contrasena antigua debe poder entrar para cambiarla.
  password: z.string().min(1, "Escribe tu contraseña").max(128),
});

export const cambioPasswordSchema = z
  .object({
    passwordActual: z.string().max(128).optional().or(z.literal("")),
    password: passwordSchema,
    passwordRepeat: z.string(),
  })
  .refine((v) => v.password === v.passwordRepeat, {
    message: "Las dos contraseñas no coinciden",
    path: ["passwordRepeat"],
  });

export const accesoSchema = z.object({ email: emailSchema });

export const reservaSchema = z.object({
  courtId: z.string().uuid("Pista no valida"),
  day: z.string().regex(DAY_PATTERN, "Fecha no valida"),
  startMinute: z.coerce.number().int().min(0).max(1439),
  durationMinutes: z.coerce.number().int().min(30).max(240),
  playerNames: z.string().max(300).optional(),
  guestCount: z.coerce.number().int().min(0).max(8).optional(),
  notes: z.string().max(500).optional(),
});

export const bloqueoSchema = z
  .object({
    courtId: z.string().uuid().optional().or(z.literal("")),
    sport: z.enum(["PADEL", "TENIS", "CROQUET"]).optional().or(z.literal("")),
    day: z.string().regex(DAY_PATTERN, "Fecha no valida"),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
    type: z.enum(["MAINTENANCE", "TOURNAMENT", "CLASS", "CLOSURE", "EVENT"]),
    title: z.string().trim().min(3, "Pon un título descriptivo").max(120),
    description: z.string().max(500).optional(),
    isPublic: z.union([z.literal("on"), z.literal("")]).optional(),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endMinute"],
  });

export const pistaSchema = z.object({
  sport: z.enum(["PADEL", "TENIS", "CROQUET"]),
  code: z.string().trim().min(2).max(16).regex(/^[A-Z0-9-]+$/, "Solo mayusculas, numeros y guiones"),
  name: z.string().trim().min(2).max(60),
  surface: z.string().trim().max(40).optional(),
  slotMinutes: z.coerce.number().int().refine((v) => [30, 60].includes(v), "Debe ser 30 o 60"),
  allowedDurations: z.string().min(2),
  maxPlayers: z.coerce.number().int().min(1).max(12),
  opensAt: z.coerce.number().int().min(0).max(1439),
  closesAt: z.coerce.number().int().min(1).max(1440),
  isIndoor: z.union([z.literal("on"), z.literal("")]).optional(),
});

/** Convierte los errores de Zod en un mapa campo → primer mensaje. */
export function erroresDeCampo(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".") || "_";
    if (!(campo in out)) out[campo] = issue.message;
  }
  return out;
}
