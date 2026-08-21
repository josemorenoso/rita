import { CATEGORIES, normalize, resolveCategory, type Category } from "./categories";
import type { Lead } from "./types";

/**
 * Descubrimiento de negocios sobre OpenStreetMap. Es la pieza que sustituye al
 * "entrar a Google Maps a mano": sin API key, sin registro y sin cuota.
 *
 * Nominatim resuelve la ciudad a coordenadas; Overpass devuelve los negocios de
 * esa categoría en un radio alrededor. Ambos servicios son gratuitos y piden un
 * User-Agent identificable, así que lo enviamos en todas las llamadas.
 */

const UA = "AIOS-Simulation/1.0 (prospeccion de clientes; contacto: molun.store1@gmail.com)";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * Espejos de Overpass, todos verificados devolviendo los mismos 600 elementos
 * sobre una consulta real. Ojo al añadir más: overpass.osm.ch responde HTTP 200
 * con cero resultados fuera de Suiza, así que un espejo regional rompe la
 * búsqueda en silencio en vez de dar error.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Corta la petición en seco: sin esto una instancia saturada cuelga 45 s. */
const OVERPASS_TIMEOUT_MS = 20_000;
const NOMINATIM_TIMEOUT_MS = 15_000;

/**
 * La mayoría de búsquedas terminan en 1-3 s y nunca llegan a este margen, así
 * que no se carga a los servidores gratuitos de más. Cuando una sí lo cruza,
 * lanzamos el siguiente espejo en paralelo sin esperar a que el primero falle:
 * gana el que conteste antes y el resto se cancela.
 */
const HEDGE_MS = 4_000;

/**
 * Reparte las búsquedas consecutivas entre espejos distintos. Sin esto, varias
 * búsquedas seguidas machacan el mismo servidor y acaban en 429.
 */
let mirrorCursor = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dominios donde Hunter.io nunca va a encontrar correos corporativos. Se
 * descartan antes de enriquecer para no gastar cuota del plan gratuito.
 */
const NON_CORPORATE = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "google.com",
  "business.site",
  "blogspot.com",
  "wordpress.com",
  "sites.google.com",
];

export class LeadSourceError extends Error {}

export interface GeoPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface SearchResult {
  category: Category | null;
  categoryLabel: string;
  place: GeoPlace;
  leads: Lead[];
  /** Cuántos negocios devolvió el mapa antes de filtrar los que no sirven. */
  rawCount: number;
}

/** Resuelve "Medellín" o "Bogotá, Colombia" a coordenadas. */
export async function geocode(city: string): Promise<GeoPlace> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es" },
      cache: "no-store",
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
  } catch {
    throw new LeadSourceError("El buscador de ciudades no respondió a tiempo. Vuelve a lanzarla.");
  }

  if (!res.ok) {
    throw new LeadSourceError(`El geocodificador respondió ${res.status}. Prueba de nuevo en unos segundos.`);
  }

  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  if (!rows.length) {
    throw new LeadSourceError(`No encuentro "${city}" en el mapa. Prueba con la ciudad y el país: "Medellín, Colombia".`);
  }

  return { name: rows[0].display_name, lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

/** Escapa lo que el usuario escribió para que no rompa la expresión regular de Overpass. */
function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

function buildQuery(category: Category | null, query: string, lat: number, lon: number, radiusM: number): string {
  const around = `(around:${radiusM},${lat},${lon})`;
  let body: string;

  if (category) {
    body = category.filters.map((f) => `  nwr${f}${around};`).join("\n");
  } else {
    // Sin categoría conocida: buscamos por nombre entre los elementos que son negocios.
    const term = escapeRegex(normalize(query));
    const keys = ["shop", "amenity", "office", "craft", "healthcare", "tourism", "leisure"];
    body = keys.map((k) => `  nwr["name"~"${term}",i]["${k}"]${around};`).join("\n");
  }

  // Se piden bastantes más de los que quiere el usuario: el orden por utilidad
  // comercial se aplica después, y con un tope corto se perderían los mejores.
  return `[out:json][timeout:40];\n(\n${body}\n);\nout center tags 600;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Una consulta contra un espejo concreto, retrasada para escalonar el arranque. */
async function askMirror(
  endpoint: string,
  query: string,
  delayMs: number,
  cancel: AbortSignal,
): Promise<OverpassElement[]> {
  const host = new URL(endpoint).hostname;

  if (delayMs > 0) await sleep(delayMs);
  if (cancel.aborted) throw new Error(`${host} no hizo falta`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
    signal: AbortSignal.any([cancel, AbortSignal.timeout(OVERPASS_TIMEOUT_MS)]),
  });

  if (!res.ok) throw new Error(`${host} respondió ${res.status}`);

  const json = (await res.json()) as { elements?: OverpassElement[] };
  return json.elements ?? [];
}

/**
 * Lanza los espejos escalonados y devuelve el primero que conteste. Antes se
 * probaban en serie y una instancia saturada costaba 27 s de espera; así el
 * peor caso lo marca el espejo más rápido, no el más lento.
 */
async function runOverpass(query: string): Promise<OverpassElement[]> {
  const cancel = new AbortController();
  const start = mirrorCursor++;

  const attempts = OVERPASS_ENDPOINTS.map((_, i) =>
    askMirror(OVERPASS_ENDPOINTS[(start + i) % OVERPASS_ENDPOINTS.length], query, i * HEDGE_MS, cancel.signal),
  );

  try {
    const elements = await Promise.any(attempts);
    return elements;
  } catch (err) {
    const problems =
      err instanceof AggregateError
        ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(", ")
        : String(err);
    throw new LeadSourceError(
      `Los servidores del mapa están saturados ahora mismo (${problems}). Espera medio minuto y vuelve a lanzarla.`,
    );
  } finally {
    // Corta los espejos que sigan en vuelo: ya tenemos la respuesta.
    cancel.abort();
  }
}

function firstTag(tags: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
}

/** Extrae el dominio limpio de una web, o null si no sirve para buscar correos. */
export function toDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes(".")) return null;
    if (NON_CORPORATE.some((bad) => host === bad || host.endsWith(`.${bad}`))) return null;
    return host;
  } catch {
    return null;
  }
}

function buildAddress(tags: Record<string, string>): string | null {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const city = tags["addr:city"] ?? tags["addr:suburb"];
  const parts = [street && number ? `${street} ${number}` : street, city, tags["addr:postcode"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function toLead(el: OverpassElement, categoryLabel: string): Lead | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const website = firstTag(tags, ["website", "contact:website", "url"]);

  return {
    id: `${el.type}/${el.id}`,
    name,
    category: categoryLabel,
    phone: firstTag(tags, ["phone", "contact:phone", "contact:mobile", "phone:mobile"]),
    website,
    domain: toDomain(website),
    address: buildAddress(tags),
    lat,
    lon,
    mapEmail: firstTag(tags, ["email", "contact:email"]),
    email: null,
    contactName: null,
    contactPosition: null,
    confidence: null,
    enrich: "pending",
  };
}

/**
 * Ordena por utilidad comercial: primero los que se pueden llamar Y enriquecer,
 * porque son los que rinden en una sesión de prospección.
 */
function score(lead: Lead): number {
  return (lead.domain ? 2 : 0) + (lead.phone ? 1 : 0) + (lead.mapEmail ? 1 : 0);
}

export async function searchBusinesses(opts: {
  query: string;
  city: string;
  limit: number;
  radiusKm: number;
}): Promise<SearchResult> {
  const category = resolveCategory(opts.query);
  const categoryLabel = category?.label ?? opts.query.trim();
  const place = await geocode(opts.city);

  const overpassQuery = buildQuery(category, opts.query, place.lat, place.lon, Math.round(opts.radiusKm * 1000));
  const elements = await runOverpass(overpassQuery);

  const seen = new Set<string>();
  const leads: Lead[] = [];

  for (const el of elements) {
    const lead = toLead(el, categoryLabel);
    if (!lead) continue;

    // Las cadenas repiten nombre en cada sucursal: nos quedamos con una por dominio.
    const key = lead.domain ? `d:${lead.domain}` : `n:${normalize(lead.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    leads.push(lead);
  }

  leads.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "es"));

  return {
    category,
    categoryLabel,
    place,
    leads: leads.slice(0, opts.limit),
    rawCount: elements.length,
  };
}

/** Para el mensaje de ayuda cuando una búsqueda vuelve vacía. */
export const KNOWN_CATEGORY_LABELS = CATEGORIES.map((c) => c.label);
