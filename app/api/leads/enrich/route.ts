import { findContact, HunterError } from "@/lib/leads/hunter";

export const runtime = "nodejs";

/**
 * Enriquece UN dominio por llamada, con la clave que trae el visitante.
 * Es deliberado que sea de uno en uno: cada petición gasta una de sus búsquedas
 * mensuales, así que quien la usa ve exactamente en qué se le va la cuota.
 *
 * La clave se usa y se descarta. No se guarda en ningún sitio.
 */
export async function POST(request: Request) {
  let body: { domain?: string; hunterKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Petición mal formada." }, { status: 400 });
  }

  const domain = body.domain?.trim();
  if (!domain) return Response.json({ error: "Falta el dominio." }, { status: 400 });

  try {
    const contact = await findContact(domain, body.hunterKey);
    return Response.json({ contact });
  } catch (err) {
    if (err instanceof HunterError) {
      return Response.json(
        { error: err.message, quotaExhausted: err.quotaExhausted, badKey: err.badKey },
        { status: err.quotaExhausted ? 429 : err.badKey ? 401 : 502 },
      );
    }
    console.error("[leads/enrich]", err);
    return Response.json({ error: "Fallo enriqueciendo el contacto." }, { status: 500 });
  }
}
