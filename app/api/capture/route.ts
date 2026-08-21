export const runtime = "nodejs";

/**
 * Recibe los datos de quien va a descargar la lista y los reenvía a la hoja de
 * cálculo (una aplicación web de Google Apps Script). Ver APPS_SCRIPT.md.
 *
 * Regla importante: si la hoja falla, esta ruta responde OK igualmente. Nunca
 * se le niega la descarga al visitante por un problema de nuestra fontanería
 * — se registra el fallo en el log y se sigue adelante.
 */

const FORWARD_TIMEOUT_MS = 8_000;

interface Body {
  name?: string;
  phone?: string;
  email?: string;
  /** Contexto de la búsqueda, útil para saber qué buscaba cada contacto. */
  query?: string;
  city?: string;
  total?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Petición mal formada." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const email = body.email?.trim() ?? "";

  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400 });
  if (!phone) return Response.json({ error: "Falta el teléfono." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Ese correo no parece válido." }, { status: 400 });

  const target = process.env.SHEETS_WEBHOOK_URL?.trim();

  if (!target) {
    // Sin hoja configurada la herramienta sigue siendo usable; solo no se
    // recogen los contactos. Se avisa en el log para que no pase inadvertido.
    console.warn("[capture] SHEETS_WEBHOOK_URL sin configurar: contacto no guardado —", email);
    return Response.json({ ok: true, stored: false });
  }

  const row = {
    fecha: new Date().toISOString(),
    nombre: name,
    telefono: phone,
    email,
    busqueda: body.query ?? "",
    ciudad: body.city ?? "",
    resultados: body.total ?? 0,
  };

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      // Apps Script responde con una redirección; hay que seguirla.
      redirect: "follow",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[capture] la hoja respondió", res.status, "—", email);
      return Response.json({ ok: true, stored: false });
    }

    return Response.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[capture] no se pudo escribir en la hoja —", email, err);
    return Response.json({ ok: true, stored: false });
  }
}
