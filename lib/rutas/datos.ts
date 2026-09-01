/**
 * El día de trabajo: la bodega, los seis domiciliarios y los cuarenta pedidos.
 *
 * Las coordenadas se generan una sola vez, en `scripts/rutas-congelar.ts`, y se
 * congelan en `pedidos.json`. Por eso aquí no hay ningún `Math.random`: si los
 * pedidos cambiaran entre recargas, cada toma del vídeo daría una ruta distinta.
 *
 * Las direcciones no están inventadas. El script coge el punto generado dentro
 * del barrio, le pregunta a OpenStreetMap por la vía más cercana y usa el nombre
 * real que devuelve. La placa («# 44 - 27») sí se compone, respetando la regla
 * que delata a las direcciones falsas en Medellín: el número que va después del
 * # pertenece SIEMPRE a la familia perpendicular — si la vía es una Carrera, ese
 * número es una Calle, y al revés.
 */

import type { Clase, Deposito, Vehiculo } from "./tipos";

/** La jornada va de 08:00 a 18:00. Todo minuto del modelo se cuenta desde las 08:00. */
export const JORNADA_MIN = 600;

/** Ventanas de entrega, en minutos desde las 08:00. */
export const VENTANAS: Record<string, [number, number]> = {
  /** Antes de las 12:00. */
  express: [0, 240],
  /** Cualquier momento de la jornada. */
  hoy: [0, 600],
  /** Franja de tarde, 14:00-18:00. */
  programado: [360, 600],
};

export const DEPOSITO: Deposito = {
  nombre: "Bodega Guayabal",
  via: "Carrera 52",
  placa: "# 12 Sur - 140",
  barrio: "Guayabal",
  lat: 6.20898,
  lng: -75.58402,
};

/**
 * Flota mixta. Los topes de la moto son los que mandan en todo el reparto: un
 * paquete de 31 kg no es un problema de optimización, es un problema de física.
 *
 * El cajón de la moto son 120 L (60x45x45, el que se vende aquí para domicilios)
 * y 55 cm de arista. Con el cajón pequeño de 90 L la flota quedaba justo al
 * filo —cabían 40 pedidos y ni uno más—, y cualquier reordenación dejaba
 * paquetes sin vehículo.
 *
 * `eta` es el factor de aprovechamiento del volumen. Sin él el algoritmo promete
 * que 120 L de cajas entran en un cajón de 120 L, y el domiciliario llama a las
 * 8 de la mañana a decir que no.
 */
export const FLOTA: Vehiculo[] = [
  { id: "MOTO-1", nombre: "Andrés Zapata", clase: "moto", placa: "JVK 18D", kgMax: 20, litrosMax: 120, eta: 0.8, dimMax: 55, kmh: 22, servicioMin: 4 },
  { id: "MOTO-2", nombre: "Diana Ospina", clase: "moto", placa: "LRQ 27B", kgMax: 20, litrosMax: 120, eta: 0.8, dimMax: 55, kmh: 22, servicioMin: 4 },
  { id: "MOTO-3", nombre: "Camilo Restrepo", clase: "moto", placa: "MTX 35A", kgMax: 20, litrosMax: 120, eta: 0.8, dimMax: 55, kmh: 22, servicioMin: 4 },
  { id: "CARRO-1", nombre: "Marcela Gil", clase: "carro", placa: "GHS 481", kgMax: 250, litrosMax: 400, eta: 0.85, dimMax: 100, kmh: 17, servicioMin: 6 },
  { id: "CARRO-2", nombre: "Julián Betancur", clase: "carro", placa: "FKD 236", kgMax: 250, litrosMax: 400, eta: 0.85, dimMax: 100, kmh: 17, servicioMin: 6 },
  // La caja de un furgón de 6 m³ mide más de dos metros de largo, así que un
  // colchón sencillo de 1,90 m entra de sobra. Con el tope en 180 cm el colchón
  // no cabía en NINGÚN vehículo y el motor lo descartaba sin decir nada.
  { id: "FURGON-1", nombre: "Yesenia Cardona", clase: "furgon", placa: "TQR 907", kgMax: 1200, litrosMax: 6000, eta: 0.9, dimMax: 220, kmh: 15, servicioMin: 8 },
];

export const CLASE_ETIQUETA: Record<Clase, string> = {
  moto: "Moto",
  carro: "Carro",
  furgon: "Furgón",
};

/**
 * Barrios reales con su centroide y el rango de vías que de verdad los recorre.
 * `peso` es la probabilidad de que un pedido caiga ahí: El Poblado y Laureles
 * concentran el domicilio de Medellín, y el reparto real no es un disco uniforme.
 */
export interface Barrio {
  nombre: string;
  lat: number;
  lng: number;
  peso: number;
  /** Rango de carreras [desde, hasta]. */
  cra: [number, number];
  /** Rango de calles [desde, hasta]. */
  cll: [number, number];
  /** Las calles al sur de la Calle 1 llevan el sufijo "Sur". */
  sur?: boolean;
  /** Dispersión en grados: 0,006 son unos 660 m. */
  sigma: number;
}

export const BARRIOS: Barrio[] = [
  { nombre: "El Poblado", lat: 6.2104, lng: -75.5709, peso: 0.16, cra: [25, 48], cll: [1, 30], sur: true, sigma: 0.0075 },
  { nombre: "Laureles", lat: 6.242, lng: -75.5958, peso: 0.13, cra: [65, 84], cll: [30, 50], sigma: 0.0055 },
  { nombre: "La Candelaria", lat: 6.2501, lng: -75.568, peso: 0.11, cra: [43, 56], cll: [44, 58], sigma: 0.0045 },
  { nombre: "Belén", lat: 6.2259, lng: -75.6005, peso: 0.09, cra: [74, 86], cll: [1, 32], sigma: 0.006 },
  { nombre: "Envigado", lat: 6.1698, lng: -75.587, peso: 0.08, cra: [25, 48], cll: [24, 50], sur: true, sigma: 0.006 },
  { nombre: "Robledo", lat: 6.2791, lng: -75.5888, peso: 0.07, cra: [68, 88], cll: [62, 84], sigma: 0.0065 },
  { nombre: "La América", lat: 6.2507, lng: -75.6079, peso: 0.06, cra: [78, 90], cll: [42, 50], sigma: 0.0045 },
  { nombre: "Estadio", lat: 6.2609, lng: -75.5957, peso: 0.06, cra: [68, 74], cll: [44, 50], sigma: 0.004 },
  { nombre: "Buenos Aires", lat: 6.2409, lng: -75.5563, peso: 0.05, cra: [30, 42], cll: [44, 56], sigma: 0.005 },
  { nombre: "Aranjuez", lat: 6.2777, lng: -75.5626, peso: 0.05, cra: [48, 56], cll: [74, 98], sigma: 0.0055 },
  { nombre: "Guayabal", lat: 6.2061, lng: -75.5879, peso: 0.04, cra: [50, 60], cll: [1, 20], sur: true, sigma: 0.005 },
  { nombre: "Sabaneta", lat: 6.1515, lng: -75.6154, peso: 0.04, cra: [42, 50], cll: [50, 78], sur: true, sigma: 0.0045 },
  { nombre: "Castilla", lat: 6.2937, lng: -75.5683, peso: 0.03, cra: [62, 68], cll: [92, 104], sigma: 0.0045 },
  { nombre: "Boston", lat: 6.248, lng: -75.5576, peso: 0.03, cra: [36, 42], cll: [48, 54], sigma: 0.0035 },
];

/**
 * Qué se reparte de verdad en un domicilio colombiano. Los rangos de peso y
 * volumen están anclados a los topes publicados de paquetería y a las medidas
 * reales de los cajones de moto que se venden aquí.
 */
export interface Categoria {
  nombre: string;
  kg: [number, number];
  litros: [number, number];
  dimMax: number;
}

export const CATEGORIAS: Categoria[] = [
  { nombre: "Mercado", kg: [6, 14], litros: [40, 68], dimMax: 45 },
  { nombre: "Farmacia", kg: [0.3, 1.5], litros: [2, 6], dimMax: 25 },
  { nombre: "Ropa", kg: [0.5, 2], litros: [8, 20], dimMax: 40 },
  { nombre: "Comida preparada", kg: [1, 3], litros: [10, 18], dimMax: 35 },
  { nombre: "Repuestos", kg: [3, 12], litros: [8, 25], dimMax: 44 },
  { nombre: "Papelería", kg: [2, 8], litros: [15, 40], dimMax: 45 },
  { nombre: "Tecnología", kg: [1, 6], litros: [6, 30], dimMax: 42 },
];

/** Las que no caben en una moto. Son las que obligan a tener flota mixta. */
export const CATEGORIAS_VOLUMINOSAS: Categoria[] = [
  { nombre: "Electrodoméstico", kg: [28, 45], litros: [300, 520], dimMax: 165 },
  { nombre: "Mueble pequeño", kg: [18, 34], litros: [220, 430], dimMax: 150 },
  { nombre: "Colchón sencillo", kg: [22, 30], litros: [340, 480], dimMax: 190 },
  { nombre: "Llantas (juego)", kg: [32, 40], litros: [180, 240], dimMax: 66 },
];

export const NOMBRES = [
  "María Restrepo", "Jhon Álvarez", "Luz Marina Ochoa", "Sebastián Arango",
  "Paula Andrea Gómez", "Wilmar Céspedes", "Catalina Uribe", "Édison Muñoz",
  "Sandra Milena Rúa", "Óscar Jaramillo", "Yuliana Posada", "Néstor Cadavid",
  "Ana Sofía Montoya", "Fredy Quintero", "Lina Marcela Agudelo", "Hernán Darío Toro",
  "Verónica Escobar", "Juan Esteban Ríos", "Claudia Patricia Zapata", "Alexánder Vélez",
  "Isabel Cristina Mesa", "Mauricio Higuita", "Daniela Villegas", "Gustavo Adolfo Pérez",
  "Adriana Bedoya", "Carlos Mario Salazar", "Natalia Hoyos", "Leidy Johana Marín",
  "Ricardo Betancourt", "Sara Valentina Duque", "Álvaro Correa", "Mónica Tabares",
  "Jorge Iván Londoño", "Estefanía Palacio", "Diego Fernando Ruiz", "Marta Lucía Giraldo",
  "Andrés Felipe Cano", "Yesid Castaño", "Carolina Serna", "Fabián Ospina",
];
