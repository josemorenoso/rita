import { abrirSesion, asegurarAgente, configurado, variablesDinamicas } from "@/lib/sofi/agente";
import { porId } from "@/lib/sofi/cotizaciones";

export const runtime = "nodejs";

/** ¿Hay llave? La pantalla lo pregunta al abrir para saber si «Llamar» puede
    ir en vivo o tiene que tirar de la llamada grabada. */
export async function GET() {
  return Response.json({ configurado: configurado() });
}

/** Abre una conversación en vivo con Sofi para una cotización concreta.
    Devuelve el token efímero y lo que Sofi debe saber del cliente. La llave
    nunca sale del servidor. */
export async function POST(request: Request) {
  let cuerpo: { cotizacionId?: string } = {};
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    cuerpo = {};
  }

  const c = cuerpo.cotizacionId ? porId(cuerpo.cotizacionId) : undefined;
  if (!c) return Response.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (!configurado()) return Response.json({ error: "Falta ELEVENLABS_API_KEY" }, { status: 503 });

  try {
    const agentId = await asegurarAgente();
    const sesion = await abrirSesion(agentId);
    return Response.json({ ...sesion, variables: variablesDinamicas(c), cotizacionId: c.id });
  } catch (err) {
    console.error("[sofi] sesión:", err);
    return Response.json({ error: "ElevenLabs no abrió la sesión", detalle: String(err) }, { status: 502 });
  }
}
