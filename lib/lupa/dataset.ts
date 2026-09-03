/* ─────────────────────────────  LUPA · el dataset  ─────────────────────────────
   Dieciocho meses de Distribuidora Andina S.A.S., fabricados aquí dentro.

   Dos decisiones mandan sobre todo lo demás:

   1. Determinismo. El vídeo se graba en varias tomas y los seis Excel se
      arrastran en directo. Si las cifras cambiaran entre tomas, la narración
      dejaría de cuadrar con la pantalla. Todo sale de un mulberry32 con
      semilla fija: ni `Math.random`, ni `Date.now`, ni zona horaria (las fechas
      se calculan en UTC, que vale lo mismo en el portátil de Luis que en el de
      cualquiera que reproduzca esto).

   2. La fila del Excel es el dato. Cada registro canónico se numera por su
      posición en el array, y el generador escribe las hojas recorriendo esos
      mismos arrays en el mismo orden. Por eso `origen.fila` es la fila que el
      auditor ve al abrir el fichero, y el lector de Excel obtiene exactamente
      los mismos orígenes leyendo de arriba abajo. Sin esa coincidencia el
      argumento de la herramienta —«pincha el hallazgo y te lleva a la celda»—
      se cae.

   Los casos sembrados (S1..S18) se colocan a mano con sus montos exactos. El
   ruido orgánico se genera alrededor con cuidado de no disparar ninguna regla
   por accidente: precios de compra que se mueven menos del 15 % en 90 días,
   márgenes de venta por encima del 12 %, descuentos por debajo del 8 % y
   registros siempre en día hábil y en horario. Lo que el motor encuentre será
   lo sembrado, ni una fuga más.
   --------------------------------------------------------------------------- */

import type {
  ArchivoCargado,
  CambioTercero,
  Documento,
  EstadoDocumento,
  Item,
  Libro,
  LineaDocumento,
  MovimientoBanco,
  MovimientoInventario,
  Politicas,
  Tercero,
  TipoDocumento,
} from "./tipos";

/* ──────────────────────────  Lo que el resto necesita  ────────────────────── */

export const EMPRESA = "Distribuidora Andina S.A.S.";
export const NIT_EMPRESA = "900.482.157-3";
export const PERIODO = { desde: "2025-03-01", hasta: "2026-08-31" } as const;

export const BODEGAS = ["BOD-01 Centro", "BOD-02 Guayabal", "BOD-03 Bello"] as const;

export const USUARIOS: { id: string; nombre: string; area: string }[] = [
  { id: "mosorio", nombre: "Marcela Osorio", area: "Compras" },
  { id: "jvargas", nombre: "Jhon Vargas", area: "Cartera" },
  { id: "lramos", nombre: "Laura Ramos", area: "Ventas" },
  { id: "dcastro", nombre: "Diego Castro", area: "Ventas" },
  { id: "kalzate", nombre: "Kevin Alzate", area: "Ventas" },
  { id: "ncardona", nombre: "Nubia Cardona", area: "Contabilidad" },
  { id: "abetancur", nombre: "Andrés Betancur", area: "Bodega" },
  { id: "sgomez", nombre: "Sara Gómez", area: "Tesorería" },
];

export const POLITICAS = {
  umbralAprobacion: 5_000_000,
  margenMinimoPct: 12,
  descuentoMaximoPct: 8,
  diasCredito: 30,
  horarioInicio: 7,
  horarioFin: 18,
  minimoSoportePago: 1_500_000,
} as const;

/** Los seis ficheros, con el nombre exacto que se arrastra a la pantalla. */
export const ARCHIVOS = {
  terceros: "01 Terceros.xlsx",
  compras: "02 Compras.xlsx",
  ventas: "03 Ventas.xlsx",
  inventario: "04 Inventario.xlsx",
  banco: "05 Banco.xlsx",
  politicas: "06 Politicas.xlsx",
} as const;

export const HOJAS = {
  terceros: "Terceros",
  cambios: "Cambios",
  documentos: "Documentos",
  detalle: "Detalle",
  movimientos: "Movimientos",
  productos: "Productos",
  extracto: "Extracto",
  parametros: "Parámetros",
} as const;

/** Encabezados feos a propósito: son los de una exportación de ERP, y son ley. */
export const ENCABEZADOS = {
  terceros: [
    "Cod. Tercero",
    "Razón Social",
    "Tipo",
    "Nit / Cédula",
    "Teléfono",
    "Dirección",
    "Cta. Bancaria",
    "Banco",
    "F. Creación",
    "Usuario Creó",
  ],
  cambios: ["Cod. Tercero", "Campo", "Valor Anterior", "Valor Nuevo", "Fecha Cambio", "Usuario"],
  comprasDocumentos: [
    "Tipo Doc",
    "Nro.",
    "Consec.",
    "Cod. Tercero",
    "Tercero",
    "Fecha Doc",
    "Fecha Registro",
    "Usuario",
    "Vlr. Total",
    "Estado",
    "Doc. Ref. OC",
    "Doc. Ref. Entrada",
  ],
  detalle: ["Nro. Doc", "Cod. Producto", "Descripción", "Cant.", "Vlr. Unit.", "Costo Unit.", "% Desc.", "Vlr. Línea"],
  ventasDocumentos: [
    "Tipo Doc",
    "Nro.",
    "Consec.",
    "Cod. Tercero",
    "Cliente",
    "Fecha Doc",
    "Fecha Registro",
    "Vendedor",
    "Vlr. Total",
    "Estado",
    "Doc. Afectado",
    "Días Crédito",
  ],
  movimientos: ["Consecutivo", "Cod. Producto", "Bodega", "Tipo Mov.", "Cantidad", "Fecha", "Doc. Soporte", "Usuario", "Motivo"],
  productos: ["Cod. Producto", "Nombre", "Categoría", "Costo Prom.", "Existencia", "Maneja Inventario"],
  extracto: ["Fecha", "Descripción", "Débito", "Crédito", "Saldo", "Cuenta", "Doc. Conciliado"],
  parametros: ["Parámetro", "Valor"],
} as const;

/** La cuenta corriente de la empresa. Una sola, para que el saldo del extracto cuadre. */
export const CUENTA_EMPRESA = "0234567890";

/* ─────────────────────────────  Azar con semilla  ───────────────────────────── */

const SEMILLA = 20260901;

type Azar = {
  real: () => number;
  entero: (a: number, b: number) => number;
  elige: <T>(xs: readonly T[]) => T;
  quizas: (p: number) => boolean;
  normal: () => number;
  baraja: <T>(xs: readonly T[]) => T[];
};

function crearAzar(semilla: number): Azar {
  let a = semilla >>> 0;
  const real = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (lo: number, hi: number) => lo + Math.floor(real() * (hi - lo + 1));
  return {
    real,
    entero,
    elige: <T,>(xs: readonly T[]) => xs[Math.floor(real() * xs.length)],
    quizas: (p: number) => real() < p,
    // Box-Muller: hace falta una campana de verdad para que los importes no
    // salgan planos y Benford tenga algo que decir.
    normal: () => Math.sqrt(-2 * Math.log(Math.max(real(), 1e-9))) * Math.cos(2 * Math.PI * real()),
    baraja: <T,>(xs: readonly T[]) => {
      const c = [...xs];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(real() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    },
  };
}

/* ────────────────────────────  Fechas, siempre UTC  ──────────────────────────── */

const MS_DIA = 86_400_000;

const aDia = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / MS_DIA);
const aISO = (dia: number) => new Date(dia * MS_DIA).toISOString().slice(0, 10);
const diaSemana = (dia: number) => new Date(dia * MS_DIA).getUTCDay();

/** Festivos colombianos del período, con la Ley Emiliani ya aplicada. */
const FESTIVOS = new Set<string>([
  "2025-04-17",
  "2025-04-18",
  "2025-05-01",
  "2025-06-02",
  "2025-06-23",
  "2025-06-30",
  "2025-07-20",
  "2025-08-07",
  "2025-08-18",
  "2025-10-13",
  "2025-11-03",
  "2025-11-17",
  "2025-12-08",
  "2025-12-25",
  "2026-01-01",
  "2026-01-12",
  "2026-03-23",
  "2026-04-02",
  "2026-04-03",
  "2026-05-01",
  "2026-05-18",
  "2026-06-08",
  "2026-06-15",
  "2026-06-29",
  "2026-07-20",
  "2026-08-07",
  "2026-08-17",
]);

const esHabil = (dia: number) => {
  const d = diaSemana(dia);
  return d >= 1 && d <= 5 && !FESTIVOS.has(aISO(dia));
};

const habilDesde = (dia: number) => {
  let d = dia;
  while (!esHabil(d)) d++;
  return d;
};

const habilAtras = (dia: number) => {
  let d = dia;
  while (!esHabil(d)) d--;
  return d;
};

const DIA_INICIO = aDia(PERIODO.desde);
const DIA_FIN = aDia(PERIODO.hasta);

/** Los 18 meses del período, cada uno con sus días hábiles ya resueltos. */
const MESES: { clave: string; anio: number; habiles: number[] }[] = (() => {
  const meses: { clave: string; anio: number; habiles: number[] }[] = [];
  for (let d = DIA_INICIO; d <= DIA_FIN; d++) {
    const iso = aISO(d);
    const clave = iso.slice(0, 7);
    let mes = meses[meses.length - 1];
    if (!mes || mes.clave !== clave) {
      mes = { clave, anio: Number(iso.slice(0, 4)), habiles: [] };
      meses.push(mes);
    }
    if (esHabil(d)) mes.habiles.push(d);
  }
  return meses;
})();

const anioDe = (dia: number) => Number(aISO(dia).slice(0, 4));

/** "2026-04-16" + 23:41 → "2026-04-16T23:41". La hora es lo que alimenta R42. */
const marca = (dia: number, hora: number, minuto: number) =>
  `${aISO(dia)}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;

/* ──────────────────────────  NIT con dígito de la DIAN  ────────────────────── */

const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** El algoritmo real de la DIAN. Sin esto, los NIT de la demo no aguantan que
    alguien del público los teclee en el RUES. */
export function digitoVerificacion(base: string): number {
  const digitos = base.replace(/\D/g, "");
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_DIAN[i];
  }
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
}

/** "900482157" → "900.482.157-3". */
export function formatearNit(base: string, dv?: number): string {
  const d = base.replace(/\D/g, "");
  const grupos: string[] = [];
  for (let i = d.length; i > 0; i -= 3) grupos.unshift(d.slice(Math.max(0, i - 3), i));
  return `${grupos.join(".")}-${dv ?? digitoVerificacion(d)}`;
}

/* ────────────────────────────  Redondeos y sumas  ──────────────────────────── */

const aDiez = (v: number) => Math.round(v / 10) * 10;
const aCien = (v: number) => Math.round(v / 100) * 100;
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Multiplicador lognormal para el importe de un documento. Sin él todas las
 * facturas caerían alrededor de la media y el primer dígito sería casi siempre
 * un 4: Benford acusaría al dataset entero en vez de a la compra fraccionada.
 */
const escala = (az: Azar, sigma: number) =>
  Math.min(4, Math.max(0.22, Math.exp(az.normal() * sigma - (sigma * sigma) / 2)));

/* ─────────────────────────────  Catálogos  ───────────────────────────── */

const BANCOS = [
  "Bancolombia",
  "Davivienda",
  "Banco de Bogotá",
  "BBVA Colombia",
  "Banco de Occidente",
  "Itaú Colombia",
  "Banco Popular",
  "Scotiabank Colpatria",
  "Banco AV Villas",
  "Banco Agrario de Colombia",
];

const VIAS = ["Calle", "Carrera", "Transversal", "Diagonal", "Avenida"];

const BARRIOS = [
  "El Poblado",
  "Laureles",
  "Belén",
  "Guayabal",
  "Envigado",
  "Itagüí",
  "Sabaneta",
  "Bello",
  "Robledo",
  "La América",
  "Buenos Aires",
  "Castilla",
  "Aranjuez",
  "Manrique",
  "San Javier",
  "Copacabana",
  "La Estrella",
  "Caldas",
  "Girardota",
  "Rionegro",
];

const PROVEEDORES_NOMBRE = [
  "Alimentos del Aburrá S.A.S.",
  "Grasas y Aceites La Estrella S.A.S.",
  "Granos Antioqueños Ltda",
  "Lácteos San Cristóbal S.A.S.",
  "Enlatados del Caribe S.A.S.",
  "Comercializadora Itagüí Ltda",
  "Panificadora El Poblado S.A.S.",
  "Aceites del Cauca S.A.S.",
  "Desechables Envigado S.A.S.",
  "Químicos y Aseo Bello Ltda",
  "Bebidas de Antioquia S.A.S.",
  "Empaques del Norte Ltda",
  "Cárnicos La Macarena S.A.S.",
  "Molinos del Occidente S.A.S.",
  "Condimentos La Ceja Ltda",
  "Azúcares del Suroeste S.A.S.",
  "Distribuidora Sabaneta S.A.S.",
  "Papelería y Empaques Caldas Ltda",
  "Oleaginosas de Urabá S.A.S.",
  "Frutas y Pulpas del Retiro S.A.S.",
  "Insumos Copacabana Ltda",
  "Comercial Guayabal S.A.S.",
  "Distribuciones Ferrocentro S.A.S.",
  "Lácteos La Pradera S.A.S.",
  "Abarrotes Robledo Ltda",
  "Plásticos Girardota S.A.S.",
  "Café de la Montaña S.A.S.",
  "Harinas del Norte Ltda",
  "Detergentes Industriales Medellín S.A.S.",
  "Salsas y Aderezos Rionegro S.A.S.",
  "Suministros del Valle S.A.S.",
  "Congelados La Estrella Ltda",
  "Distribuidora Belén S.A.S.",
  "Envases y Tapas Caribe Ltda",
  "Pastas La Candelaria S.A.S.",
  "Avícola San Antonio S.A.S.",
  "Comercializadora Laureles Ltda",
  "Aseo Total Antioquia S.A.S.",
  "Granja Los Almendros S.A.S.",
  "Bebidas Naturales del Oriente S.A.S.",
  "Empaques Flexibles Andinos S.A.S.",
  "Distribuciones Manrique Ltda",
  "Especias del Trópico S.A.S.",
  "Panadería Industrial Aranjuez S.A.S.",
  "Provisiones La Floresta S.A.S.",
  "Alimentos Concentrados Marinilla S.A.S.",
  "Insumos Cordillera S.A.S.",
  "Lácteos El Carmen Ltda",
  "Distribuciones Buenos Aires S.A.S.",
  "Comercial San Javier S.A.S.",
  "Empaques Metálicos del Sur S.A.S.",
  "Aceites y Margarinas Caucasia S.A.S.",
  "Granos y Cereales Yarumal Ltda",
  "Empresas Públicas de Medellín E.S.P.",
  "Seguros Generales Suramericana S.A.",
  "Inmobiliaria Oviedo S.A.S.",
  "Transportes Rápido Ochoa S.A.",
  "Une Telecomunicaciones S.A.",
  "Servicios Temporales Aburrá S.A.S.",
  "Mantenimiento Industrial Andino S.A.S.",
];

const CLIENTES_NOMBRE = [
  "Restaurante La Barra Envigado",
  "Cafetería El Poblado Centro",
  "Minimercado La Aurora",
  "Restaurante Mondongos Laureles",
  "Autoservicio La Playa",
  "Panadería y Café Astor Sur",
  "Restaurante Sancho Paisa",
  "Supermercado El Trébol Bello",
  "Cafetería Ciudad Universitaria",
  "Restaurante Hato Viejo Itagüí",
  "Minimercado Los Colores",
  "Comidas Rápidas El Tesoro",
  "Restaurante Barbacoa Sabaneta",
  "Cafetería La Estación Niquía",
  "Supermercado Los Andes Robledo",
  "Restaurante Ancón Caldas",
  "Minimercado San Diego",
  "Casino Empresarial Ruta N",
  "Restaurante Cielo Provenza",
  "Cafetería Torre Médica Poblado",
  "Autoservicio Guayabal Express",
  "Restaurante El Rancherito Copacabana",
  "Minimercado La Milagrosa",
  "Panadería Santa Elena",
  "Restaurante Mangos Belén",
  "Supermercado La Vaquita Buenos Aires",
  "Cafetería Plaza Mayor",
  "Restaurante Ocaso Manrique",
  "Minimercado El Diamante",
  "Comedor Industrial Zona Franca",
  "Restaurante La Provincia Girardota",
  "Cafetería Aeropuerto Olaya",
  "Supermercado Euro La Floresta",
  "Restaurante Carnes y Brasas Aranjuez",
  "Minimercado Villa Hermosa",
  "Casino Universidad de Antioquia",
  "Restaurante Malanga Estadio",
  "Cafetería Hospital San Vicente",
  "Autoservicio La Mota",
  "Restaurante El Botánico Prado",
  "Minimercado Santa Mónica",
  "Panadería Migas de Barcelona",
  "Restaurante Terraza Rionegro",
  "Cafetería Centro Comercial Santafé",
  "Supermercado Mercafé Marinilla",
];

/** Los doce de nómina. Del EMP-05 al EMP-11 son los usuarios del ERP: la
    coincidencia entre la ficha de EMP-04 y el proveedor PRV-047 es el caso S1. */
const EMPLEADOS_NOMBRE = [
  "Carlos Andrés Restrepo Vélez",
  "Diana Marcela Zapata Ríos",
  "Juan Esteban Muñoz Arango",
  "Marcela Osorio Ruiz",
  "Jhon Fredy Vargas Cano",
  "Laura Cristina Ramos Peláez",
  "Diego Alejandro Castro Mesa",
  "Kevin Santiago Alzate Duque",
  "Nubia Elena Cardona Tobón",
  "Andrés Felipe Betancur Gil",
  "Sara Milena Gómez Ospina",
  "Julián David Henao Correa",
];

/* ─────────────────  Los identificadores de los casos sembrados  ───────────── */

export const CASOS = {
  proveedorFantasma: "PRV-047", // S1
  empleadaCompras: "EMP-04", // S1
  cuentaCompartida: "0230456789", // S1
  pagoDuplicado: "PRV-012", // S2
  fraccionada: "PRV-023", // S3
  sobrecosto: "PRV-008", // S4
  skuSobrecosto: "ACE-1000", // S4
  skuMerma: "ARR-500", // S5
  bodegaMerma: "BOD-02 Guayabal", // S5
  usuarioNotas: "jvargas", // S6
  cambioCuenta: "PRV-031", // S8
  skuRecompra: "ASE-880", // S13
  facturaDuplicada: "FC-2026-0331", // S2
  facturasGemelas: ["FC-2026-0455", "FC-2026-0461"], // S7
  recibosFaltantes: ["RC-2026-0188", "RC-2026-0189", "RC-2026-0190", "RC-2026-0191", "RC-2026-0192"], // S14
} as const;

/* ─────────────────────────────  Productos  ───────────────────────────── */

type Producto = {
  sku: string;
  nombre: string;
  categoria: string;
  costo: number;
  precio: number;
  inventariable: boolean;
  proveedores: string[];
  activo: boolean;
  altaMargen: boolean;
};

/**
 * Cada referencia es una base y una presentación de las que esa base admite. No
 * se combinan al azar: «Toalla de manos 1 L» no existe en ningún catálogo, y el
 * Excel se abre en cámara y se lee.
 *
 * El costo tampoco se sortea suelto. Cada base trae el precio mayorista de su
 * unidad —un kilo, un litro, una unidad suelta— y la presentación lo multiplica
 * por lo que de verdad contiene. Así el bulto de arroz de 25 kg vale veinticinco
 * veces el kilo, la pimienta cuesta treinta veces lo que la sal, y ninguna línea
 * del detalle delata al generador. Los dos primeros números están atados a los
 * casos sembrados: el aceite a 4.425 el litro da los 88.500 del bidón de S4, y
 * el arroz a 4.600 el kilo da los 115.000 del bulto de S5.
 */
const FAMILIAS: { prefijo: string; categoria: string; porMetro: number; bases: [string, number, string[]][] }[] = [
  {
    prefijo: "ACE",
    categoria: "Aceites y grasas",
    porMetro: 1,
    bases: [
      ["Aceite vegetal", 4_425, ["1 L", "3 L", "5 L", "20 L", "12 x 1 L"]],
      ["Aceite de girasol", 7_800, ["1 L", "3 L", "5 L", "12 x 1 L"]],
      ["Aceite de soya", 5_200, ["1 L", "3 L", "20 L"]],
      ["Manteca vegetal", 6_400, ["500 g", "1 kg", "4 kg", "15 kg"]],
      ["Margarina industrial", 8_900, ["500 g", "1 kg", "4 kg", "10 kg"]],
      ["Aceite de palma", 4_900, ["3 L", "5 L", "20 L"]],
    ],
  },
  {
    prefijo: "ARR",
    categoria: "Granos y cereales",
    porMetro: 1,
    bases: [
      ["Arroz blanco", 4_600, ["500 g", "1 kg", "5 kg", "12,5 kg", "25 kg"]],
      ["Arroz integral", 6_200, ["500 g", "1 kg", "5 kg"]],
      ["Fríjol cargamanto", 9_800, ["500 g", "1 kg", "5 kg", "25 kg"]],
      ["Lenteja", 5_400, ["500 g", "1 kg", "5 kg"]],
      ["Garbanzo", 8_600, ["500 g", "1 kg", "5 kg"]],
      ["Arveja seca", 5_100, ["500 g", "1 kg", "5 kg"]],
      ["Maíz trillado", 3_400, ["1 kg", "5 kg", "25 kg"]],
    ],
  },
  {
    prefijo: "ENL",
    categoria: "Enlatados",
    porMetro: 1,
    bases: [
      ["Atún en lomos", 34_000, ["170 g", "12 x 170 g", "24 x 170 g", "48 x 170 g"]],
      ["Sardina en salsa", 12_500, ["425 g", "12 x 425 g", "24 x 425 g"]],
      ["Maíz dulce", 9_800, ["425 g", "12 x 425 g", "24 x 425 g"]],
      ["Arveja en conserva", 9_200, ["425 g", "12 x 425 g", "24 x 425 g"]],
      ["Champiñones laminados", 24_000, ["184 g", "12 x 184 g", "24 x 184 g"]],
      ["Duraznos en almíbar", 11_400, ["820 g", "12 x 820 g"]],
    ],
  },
  {
    prefijo: "LAC",
    categoria: "Lácteos",
    porMetro: 1,
    bases: [
      ["Leche entera UHT", 3_900, ["1 L", "12 x 1 L", "24 x 1 L"]],
      ["Leche deslactosada", 4_600, ["1 L", "12 x 1 L"]],
      ["Queso campesino", 15_500, ["500 g", "1 kg", "2,5 kg"]],
      ["Queso mozzarella", 19_800, ["500 g", "1 kg", "5 kg"]],
      ["Crema de leche", 9_400, ["500 ml", "1 L", "12 x 500 ml"]],
      ["Yogur natural", 5_200, ["1 L", "6 x 1 L", "12 x 1 L"]],
      ["Mantequilla", 21_000, ["250 g", "500 g", "1 kg"]],
    ],
  },
  {
    prefijo: "DES",
    categoria: "Desechables",
    porMetro: 1.3,
    bases: [
      ["Vaso desechable 7 oz", 95, ["50 un", "100 un", "1000 un"]],
      ["Plato desechable hondo", 180, ["25 un", "100 un", "500 un"]],
      ["Servilleta cuadrada", 22, ["100 un", "500 un", "1000 un"]],
      ["Bolsa de basura calibre 2", 640, ["10 un", "50 un", "100 un"]],
      ["Contenedor de icopor", 320, ["25 un", "125 un", "500 un"]],
      ["Cubiertos desechables", 58, ["50 un", "500 un", "1000 un"]],
      ["Papel aluminio", 205, ["rollo 30 m", "rollo 100 m", "6 x rollo 30 m"]],
    ],
  },
  {
    prefijo: "ASE",
    categoria: "Aseo y limpieza",
    porMetro: 0.011,
    bases: [
      ["Detergente en polvo", 4_200, ["1 kg", "5 kg", "15 kg"]],
      ["Jabón líquido de manos", 6_800, ["1 L", "3,8 L", "12 x 1 L"]],
      ["Blanqueador", 2_400, ["1 L", "2 L", "3,8 L", "20 L"]],
      ["Desinfectante lavanda", 3_100, ["1 L", "3,8 L", "20 L"]],
      ["Limpiavidrios", 5_600, ["500 ml", "1 L", "3,8 L"]],
      ["Papel higiénico institucional", 8_100, ["rollo 250 m", "4 x rollo 250 m", "12 x rollo 250 m"]],
      ["Toalla de manos", 8_900, ["rollo 150 m", "6 x rollo 150 m", "12 x rollo 150 m"]],
    ],
  },
  {
    prefijo: "BEB",
    categoria: "Bebidas",
    porMetro: 1,
    bases: [
      ["Gaseosa cola", 2_600, ["1,5 L", "2,5 L", "6 x 1,5 L", "12 x 1,5 L"]],
      ["Agua en botella", 1_100, ["600 ml", "12 x 600 ml", "24 x 600 ml"]],
      ["Jugo de caja surtido", 4_200, ["200 ml", "12 x 200 ml", "24 x 200 ml"]],
      ["Té helado", 3_100, ["400 ml", "1,5 L", "12 x 400 ml"]],
      ["Bebida hidratante", 4_800, ["500 ml", "12 x 500 ml", "24 x 500 ml"]],
      ["Malta", 5_400, ["330 ml", "6 x 330 ml", "24 x 330 ml"]],
      ["Refresco en polvo", 12_000, ["1 kg", "12 x 25 g", "24 x 25 g"]],
    ],
  },
  {
    prefijo: "PAN",
    categoria: "Panadería",
    porMetro: 1,
    bases: [
      ["Harina de trigo fortificada", 3_400, ["1 kg", "12,5 kg", "25 kg"]],
      ["Levadura seca", 22_000, ["500 g", "1 kg", "10 x 500 g"]],
      ["Mezcla para ponqué", 7_800, ["1 kg", "5 kg", "10 kg"]],
      ["Pan tajado", 6_200, ["450 g", "6 x 450 g", "12 x 450 g"]],
      ["Galleta de sal", 9_500, ["3 kg", "12 x 300 g", "24 x 300 g"]],
      ["Tostada integral", 14_000, ["12 x 200 g", "24 x 200 g"]],
    ],
  },
  {
    prefijo: "CON",
    categoria: "Condimentos y salsas",
    porMetro: 1,
    bases: [
      ["Sal refinada", 1_500, ["500 g", "1 kg", "25 kg"]],
      ["Pimienta molida", 42_000, ["500 g", "1 kg", "4 kg"]],
      ["Comino molido", 28_000, ["500 g", "1 kg", "4 kg"]],
      ["Color en polvo", 9_800, ["500 g", "1 kg", "4 kg"]],
      ["Caldo en cubo", 24_000, ["12 x 100 g", "24 x 100 g", "96 x 100 g"]],
      ["Salsa de tomate", 6_900, ["1 kg", "4 kg", "12 x 1 kg"]],
      ["Mayonesa", 9_400, ["1 kg", "3,8 kg", "12 x 1 kg"]],
      ["Mostaza", 7_200, ["1 kg", "3,8 kg", "12 x 1 kg"]],
    ],
  },
  {
    prefijo: "CAR",
    categoria: "Cárnicos y embutidos",
    porMetro: 1,
    bases: [
      ["Salchicha coctel", 13_500, ["500 g", "1 kg", "2,5 kg"]],
      ["Chorizo santarrosano", 18_900, ["500 g", "1 kg", "5 kg"]],
      ["Jamón de cerdo", 22_500, ["500 g", "1 kg", "2,5 kg"]],
      ["Mortadela", 11_800, ["1 kg", "2,5 kg", "5 kg"]],
      ["Tocineta ahumada", 26_000, ["500 g", "1 kg", "2,5 kg"]],
      ["Pechuga de pollo", 14_900, ["1 kg", "2,5 kg", "5 kg"]],
    ],
  },
  {
    prefijo: "HAR",
    categoria: "Pastas y harinas",
    porMetro: 1,
    bases: [
      ["Pasta espagueti", 4_800, ["500 g", "1 kg", "5 kg", "24 x 500 g"]],
      ["Pasta tornillo", 4_900, ["500 g", "1 kg", "5 kg"]],
      ["Harina de maíz precocida", 3_900, ["1 kg", "5 kg", "25 kg"]],
      ["Fécula de maíz", 6_400, ["500 g", "1 kg", "5 kg"]],
      ["Avena en hojuelas", 5_200, ["500 g", "1 kg", "10 kg"]],
    ],
  },
  {
    prefijo: "AZU",
    categoria: "Azúcar y endulzantes",
    porMetro: 1,
    bases: [
      ["Azúcar blanca refinada", 3_800, ["1 kg", "5 kg", "12,5 kg", "50 kg"]],
      ["Azúcar morena", 4_400, ["1 kg", "5 kg", "25 kg"]],
      ["Panela pulverizada", 5_600, ["500 g", "1 kg", "5 kg"]],
      ["Endulzante en sobres", 95, ["50 un", "100 un", "500 un"]],
      ["Miel de abejas", 18_000, ["330 g", "1 kg", "12 x 330 g"]],
    ],
  },
];

/** Cuánto contiene una presentación medido en la unidad de su base. Un rollo se
    convierte con el factor de su familia: treinta metros de papel aluminio y
    doscientos cincuenta de papel higiénico no valen lo mismo por metro. */
function contenido(texto: string, porMetro: number): number {
  const paquete = /^(\d+) x (.+)$/.exec(texto);
  if (paquete) return Number(paquete[1]) * contenido(paquete[2], porMetro);
  const rollo = /^rollo (\d+) m$/.exec(texto);
  if (rollo) return Number(rollo[1]) * porMetro;
  const unidades = /^(\d+) un$/.exec(texto);
  if (unidades) return Number(unidades[1]);
  const medida = /^(\d+(?:,\d+)?) (g|kg|ml|L)$/.exec(texto);
  if (!medida) return 1;
  const valor = Number(medida[1].replace(",", "."));
  return medida[2] === "g" || medida[2] === "ml" ? valor / 1000 : valor;
}

const SERVICIOS = [
  "Servicio de transporte urbano",
  "Recargo por entrega express",
  "Alquiler de estibas plásticas",
  "Servicio de empaque especial",
  "Gestión de devoluciones",
  "Recargo por descarga manual",
  "Servicio de refrigeración en tránsito",
  "Asesoría de surtido en punto",
];

function construirProductos(az: Azar): Producto[] {
  const productos: Producto[] = [];

  // Los dos SKU protagonistas van a mano: sus costos son los que sostienen las
  // cifras de S4 (referencia 88.500) y S5 (80 bultos × 115.000 = 9.200.000).
  productos.push({
    sku: "ACE-1000",
    nombre: "Aceite vegetal 20 L",
    categoria: "Aceites y grasas",
    costo: 88_500,
    precio: 112_400,
    inventariable: true,
    proveedores: ["PRV-008", "PRV-002", "PRV-019"],
    activo: true,
    altaMargen: false,
  });
  productos.push({
    sku: "ARR-500",
    nombre: "Arroz blanco 25 kg",
    categoria: "Granos y cereales",
    costo: 115_000,
    precio: 143_800,
    inventariable: true,
    proveedores: ["PRV-003", "PRV-053"],
    activo: true,
    altaMargen: false,
  });
  productos.push({
    sku: CASOS.skuRecompra,
    nombre: "Detergente en polvo 15 kg",
    categoria: "Aseo y limpieza",
    costo: 121_500,
    precio: 165_200,
    inventariable: true,
    proveedores: ["PRV-029"],
    activo: false,
    altaMargen: false,
  });

  const usados = new Set(productos.map((p) => p.sku));
  const restantes = 400 - SERVICIOS.length - productos.length;
  const porFamilia = FAMILIAS.map((_, i) => Math.floor(restantes / FAMILIAS.length) + (i < restantes % FAMILIAS.length ? 1 : 0));

  FAMILIAS.forEach((fam, f) => {
    for (let i = 0; i < porFamilia[f]; i++) {
      const sku = `${fam.prefijo}-${100 + i * 7}`;
      if (usados.has(sku)) continue;
      usados.add(sku);
      const b = i % fam.bases.length;
      const [base, unitario, presentaciones] = fam.bases[b];
      const pres = presentaciones[Math.floor(i / fam.bases.length) % presentaciones.length];
      // Un punto de dispersión por marca: dos referencias de la misma base no
      // cuestan lo mismo al peso, pero tampoco se van a otro orden de magnitud.
      const costo = Math.max(900, aCien(unitario * (0.94 + az.real() * 0.14) * contenido(pres, fam.porMetro)));
      const altaMargen = (fam.prefijo === "ASE" || fam.prefijo === "DES") && az.quizas(0.55);
      const margen = altaMargen ? 0.45 + az.real() * 0.04 : 0.22 + az.real() * 0.14;
      productos.push({
        sku,
        nombre: `${base} ${pres}`,
        categoria: fam.categoria,
        costo,
        precio: Math.max(aCien(costo * (1 + margen)), costo + 300),
        inventariable: true,
        proveedores: [],
        activo: false,
        altaMargen,
      });
    }
  });

  for (let i = 0; i < SERVICIOS.length; i++) {
    productos.push({
      sku: `SER-${100 + i * 5}`,
      nombre: SERVICIOS[i],
      categoria: "Servicios logísticos",
      costo: aCien(18_000 + az.real() * 90_000),
      precio: 0,
      inventariable: false,
      proveedores: [],
      activo: false,
      altaMargen: false,
    });
  }
  for (const p of productos) if (!p.inventariable) p.precio = aCien(p.costo * 1.32);

  // Un proveedor principal y hasta dos alternativos por referencia: sin varios
  // proveedores del mismo SKU, R21 y R30 no tendrían con qué comparar.
  const conCatalogo = productos.filter((p) => p.proveedores.length === 0 && p.inventariable);
  for (let i = 0; i < conCatalogo.length; i++) {
    const p = conCatalogo[i];
    const principal = 1 + ((i * 7) % 53);
    const segundo = 1 + ((i * 11 + 17) % 53);
    const tercero = 1 + ((i * 23 + 5) % 53);
    const ids = [principal, segundo, tercero]
      .slice(0, az.quizas(0.45) ? 3 : 2)
      .map((n) => `PRV-${String(n).padStart(3, "0")}`);
    p.proveedores = [...new Set(ids)];
  }
  for (const p of productos) {
    if (!p.inventariable) p.proveedores = ["PRV-057"];
  }

  // 180 referencias mueven el negocio; el resto es cola larga que se compra una
  // sola vez. Esa asimetría es la que evita que R25 salte donde no toca.
  const inventariables = productos.filter((p) => p.inventariable && p.sku !== CASOS.skuRecompra);
  for (const p of az.baraja(inventariables).slice(0, 180)) p.activo = true;
  productos.find((p) => p.sku === "ACE-1000")!.activo = true;
  productos.find((p) => p.sku === "ARR-500")!.activo = true;

  return productos;
}

/* ─────────────────────────────  Terceros  ───────────────────────────── */

type Sin<T> = Omit<T, "origen">;
type Doc = Sin<Documento>;
type Linea = Sin<LineaDocumento>;

/** Los tres NIT que no pasan el dígito de verificación y el que llegó vacío (S15). */
const NIT_ROTOS = new Set(["PRV-042", "CLI-017", "CLI-033"]);
const NIT_AUSENTE = "CLI-041";

function direccion(az: Azar): string {
  return `${az.elige(VIAS)} ${az.entero(1, 98)}${az.quizas(0.25) ? "A" : ""} # ${az.entero(1, 99)} - ${az.entero(10, 99)}, ${az.elige(BARRIOS)}, Medellín`;
}

const telefonoFijo = (az: Azar) => `604 ${az.entero(200, 899)} ${az.entero(10, 99)} ${az.entero(10, 99)}`;
const telefonoCel = (az: Azar) => `3${az.entero(0, 2)}${az.entero(0, 9)} ${az.entero(200, 899)} ${az.entero(10, 99)} ${az.entero(10, 99)}`;
const cuenta = (az: Azar) => String(az.entero(1, 9)) + String(az.entero(10_000_000, 99_999_999)) + String(az.entero(0, 9));

function construirTerceros(az: Azar): { terceros: Sin<Tercero>[]; cambios: Sin<CambioTercero>[] } {
  const terceros: Sin<Tercero>[] = [];

  for (let i = 0; i < PROVEEDORES_NOMBRE.length; i++) {
    const id = `PRV-${String(i + 1).padStart(3, "0")}`;
    const base = String(800_000_000 + az.entero(1_000_000, 99_000_000));
    const dv = digitoVerificacion(base);
    terceros.push({
      id,
      tipo: "proveedor",
      nombre: PROVEEDORES_NOMBRE[i],
      // Un dígito equivocado es indistinguible a simple vista: por eso R10
      // existe y por eso estos tres van sembrados y no salen del azar.
      nit: formatearNit(base, NIT_ROTOS.has(id) ? (dv + 4) % 10 : dv),
      telefono: telefonoFijo(az),
      direccion: direccion(az),
      cuentaBancaria: cuenta(az),
      banco: az.elige(BANCOS),
      fechaCreacion: aISO(aDia("2016-06-01") + az.entero(0, 3_150)),
      usuarioCreacion: az.quizas(0.6) ? "mosorio" : null,
    });
  }

  for (let i = 0; i < CLIENTES_NOMBRE.length; i++) {
    const id = `CLI-${String(i + 1).padStart(3, "0")}`;
    const base = String(900_000_000 + az.entero(1_000_000, 99_000_000));
    const dv = digitoVerificacion(base);
    terceros.push({
      id,
      tipo: "cliente",
      nombre: CLIENTES_NOMBRE[i],
      nit: id === NIT_AUSENTE ? "" : formatearNit(base, NIT_ROTOS.has(id) ? (dv + 3) % 10 : dv),
      telefono: az.quizas(0.5) ? telefonoFijo(az) : telefonoCel(az),
      direccion: direccion(az),
      cuentaBancaria: cuenta(az),
      banco: az.elige(BANCOS),
      fechaCreacion: aISO(aDia("2017-02-01") + az.entero(0, 2_900)),
      usuarioCreacion: az.elige(["lramos", "dcastro", "kalzate"]),
    });
  }

  for (let i = 0; i < EMPLEADOS_NOMBRE.length; i++) {
    const id = `EMP-${String(i + 1).padStart(2, "0")}`;
    const base = String(az.entero(1_000_100_000, 1_099_999_999));
    terceros.push({
      id,
      tipo: "empleado",
      nombre: EMPLEADOS_NOMBRE[i],
      nit: formatearNit(base),
      telefono: telefonoCel(az),
      direccion: direccion(az),
      cuentaBancaria: cuenta(az),
      banco: "Bancolombia",
      fechaCreacion: aISO(aDia("2018-01-15") + az.entero(0, 2_400)),
      usuarioCreacion: "ncardona",
    });
  }

  const buscar = (id: string) => terceros.find((t) => t.id === id)!;

  // S1: el proveedor exprés. Creado el 6 de noviembre y facturando el 7, con la
  // cuenta de la empleada de compras. Las señales caen todas sobre el mismo
  // ente, que es lo que convierte cinco hallazgos sueltos en un caso.
  const fantasma = buscar(CASOS.proveedorFantasma);
  fantasma.fechaCreacion = "2025-11-06";
  fantasma.usuarioCreacion = "mosorio";
  fantasma.cuentaBancaria = CASOS.cuentaCompartida;
  fantasma.banco = "Bancolombia";
  fantasma.direccion = "Calle 44 # 72 - 18, Laureles, Medellín";
  fantasma.telefono = "310 486 22 07";
  const marcela = buscar(CASOS.empleadaCompras);
  marcela.cuentaBancaria = CASOS.cuentaCompartida;
  marcela.banco = "Bancolombia";

  // Nadie más puede compartir cuenta, o R08 devolvería parejas sin significado.
  const vistas = new Set<string>();
  for (const t of terceros) {
    if (t.id === CASOS.proveedorFantasma || t.id === CASOS.empleadaCompras) continue;
    while (vistas.has(t.cuentaBancaria) || t.cuentaBancaria === CASOS.cuentaCompartida) t.cuentaBancaria = cuenta(az);
    vistas.add(t.cuentaBancaria);
  }

  /* Los cambios del maestro. Solo uno de cuenta bancaria toca a un proveedor al
     que después se le paga (S8): cualquier otro dispararía R07 de verdad. */
  const cambios: Sin<CambioTercero>[] = [];
  const empuja = (
    terceroId: string,
    campo: CambioTercero["campo"],
    anterior: string,
    nuevo: string,
    dia: number,
    usuario: string,
  ) => cambios.push({ terceroId, campo, valorAnterior: anterior, valorNuevo: nuevo, fecha: aISO(dia), usuario });

  const valle = buscar(CASOS.cambioCuenta);
  const cuentaVieja = valle.cuentaBancaria;
  valle.cuentaBancaria = "8801234455";
  empuja(CASOS.cambioCuenta, "cuenta_bancaria", cuentaVieja, valle.cuentaBancaria, aDia("2026-06-08"), "mosorio");

  for (let i = 0; i < 14; i++) {
    const t = buscar(`PRV-${String(3 + i * 3).padStart(3, "0")}`);
    const dia = habilDesde(DIA_INICIO + az.entero(10, 520));
    if (az.quizas(0.5)) empuja(t.id, "telefono", telefonoFijo(az), t.telefono, dia, "mosorio");
    else empuja(t.id, "direccion", direccion(az), t.direccion, dia, az.elige(["mosorio", "ncardona"]));
  }
  for (let i = 0; i < 15; i++) {
    const t = buscar(`CLI-${String(2 + i * 3).padStart(3, "0")}`);
    const dia = habilDesde(DIA_INICIO + az.entero(10, 520));
    const campo: CambioTercero["campo"] = az.quizas(0.4) ? "cuenta_bancaria" : az.quizas(0.5) ? "telefono" : "direccion";
    const anterior = campo === "cuenta_bancaria" ? cuenta(az) : campo === "telefono" ? telefonoCel(az) : direccion(az);
    const nuevo = campo === "cuenta_bancaria" ? t.cuentaBancaria : campo === "telefono" ? t.telefono : t.direccion;
    empuja(t.id, campo, anterior, nuevo, dia, az.elige(["jvargas", "lramos", "ncardona"]));
  }
  for (let i = 0; i < 10; i++) {
    const t = buscar(`EMP-${String(1 + i).padStart(2, "0")}`);
    const dia = habilDesde(DIA_INICIO + az.entero(10, 520));
    const campo: CambioTercero["campo"] = az.quizas(0.5) ? "telefono" : "direccion";
    empuja(t.id, campo, campo === "telefono" ? telefonoCel(az) : direccion(az), campo === "telefono" ? t.telefono : t.direccion, dia, "ncardona");
  }
  cambios.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.terceroId < b.terceroId ? -1 : 1));

  return { terceros, cambios };
}

/* ─────────────────────────────  Series y horarios  ───────────────────────── */

function crearSerie(prefijo: string) {
  let n = 0;
  return (dia: number) => {
    n += 1;
    return { numero: `${prefijo}-${anioDe(dia)}-${String(n).padStart(4, "0")}`, consecutivo: n };
  };
}

/** Hora normal de tecleo: día hábil y jornada. Lo que R42 considera aburrido. */
const registroNormal = (az: Azar, dia: number) => marca(habilDesde(dia), az.entero(8, 17), az.entero(0, 59));

const PROVEEDORES_OPERATIVOS = ["PRV-054", "PRV-055", "PRV-056", "PRV-057", "PRV-058", "PRV-059", "PRV-060"];

/* ─────────────────────────────  Ventas  ───────────────────────────── */

const FV_POR_MES = [55, 55, 56, 54, 57, 55, 58, 56, 57, 57, 74, 75, 75, 76, 75, 75, 75, 75];
const RC_POR_MES = [14, 15, 16, 17, 17, 18, 18, 18, 18, 19, 29, 30, 31, 32, 32, 32, 32, 32];
/** Estacionalidad real de un distribuidor de alimentos: diciembre manda, enero cae. */
const ESTACION = [1.0, 1.02, 0.98, 1.03, 1.0, 1.01, 1.04, 1.06, 1.14, 1.2, 0.86, 0.95, 1.0, 1.02, 1.0, 1.03, 1.05, 1.04];

/** Márgenes de las 23 facturas de S11; las seis primeras venden por debajo del costo. */
const MARGENES_S11 = [
  -0.08, -0.06, -0.05, -0.04, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.105,
  0.095, 0.085, 0.075, 0.065, 0.055,
];
const OBJETIVO_S11 = 9_100_000;
const OBJETIVO_S12 = 7_400_000;
const OBJETIVO_FACTURACION = 4_210_000_000;
const VALORES_S16 = [520_000, 610_000, 480_000, 640_000, 570_000, 560_000, 520_000];
const CREDITOS_S17: [number, number][] = [
  [96, 7_400_000],
  [90, 6_150_000],
  [84, 5_820_000],
  [72, 4_960_000],
  [60, 5_310_000],
];

type Sembrada = { mes: number; filas: Linea[]; vendedor: string; dias: number; marca: "s11" | "s12" | "s16" | "s17" };

type Ventas = {
  fvs: Doc[];
  lineas: Map<string, Linea[]>;
  ventasPorSku: Map<string, number[]>;
  sinSalida: Set<string>;
  marcados: Record<"s11" | "s12" | "s16" | "s17", string[]>;
  sacrificado: { s11: number; s12: number };
};

/**
 * Las facturas sembradas se construyen ANTES que las orgánicas porque su
 * importe hay que descontarlo del objetivo del mes: si se calcularan al vuelo,
 * la facturación total se saldría del rango que el guion promete en pantalla.
 */
function sembrarVentas(az: Azar, productos: Producto[], precioMes: (p: Producto, m: number) => number): Sembrada[] {
  const caros = productos.filter((p) => p.activo && p.costo > 60_000);
  const altaMargen = productos.filter((p) => p.altaMargen);
  const activos = productos.filter((p) => p.activo);
  const fuera: Sembrada[] = [];

  // S11 · veintitrés facturas por debajo del 12 % de margen, seis a pérdida.
  // El precio de lista es el que baja; el costo se queda donde está.
  const pesos11 = MARGENES_S11.map((m) => 0.12 - m);
  const total11 = suma(pesos11);
  let deuda11 = 0;
  MARGENES_S11.forEach((margen, i) => {
    const item = caros[(i * 5 + 3) % caros.length];
    const precio = aCien(item.costo / (1 - margen));
    const sacrificioUnidad = 0.12 * precio - (precio - item.costo);
    const objetivo = (OBJETIVO_S11 * pesos11[i]) / total11 + deuda11;
    const cant = Math.max(6, Math.round(objetivo / sacrificioUnidad));
    deuda11 = objetivo - cant * sacrificioUnidad;
    fuera.push({
      mes: 2 + (i % 16),
      vendedor: az.elige(["lramos", "dcastro", "kalzate"]),
      dias: 30,
      marca: "s11",
      filas: [
        {
          documentoId: "",
          sku: item.sku,
          descripcion: item.nombre,
          cantidad: cant,
          precioUnitario: precio,
          costoUnitario: item.costo,
          descuentoPct: 0,
          total: cant * precio,
        },
      ],
    });
  });

  // S12 · lramos regala entre el 14 % y el 22 % donde la política dice 8 %.
  // Van sobre referencias de alto margen: el descuento se sale de política sin
  // que la factura pierda dinero, o S11 y S12 se pisarían.
  let deuda12 = 0;
  for (let i = 0; i < 31; i++) {
    const desc = 14 + (i % 5) * 2;
    const item = altaMargen[(i * 3 + 1) % altaMargen.length];
    const mes = i % 18;
    const precio = precioMes(item, mes);
    const exceso = (desc - POLITICAS.descuentoMaximoPct) / 100;
    const objetivo = OBJETIVO_S12 / 31 + deuda12;
    const cant = Math.max(6, Math.round(objetivo / (precio * exceso)));
    deuda12 = objetivo - cant * precio * exceso;
    fuera.push({
      mes,
      vendedor: "lramos",
      dias: 30,
      marca: "s12",
      filas: [
        {
          documentoId: "",
          sku: item.sku,
          descripcion: item.nombre,
          cantidad: cant,
          precioUnitario: precio,
          costoUnitario: item.costo,
          descuentoPct: desc,
          total: Math.round(cant * precio * (1 - desc / 100)),
        },
      ],
    });
  }

  // S16 · siete ventas de referencia inventariable que nunca salieron de bodega.
  VALORES_S16.forEach((valor, i) => {
    const mes = 4 + i * 2;
    const item = activos[(i * 17 + 9) % activos.length];
    const precio = precioMes(item, mes);
    const cant = Math.max(1, Math.round(valor / precio));
    fuera.push({
      mes,
      vendedor: az.elige(["dcastro", "kalzate"]),
      dias: 15,
      marca: "s16",
      filas: [
        {
          documentoId: "",
          sku: item.sku,
          descripcion: item.nombre,
          cantidad: cant,
          precioUnitario: precio,
          costoUnitario: item.costo,
          descuentoPct: 0,
          total: cant * precio,
        },
      ],
    });
  });

  // S17 · cinco clientes con hasta 96 días de plazo y ningún recibo detrás.
  CREDITOS_S17.forEach(([dias, valor], i) => {
    const mes = 11 + i;
    const item = activos[(i * 29 + 4) % activos.length];
    const precio = precioMes(item, mes);
    const cant = Math.max(1, Math.round(valor / precio));
    fuera.push({
      mes,
      vendedor: az.elige(["lramos", "dcastro", "kalzate"]),
      dias,
      marca: "s17",
      filas: [
        {
          documentoId: "",
          sku: item.sku,
          descripcion: item.nombre,
          cantidad: cant,
          precioUnitario: precio,
          costoUnitario: item.costo,
          descuentoPct: 0,
          total: cant * precio,
        },
      ],
    });
  });

  return fuera;
}

function construirVentas(az: Azar, productos: Producto[], precioMes: (p: Producto, m: number) => number): Ventas {
  const activos = productos.filter((p) => p.activo);
  const servicios = productos.filter((p) => !p.inventariable);
  const aceite = productos.find((p) => p.sku === CASOS.skuSobrecosto)!;
  const clientes = CLIENTES_NOMBRE.map((_, i) => `CLI-${String(i + 1).padStart(3, "0")}`);

  const sembradas = sembrarVentas(az, productos, precioMes);
  const porMes: Sembrada[][] = MESES.map(() => []);
  for (const s of sembradas) porMes[s.mes].push(s);

  const pesoMes = MESES.map((_, m) => FV_POR_MES[m] * ESTACION[m]);
  const pesoTotal = suma(pesoMes);
  const sembradoTotal = suma(sembradas.map((s) => suma(s.filas.map((f) => f.total))));
  const objetivoOrganico = OBJETIVO_FACTURACION - sembradoTotal;

  const serieFV = crearSerie("FV");
  const fvs: Doc[] = [];
  const lineas = new Map<string, Linea[]>();
  const ventasPorSku = new Map<string, number[]>();
  const sinSalida = new Set<string>();
  const marcados: Record<"s11" | "s12" | "s16" | "s17", string[]> = { s11: [], s12: [], s16: [], s17: [] };
  let deuda = 0;

  const anotaVenta = (sku: string, dia: number) => {
    const lista = ventasPorSku.get(sku);
    if (lista) lista.push(dia);
    else ventasPorSku.set(sku, [dia]);
  };

  for (let m = 0; m < MESES.length; m++) {
    const mes = MESES[m];
    const propias = porMes[m];
    const organicas = FV_POR_MES[m] - propias.length;
    const objetivoMes = (objetivoOrganico * pesoMes[m]) / pesoTotal;

    const lista: (Sembrada | null)[] = [...propias];
    for (let i = 0; i < organicas; i++) lista.push(null);
    const orden = az.baraja(lista);
    const dias = lista.map(() => mes.habiles[az.entero(0, mes.habiles.length - 1)]).sort((a, b) => a - b);

    for (let i = 0; i < orden.length; i++) {
      const sem = orden[i];
      const dia = dias[i];
      const { numero, consecutivo } = serieFV(dia);
      let filas: Linea[];
      let vendedor: string;
      let diasCredito: number;

      if (sem) {
        filas = sem.filas.map((f) => ({ ...f, documentoId: numero }));
        vendedor = sem.vendedor;
        diasCredito = sem.dias;
        marcados[sem.marca].push(numero);
        if (sem.marca === "s16") sinSalida.add(numero);
        else for (const f of filas) anotaVenta(f.sku, dia);
      } else {
        const objetivo = Math.max(350_000, (objetivoMes / organicas) * escala(az, 0.34) + deuda);
        const n = az.entero(2, 5);
        filas = [];
        // El aceite de 20 L es la referencia estrella y se compra por camiones:
        // si no se vendiera casi a diario, cada compra parecería una recompra
        // anómala y R25 devolvería un montón de ruido en vez de las cuatro de S13.
        const conAceite = i % 3 === 1;
        for (let k = 0; k < n; k++) {
          const item = conAceite && k === 0 ? aceite : az.quizas(0.06) ? az.elige(servicios) : az.elige(activos);
          const desc = az.quizas(0.3) ? az.entero(2, 6) : 0;
          const precio = precioMes(item, m);
          const neto = precio * (1 - desc / 100);
          const cant = Math.max(1, Math.round(objetivo / n / neto));
          filas.push({
            documentoId: numero,
            sku: item.sku,
            descripcion: item.nombre,
            cantidad: cant,
            precioUnitario: precio,
            costoUnitario: item.costo,
            descuentoPct: desc,
            total: Math.round(cant * neto),
          });
          if (item.inventariable) anotaVenta(item.sku, dia);
        }
        deuda = objetivo - suma(filas.map((f) => f.total));
        vendedor = az.elige(["lramos", "dcastro", "kalzate", "ncardona"]);
        diasCredito = az.elige([0, 15, 15, 30, 30, 30]);
      }

      lineas.set(numero, filas);
      fvs.push({
        id: numero,
        tipo: "factura_venta",
        numero,
        consecutivo,
        serie: "FV",
        terceroId: az.elige(clientes),
        fecha: aISO(dia),
        fechaRegistro: registroNormal(az, dia),
        usuarioRegistro: vendedor,
        montoTotal: suma(filas.map((f) => f.total)),
        estado: "vigente",
        ordenCompraId: null,
        entradaInventarioId: null,
        facturaAfectadaId: null,
        diasCredito,
      });
    }
  }

  /* Los huecos de S14: dos facturas de venta que no están. El consecutivo sigue
     corrido, y esa discontinuidad es todo lo que ve R06. */
  const huecosFV = new Set(["FV-2025-0412", "FV-2026-0903"]);
  const vivas = fvs.filter((d) => !huecosFV.has(d.numero));
  for (const n of huecosFV) {
    // Las ventas de una factura que ya no existe no cuentan como rotación: si
    // se quedaran anotadas, R25 vería un movimiento que el Excel no contiene.
    const dia = aDia(fvs.find((d) => d.numero === n)!.fecha);
    for (const l of lineas.get(n) ?? []) {
      const dias = ventasPorSku.get(l.sku);
      const donde = dias?.indexOf(dia) ?? -1;
      if (dias && donde >= 0) dias.splice(donde, 1);
    }
    lineas.delete(n);
  }

  // Ocho anulaciones de importe pequeño: el ruido natural que R13 tiene que
  // saber separar de la concentración real de jvargas.
  for (const d of az.baraja(vivas.filter((d) => d.montoTotal < 3_000_000)).slice(0, 8)) d.estado = "anulado";

  const sacrificado = {
    s11: suma(
      marcados.s11.map((n) => {
        const f = lineas.get(n)!;
        return suma(f.map((x) => 0.12 * x.total - (x.total - x.cantidad * (x.costoUnitario ?? 0))));
      }),
    ),
    s12: suma(
      marcados.s12.map((n) => {
        const f = lineas.get(n)!;
        return suma(f.map((x) => (x.cantidad * x.precioUnitario * (x.descuentoPct - POLITICAS.descuentoMaximoPct)) / 100));
      }),
    ),
  };

  return { fvs: vivas, lineas, ventasPorSku, sinSalida, marcados, sacrificado };
}

/* ───────────────────────  Notas crédito, débito y recibos  ─────────────────── */

/** Las seis notas crédito de S6: borran cartera que llevaba meses vencida. */
const NOTAS_S6 = [1_850_000, 2_100_000, 1_640_000, 2_480_000, 2_230_000, 2_100_000];

type Cobros = { ncs: Doc[]; nds: Doc[]; rcs: Doc[]; lineas: Map<string, Linea[]>; notasViejas: string[] };

function construirCobros(az: Azar, ventas: Ventas): Cobros {
  const lineas = new Map<string, Linea[]>();
  const vivas = ventas.fvs.filter((d) => d.estado !== "anulado");
  const sinCobro = new Set<string>(ventas.marcados.s17);

  /* Recibos de caja. Se emiten con cupo fijo por mes para que el consecutivo
     llegue justo a donde tiene que estar el hueco de S14. Las cinco facturas de
     S17 quedan fuera del cupo a propósito: son la cartera que nadie persiguió. */
  const pendientes = [...vivas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let cursor = 0;
  const serieRC = crearSerie("RC");
  const rcs: Doc[] = [];
  for (let m = 0; m < MESES.length; m++) {
    const mes = MESES[m];
    const cierre = mes.habiles[mes.habiles.length - 1];
    const elegidas: Doc[] = [];
    while (elegidas.length < RC_POR_MES[m] && cursor < pendientes.length) {
      const fv = pendientes[cursor++];
      if (sinCobro.has(fv.numero)) continue;
      if (aDia(fv.fecha) + (fv.diasCredito ?? 30) > cierre) continue;
      elegidas.push(fv);
    }
    const dias = elegidas.map(() => mes.habiles[az.entero(0, mes.habiles.length - 1)]).sort((a, b) => a - b);
    elegidas.forEach((fv, i) => {
      const dia = dias[i];
      const { numero, consecutivo } = serieRC(dia);
      fv.estado = "pagado";
      rcs.push({
        id: numero,
        tipo: "recibo_caja",
        numero,
        consecutivo,
        serie: "RC",
        terceroId: fv.terceroId,
        fecha: aISO(dia),
        fechaRegistro: registroNormal(az, dia),
        usuarioRegistro: az.quizas(0.75) ? "jvargas" : "sgomez",
        montoTotal: fv.montoTotal,
        estado: "pagado",
        ordenCompraId: null,
        entradaInventarioId: null,
        facturaAfectadaId: fv.numero,
        diasCredito: null,
      });
    });
  }

  /* Notas crédito. Seis de jvargas borran facturas vencidas hace más de 90 días
     (S6); el resto son devoluciones normales, siempre dentro del mes siguiente,
     para que R12 no encuentre más que las sembradas. */
  const serieNC = crearSerie("NC");
  const notas: { fv: Doc; dia: number; monto: number; usuario: string; vieja: boolean }[] = [];
  const candidatasViejas = vivas.filter(
    (d) => aDia(d.fecha) + 170 <= DIA_FIN && aDia(d.fecha) >= DIA_INICIO + 30 && d.montoTotal > 2_600_000,
  );
  NOTAS_S6.forEach((monto, i) => {
    const fv = candidatasViejas[Math.floor(((i + 1) * candidatasViejas.length) / (NOTAS_S6.length + 1))];
    notas.push({ fv, dia: habilDesde(aDia(fv.fecha) + 150 + i * 3), monto, usuario: "jvargas", vieja: true });
  });
  const usadas = new Set(notas.map((n) => n.fv.numero));
  const restantes = az.baraja(vivas.filter((d) => !usadas.has(d.numero) && d.montoTotal > 900_000));
  for (let i = 0; i < 49; i++) {
    const fv = restantes[i];
    notas.push({
      fv,
      dia: habilDesde(aDia(fv.fecha) + az.entero(4, 26)),
      monto: aCien(fv.montoTotal * (0.05 + az.real() * 0.16)),
      usuario: i < 28 ? "jvargas" : az.elige(["lramos", "dcastro", "ncardona"]),
      vieja: false,
    });
  }
  notas.sort((a, b) => a.dia - b.dia || (a.fv.numero < b.fv.numero ? -1 : 1));

  const ncs: Doc[] = [];
  const notasViejas: string[] = [];
  for (const n of notas) {
    const { numero, consecutivo } = serieNC(n.dia);
    const base = ventas.lineas.get(n.fv.numero)![0];
    // La cantidad baja hasta el primer divisor: así la nota vale exactamente
    // lo que tiene que valer y S6 suma 12.400.000 clavados.
    let cant = Math.max(1, Math.round(n.monto / base.precioUnitario));
    while (cant > 1 && n.monto % cant !== 0) cant--;
    const precio = n.monto / cant;
    lineas.set(numero, [
      {
        documentoId: numero,
        sku: base.sku,
        descripcion: base.descripcion,
        cantidad: cant,
        precioUnitario: precio,
        costoUnitario: base.costoUnitario,
        descuentoPct: 0,
        total: cant * precio,
      },
    ]);
    if (n.vieja) notasViejas.push(numero);
    ncs.push({
      id: numero,
      tipo: "nota_credito",
      numero,
      consecutivo,
      serie: "NC",
      terceroId: n.fv.terceroId,
      fecha: aISO(n.dia),
      fechaRegistro: registroNormal(az, n.dia),
      usuarioRegistro: n.usuario,
      montoTotal: cant * precio,
      estado: "vigente",
      ordenCompraId: null,
      entradaInventarioId: null,
      facturaAfectadaId: n.fv.numero,
      diasCredito: null,
    });
  }

  const serieND = crearSerie("ND");
  const nds: Doc[] = [];
  const conDia = az
    .baraja(vivas.filter((d) => d.montoTotal > 1_200_000))
    .slice(0, 12)
    .map((fv) => ({ fv, dia: habilDesde(aDia(fv.fecha) + az.entero(6, 40)) }))
    .sort((a, b) => a.dia - b.dia);
  for (const { fv, dia } of conDia) {
    const { numero, consecutivo } = serieND(dia);
    const monto = aCien(fv.montoTotal * (0.02 + az.real() * 0.05));
    lineas.set(numero, [
      {
        documentoId: numero,
        sku: "SER-105",
        descripcion: "Recargo por entrega express",
        cantidad: 1,
        precioUnitario: monto,
        costoUnitario: null,
        descuentoPct: 0,
        total: monto,
      },
    ]);
    nds.push({
      id: numero,
      tipo: "nota_debito",
      numero,
      consecutivo,
      serie: "ND",
      terceroId: fv.terceroId,
      fecha: aISO(dia),
      fechaRegistro: registroNormal(az, dia),
      usuarioRegistro: az.elige(["jvargas", "ncardona"]),
      montoTotal: monto,
      estado: "vigente",
      ordenCompraId: null,
      entradaInventarioId: null,
      facturaAfectadaId: fv.numero,
      diasCredito: null,
    });
  }

  // S14 · los cinco recibos que faltan. Se numeraron y no están.
  const faltan = new Set<string>(CASOS.recibosFaltantes);
  return { ncs, nds, rcs: rcs.filter((r) => !faltan.has(r.numero)), lineas, notasViejas };
}

/* ─────────────────────────────  Compras  ───────────────────────────── */

const FC_POR_MES = [28, 29, 30, 30, 31, 30, 32, 30, 30, 30, 38, 39, 40, 41, 41, 41, 40, 40];
const OBJETIVO_COMPRAS = 2_895_000_000;

/** Ocho proveedores concentran el grueso del gasto. Sin esa cola larga, R43 no
    tendría historial suficiente para decir que un importe es atípico. */
const GRANDES = ["PRV-001", "PRV-005", "PRV-011", "PRV-014", "PRV-021", "PRV-025", "PRV-035", "PRV-044"];

/** S1 · las siete facturas del proveedor exprés: 485 unidades a 40.000 = 19.400.000. */
const CANTIDADES_S1 = [54, 62, 72, 78, 69, 76, 74];
const FECHAS_S1 = ["2025-11-07", "2025-12-18", "2026-02-11", "2026-03-24", "2026-05-06", "2026-06-17", "2026-07-22"];
const NOCHE_S1 = [true, false, true, false, true, false, true];

/** S4 · el sobrecosto progresivo del aceite: +34 % de marzo a julio de 2026. */
const PRECIOS_S4: [string, number, number[]][] = [
  ["2026-03", 86_000, [69, 66, 65]],
  ["2026-04", 92_500, [104, 99, 97]],
  ["2026-05", 99_800, [156, 149, 145]],
  ["2026-06", 107_200, [242, 235, 223]],
  ["2026-07", 115_240, [285, 273, 262]],
];
/** Los otros dos proveedores del mismo aceite, quietos alrededor de 88.500. */
const REFERENCIA_S4: [string, string, number, number][] = [
  ["PRV-002", "2026-03", 88_200, 140],
  ["PRV-019", "2026-04", 87_900, 160],
  ["PRV-002", "2026-05", 88_600, 150],
  ["PRV-019", "2026-06", 89_200, 170],
  ["PRV-002", "2026-07", 88_400, 155],
  ["PRV-019", "2026-07", 88_900, 165],
];
const REFERENCIA_ACEITE = 88_500;

/** S10 · once facturas que se pagaron sin que constara la entrada. */
const SIN_ENTRADA_S10 = [1_150_000, 1_380_000, 1_240_000, 1_460_000, 1_190_000, 1_320_000, 1_410_000, 1_270_000, 1_350_000, 1_230_000, 1_300_000];
/** S18/R43 · seis importes que se salen del histórico de su propio proveedor. */
const ATIPICOS_S18: [string, string, number][] = [
  ["PRV-001", "2025-07", 24_780_000],
  ["PRV-005", "2025-10", 26_340_000],
  ["PRV-011", "2026-01", 25_910_000],
  ["PRV-014", "2026-03", 27_460_000],
  ["PRV-025", "2026-05", 26_820_000],
  ["PRV-044", "2026-07", 25_370_000],
];
const RECOMPRAS_S13 = ["2025-09", "2025-12", "2026-02", "2026-04", "2026-07"];
const CANTIDADES_S13 = [14, 8, 11, 9, 12];
const DIA_ORDENES_S3 = "2026-04-16";

type Fija = {
  proveedor: string;
  sku: string;
  cantidad: number;
  precio: number;
  conOC: boolean;
  conEntrada: boolean;
  pagar: boolean;
  caso: string;
  /** Día impuesto por el contrato, o `null` si vale cualquiera del mes. */
  dia: number | null;
  /** Posición dentro del mes cuando el guion canta el consecutivo en voz alta. */
  rango?: number;
};
type EspecieFC = { clase: "normal" } | ({ clase: "fija" } & Fija);

type Compras = {
  ocs: Doc[];
  fcs: Doc[];
  ents: Doc[];
  pagos: Doc[];
  lineas: Map<string, Linea[]>;
  marcados: Record<string, string[]>;
  sobrecostoS4: number;
};

/**
 * Parte un importe cerrado en cantidad × precio unitario, buscando el divisor
 * que deje el precio más cerca del costo real de alguna referencia. Un importe
 * sembrado tiene que caer en una línea creíble: «1 unidad × 24.780.000» delata
 * al generador en cuanto alguien abre el Excel.
 */
function partirMonto(monto: number, candidatos: Producto[]): { item: Producto; cantidad: number; precio: number } {
  let mejor: { item: Producto; cantidad: number; precio: number; error: number } | null = null;
  for (let cant = 4; cant <= 900; cant++) {
    if (monto % cant !== 0) continue;
    const precio = monto / cant;
    for (const item of candidatos) {
      const error = Math.abs(precio - item.costo) / item.costo;
      if (!mejor || error < mejor.error) mejor = { item, cantidad: cant, precio, error };
    }
  }
  if (!mejor) return { item: candidatos[0], cantidad: 1, precio: monto };
  return { item: mejor.item, cantidad: mejor.cantidad, precio: mejor.precio };
}

function construirCompras(
  az: Azar,
  productos: Producto[],
  ventasPorSku: Map<string, number[]>,
  precioCompra: (p: Producto, prov: string, m: number) => number,
): Compras {
  const porSku = new Map(productos.map((p) => [p.sku, p]));
  const mesDeClave = new Map(MESES.map((x, i) => [x.clave, i]));
  const especiales = new Set<string>([CASOS.skuSobrecosto, CASOS.skuMerma, CASOS.skuRecompra]);

  const catalogo = new Map<string, Producto[]>();
  for (const p of productos) {
    if (!p.inventariable || especiales.has(p.sku)) continue;
    for (const prv of p.proveedores) {
      const lista = catalogo.get(prv);
      if (lista) lista.push(p);
      else catalogo.set(prv, [p]);
    }
  }
  const urna: string[] = [];
  for (const prv of [...catalogo.keys()].sort()) {
    if (prv === CASOS.proveedorFantasma || PROVEEDORES_OPERATIVOS.includes(prv)) continue;
    for (let k = 0; k < (GRANDES.includes(prv) ? 4 : 1); k++) urna.push(prv);
  }

  /* Los días de compra del aceite salen de sus propios días de venta: entre dos
     compras seguidas tiene que haber vendido algo, o R25 marcaría como recompra
     anómala lo que solo es rotación alta. */
  const ventasAceite = [...(ventasPorSku.get(CASOS.skuSobrecosto) ?? [])].sort((a, b) => a - b);
  let ultimoAceite = DIA_INICIO - 1;
  const diaSeguroAceite = (clave: string) => {
    const d = ventasAceite.find((x) => x > ultimoAceite && aISO(x).slice(0, 7) === clave);
    ultimoAceite = d ?? ultimoAceite + 1;
    return ultimoAceite;
  };

  const usados = new Set<string>();
  const libres = () =>
    productos.filter((p) => p.inventariable && !especiales.has(p.sku) && !usados.has(p.sku) && p.costo > 12_000);
  const reservarPorCosto = (objetivo: number) => {
    const item = libres().reduce((a, b) => (Math.abs(a.costo - objetivo) <= Math.abs(b.costo - objetivo) ? a : b));
    usados.add(item.sku);
    return item;
  };
  const reservarPorMonto = (monto: number) => {
    const r = partirMonto(monto, libres());
    usados.add(r.item.sku);
    return r;
  };

  const especies: EspecieFC[][] = MESES.map(() => []);
  const mete = (clave: string, f: Fija) => especies[mesDeClave.get(clave)!].push({ clase: "fija", ...f });

  // S1 · siete referencias distintas a 40.000 la unidad: mismo proveedor, mismo
  // precio, sin orden de compra y cuatro tecleadas de madrugada.
  FECHAS_S1.forEach((fecha, i) => {
    const item = reservarPorCosto(40_000);
    mete(fecha.slice(0, 7), {
      proveedor: CASOS.proveedorFantasma,
      sku: item.sku,
      cantidad: CANTIDADES_S1[i],
      precio: 40_000,
      conOC: false,
      conEntrada: true,
      pagar: true,
      caso: NOCHE_S1[i] ? "s1-noche" : "s1",
      dia: aDia(fecha),
    });
  });

  // S3 · seis órdenes de 4.800.000 el mismo día, justo debajo de los 5.000.000
  // que exigirían una firma. Seis referencias distintas para que la compra
  // fraccionada no se confunda con una recompra.
  for (let i = 0; i < 6; i++) {
    const item = reservarPorCosto(80_000);
    mete("2026-04", {
      proveedor: CASOS.fraccionada,
      sku: item.sku,
      cantidad: 60,
      precio: 80_000,
      conOC: true,
      conEntrada: true,
      // Sin pagar: seis pagos idénticos al mismo proveedor serían un duplicado
      // que el contrato no pide, y el caso vive en las órdenes, no en el dinero.
      pagar: false,
      caso: "s3",
      dia: aDia("2026-04-20"),
    });
  }

  for (const [clave, precio, cantidades] of PRECIOS_S4) {
    for (const cant of cantidades) {
      mete(clave, { proveedor: CASOS.sobrecosto, sku: CASOS.skuSobrecosto, cantidad: cant, precio, conOC: true, conEntrada: true, pagar: true, caso: "s4", dia: null });
    }
  }
  for (const [prov, clave, precio, cant] of REFERENCIA_S4) {
    mete(clave, { proveedor: prov, sku: CASOS.skuSobrecosto, cantidad: cant, precio, conOC: true, conEntrada: true, pagar: true, caso: "s4-ref", dia: null });
  }

  {
    const r = reservarPorMonto(8_400_000);
    mete("2026-05", { proveedor: CASOS.cambioCuenta, sku: r.item.sku, cantidad: r.cantidad, precio: r.precio, conOC: true, conEntrada: true, pagar: false, caso: "s8", dia: null });
  }
  SIN_ENTRADA_S10.forEach((monto, i) => {
    const r = reservarPorMonto(monto);
    mete(MESES[3 + i].clave, {
      proveedor: `PRV-${String(6 + i * 3).padStart(3, "0")}`,
      sku: r.item.sku,
      cantidad: r.cantidad,
      precio: r.precio,
      conOC: true,
      conEntrada: false,
      pagar: true,
      caso: "s10",
      dia: null,
    });
  });
  RECOMPRAS_S13.forEach((clave, i) => {
    mete(clave, {
      proveedor: "PRV-029",
      sku: CASOS.skuRecompra,
      cantidad: CANTIDADES_S13[i],
      precio: 122_500,
      conOC: true,
      conEntrada: true,
      pagar: true,
      caso: i === 0 ? "s13-base" : "s13",
      dia: null,
    });
  });
  for (const [prov, clave, monto] of ATIPICOS_S18) {
    const r = reservarPorMonto(monto);
    mete(clave, { proveedor: prov, sku: r.item.sku, cantidad: r.cantidad, precio: r.precio, conOC: true, conEntrada: true, pagar: false, caso: "s18-z", dia: null });
  }
  {
    const r = reservarPorMonto(3_200_000);
    mete("2026-01", { proveedor: CASOS.pagoDuplicado, sku: r.item.sku, cantidad: r.cantidad, precio: r.precio, conOC: true, conEntrada: true, pagar: false, caso: "s2", dia: null, rango: 31 });
    const a = reservarPorMonto(1_850_000);
    mete("2026-04", { proveedor: "PRV-017", sku: a.item.sku, cantidad: a.cantidad, precio: a.precio, conOC: true, conEntrada: true, pagar: false, caso: "s7", dia: null, rango: 38 });
    const b = reservarPorMonto(1_850_000);
    mete("2026-05", { proveedor: "PRV-017", sku: b.item.sku, cantidad: b.cantidad, precio: b.precio, conOC: true, conEntrada: true, pagar: false, caso: "s7", dia: null, rango: 3 });
  }

  const sembradoTotal = suma(especies.flat().map((e) => (e.clase === "fija" ? e.cantidad * e.precio : 0)));
  const pesoMes = MESES.map((_, m) => FC_POR_MES[m] * ESTACION[m]);
  const pesoTotal = suma(pesoMes);
  const objetivoOrganico = OBJETIVO_COMPRAS - sembradoTotal;

  const ultimaCompra = new Map<string, number>();
  const huboVenta = (sku: string, desde: number, hasta: number) =>
    (ventasPorSku.get(sku) ?? []).some((d) => d > desde && d <= hasta);
  const puedeComprar = (sku: string, dia: number) => {
    const previa = ultimaCompra.get(sku);
    return previa === undefined || huboVenta(sku, previa, dia);
  };

  const serieFC = crearSerie("FC");
  const fcs: Doc[] = [];
  const lineas = new Map<string, Linea[]>();
  const marcados: Record<string, string[]> = {};
  const anota = (caso: string, numero: string) => (marcados[caso] ??= []).push(numero);
  const sinEntrada = new Set<string>();
  const sinOrden = new Set<string>();
  const ocupadoFC = new Set<string>();
  const paraPagar = new Set<string>();
  let deuda = 0;

  for (let m = 0; m < MESES.length; m++) {
    const mes = MESES[m];
    const propias = especies[m];
    const organicas = FC_POR_MES[m] - propias.length;
    const objetivoMes = (objetivoOrganico * pesoMes[m]) / pesoTotal;

    const lista: EspecieFC[] = [...propias];
    for (let i = 0; i < organicas; i++) lista.push({ clase: "normal" });
    const orden = az.baraja(lista);
    // Las tres facturas con número cantado se colocan en su posición exacta; la
    // que estaba ahí se va al hueco que dejan.
    for (const e of propias) {
      if (e.clase !== "fija" || !e.rango) continue;
      const pos = orden.indexOf(e);
      const destino = e.rango - 1;
      [orden[destino], orden[pos]] = [orden[pos], orden[destino]];
    }
    /* Los días sueltos van ordenados: el consecutivo de un ERP sube con la
       fecha. Las facturas con día impuesto por el contrato se quedan donde
       están y son la única excepción. */
    const sueltos = orden.filter((e) => e.clase === "normal").map(() => mes.habiles[az.entero(0, mes.habiles.length - 1)]).sort((a, b) => a - b);
    let cursorDia = 0;
    const dias = orden.map((e) =>
      e.clase === "fija" && e.dia !== null
        ? e.dia
        : e.clase === "fija" && e.sku === CASOS.skuSobrecosto
          ? diaSeguroAceite(mes.clave)
          : e.clase === "fija"
            ? mes.habiles[az.entero(0, mes.habiles.length - 1)]
            : sueltos[cursorDia++],
    );

    for (let i = 0; i < orden.length; i++) {
      const esp = orden[i];
      const dia = dias[i];
      let filas: Linea[];
      let proveedor: string;
      let caso = "";

      if (esp.clase === "fija") {
        const item = porSku.get(esp.sku)!;
        proveedor = esp.proveedor;
        caso = esp.caso;
        filas = [
          {
            documentoId: "",
            sku: item.sku,
            descripcion: item.nombre,
            cantidad: esp.cantidad,
            precioUnitario: esp.precio,
            costoUnitario: esp.precio,
            descuentoPct: 0,
            total: esp.cantidad * esp.precio,
          },
        ];
      } else {
        let elegidos: Producto[] = [];
        proveedor = urna[az.entero(0, urna.length - 1)];
        for (let intento = 0; intento < 30 && elegidos.length === 0; intento++) {
          proveedor = urna[az.entero(0, urna.length - 1)];
          if (ocupadoFC.has(`${proveedor}|${dia}`)) continue;
          // Las referencias reservadas por un caso sembrado no vuelven a la
          // rueda: una compra orgánica de la misma referencia rompería la
          // rotación que R25 exige entre dos compras seguidas.
          const posibles = (catalogo.get(proveedor) ?? []).filter((p) => !usados.has(p.sku) && puedeComprar(p.sku, dia));
          elegidos = az.baraja(posibles).slice(0, Math.min(posibles.length, az.entero(3, 7)));
        }
        if (elegidos.length === 0) {
          // Última red: una referencia de cola larga que nadie ha comprado aún.
          const virgen = productos.filter((p) => p.inventariable && !especiales.has(p.sku) && !usados.has(p.sku) && !ultimaCompra.has(p.sku));
          if (virgen.length === 0) continue;
          elegidos = [virgen[az.entero(0, virgen.length - 1)]];
        }
        const objetivo = Math.max(600_000, (objetivoMes / organicas) * escala(az, 0.5) + deuda);
        const n = elegidos.length;
        filas = elegidos.map((item) => {
          const precio = precioCompra(item, proveedor, m);
          const cant = Math.max(1, Math.round(objetivo / n / precio));
          return {
            documentoId: "",
            sku: item.sku,
            descripcion: item.nombre,
            cantidad: cant,
            precioUnitario: precio,
            costoUnitario: precio,
            descuentoPct: 0,
            total: cant * precio,
          };
        });
        deuda = objetivo - suma(filas.map((f) => f.total));
      }

      const { numero, consecutivo } = serieFC(dia);
      for (const f of filas) {
        f.documentoId = numero;
        ultimaCompra.set(f.sku, dia);
      }
      lineas.set(numero, filas);
      if (caso) anota(caso, numero);
      const doc: Doc = {
        id: numero,
        tipo: "factura_compra",
        numero,
        consecutivo,
        serie: "FC",
        terceroId: proveedor,
        fecha: aISO(dia),
        fechaRegistro: caso === "s1-noche" ? marca(dia, az.elige([22, 23, 1, 3]), az.entero(0, 59)) : registroNormal(az, dia),
        usuarioRegistro: caso.startsWith("s1") ? "mosorio" : az.quizas(0.62) ? "mosorio" : "ncardona",
        montoTotal: suma(filas.map((f) => f.total)),
        estado: "vigente",
        ordenCompraId: null,
        entradaInventarioId: null,
        facturaAfectadaId: null,
        diasCredito: null,
      };
      fcs.push(doc);
      ocupadoFC.add(`${proveedor}|${dia}`);
      if (esp.clase === "fija") {
        if (!esp.conOC) sinOrden.add(numero);
        if (!esp.conEntrada) sinEntrada.add(numero);
        if (esp.pagar) paraPagar.add(numero);
      } else if (az.quizas(0.85)) {
        paraPagar.add(numero);
      }
    }
  }

  /* Dos facturas del mismo proveedor por el mismo importe exacto serían un falso
     positivo de R01. Las únicas que pueden existir son las gemelas de S7. */
  const sembradas = new Set(Object.values(marcados).flat());
  const vistos = new Map<string, Set<number>>();
  const registra = (fc: Doc) => {
    const clave = fc.terceroId ?? "";
    let ya = vistos.get(clave);
    if (!ya) vistos.set(clave, (ya = new Set()));
    return ya;
  };
  for (const fc of fcs) if (sembradas.has(fc.numero)) registra(fc).add(fc.montoTotal);
  for (const fc of fcs) {
    if (sembradas.has(fc.numero)) continue;
    const ya = registra(fc);
    while (ya.has(fc.montoTotal)) {
      const filas = lineas.get(fc.numero)!;
      const f = filas[filas.length - 1];
      f.cantidad += 1;
      f.total = f.cantidad * f.precioUnitario;
      fc.montoTotal = suma(filas.map((x) => x.total));
    }
    ya.add(fc.montoTotal);
  }

  /* ── Órdenes de compra, entradas y pagos, colgando de cada factura ── */

  const serieOC = crearSerie("OC");
  const serieENT = crearSerie("ENT");
  const seriePG = crearSerie("PAGO");
  const ocs: Doc[] = [];
  const ents: Doc[] = [];
  const pagos: Doc[] = [];

  const plantilla = (
    tipo: TipoDocumento,
    serie: string,
    numero: string,
    consecutivo: number,
    fc: Doc,
    dia: number,
    usuario: string,
    estado: EstadoDocumento,
  ): Doc => ({
    id: numero,
    tipo,
    numero,
    consecutivo,
    serie,
    terceroId: fc.terceroId,
    fecha: aISO(dia),
    fechaRegistro: registroNormal(az, dia),
    usuarioRegistro: usuario,
    montoTotal: fc.montoTotal,
    estado,
    ordenCompraId: null,
    entradaInventarioId: null,
    facturaAfectadaId: null,
    diasCredito: null,
  });

  const conOC = fcs.filter((d) => !sinOrden.has(d.numero));
  // Las seis de la compra fraccionada se firman el mismo día: es el caso.
  const ocFija = new Map<string, number>();
  for (const n of marcados["s3"] ?? []) ocFija.set(n, aDia(DIA_ORDENES_S3));
  const ocupadoOC = new Set<string>();
  conOC
    .map((fc) => {
      const impuesto = ocFija.get(fc.numero);
      if (impuesto !== undefined) return { fc, dia: impuesto };
      // Dos órdenes al mismo proveedor el mismo día son compra fraccionada, y la
      // única tanda así del período es la sembrada.
      let dia = Math.max(habilDesde(DIA_INICIO), habilDesde(aDia(fc.fecha) - az.entero(5, 15)));
      while (ocupadoOC.has(`${fc.terceroId}|${dia}`) && dia > DIA_INICIO) dia = habilAtras(dia - 1);
      ocupadoOC.add(`${fc.terceroId}|${dia}`);
      return { fc, dia };
    })
    .sort((a, b) => a.dia - b.dia || (a.fc.numero < b.fc.numero ? -1 : 1))
    .forEach(({ fc, dia }) => {
      const { numero, consecutivo } = serieOC(dia);
      const oc = plantilla("orden_compra", "OC", numero, consecutivo, fc, dia, fc.usuarioRegistro ?? "mosorio", "vigente");
      fc.ordenCompraId = numero;
      ocs.push(oc);
    });

  const conEnt = fcs.filter((d) => !sinEntrada.has(d.numero));
  [...conEnt]
    .map((fc) => ({ fc, dia: habilDesde(aDia(fc.fecha) + az.entero(0, 3)) }))
    .sort((a, b) => a.dia - b.dia)
    .forEach(({ fc, dia }) => {
      const { numero, consecutivo } = serieENT(dia);
      ents.push(plantilla("entrada_inventario", "ENT", numero, consecutivo, fc, dia, "abetancur", "vigente"));
      fc.entradaInventarioId = numero;
    });

  /* Los pagos. Los cuatro sembrados llevan fecha del contrato; el resto sale a
     los 25-45 días. Se numeran en orden cronológico, como en el ERP. */
  const fijos = new Map<string, number[]>();
  for (const n of marcados["s2"] ?? []) fijos.set(n, [aDia("2026-02-09"), aDia("2026-02-20")]);
  for (const n of marcados["s8"] ?? []) fijos.set(n, [aDia("2026-06-14")]);
  const s7 = marcados["s7"] ?? [];
  if (s7[0]) fijos.set(s7[0], [aDia("2026-06-02")]);
  if (s7[1]) fijos.set(s7[1], [aDia("2026-06-05")]);
  for (const n of marcados["s18-z"] ?? []) fijos.set(n, [habilDesde(aDia(fcs.find((d) => d.numero === n)!.fecha) + 30)]);

  const planPagos: { fc: Doc | null; tercero: string; monto: number; dia: number }[] = [];
  for (const fc of fcs) {
    const impuestas = fijos.get(fc.numero);
    if (impuestas) {
      // El contrato canta estas fechas en voz alta: no se desplazan aunque
      // caigan en domingo. El registro sí espera al siguiente día hábil.
      for (const dia of impuestas) planPagos.push({ fc, tercero: fc.terceroId ?? "", monto: fc.montoTotal, dia });
      continue;
    }
    if (!paraPagar.has(fc.numero)) continue;
    const dia = habilDesde(aDia(fc.fecha) + az.entero(25, 45));
    if (dia > DIA_FIN) continue;
    planPagos.push({ fc, tercero: fc.terceroId ?? "", monto: fc.montoTotal, dia });
  }

  /* Nómina, arriendo, servicios y telefonía. No nacen de una factura de compra,
     pero salen del banco todos los meses y por encima del mínimo que exige
     soporte: sin su documento de egreso, R14 los leería como pagos sin respaldo
     y el informe se llenaría de gasto corriente en vez de fugas. */
  const OPERATIVOS: [string, number, number][] = [
    ["PRV-059", 38_000_000, 8_000_000],
    ["PRV-056", 12_200_000, 700_000],
    ["PRV-054", 3_600_000, 1_800_000],
    ["PRV-058", 1_550_000, 600_000],
  ];
  for (let m = 0; m < MESES.length; m++) {
    for (const [prv, base, rango] of OPERATIVOS) {
      planPagos.push({
        fc: null,
        tercero: prv,
        monto: aCien(base + az.real() * rango),
        dia: MESES[m].habiles[Math.min(3 + az.entero(0, 2), MESES[m].habiles.length - 1)],
      });
    }
  }

  planPagos.sort((a, b) => a.dia - b.dia || (a.tercero < b.tercero ? -1 : a.tercero > b.tercero ? 1 : a.monto - b.monto));
  for (const { fc, tercero, monto, dia } of planPagos) {
    const { numero, consecutivo } = seriePG(dia);
    pagos.push({
      id: numero,
      tipo: "pago",
      numero,
      consecutivo,
      serie: "PAGO",
      terceroId: tercero,
      fecha: aISO(dia),
      fechaRegistro: registroNormal(az, dia),
      usuarioRegistro: "sgomez",
      montoTotal: monto,
      estado: "pagado",
      // El ERP exporta una sola columna de referencia por documento y en un pago
      // lleva la factura que cancela. Se guarda en los dos campos canónicos para
      // que la regla la encuentre igual busque la orden o la factura afectada.
      ordenCompraId: fc ? fc.numero : null,
      entradaInventarioId: null,
      facturaAfectadaId: fc ? fc.numero : null,
      diasCredito: null,
    });
    if (fc) fc.estado = "pagado";
  }

  const sobrecostoS4 = suma(
    (marcados["s4"] ?? []).map((n) => {
      const f = lineas.get(n)![0];
      return f.cantidad * (f.precioUnitario - REFERENCIA_ACEITE);
    }),
  );

  return { ocs, fcs, ents, pagos, lineas, marcados, sobrecostoS4 };
}

/* ─────────────────────────────  Inventario  ───────────────────────────── */

/** S5 · nueve mermas de arroz en Guayabal: 80 bultos a 115.000 = 9.200.000. */
const MERMAS_S5 = [8, 6, 12, 9, 7, 11, 8, 10, 9];
/** S16 · cinco salidas sin ningún documento detrás. */
const HUERFANAS_S16 = [5, 4, 6, 5, 5];

type Mov = Sin<MovimientoInventario>;

function construirInventario(
  az: Azar,
  productos: Producto[],
  ventas: Ventas,
  compras: Compras,
): { movimientos: Mov[]; huerfanoSku: Producto } {
  const porSku = new Map(productos.map((p) => [p.sku, p]));
  const bodegaDe = (sku: string) => (sku === CASOS.skuMerma ? BODEGAS[1] : BODEGAS[hash(sku) < 0.4 ? 0 : hash(sku) < 0.75 ? 1 : 2]);
  const movs: Mov[] = [];
  let orden = 0;
  const mete = (m: Omit<Mov, "id">) => movs.push({ ...m, id: String(orden++) });

  for (const fc of compras.fcs) {
    if (!fc.entradaInventarioId) continue;
    const ent = compras.ents.find((e) => e.numero === fc.entradaInventarioId)!;
    for (const l of compras.lineas.get(fc.numero) ?? []) {
      mete({
        sku: l.sku,
        bodega: bodegaDe(l.sku),
        tipo: "entrada",
        cantidad: l.cantidad,
        fecha: ent.fecha,
        documentoId: ent.numero,
        usuario: "abetancur",
        motivo: `Recepción ${fc.numero}`,
      });
    }
  }

  for (const fv of ventas.fvs) {
    if (ventas.sinSalida.has(fv.numero)) continue;
    for (const l of ventas.lineas.get(fv.numero) ?? []) {
      if (!porSku.get(l.sku)?.inventariable) continue;
      mete({
        sku: l.sku,
        bodega: bodegaDe(l.sku),
        tipo: "salida",
        cantidad: -l.cantidad,
        fecha: fv.fecha,
        documentoId: fv.numero,
        usuario: "abetancur",
        motivo: `Despacho ${fv.numero}`,
      });
    }
  }

  // S5 · la merma recurrente: mismo producto, misma bodega, mismo usuario.
  MERMAS_S5.forEach((cant, i) => {
    mete({
      sku: CASOS.skuMerma,
      bodega: CASOS.bodegaMerma,
      tipo: "ajuste",
      cantidad: -cant,
      fecha: aISO(habilDesde(aDia("2026-03-05") + i * 19)),
      documentoId: null,
      usuario: "abetancur",
      motivo: az.elige(["Producto averiado", "Bulto roto en estiba", "Diferencia de conteo", "Humedad en bodega"]),
    });
  });

  // S16 · cinco salidas huérfanas. Se valoran al costo promedio: ≈ 2.900.000.
  const huerfanoSku = productos
    .filter((p) => p.activo && p.costo > 90_000 && p.costo < 150_000 && p.sku !== CASOS.skuMerma)
    .reduce((a, b) => (Math.abs(a.costo - 116_000) <= Math.abs(b.costo - 116_000) ? a : b));
  HUERFANAS_S16.forEach((cant, i) => {
    mete({
      sku: huerfanoSku.sku,
      bodega: bodegaDe(huerfanoSku.sku),
      tipo: "salida",
      cantidad: -cant,
      fecha: aISO(habilDesde(aDia("2025-10-08") + i * 47)),
      documentoId: null,
      usuario: az.elige(["abetancur", "ncardona"]),
      motivo: "Salida sin documento",
    });
  });

  /* Ajustes normales. Los negativos van repartidos a intervalo fijo y rotando de
     bodega: así ninguna bodega pasa de dos en una ventana de 90 días y R26 solo
     encuentra la merma sembrada. */
  const candidatos = productos.filter((p) => p.inventariable && p.sku !== CASOS.skuMerma && p.activo);
  for (let i = 0; i < 24; i++) {
    const item = candidatos[(i * 13 + 5) % candidatos.length];
    mete({
      sku: item.sku,
      bodega: BODEGAS[i % 3],
      tipo: "ajuste",
      cantidad: -az.entero(2, 9),
      fecha: aISO(habilDesde(DIA_INICIO + 14 + i * 22)),
      documentoId: null,
      usuario: az.elige(["abetancur", "ncardona"]),
      motivo: az.elige(["Producto averiado", "Diferencia de conteo", "Vencimiento", "Devolución a proveedor"]),
    });
  }
  for (let i = 0; i < 104; i++) {
    const item = candidatos[(i * 7 + 2) % candidatos.length];
    mete({
      sku: item.sku,
      bodega: bodegaDe(item.sku),
      tipo: "ajuste",
      cantidad: az.entero(1, 8),
      fecha: aISO(habilDesde(DIA_INICIO + az.entero(5, 540))),
      documentoId: null,
      usuario: az.elige(["abetancur", "ncardona"]),
      motivo: az.elige(["Sobrante de conteo físico", "Reingreso de devolución", "Ajuste de inventario cíclico"]),
    });
  }

  for (let i = 0; i < 60; i++) {
    const item = candidatos[(i * 11 + 3) % candidatos.length];
    const cant = az.entero(3, 24);
    const dia = aISO(habilDesde(DIA_INICIO + az.entero(5, 540)));
    const origen = BODEGAS[i % 3];
    const destino = BODEGAS[(i + 1) % 3];
    mete({ sku: item.sku, bodega: origen, tipo: "traslado", cantidad: -cant, fecha: dia, documentoId: null, usuario: "abetancur", motivo: `Traslado a ${destino}` });
    mete({ sku: item.sku, bodega: destino, tipo: "traslado", cantidad: cant, fecha: dia, documentoId: null, usuario: "abetancur", motivo: `Traslado desde ${origen}` });
  }

  movs.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : Number(a.id) - Number(b.id)));
  movs.forEach((m, i) => (m.id = `MOV-${String(i + 1).padStart(6, "0")}`));
  return { movimientos: movs, huerfanoSku };
}

/* ─────────────────────────────  Banco  ───────────────────────────── */

/** S9 · nueve salidas de dinero por encima del mínimo y sin nada que las respalde. */
const SIN_SOPORTE_S9: [string, number][] = [
  ["TRANSF PSE SERVICIOS INTEGRALES JR", 2_450_000],
  ["TRANSF PSE SERVICIOS INTEGRALES JR", 2_450_000],
  ["TRANSF PSE SERVICIOS INTEGRALES JR", 2_450_000],
  ["TRANSFERENCIA INTERBANCARIA ACH", 1_780_000],
  ["TRANSF PSE PROVEEDOR NO IDENTIFICADO", 1_920_000],
  ["PAGO PSE ASESORIAS EMPRESARIALES", 2_150_000],
  ["TRANSFERENCIA INTERBANCARIA ACH", 1_860_000],
  ["TRANSF PSE LOGISTICA Y SUMINISTROS", 1_740_000],
  ["PAGO PSE MANTENIMIENTO GENERAL", 1_800_000],
];

type Ban = Sin<MovimientoBanco>;

/** Como los escribe un banco colombiano en el extracto de la cuenta corriente. */
const GLOSA_OPERATIVA: Record<string, string> = {
  "PRV-059": "PAGO NOMINA DISPERSION",
  "PRV-056": "DEBITO AUTOMATICO ARRENDAMIENTO",
  "PRV-054": "DEBITO AUTOMATICO EPM SERVICIOS",
  "PRV-058": "DEBITO AUTOMATICO UNE TELECOMUNIC",
};

/** El nombre como lo escribe el banco: en mayúsculas, sin tildes y recortado. */
function comoBanco(nombre: string, largo = 24): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, largo)
    .trim();
}

function construirBanco(az: Azar, terceros: Sin<Tercero>[], compras: Compras, cobros: Cobros): Ban[] {
  const nombre = new Map(terceros.map((t) => [t.id, t.nombre]));
  const filas: Ban[] = [];
  const mete = (fecha: string, descripcion: string, monto: number, tipo: "debito" | "credito", doc: string | null, tercero: string | null) =>
    filas.push({ id: "", fecha, descripcion, monto, tipo, cuenta: CUENTA_EMPRESA, terceroIdInferido: tercero, documentoConciliadoId: doc });

  for (const pg of compras.pagos) {
    const glosa = GLOSA_OPERATIVA[pg.terceroId ?? ""] ?? `TRANSF PSE PROVEEDOR ${comoBanco(nombre.get(pg.terceroId ?? "") ?? "")}`;
    mete(pg.fecha, glosa, pg.montoTotal, "debito", pg.numero, pg.terceroId);
  }
  for (const rc of cobros.rcs) {
    mete(rc.fecha, `ABONO CLIENTE ${comoBanco(nombre.get(rc.terceroId ?? "") ?? "")}`, rc.montoTotal, "credito", rc.numero, rc.terceroId);
  }

  for (let m = 0; m < MESES.length; m++) {
    const mes = MESES[m];
    const dia = (k: number) => aISO(mes.habiles[Math.min(k, mes.habiles.length - 1)]);
    mete(dia(mes.habiles.length - 1), "GMF 4X1000", aCien(900_000 + az.real() * 480_000), "debito", null, null);
    mete(dia(mes.habiles.length - 1), "COMISION MANEJO CUENTA CORRIENTE", aCien(72_000 + az.real() * 26_000), "debito", null, null);
    mete(dia(mes.habiles.length - 1), "RENDIMIENTOS FINANCIEROS", aCien(180_000 + az.real() * 260_000), "credito", null, null);
    for (let k = 0; k < 6; k++) {
      mete(dia(az.entero(0, mes.habiles.length - 1)), az.elige(["COMPRA DATAFONO INSUMOS", "PAGO PSE SERVICIOS TECNICOS", "DEBITO AUTOMATICO POLIZA", "PAGO PSE PAPELERIA", "RETIRO CAJERO OFICINA"]), aCien(180_000 + az.real() * 1_150_000), "debito", null, null);
    }
  }
  for (let i = 0; i < 12; i++) {
    mete(aISO(habilDesde(DIA_INICIO + 25 + i * 42)), "NOTA DEBITO CHEQUE DEVUELTO", aCien(320_000 + az.real() * 900_000), "debito", null, null);
  }

  // S9 · repartidas por el período, siempre por encima del mínimo que exige soporte.
  SIN_SOPORTE_S9.forEach(([desc, monto], i) => {
    mete(aISO(habilDesde(DIA_INICIO + 40 + i * 57)), desc, monto, "debito", null, null);
  });

  /* Lo que entra por caja sin pasar por un recibo conciliado. Se dimensiona
     contra lo que salió ese mes porque una cuenta corriente que se hunde en
     rojo mil millones distraería de lo que se está narrando: el público mira
     el saldo aunque nadie lo mencione. */
  const salidas = new Map<string, number>();
  const entradas = new Map<string, number>();
  for (const f of filas) {
    const clave = f.fecha.slice(0, 7);
    const destino = f.tipo === "debito" ? salidas : entradas;
    destino.set(clave, (destino.get(clave) ?? 0) + f.monto);
  }
  for (const mes of MESES) {
    const falta = (salidas.get(mes.clave) ?? 0) * 1.025 - (entradas.get(mes.clave) ?? 0);
    if (falta <= 0) continue;
    const cuantas = az.entero(20, 28);
    let pendiente = falta;
    for (let k = 0; k < cuantas; k++) {
      const monto = k === cuantas - 1 ? Math.max(50_000, pendiente) : aCien((pendiente / (cuantas - k)) * (0.55 + az.real() * 0.9));
      pendiente -= monto;
      mete(
        aISO(mes.habiles[az.entero(0, mes.habiles.length - 1)]),
        az.elige(["CONSIGNACION NACIONAL", "TRANSFERENCIA INTERBANCARIA ACH", "RECAUDO PSE CLIENTE", "CONSIGNACION EFECTIVO SUCURSAL"]),
        aCien(monto),
        "credito",
        null,
        null,
      );
      if (pendiente <= 0) break;
    }
  }

  filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.descripcion < b.descripcion ? -1 : 1));
  filas.forEach((f, i) => (f.id = `BAN-${String(i + 1).padStart(4, "0")}`));
  return filas;
}

/**
 * El saldo del extracto. No está en el modelo canónico porque es un derivado,
 * pero sin él la hoja no parece un extracto. El saldo de apertura se elige para
 * que la cuenta nunca quede en rojo: un descubierto de 200 millones distraería
 * al público del hallazgo que se está narrando.
 */
export function saldosDelExtracto(banco: MovimientoBanco[]): number[] {
  let minimo = 0;
  let corriente = 0;
  for (const b of banco) {
    corriente += b.tipo === "credito" ? b.monto : -b.monto;
    if (corriente < minimo) minimo = corriente;
  }
  const apertura = Math.ceil((-minimo + 62_000_000) / 1_000_000) * 1_000_000;
  const saldos: number[] = [];
  let saldo = apertura;
  for (const b of banco) {
    saldo += b.tipo === "credito" ? b.monto : -b.monto;
    saldos.push(saldo);
  }
  return saldos;
}

/* ────────────────────  Registros fuera de horario (S18)  ──────────────────── */

const FESTIVOS_ELEGIBLES = [
  "2025-05-01",
  "2025-06-23",
  "2025-08-07",
  "2025-10-13",
  "2025-11-17",
  "2025-12-08",
  "2025-12-25",
  "2026-01-12",
  "2026-04-03",
  "2026-05-18",
  "2026-06-15",
  "2026-07-20",
];

/**
 * Treinta y siete registros de madrugada —veintidós de la misma persona— y doce
 * en festivo. Se marcan al final, sobre documentos ya construidos, porque es la
 * única forma de que el recuento sea exacto: si la hora saliera del azar en cada
 * documento, R42 encontraría un número distinto en cada ejecución.
 */
function marcarFueraDeHorario(az: Azar, documentos: Doc[], yaNocturnos: string[]): void {
  const nocturnos = new Set(yaNocturnos);
  const libres = az.baraja(documentos.filter((d) => !nocturnos.has(d.numero) && d.fechaRegistro));
  const deMosorio = libres.filter((d) => d.usuarioRegistro === "mosorio");
  const resto = libres.filter((d) => d.usuarioRegistro !== "mosorio");

  const faltanMosorio = 22 - yaNocturnos.length;
  const elegidos = [...deMosorio.slice(0, faltanMosorio), ...resto.slice(0, 37 - 22)];
  for (const d of elegidos) {
    const dia = aDia(d.fechaRegistro!);
    d.fechaRegistro = marca(dia, az.elige([22, 22, 23, 23, 0, 1, 2, 3, 4]), az.entero(0, 59));
    nocturnos.add(d.numero);
  }

  const paraFestivo = az.baraja(documentos.filter((d) => !nocturnos.has(d.numero) && d.fechaRegistro)).slice(0, 12);
  paraFestivo.forEach((d, i) => {
    d.fechaRegistro = marca(aDia(FESTIVOS_ELEGIBLES[i]), az.entero(9, 16), az.entero(0, 59));
  });
}

/* ─────────────────────────────  Ensamblado  ───────────────────────────── */

/** Hash estable para las decisiones que no pueden depender del orden de llamada. */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function conOrigen<T extends object>(items: Sin<T>[], archivo: string, hoja: string): T[] {
  return items.map((x, i) => ({ ...x, origen: { archivo, hoja, fila: i + 2 } }) as unknown as T);
}

/** Qué documento pertenece a qué caso sembrado. Lo anota el generador al pasar
    para que el verificador no tenga que volver a deducirlo. */
export type CasosSembrados = {
  sacrificadoS11: number;
  sacrificadoS12: number;
  sobrecostoS4: number;
  huerfanoSku: string;
  huerfanoCosto: number;
  venta: Record<string, string[]>;
  compra: Record<string, string[]>;
  notasViejas: string[];
};

export function construirLibro(): Libro {
  return construirDataset().libro;
}

export function construirDataset(): { libro: Libro; casos: CasosSembrados } {
  const az = crearAzar(SEMILLA);
  const productos = construirProductos(az);
  const { terceros, cambios } = construirTerceros(az);

  const precioMes = (p: Producto, m: number) => aDiez(p.precio * (1 + 0.0022 * m));
  const precioCompra = (p: Producto, prov: string, m: number) =>
    aDiez(p.costo * (0.965 + 0.05 * hash(`${p.sku}|${prov}`)) * (1 + 0.0025 * m));

  const ventas = construirVentas(az, productos, precioMes);
  const cobros = construirCobros(az, ventas);
  const compras = construirCompras(az, productos, ventas.ventasPorSku, precioCompra);
  const { movimientos, huerfanoSku } = construirInventario(az, productos, ventas, compras);
  const banco = construirBanco(az, terceros, compras, cobros);

  const docsCompra = [...compras.ocs, ...compras.fcs, ...compras.ents, ...compras.pagos];
  const docsVenta = [...ventas.fvs, ...cobros.ncs, ...cobros.nds, ...cobros.rcs];
  marcarFueraDeHorario(az, [...docsCompra, ...docsVenta], compras.marcados["s1-noche"] ?? []);

  const lineasCompra = docsCompra.flatMap((d) => compras.lineas.get(d.numero) ?? []);
  const todasLineasVenta = new Map([...ventas.lineas, ...cobros.lineas]);
  const lineasVenta = docsVenta.flatMap((d) => todasLineasVenta.get(d.numero) ?? []);

  /* Existencias. Se recorre el histórico para elegir un stock inicial que no
     deje ninguna referencia en negativo por el camino: una existencia negativa
     en pantalla es una pregunta que nadie quiere responder en directo. */
  const acumulado = new Map<string, { minimo: number; total: number }>();
  for (const mv of movimientos) {
    const a = acumulado.get(mv.sku) ?? { minimo: 0, total: 0 };
    a.total += mv.cantidad;
    if (a.total < a.minimo) a.minimo = a.total;
    acumulado.set(mv.sku, a);
  }
  const items: Sin<Item>[] = productos.map((p) => {
    const a = acumulado.get(p.sku);
    const base = a ? Math.ceil(-a.minimo * 1.15) + 12 : 0;
    return {
      sku: p.sku,
      nombre: p.nombre,
      categoria: p.categoria,
      costoPromedio: p.costo,
      stockActual: p.inventariable ? base + (a?.total ?? 0) : 0,
      inventariable: p.inventariable,
    };
  });

  const politicas: Sin<Politicas> = { ...POLITICAS };

  const conFilas = (nombre: string, hojas: string[], filas: number, aporta: string[]): ArchivoCargado => ({
    nombre,
    hojas,
    filas,
    // Estimación: el tamaño real solo lo sabe quien escribe el .xlsx. En la demo
    // este dato lo rellena la ingesta con el fichero de verdad.
    bytes: filas * 108 + 6_144,
    aporta,
  });

  const libro: Libro = {
    empresa: EMPRESA,
    nit: NIT_EMPRESA,
    periodo: { desde: PERIODO.desde, hasta: PERIODO.hasta },
    terceros: conOrigen<Tercero>(terceros, ARCHIVOS.terceros, HOJAS.terceros),
    cambiosTercero: conOrigen<CambioTercero>(cambios, ARCHIVOS.terceros, HOJAS.cambios),
    documentos: [
      ...conOrigen<Documento>(docsCompra, ARCHIVOS.compras, HOJAS.documentos),
      ...conOrigen<Documento>(docsVenta, ARCHIVOS.ventas, HOJAS.documentos),
    ],
    lineas: [
      ...conOrigen<LineaDocumento>(lineasCompra, ARCHIVOS.compras, HOJAS.detalle),
      ...conOrigen<LineaDocumento>(lineasVenta, ARCHIVOS.ventas, HOJAS.detalle),
    ],
    inventario: conOrigen<MovimientoInventario>(movimientos, ARCHIVOS.inventario, HOJAS.movimientos),
    banco: conOrigen<MovimientoBanco>(banco, ARCHIVOS.banco, HOJAS.extracto),
    items: conOrigen<Item>(items, ARCHIVOS.inventario, HOJAS.productos),
    politicas: { ...politicas, origen: { archivo: ARCHIVOS.politicas, hoja: HOJAS.parametros, fila: 2 } },
    archivos: [
      conFilas(ARCHIVOS.terceros, [HOJAS.terceros, HOJAS.cambios], terceros.length + cambios.length, ["terceros", "cambiosTercero"]),
      conFilas(ARCHIVOS.compras, [HOJAS.documentos, HOJAS.detalle], docsCompra.length + lineasCompra.length, ["documentos", "lineas"]),
      conFilas(ARCHIVOS.ventas, [HOJAS.documentos, HOJAS.detalle], docsVenta.length + lineasVenta.length, ["documentos", "lineas"]),
      conFilas(ARCHIVOS.inventario, [HOJAS.movimientos, HOJAS.productos], movimientos.length + items.length, ["inventario", "items"]),
      conFilas(ARCHIVOS.banco, [HOJAS.extracto], banco.length, ["banco"]),
      conFilas(ARCHIVOS.politicas, [HOJAS.parametros], 7, ["politicas"]),
    ],
  };

  const casos: CasosSembrados = {
    sacrificadoS11: ventas.sacrificado.s11,
    sacrificadoS12: ventas.sacrificado.s12,
    sobrecostoS4: compras.sobrecostoS4,
    huerfanoSku: huerfanoSku.sku,
    huerfanoCosto: huerfanoSku.costo,
    venta: ventas.marcados,
    compra: compras.marcados,
    notasViejas: cobros.notasViejas,
  };
  return { libro, casos };
}
