/**
 * El enlace que abre la ruta completa en Google Maps, sin clave ni SDK.
 *
 * Tres cosas que no son obvias y que rompen esto en silencio:
 *
 *  1. `api=1` es obligatorio. Sin él Google IGNORA todos los demás parámetros y
 *     abre el mapa vacío. No da error: simplemente no hay ruta.
 *  2. El tope real son 10 puntos contando el origen — la ayuda de Google dice
 *     «hasta 9 paradas, incluido el destino». Si te pasas, las paradas sobrantes
 *     desaparecen sin ningún aviso. Por eso el motor no permite rutas de más de
 *     9 paradas: es una restricción del enlace, no del algoritmo.
 *  3. En un móvil SIN la app de Google Maps instalada, el navegador solo admite
 *     3 paradas intermedias. La lista de paradas de esta pantalla es la fuente
 *     de verdad; el mapa es la ayuda para conducir.
 *
 * Google respeta el orden que le damos: no reordena nada. Toda la calidad de la
 * ruta es responsabilidad nuestra.
 */

const MAX_PUNTOS = 10;

export interface ParadaMapa {
  lat: number;
  lng: number;
}

/**
 * `two-wheeler` existe y Colombia está en su cobertura oficial: da calles
 * preferentes para moto. Para carro y furgón, `driving`.
 */
export type ModoMapa = "driving" | "two-wheeler";

export function enlaceGoogleMaps(origen: ParadaMapa, paradas: ParadaMapa[], modo: ModoMapa = "driving"): string | null {
  if (!paradas.length) return null;
  if (1 + paradas.length > MAX_PUNTOS) return null;

  const c = (p: ParadaMapa) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const destino = paradas[paradas.length - 1];
  const intermedias = paradas.slice(0, -1);

  // URLSearchParams ya codifica la coma como %2C y la barra vertical como %7C,
  // que es exactamente lo que Google exige. Hacerlo a mano es donde se falla.
  const q = new URLSearchParams({
    api: "1",
    origin: c(origen),
    destination: c(destino),
    travelmode: modo,
  });
  if (intermedias.length) q.set("waypoints", intermedias.map(c).join("|"));
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Cuántas paradas caben todavía en un enlace, contando la bodega como origen. */
export const paradasQueCaben = () => MAX_PUNTOS - 1;
