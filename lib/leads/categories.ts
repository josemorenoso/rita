/**
 * OpenStreetMap indexa negocios por etiqueta, no por frase. Este diccionario
 * traduce lo que escribe una persona ("clínicas dentales") a las etiquetas que
 * entiende Overpass (`amenity=dentist`). Si nada casa, `resolveCategory`
 * devuelve null y el buscador cae al modo texto libre.
 */
export interface Category {
  /** Identificador corto, el que viaja en el formulario. */
  id: string;
  /** Etiqueta que se muestra en la ficha y en la tabla. */
  label: string;
  /** Filtros de Overpass. Cada uno genera su propia consulta. */
  filters: string[];
  /** Palabras que disparan esta categoría al escribir texto libre. */
  match: string[];
  /** Si aparece como chip en el formulario. */
  chip?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "dentist",
    label: "Clínica dental",
    filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
    match: ["dentista", "dental", "dentales", "odontolog", "clinica dental"],
    chip: true,
  },
  {
    id: "gym",
    label: "Gimnasio",
    filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'],
    match: ["gimnasio", "gym", "fitness", "crossfit", "deportivo"],
    chip: true,
  },
  {
    id: "restaurant",
    label: "Restaurante",
    filters: ['["amenity"="restaurant"]'],
    match: ["restaurante", "restaurantes", "comida", "cocina"],
    chip: true,
  },
  {
    id: "cafe",
    label: "Cafetería",
    filters: ['["amenity"="cafe"]'],
    match: ["cafeteria", "cafeterias", "cafe", "coffee"],
  },
  {
    id: "hotel",
    label: "Hotel",
    filters: ['["tourism"="hotel"]', '["tourism"="guest_house"]'],
    match: ["hotel", "hoteles", "hospedaje", "hostal", "alojamiento"],
    chip: true,
  },
  {
    id: "hairdresser",
    label: "Peluquería",
    filters: ['["shop"="hairdresser"]'],
    match: ["peluqueria", "peluquerias", "barberia", "barber", "salon de belleza"],
    chip: true,
  },
  {
    id: "beauty",
    label: "Centro de estética",
    filters: ['["shop"="beauty"]', '["leisure"="spa"]'],
    match: ["estetica", "spa", "belleza", "manicura", "depilacion"],
    chip: true,
  },
  {
    id: "car_repair",
    label: "Taller mecánico",
    filters: ['["shop"="car_repair"]', '["shop"="tyres"]'],
    match: ["taller", "talleres", "mecanico", "mecanica", "neumatico", "llanta"],
    chip: true,
  },
  {
    id: "car_dealer",
    label: "Concesionario",
    filters: ['["shop"="car"]'],
    match: ["concesionario", "concesionarios", "venta de carros", "venta de coches", "automotriz"],
  },
  {
    id: "estate_agent",
    label: "Inmobiliaria",
    filters: ['["office"="estate_agent"]'],
    match: ["inmobiliaria", "inmobiliarias", "bienes raices", "finca raiz", "real estate"],
    chip: true,
  },
  {
    id: "lawyer",
    label: "Despacho de abogados",
    filters: ['["office"="lawyer"]'],
    match: ["abogado", "abogados", "bufete", "juridico", "despacho legal"],
    chip: true,
  },
  {
    id: "accountant",
    label: "Asesoría contable",
    filters: ['["office"="accountant"]', '["office"="tax_advisor"]'],
    match: ["contable", "contador", "contadores", "asesoria", "gestoria", "fiscal", "contabilidad"],
    chip: true,
  },
  {
    id: "consulting",
    label: "Consultora",
    filters: ['["office"="consulting"]', '["office"="company"]'],
    match: ["consultora", "consultoria", "consultores"],
  },
  {
    id: "advertising",
    label: "Agencia de marketing",
    filters: ['["office"="advertising_agency"]', '["office"="marketing"]'],
    match: ["agencia", "marketing", "publicidad", "agencias"],
    chip: true,
  },
  {
    id: "veterinary",
    label: "Clínica veterinaria",
    filters: ['["amenity"="veterinary"]'],
    match: ["veterinaria", "veterinario", "mascotas"],
    chip: true,
  },
  {
    id: "pharmacy",
    label: "Farmacia",
    filters: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
    match: ["farmacia", "farmacias", "droguería", "drogueria", "botica"],
  },
  {
    id: "clinic",
    label: "Centro médico",
    filters: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"="centre"]'],
    match: ["clinica", "clinicas", "centro medico", "consultorio", "medico", "ips", "salud"],
    chip: true,
  },
  {
    id: "physio",
    label: "Fisioterapia",
    filters: ['["healthcare"="physiotherapist"]'],
    match: ["fisioterapia", "fisioterapeuta", "rehabilitacion", "kinesiolog"],
  },
  {
    id: "psychologist",
    label: "Psicología",
    filters: ['["healthcare"="psychotherapist"]', '["office"="psychologist"]'],
    match: ["psicolog", "psiquiatr", "terapia", "salud mental"],
  },
  {
    id: "optician",
    label: "Óptica",
    filters: ['["shop"="optician"]'],
    match: ["optica", "opticas", "gafas", "lentes"],
  },
  {
    id: "school",
    label: "Colegio",
    filters: ['["amenity"="school"]'],
    match: ["colegio", "colegios", "escuela", "instituto"],
  },
  {
    id: "academy",
    label: "Academia / formación",
    filters: ['["amenity"="language_school"]', '["office"="educational_institution"]', '["amenity"="college"]'],
    match: ["academia", "academias", "formacion", "idiomas", "curso", "capacitacion"],
    chip: true,
  },
  {
    id: "kindergarten",
    label: "Guardería",
    filters: ['["amenity"="kindergarten"]'],
    match: ["guarderia", "jardin infantil", "preescolar"],
  },
  {
    id: "travel_agency",
    label: "Agencia de viajes",
    filters: ['["shop"="travel_agency"]'],
    match: ["viajes", "turismo", "agencia de viajes", "tour"],
  },
  {
    id: "insurance",
    label: "Correduría de seguros",
    filters: ['["office"="insurance"]'],
    match: ["seguros", "aseguradora", "corredor de seguros"],
    chip: true,
  },
  {
    id: "notary",
    label: "Notaría",
    filters: ['["office"="notary"]'],
    match: ["notaria", "notario"],
  },
  {
    id: "builder",
    label: "Constructora",
    filters: ['["craft"="builder"]', '["office"="construction_company"]', '["shop"="doityourself"]'],
    match: ["constructora", "construccion", "obra", "reforma", "albanil"],
    chip: true,
  },
  {
    id: "plumber",
    label: "Fontanería",
    filters: ['["craft"="plumber"]'],
    match: ["fontanero", "fontaneria", "plomero", "plomeria"],
  },
  {
    id: "electrician",
    label: "Electricista",
    filters: ['["craft"="electrician"]'],
    match: ["electricista", "electricidad"],
  },
  {
    id: "bakery",
    label: "Panadería",
    filters: ['["shop"="bakery"]', '["shop"="pastry"]'],
    match: ["panaderia", "pasteleria", "reposteria"],
  },
  {
    id: "clothes",
    label: "Tienda de ropa",
    filters: ['["shop"="clothes"]', '["shop"="boutique"]'],
    match: ["ropa", "boutique", "moda", "tienda de ropa"],
  },
  {
    id: "supermarket",
    label: "Supermercado",
    filters: ['["shop"="supermarket"]', '["shop"="convenience"]'],
    match: ["supermercado", "super", "minimarket", "tienda de barrio"],
  },
  {
    id: "florist",
    label: "Floristería",
    filters: ['["shop"="florist"]'],
    match: ["floristeria", "flores", "floreria"],
  },
  {
    id: "jewelry",
    label: "Joyería",
    filters: ['["shop"="jewelry"]'],
    match: ["joyeria", "joyas", "relojeria"],
  },
  {
    id: "bar",
    label: "Bar",
    filters: ['["amenity"="bar"]', '["amenity"="pub"]'],
    match: ["bar", "bares", "pub", "discoteca", "cerveceria"],
  },
  {
    id: "laundry",
    label: "Lavandería",
    filters: ['["shop"="laundry"]', '["shop"="dry_cleaning"]'],
    match: ["lavanderia", "tintoreria", "lavaseco"],
  },
];

export const CHIP_CATEGORIES = CATEGORIES.filter((c) => c.chip);

/** Quita acentos y baja a minúsculas para que "peluquería" case con "peluqueria". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/**
 * Resuelve texto libre a una categoría. Prioriza la coincidencia más larga para
 * que "clinica dental" gane a "clinica".
 */
export function resolveCategory(query: string): Category | null {
  const q = normalize(query);
  if (!q) return null;

  const byId = CATEGORIES.find((c) => c.id === q);
  if (byId) return byId;

  let best: Category | null = null;
  let bestLen = 0;
  for (const cat of CATEGORIES) {
    for (const term of cat.match) {
      if (q.includes(term) && term.length > bestLen) {
        best = cat;
        bestLen = term.length;
      }
    }
  }
  return best;
}
