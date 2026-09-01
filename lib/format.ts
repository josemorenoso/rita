const NUM = new Intl.NumberFormat("es-ES");
const NUM1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const num = (v: number) => NUM.format(Math.round(v));
export const dec = (v: number) => NUM1.format(v);
export const pct = (v: number) => `${NUM1.format(v)} %`;

export function eur(v: number) {
  return `${NUM.format(Math.round(v))} €`;
}

export function eurCompact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${NUM1.format(v / 1_000_000)} M €`;
  if (Math.abs(v) >= 10_000) return `${NUM1.format(v / 1000)} k €`;
  return `${NUM.format(Math.round(v))} €`;
}

export function hoursLabel(v: number) {
  const h = Math.floor(v);
  const m = Math.floor((v - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function clockLabel(secondsOfDay: number) {
  const s = Math.floor(secondsOfDay) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function uptimeLabel(seconds: number) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function tokensLabel(v: number) {
  if (v >= 1_000_000_000) return `${NUM1.format(v / 1_000_000_000)} B`;
  if (v >= 1_000_000) return `${NUM1.format(v / 1_000_000)} M`;
  if (v >= 1000) return `${NUM1.format(v / 1000)} k`;
  return NUM.format(v);
}

/* ── Reparto de rutas ── */

/** "155,6 km". Un decimal: más precisión no la tiene el propio dato. */
export const km = (v: number) => `${NUM1.format(v)} km`;

/** "8h 34m" por encima de la hora, "42 min" por debajo. */
export function minLabel(v: number) {
  const m = Math.round(v);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Minutos desde las 08:00 → "14:35". La jornada del reparto empieza a las ocho. */
export function relojReparto(minutosDesdeLasOcho: number) {
  const total = 8 * 60 + Math.round(minutosDesdeLasOcho);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "2,4 kg" y "18 L", que es como los lee quien carga la moto. */
export const kg = (v: number) => `${NUM1.format(v)} kg`;
export const litros = (v: number) => `${NUM.format(v)} L`;
