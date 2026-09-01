/**
 * Un mapa de teselas en 60 líneas, sin Leaflet y sin ninguna dependencia.
 *
 * Todo el mapa es esta idea: proyectar lat/lng a un plano de píxeles infinito
 * (Web Mercator) y restarle el píxel de la esquina superior izquierda. La MISMA
 * función coloca las teselas y dibuja la ruta, así que todo cuadra al píxel.
 *
 * El fondo son las teselas oscuras de Esri, que hoy siguen siendo las únicas
 * gratuitas, sin clave y sin marca de agua. CARTO ya no vale: responde 200 con
 * un PNG válido que lleva «API KEY REQUIRED» impreso encima, así que un chequeo
 * automático lo da por bueno y la marca sale en pantalla.
 */

const TESELA = 256;

/**
 * Esri usa {z}/{y}/{x} —invertido respecto a todo el mundo— y sin extensión de
 * fichero. Confundirlo no da error: devuelve teselas de otro continente.
 */
const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile";
/** Los nombres de barrio van en una capa aparte, encima del fondo. */
const ESRI_ETIQUETAS =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile";
/** Respaldo si Esri se cae: OpenStreetMap invertido por CSS. */
const OSM = "https://tile.openstreetmap.org";

export const ATRIBUCION_ESRI = "Esri, HERE, Garmin, © OpenStreetMap contributors";
export const ATRIBUCION_OSM = "© OpenStreetMap contributors";

/**
 * Esri se queda sin datos en Medellín a partir del zoom 17: devuelve una tesela
 * GRIS CLARA con el texto «Map data not yet available», que sobre un diseño
 * oscuro canta muchísimo. Por eso el zoom está capado aquí y no en la confianza
 * de que nadie haga scroll.
 */
export const ZOOM_MIN = 11;
export const ZOOM_MAX = 16;

/** El centro real de la mancha urbana. El centroide de OSM cae en zona rural. */
export const CENTRO = { lat: 6.245, lng: -75.58 };

export interface Vista {
  lat: number;
  lng: number;
  zoom: number;
}

export interface Punto {
  x: number;
  y: number;
}

/** lat/lng → píxel absoluto del mundo en ese zoom. */
export function proyectar(lat: number, lng: number, zoom: number): Punto {
  const n = 2 ** zoom * TESELA;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** Píxel del mundo → lat/lng. */
export function desproyectar(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = 2 ** zoom * TESELA;
  return {
    lng: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

/** Metros por píxel, para dibujar una escala honesta. */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export interface TeselaVisible {
  clave: string;
  base: string;
  etiquetas: string;
  respaldo: string;
  izquierda: number;
  arriba: number;
}

/**
 * Las teselas que hacen falta para cubrir un rectángulo de ancho×alto píxeles
 * centrado en la vista, con su posición ya calculada dentro del contenedor.
 */
export function teselasVisibles(vista: Vista, ancho: number, alto: number): TeselaVisible[] {
  const zoom = Math.round(vista.zoom);
  const centro = proyectar(vista.lat, vista.lng, zoom);
  const origenX = centro.x - ancho / 2;
  const origenY = centro.y - alto / 2;
  const n = 2 ** zoom;

  const out: TeselaVisible[] = [];
  const tx0 = Math.floor(origenX / TESELA);
  const ty0 = Math.floor(origenY / TESELA);
  const tx1 = Math.floor((origenX + ancho) / TESELA);
  const ty1 = Math.floor((origenY + alto) / TESELA);

  for (let ty = ty0; ty <= ty1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = tx0; tx <= tx1; tx++) {
      const wrap = ((tx % n) + n) % n;
      out.push({
        clave: `${zoom}/${wrap}/${ty}`,
        base: `${ESRI}/${zoom}/${ty}/${wrap}`,
        etiquetas: `${ESRI_ETIQUETAS}/${zoom}/${ty}/${wrap}`,
        respaldo: `${OSM}/${zoom}/${wrap}/${ty}.png`,
        izquierda: tx * TESELA - origenX,
        arriba: ty * TESELA - origenY,
      });
    }
  }
  return out;
}

/** lat/lng → píxel dentro del contenedor. Es la que usa la ruta y los pines. */
export function aPantalla(
  lat: number,
  lng: number,
  vista: Vista,
  ancho: number,
  alto: number,
): Punto {
  const zoom = Math.round(vista.zoom);
  const centro = proyectar(vista.lat, vista.lng, zoom);
  const p = proyectar(lat, lng, zoom);
  return { x: p.x - (centro.x - ancho / 2), y: p.y - (centro.y - alto / 2) };
}

/** El encuadre que mete todos esos puntos dentro del rectángulo, con margen. */
export function encuadrar(
  puntos: { lat: number; lng: number }[],
  ancho: number,
  alto: number,
  margen = 30,
): Vista {
  if (!puntos.length) return { ...CENTRO, zoom: 12 };
  const lats = puntos.map((p) => p.lat);
  const lngs = puntos.map((p) => p.lng);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  for (let z = ZOOM_MAX; z >= ZOOM_MIN; z--) {
    const proy = puntos.map((p) => proyectar(p.lat, p.lng, z));
    const w = Math.max(...proy.map((p) => p.x)) - Math.min(...proy.map((p) => p.x));
    const h = Math.max(...proy.map((p) => p.y)) - Math.min(...proy.map((p) => p.y));
    if (w <= ancho - margen * 2 && h <= alto - margen * 2) return { lat, lng, zoom: z };
  }
  return { lat, lng, zoom: ZOOM_MIN };
}
