import type { Sport } from "@/lib/types";

/** Traduccion entre el segmento de URL y el enum del modelo. */
export const SLUG_A_DEPORTE: Record<string, Sport> = {
  padel: "PADEL",
  tenis: "TENIS",
  croquet: "CROQUET",
};

export const DEPORTE_A_SLUG: Record<Sport, string> = {
  PADEL: "padel",
  TENIS: "tenis",
  CROQUET: "croquet",
};

export const DEPORTE_NOMBRE: Record<Sport, string> = {
  PADEL: "Pádel",
  TENIS: "Tenis",
  CROQUET: "Croquet",
};

export const DEPORTES_SLUGS = Object.keys(SLUG_A_DEPORTE);
