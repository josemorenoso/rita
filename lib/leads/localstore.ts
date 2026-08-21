"use client";

import type { LeadRun } from "./types";

/**
 * Todo lo del visitante vive en SU navegador, nunca en el servidor. Es lo
 * correcto para una herramienta que se regala: no guardas datos de contacto
 * de terceros, no pagas almacenamiento y no hay nada que limpiar. Además
 * Vercel no tiene disco persistente, así que escribir ficheros no sería opción.
 */

const RUNS_KEY = "rita.v1.runs";
const HUNTER_KEY = "rita.v1.hunterKey";
const CAPTURED_KEY = "rita.v1.captured";

/** Tope de búsquedas guardadas. localStorage ronda los 5 MB y cada lista pesa ~20 KB. */
const MAX_RUNS = 25;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota llena o modo privado: la herramienta sigue funcionando sin historial.
  }
}

export function listRuns(): LeadRun[] {
  return read<LeadRun[]>(RUNS_KEY, []);
}

export function loadRun(id: string): LeadRun | null {
  return listRuns().find((r) => r.id === id) ?? null;
}

/** Guarda o reemplaza una búsqueda, dejando la más reciente primero. */
export function saveRun(run: LeadRun): void {
  const rest = listRuns().filter((r) => r.id !== run.id);
  write(RUNS_KEY, [run, ...rest].slice(0, MAX_RUNS));
}

export function clearRuns(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RUNS_KEY);
  } catch {
    /* nada que hacer */
  }
}

// ── Clave de Hunter del visitante ──
// Se queda aquí y viaja en cada petición solo para usarse; el servidor no la
// almacena en ningún momento.

export function getHunterKey(): string {
  return read<string>(HUNTER_KEY, "");
}

export function setHunterKey(key: string): void {
  write(HUNTER_KEY, key.trim());
}

// ── Recuerda si ya dejó sus datos, para no pedírselos dos veces ──

export function isCaptured(): boolean {
  return read<boolean>(CAPTURED_KEY, false);
}

export function markCaptured(): void {
  write(CAPTURED_KEY, true);
}
