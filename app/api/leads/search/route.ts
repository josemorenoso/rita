import { randomUUID } from "node:crypto";
import { LeadSourceError, searchBusinesses } from "@/lib/leads/source";
import type { LeadRun } from "@/lib/leads/types";

export const runtime = "nodejs";

/**
 * Busca negocios y devuelve la lista. No guarda nada: el resultado viaja al
 * navegador del visitante y vive allí. Así la herramienta no almacena datos de
 * contacto de terceros y funciona en Vercel, que no tiene disco persistente.
 */

interface Body {
  query?: string;
  city?: string;
  limit?: number;
  radiusKm?: number;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Petición mal formada." }, { status: 400 });
  }

  const query = body.query?.trim() ?? "";
  const city = body.city?.trim() ?? "";

  if (!query) return Response.json({ error: "Dime qué tipo de negocio buscas." }, { status: 400 });
  if (!city) return Response.json({ error: "Dime en qué ciudad quieres buscar." }, { status: 400 });

  const limit = clamp(body.limit, 5, 100, 40);
  const radiusKm = clamp(body.radiusKm, 1, 50, 20);

  try {
    const result = await searchBusinesses({ query, city, limit, radiusKm });

    const run: LeadRun = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      query,
      categoryLabel: result.categoryLabel,
      city,
      place: result.place.name,
      lat: result.place.lat,
      lon: result.place.lon,
      radiusKm,
      leads: result.leads,
    };

    return Response.json({
      run,
      /** Distingue "categoría reconocida" de "búsqueda por nombre", que da menos resultados. */
      matchedCategory: result.category !== null,
      rawCount: result.rawCount,
    });
  } catch (err) {
    if (err instanceof LeadSourceError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    console.error("[leads/search]", err);
    return Response.json({ error: "No se pudo completar la búsqueda en el mapa." }, { status: 500 });
  }
}
