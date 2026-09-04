/**
 * Números en palabras, para que la voz diga «tres millones cuarenta y nueve
 * mil pesos» y no lea dígitos uno a uno. Solo enteros y solo pesos: es lo
 * único que Sofi necesita pronunciar.
 */

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos",
  "setecientos", "ochocientos", "novecientos",
];

function menorDeMil(n: number): string {
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const r = n % 10;
    return r ? `${DECENAS[d]} y ${UNIDADES[r]}` : DECENAS[d];
  }
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  return `${CENTENAS[c]}${r ? ` ${menorDeMil(r)}` : ""}`;
}

/** «uno» delante de un nombre se apocopa: setecientos UN mil, treinta y UN
    mil. Solo «veintiuno» conserva la tilde al apocoparse. */
const apocope = (s: string) => s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

/** 3049920 → «tres millones cuarenta y nueve mil novecientos veinte». */
export function numeroEnPalabras(valor: number): string {
  const n = Math.floor(Math.abs(valor));
  if (n === 0) return "cero";
  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones > 0) partes.push(millones === 1 ? "un millón" : `${apocope(menorDeMil(millones))} millones`);
  if (miles > 0) partes.push(miles === 1 ? "mil" : `${apocope(menorDeMil(miles))} mil`);
  if (resto > 0) partes.push(menorDeMil(resto));
  return partes.join(" ");
}

export const pesosEnPalabras = (valor: number) => `${numeroEnPalabras(valor)} pesos`;

/** Para leer un total sin marear: redondea a miles hacia abajo y lo dice
    en palabras. 3.049.920 → «tres millones cuarenta y nueve mil pesos». */
export function pesosRedondosEnPalabras(valor: number) {
  return pesosEnPalabras(Math.floor(valor / 1000) * 1000);
}

/** «diez por ciento». */
export function porcentajeEnPalabras(fraccion: number) {
  return `${numeroEnPalabras(Math.round(fraccion * 100))} por ciento`;
}
