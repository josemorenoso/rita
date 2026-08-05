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
