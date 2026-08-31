export type ChannelStatus = "active" | "locked";

export type ChannelIcon =
  | "bolt"
  | "map"
  | "google"
  | "instagram"
  | "linkedin"
  | "phantom"
  | "database"
  | "hunter"
  | "flag";

export interface DiagramNode {
  id: string;
  icon: ChannelIcon;
  label: string;
  sublabel: string;
  status: ChannelStatus;
  /** Lo que se lee al tocar un nodo bloqueado. */
  lockedNote?: string;
}

/**
 * El paso a paso que se muestra en el diagrama de Rita. Los "active" son los
 * que de verdad ejecuta la herramienta gratuita; los "locked" existen para
 * que se vea todo lo que puede hacer, marcados sin ambigüedad como fuera del
 * plan gratuito — nunca se simula que corren.
 */
export const RITA_PIPELINE: DiagramNode[] = [
  {
    id: "start",
    icon: "bolt",
    label: "Rita recibe tu búsqueda",
    sublabel: "Qué negocio · qué ciudad",
    status: "active",
  },
  {
    id: "maps",
    icon: "map",
    label: "Mapa de negocios",
    sublabel: "OpenStreetMap · en vivo",
    status: "active",
  },
  {
    id: "google",
    icon: "google",
    label: "Google Maps Business",
    sublabel: "API oficial",
    status: "locked",
    lockedNote: "Extracción masiva vía la API oficial de Google Maps Business. Se activa en el plan Pro de Rita.",
  },
  {
    id: "instagram",
    icon: "instagram",
    label: "Instagram",
    sublabel: "Perfiles de negocio",
    status: "locked",
    lockedNote: "Búsqueda y verificación profunda de perfiles de Instagram. Se activa en el plan Pro de Rita.",
  },
  {
    id: "linkedin",
    icon: "linkedin",
    label: "LinkedIn",
    sublabel: "Sales Navigator",
    status: "locked",
    lockedNote: "Prospección de tomadores de decisión en LinkedIn Sales Navigator. Se activa en el plan Pro de Rita.",
  },
  {
    id: "phantom",
    icon: "phantom",
    label: "PhantomBuster",
    sublabel: "Automatización",
    status: "locked",
    lockedNote: "Scraping automatizado multi-plataforma con PhantomBuster. Se activa en el plan Pro de Rita.",
  },
  {
    id: "b2b",
    icon: "database",
    label: "Bases de datos B2B",
    sublabel: "Directorios privados",
    status: "locked",
    lockedNote: "Cruce con directorios comerciales y bases de datos B2B privadas. Se activa en el plan Pro de Rita.",
  },
  {
    id: "hunter",
    icon: "hunter",
    label: "Hunter.io",
    sublabel: "Correo del responsable",
    status: "active",
  },
  {
    id: "done",
    icon: "flag",
    label: "Lista lista para llamar",
    sublabel: "Teléfono + web + correo",
    status: "active",
  },
];
