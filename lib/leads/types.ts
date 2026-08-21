/** Estado del enriquecimiento con Hunter.io para un negocio concreto. */
export type EnrichState = "pending" | "done" | "empty" | "skipped" | "error";

export interface Lead {
  /** Estable entre ejecuciones: viene del tipo y el id de OpenStreetMap. */
  id: string;
  name: string;
  /** Etiqueta legible del tipo de negocio ("Clínica dental"). */
  category: string;
  phone: string | null;
  website: string | null;
  /** Dominio limpio (sin www ni protocolo). Es lo que consulta Hunter.io. */
  domain: string | null;
  address: string | null;
  lat: number;
  lon: number;
  /** Email publicado en el propio mapa, si lo hay. Sale gratis, sin gastar cuota. */
  mapEmail: string | null;

  // ── Enriquecimiento (Hunter.io) ──
  email: string | null;
  contactName: string | null;
  contactPosition: string | null;
  confidence: number | null;
  enrich: EnrichState;
}

export interface LeadRun {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  /** Lo que el usuario escribió o el chip que pulsó. */
  query: string;
  /** Etiqueta de la categoría con la que se resolvió la búsqueda. */
  categoryLabel: string;
  city: string;
  /** Nombre completo del sitio tal y como lo devolvió el geocodificador. */
  place: string;
  lat: number;
  lon: number;
  radiusKm: number;
  leads: Lead[];
}

/** Resumen para el listado de /leads, sin arrastrar todos los contactos. */
export interface LeadRunSummary {
  id: string;
  createdAt: string;
  query: string;
  categoryLabel: string;
  city: string;
  total: number;
  withPhone: number;
  withEmail: number;
}

export function summarize(run: LeadRun): LeadRunSummary {
  return {
    id: run.id,
    createdAt: run.createdAt,
    query: run.query,
    categoryLabel: run.categoryLabel,
    city: run.city,
    total: run.leads.length,
    withPhone: run.leads.filter((l) => l.phone).length,
    withEmail: run.leads.filter((l) => l.email ?? l.mapEmail).length,
  };
}
