/**
 * Cliente de Hunter.io. Cada visitante trae su propia clave del plan gratuito
 * (50 búsquedas de dominio al mes), así la herramienta se puede regalar sin que
 * el dueño pague nada ni comparta cuota con desconocidos.
 *
 * La clave se recibe por petición, se usa y se descarta: en ningún momento se
 * escribe en disco ni en una base de datos. HUNTER_API_KEY del entorno solo
 * actúa como respaldo para desarrollo local.
 */

const HUNTER = "https://api.hunter.io/v2";
const TIMEOUT_MS = 15_000;

export class HunterError extends Error {
  constructor(
    message: string,
    /** true cuando el problema es la cuota agotada, no un fallo técnico. */
    readonly quotaExhausted = false,
    /** true cuando la clave es inválida: hay que pedirle otra al visitante. */
    readonly badKey = false,
  ) {
    super(message);
  }
}

export interface HunterQuota {
  used: number;
  available: number;
  remaining: number;
}

export interface HunterContact {
  email: string;
  name: string | null;
  position: string | null;
  confidence: number | null;
  organization: string | null;
}

/** La clave del visitante manda; la del entorno es solo respaldo local. */
export function resolveKey(provided?: string | null): string {
  const key = provided?.trim() || process.env.HUNTER_API_KEY?.trim();
  if (!key) {
    throw new HunterError("Hace falta una clave de Hunter.io para buscar correos.", false, true);
  }
  return key;
}

interface HunterEnvelope<T> {
  data?: T;
  errors?: { id: string; code: number; details: string }[];
}

async function call<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const search = new URLSearchParams({ ...params, api_key: key });

  let res: Response;
  try {
    res = await fetch(`${HUNTER}/${path}?${search}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HunterError("Hunter.io no respondió a tiempo.");
  }

  const json = (await res.json().catch(() => ({}))) as HunterEnvelope<T>;

  if (!res.ok || json.errors?.length) {
    const detail = json.errors?.[0]?.details ?? `Hunter.io respondió ${res.status}`;
    const badKey = res.status === 401 || /api key|invalid/i.test(detail);
    const exhausted = res.status === 429 || /limit|quota|upgrade/i.test(detail);
    throw new HunterError(detail, exhausted, badKey);
  }

  if (!json.data) throw new HunterError("Hunter.io devolvió una respuesta vacía.");
  return json.data;
}

/** Cuántas búsquedas le quedan a esa clave este mes. */
export async function getQuota(providedKey?: string | null): Promise<HunterQuota> {
  const data = await call<{ requests: { searches: { used: number; available: number } } }>(
    "account",
    {},
    resolveKey(providedKey),
  );
  const { used, available } = data.requests.searches;
  return { used, available, remaining: Math.max(0, available - used) };
}

interface DomainSearchData {
  domain: string;
  organization: string | null;
  emails: {
    value: string;
    type: string | null;
    confidence: number | null;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
  }[];
}

/**
 * Un contacto por dominio. Devuelve null si el dominio existe pero Hunter no
 * conoce ningún correo — ese caso no consume cuota.
 */
export async function findContact(domain: string, providedKey?: string | null): Promise<HunterContact | null> {
  const data = await call<DomainSearchData>("domain-search", { domain, limit: "10" }, resolveKey(providedKey));
  const emails = data.emails ?? [];
  if (!emails.length) return null;

  // Un correo con nombre y cargo vale más para llamar en frío que un info@,
  // así que puntúa por encima aunque tenga algo menos de confianza.
  const best = [...emails].sort((a, b) => {
    const named = Number(Boolean(b.first_name)) - Number(Boolean(a.first_name));
    if (named !== 0) return named;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  })[0];

  const name = [best.first_name, best.last_name].filter(Boolean).join(" ").trim();

  return {
    email: best.value,
    name: name || null,
    position: best.position,
    confidence: best.confidence,
    organization: data.organization,
  };
}

/** Hay clave de respaldo en el servidor, para saber si pedirla o no al visitante. */
export function hasServerKey(): boolean {
  return Boolean(process.env.HUNTER_API_KEY?.trim());
}
