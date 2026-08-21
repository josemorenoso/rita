/**
 * ─────────────────────────────────────────────────────────────────────
 *  TU MARCA. Este es el único fichero que necesitas tocar.
 *  Rellena lo que quieras; lo que dejes vacío simplemente no se muestra.
 * ─────────────────────────────────────────────────────────────────────
 */
export const BRAND = {
  /** Nombre de la herramienta. Sale en la cabecera y en la pestaña. */
  toolName: "Rita",

  /** Frase corta bajo el título. Explica qué gana quien entra. */
  tagline: "Encuentra negocios reales con teléfono, web y correo en cualquier ciudad.",

  /** Tu nombre o el de tu empresa. Vacío = no aparece el pie de página. */
  owner: "",

  /** A dónde mandas a la gente: Instagram, WhatsApp, tu web… Vacío = sin enlace. */
  link: "",

  /** El texto sobre el que se pulsa. Ej: "Hablemos por WhatsApp". */
  linkLabel: "",
};

/** Cuántos negocios se buscan por defecto y hasta dónde llega el deslizador. */
export const SEARCH_DEFAULTS = {
  limit: 40,
  maxLimit: 100,
  radiusKm: 20,
};
