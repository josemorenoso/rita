import { abrirSesion, asegurarAgente, configurado, llaveDelServidor, variablesDinamicas } from "@/lib/sofi/agente";
import { porId } from "@/lib/sofi/cotizaciones";

export const runtime = "nodejs";

/** ¿Hay llave en el servidor? La pantalla lo pregunta al abrir. Si no la hay,
    el visitante puede traer la suya en cada petición. */
export async function GET() {
  return Response.json({ configurado: configurado() });
}

/** Abre una conversación en vivo con Sofi para una cotización concreta.
    Devuelve el token efímero y lo que Sofi debe saber del cliente. La llave
    (la del servidor o la que manda el visitante) nunca vuelve al navegador. */
export async function POST(request: Request) {
  let cuerpo: { cotizacionId?: string; llave?: string } = {};
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    cuerpo = {};
  }

  const c = cuerpo.cotizacionId ? porId(cuerpo.cotizacionId) : undefined;
  if (!c) return Response.json({ error: "Cotización no encontrada" }, { status: 404 });

  const llave = llaveDelServidor() || cuerpo.llave?.trim() || "";
  if (!llave) return Response.json({ error: "Falta la llave de ElevenLabs" }, { status: 503 });

  try {
    const agentId = await asegurarAgente(llave);
    const sesion = await abrirSesion(llave, agentId);
    return Response.json({ ...sesion, variables: variablesDinamicas(c), cotizacionId: c.id });
  } catch (err) {
    console.error("[sofi] sesión:", err);
    return Response.json({ error: "ElevenLabs no abrió la sesión", detalle: String(err) }, { status: 502 });
  }
}
