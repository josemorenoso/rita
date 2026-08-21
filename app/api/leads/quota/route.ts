import { getQuota, hasServerKey, HunterError } from "@/lib/leads/hunter";

export const runtime = "nodejs";

/**
 * Cuántas búsquedas le quedan a la clave del visitante. Va por POST y no por
 * GET a propósito: así la clave viaja en el cuerpo y no acaba escrita en los
 * registros de acceso del servidor ni en el historial del navegador.
 */
export async function POST(request: Request) {
  let body: { hunterKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const hasKey = Boolean(body.hunterKey?.trim()) || hasServerKey();
  if (!hasKey) {
    return Response.json({ configured: false });
  }

  try {
    const quota = await getQuota(body.hunterKey);
    return Response.json({ configured: true, ...quota });
  } catch (err) {
    if (err instanceof HunterError) {
      return Response.json({ configured: true, error: err.message, badKey: err.badKey }, { status: 200 });
    }
    return Response.json({ configured: true, error: "No se pudo leer la cuota." }, { status: 200 });
  }
}
