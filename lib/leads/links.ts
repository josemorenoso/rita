/**
 * Enlaces de conveniencia que se generan a partir del nombre del negocio, no
 * datos que venga a buscar un scraper. Uno por clic, sin clave y sin roto de
 * los términos de uso de la red de turno.
 */

export function linkedinSearchUrl(name: string, city: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`${name} ${city}`)}`;
}

export function instagramSearchUrl(name: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`;
}

export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
