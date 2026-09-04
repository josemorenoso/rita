/* ─────────────────────────────  SOFI  ─────────────────────────────
   Tipos compartidos por la pantalla, el reproductor del guion, la llamada
   en vivo y la ruta de API. Todo lo que aparece en la ficha o en la agenda
   tiene aquí su catálogo, para que las tres fuentes (guion grabado, agente
   en vivo, interfaz) hablen exactamente el mismo idioma.
   ------------------------------------------------------------------ */

export type Canal = "WhatsApp" | "Web" | "Instagram" | "Llamada";

export interface Linea {
  producto: string;
  cantidad: number;
  /** Cómo se cuenta: caneca, bulto, paca… */
  unidad: string;
  /** Precio unitario en pesos. */
  precio: number;
  /** Cómo lo dice Sofi en voz alta, en plural: «canecas de aceite vegetal de veinte litros». */
  dicho: string;
}

export type Resultado =
  | "pedido_cerrado"
  | "cotizacion_reenviada"
  | "seguimiento_agendado"
  | "volver_a_llamar"
  | "no_interesado";

export interface Cierre {
  resultado: Resultado;
  resumen: string;
  /** Pesos que entran por esta llamada (solo cuando hay pedido). */
  monto?: number;
}

export interface Cotizacion {
  id: string;
  negocio: string;
  tipo: string;
  barrio: string;
  contacto: string;
  /** Cómo lo llama Sofi por teléfono: «don Andrés», «Marcela». */
  trato: string;
  cargo: string;
  telefono: string;
  canal: Canal;
  /** Días desde que pidió la cotización. */
  hace: number;
  lineas: Linea[];
  /** Descuento autorizado sobre el total, 0.10 = diez por ciento. */
  descuento: number;
  /** Lo que Sofi tiene permiso para ofrecer, en sus palabras. */
  incentivo: string;
  /** Solo las que ya se llamaron hoy antes de abrir la pantalla. */
  cerrada?: Cierre;
}

/* ── La ficha: lo que Sofi va anotando mientras habla ── */

export type Campo = "motivo" | "proveedor" | "volumen" | "entrega" | "decisor" | "canal" | "oportunidad";

export const CAMPOS: { id: Campo; titulo: string }[] = [
  { id: "motivo", titulo: "Por qué no compró" },
  { id: "proveedor", titulo: "A quién le compra hoy" },
  { id: "volumen", titulo: "Cuánto pide al mes" },
  { id: "entrega", titulo: "Cuándo y dónde recibe" },
  { id: "decisor", titulo: "Quién decide" },
  { id: "canal", titulo: "Por dónde prefiere que le escriban" },
  { id: "oportunidad", titulo: "Oportunidad detectada" },
];

export interface Dato {
  campo: Campo;
  valor: string;
}

/* ── La agenda: lo que queda programado al colgar ── */

export type TipoAccion = "whatsapp" | "descuento" | "despacho" | "reserva" | "llamada" | "vendedor" | "lista";

export const ACCIONES: Record<TipoAccion, string> = {
  whatsapp: "WhatsApp",
  descuento: "Incentivo",
  despacho: "Despacho",
  reserva: "Reserva",
  llamada: "Llamada",
  vendedor: "Vendedor",
  lista: "Lista de precios",
};

export interface Accion {
  tipo: TipoAccion;
  cuando: string;
  detalle: string;
}

export const RESULTADOS: Record<Resultado, { etiqueta: string; tono: "bien" | "medio" | "mal" }> = {
  pedido_cerrado: { etiqueta: "Pedido cerrado", tono: "bien" },
  cotizacion_reenviada: { etiqueta: "Cotización reenviada", tono: "medio" },
  seguimiento_agendado: { etiqueta: "Seguimiento agendado", tono: "medio" },
  volver_a_llamar: { etiqueta: "Volver a llamar", tono: "medio" },
  no_interesado: { etiqueta: "No le interesa", tono: "mal" },
};

/* ── Lo que pasa durante la llamada, venga del guion o del agente en vivo ── */

export type Evento =
  | { tipo: "dato"; dato: Dato }
  | { tipo: "accion"; accion: Accion }
  | { tipo: "cierre"; cierre: Cierre };

export type Quien = "sofi" | "cliente";

export interface Turno {
  id: string;
  quien: Quien;
  /** Lo que se ve en pantalla. */
  texto: string;
  /** Lo que se manda a la voz, si difiere (etiquetas de emoción, etc.). */
  voz?: string;
  /** Se disparan cuando el turno termina de sonar. */
  eventos?: Evento[];
}

export interface Guion {
  cotizacionId: string;
  turnos: Turno[];
}

/** Nombres de las herramientas que el agente en vivo puede llamar. El
    servidor las declara y el navegador las atiende: si cambian aquí, cambian
    en los dos lados. */
export const HERRAMIENTAS = {
  dato: "anotar_dato",
  accion: "agendar_accion",
  cierre: "cerrar_llamada",
} as const;

/* ── Cálculo ── */

export const totalCotizacion = (c: Cotizacion) => c.lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);

export const totalConDescuento = (c: Cotizacion) => Math.round(totalCotizacion(c) * (1 - c.descuento));

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/** «$3,4 M» para la cabecera, donde no cabe la cifra entera. */
export function pesosCortos(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000).toLocaleString("es-CO")} mil`;
  return pesos(n);
}

export function haceTexto(dias: number) {
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 11) return "hace una semana";
  if (dias < 18) return "hace dos semanas";
  if (dias < 25) return "hace tres semanas";
  if (dias < 39) return "hace un mes";
  if (dias < 53) return "hace mes y medio";
  return "hace casi dos meses";
}
