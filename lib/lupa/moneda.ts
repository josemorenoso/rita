/* Formato colombiano. Distribuidora Andina factura en pesos y sus documentos
   llevan NIT, así que aquí no aparece un euro por ninguna parte. Un solo
   fichero para que el motor, los Excel y la pantalla escriban las cifras
   exactamente igual. */

const NUM = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "$ 12.400.000". Sin decimales: el peso no los usa en la calle. */
export const cop = (v: number) => `$ ${NUM.format(Math.round(v))}`;

/** "$ 12,4 M" para titulares y ejes de gráfico. */
export function copCorto(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `$ ${NUM1.format(v / 1_000_000_000)} MM`;
  if (a >= 1_000_000) return `$ ${NUM1.format(v / 1_000_000)} M`;
  if (a >= 1_000) return `$ ${NUM.format(Math.round(v / 1_000))} k`;
  return `$ ${NUM.format(Math.round(v))}`;
}

export const numero = (v: number) => NUM.format(Math.round(v));
export const decimal = (v: number) => NUM1.format(v);
export const pctL = (v: number) => `${NUM1.format(v)} %`;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-03-14" → "14/03/2026". Para tablas de evidencia. */
export function fecha(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-03-14" → "14 de marzo". Para el texto narrado. */
export function fechaLarga(iso: string, conAno = false) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  const base = `${Number(d)} de ${MESES[Number(m) - 1]}`;
  return conAno ? `${base} de ${a}` : base;
}

/** "2026-03-14T23:41" → "14/03/2026 23:41". */
export function fechaHora(iso: string) {
  const hora = iso.length > 10 ? ` ${iso.slice(11, 16)}` : "";
  return `${fecha(iso)}${hora}`;
}

/** Días entre dos fechas ISO. Positivo si `b` es posterior. */
export function dias(a: string, b: string) {
  const ms = Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10));
  return Math.round(ms / 86_400_000);
}

/** Suma días a una fecha ISO y devuelve otra fecha ISO. */
export function masDias(iso: string, n: number) {
  const t = Date.parse(iso.slice(0, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "2026-03" — la clave de mes que usan los agrupados. */
export const mesDe = (iso: string) => iso.slice(0, 7);

/** "2026-T1" — trimestre, para R44. */
export function trimestreDe(iso: string) {
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-T${Math.floor((m - 1) / 3) + 1}`;
}
