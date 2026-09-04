import type { Cotizacion, Linea } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   Las cotizaciones que Distribuidora Andina mandó y nadie convirtió en
   pedido. Los productos y precios salen del mismo catálogo que audita LUPA
   (Excel Distribuidora Andina/04 Inventario.xlsx), así los tres agentes
   hablan de la misma empresa. Nombres y teléfonos son inventados.

   La primera pendiente es la que tiene guion grabado: «Llamar» la llama a
   ella. Las cinco de abajo ya se llamaron hoy antes de abrir la pantalla,
   para que la cabecera no arranque en cero.
   ------------------------------------------------------------------ */

const P = (producto: string, unidad: string, precio: number, dicho: string) => (cantidad: number): Linea => ({
  producto,
  cantidad,
  unidad,
  precio,
  dicho,
});

const ACEITE_20 = P("Aceite vegetal 20 L", "caneca", 112_400, "canecas de aceite vegetal de veinte litros");
const ARROZ_25 = P("Arroz blanco 25 kg", "bulto", 139_000, "bultos de arroz de veinticinco kilos");
const SERVILLETA = P("Servilleta cuadrada ×1000", "paca", 32_500, "pacas de servilletas");
const SOYA_3 = P("Aceite de soya 3 L", "garrafa", 20_900, "garrafas de aceite de soya");
const MIEL = P("Miel de abejas 12 × 330 g", "caja", 85_500, "cajas de miel");
const PONQUE = P("Mezcla para ponqué 10 kg", "bulto", 107_300, "bultos de mezcla para ponqué");
const CHORIZO = P("Chorizo santarrosano 500 g", "paquete", 11_300, "paquetes de chorizo santarrosano");
const DETERGENTE = P("Detergente en polvo 15 kg", "bulto", 148_500, "bultos de detergente");
const MANTECA = P("Manteca vegetal 500 g", "unidad", 3_900, "mantecas de quinientos gramos");
const AZUCAR_50 = P("Azúcar blanca 50 kg", "bulto", 189_000, "bultos de azúcar");
const PANELA = P("Panela pastilla ×24", "caja", 58_000, "cajas de panela");
const FRIJOL = P("Fríjol cargamanto 12,5 kg", "bulto", 118_000, "bultos de fríjol cargamanto");
const PAPEL = P("Papel higiénico jumbo ×12", "paca", 64_000, "pacas de papel higiénico");
const CAFE = P("Café molido 2,5 kg", "bolsa", 96_000, "bolsas de café molido");
const HARINA_50 = P("Harina de trigo 50 kg", "bulto", 132_000, "bultos de harina");
const HUEVOS = P("Huevos AA ×30", "cubeta", 16_500, "cubetas de huevos");
const QUESO = P("Queso campesino 2,5 kg", "bloque", 54_000, "bloques de queso campesino");

export const COTIZACIONES: Cotizacion[] = [
  /* ── Pendientes. La primera es la de la llamada grabada. ── */
  {
    id: "cot-041",
    negocio: "Restaurante Sancho Paisa",
    tipo: "Restaurante",
    barrio: "Laureles",
    contacto: "Andrés Zapata",
    trato: "don Andrés",
    cargo: "Dueño",
    telefono: "310 452 88 17",
    canal: "WhatsApp",
    hace: 23,
    lineas: [ACEITE_20(12), ARROZ_25(10), SERVILLETA(20)],
    descuento: 0.1,
    incentivo: "diez por ciento en el primer pedido y envío gratis hasta Laureles",
  },
  {
    id: "cot-038",
    negocio: "Café Astor Sur",
    tipo: "Panadería y café",
    barrio: "El Poblado",
    contacto: "Marcela Hoyos",
    trato: "Marcela",
    cargo: "Administradora",
    telefono: "301 776 24 90",
    canal: "Instagram",
    hace: 31,
    lineas: [PONQUE(8), MANTECA(60), MIEL(4)],
    descuento: 0.08,
    incentivo: "ocho por ciento y treinta días de plazo para pagar",
  },
  {
    id: "cot-044",
    negocio: "Minimercado La Esquina de Belén",
    tipo: "Minimercado",
    barrio: "Belén",
    contacto: "Jorge Iván Mesa",
    trato: "don Jorge",
    cargo: "Dueño",
    telefono: "312 209 55 31",
    canal: "Llamada",
    hace: 18,
    lineas: [ARROZ_25(15), SOYA_3(48), DETERGENTE(6)],
    descuento: 0.07,
    incentivo: "siete por ciento y el envío gratis",
  },
  {
    id: "cot-033",
    negocio: "Cafetería Clínica Las Vegas",
    tipo: "Cafetería institucional",
    barrio: "El Poblado",
    contacto: "Luz Dary Ramírez",
    trato: "doña Luz Dary",
    cargo: "Coordinadora de compras",
    telefono: "604 444 91 20",
    canal: "Web",
    hace: 40,
    lineas: [CAFE(24), AZUCAR_50(4), SERVILLETA(30), HUEVOS(40)],
    descuento: 0.1,
    incentivo: "diez por ciento y entrega dos veces por semana sin recargo",
  },
  {
    id: "cot-047",
    negocio: "Restaurante El Botánico Prado",
    tipo: "Restaurante",
    barrio: "Prado",
    contacto: "Camilo Restrepo",
    trato: "Camilo",
    cargo: "Chef propietario",
    telefono: "300 918 40 62",
    canal: "WhatsApp",
    hace: 12,
    lineas: [ACEITE_20(6), FRIJOL(5), CHORIZO(80), QUESO(10)],
    descuento: 0.08,
    incentivo: "ocho por ciento y envío gratis",
  },
  {
    id: "cot-036",
    negocio: "Hotel Nutibara Boutique",
    tipo: "Hotel",
    barrio: "Centro",
    contacto: "Sandra Milena Vélez",
    trato: "Sandra",
    cargo: "Jefe de compras",
    telefono: "604 511 20 30",
    canal: "Web",
    hace: 27,
    lineas: [CAFE(30), HUEVOS(60), PAPEL(20), MIEL(6)],
    descuento: 0.1,
    incentivo: "diez por ciento y treinta días de plazo",
  },
  {
    id: "cot-049",
    negocio: "Panadería Santa Elena",
    tipo: "Panadería",
    barrio: "Buenos Aires",
    contacto: "Wilmar Castaño",
    trato: "don Wilmar",
    cargo: "Dueño",
    telefono: "311 385 77 04",
    canal: "WhatsApp",
    hace: 9,
    lineas: [HARINA_50(10), AZUCAR_50(3), MANTECA(120), HUEVOS(30)],
    descuento: 0.07,
    incentivo: "siete por ciento y la harina entregada mañana mismo",
  },
  {
    id: "cot-035",
    negocio: "Comidas Rápidas El Parche",
    tipo: "Comidas rápidas",
    barrio: "Robledo",
    contacto: "Yesica Álvarez",
    trato: "Yesica",
    cargo: "Dueña",
    telefono: "320 604 12 58",
    canal: "Instagram",
    hace: 35,
    lineas: [ACEITE_20(8), CHORIZO(120), SERVILLETA(15), PAPEL(6)],
    descuento: 0.1,
    incentivo: "diez por ciento y envío gratis",
  },
  {
    id: "cot-029",
    negocio: "Colegio San Ignacio · cafetería",
    tipo: "Cafetería escolar",
    barrio: "Aranjuez",
    contacto: "Gloria Ospina",
    trato: "doña Gloria",
    cargo: "Encargada de la cafetería",
    telefono: "604 263 18 75",
    canal: "Llamada",
    hace: 52,
    lineas: [PANELA(20), HUEVOS(50), ARROZ_25(6), QUESO(8)],
    descuento: 0.08,
    incentivo: "ocho por ciento y entrega semanal fija",
  },
  {
    id: "cot-046",
    negocio: "Fonda La Envigadeña",
    tipo: "Restaurante típico",
    barrio: "Envigado",
    contacto: "Fabio Arango",
    trato: "don Fabio",
    cargo: "Dueño",
    telefono: "313 720 96 41",
    canal: "WhatsApp",
    hace: 15,
    lineas: [FRIJOL(8), CHORIZO(150), ARROZ_25(8), PANELA(10)],
    descuento: 0.1,
    incentivo: "diez por ciento en el primer pedido",
  },

  /* ── Ya llamadas hoy, antes de abrir la pantalla. ── */
  {
    id: "cot-040",
    negocio: "Restaurante Ocaso Manrique",
    tipo: "Restaurante",
    barrio: "Manrique",
    contacto: "Beatriz Londoño",
    trato: "doña Beatriz",
    cargo: "Dueña",
    telefono: "314 890 23 76",
    canal: "WhatsApp",
    hace: 21,
    lineas: [ACEITE_20(9), SERVILLETA(25), CHORIZO(60)],
    descuento: 0.1,
    incentivo: "diez por ciento y envío gratis",
    cerrada: { resultado: "pedido_cerrado", resumen: "Pedido completo · despacho mañana 10:00", monto: 2_051_820 },
  },
  {
    id: "cot-031",
    negocio: "Pastelería Dulce Laurel",
    tipo: "Pastelería",
    barrio: "Laureles",
    contacto: "Natalia Ruiz",
    trato: "Natalia",
    cargo: "Dueña",
    telefono: "302 445 60 19",
    canal: "Instagram",
    hace: 26,
    lineas: [PONQUE(6), MANTECA(80), HUEVOS(40), AZUCAR_50(2)],
    descuento: 0.08,
    incentivo: "ocho por ciento",
    cerrada: { resultado: "pedido_cerrado", resumen: "Pedido completo · recoge en bodega el sábado", monto: 1_467_408 },
  },
  {
    id: "cot-027",
    negocio: "Restaurante Ancón Caldas",
    tipo: "Restaurante",
    barrio: "Caldas",
    contacto: "Óscar Tabares",
    trato: "don Óscar",
    cargo: "Dueño",
    telefono: "315 118 70 03",
    canal: "Llamada",
    hace: 44,
    lineas: [ACEITE_20(22), SERVILLETA(76)],
    descuento: 0.1,
    incentivo: "diez por ciento",
    cerrada: { resultado: "seguimiento_agendado", resumen: "Decide con el socio · llamar martes 9:30" },
  },
  {
    id: "cot-030",
    negocio: "Minimercado San Diego",
    tipo: "Minimercado",
    barrio: "San Diego",
    contacto: "Paula Andrea Giraldo",
    trato: "Paula",
    cargo: "Administradora",
    telefono: "318 357 41 88",
    canal: "Web",
    hace: 30,
    lineas: [MIEL(15), SOYA_3(61), PONQUE(13)],
    descuento: 0.07,
    incentivo: "siete por ciento",
    cerrada: { resultado: "cotizacion_reenviada", resumen: "Cotización nueva por WhatsApp · confirma el lunes" },
  },
  {
    id: "cot-022",
    negocio: "Cafetería Aeropuerto Olaya",
    tipo: "Cafetería",
    barrio: "Olaya Herrera",
    contacto: "Ricardo Múnera",
    trato: "don Ricardo",
    cargo: "Administrador",
    telefono: "604 365 49 12",
    canal: "Web",
    hace: 60,
    lineas: [CAFE(18), AZUCAR_50(2), SERVILLETA(40)],
    descuento: 0.1,
    incentivo: "diez por ciento",
    cerrada: { resultado: "no_interesado", resumen: "Ya firmó con otro proveedor por un año" },
  },
];

export const porId = (id: string) => COTIZACIONES.find((c) => c.id === id);

/** Las que tocan llamar, en el orden de la cola. */
export const PENDIENTES = COTIZACIONES.filter((c) => !c.cerrada);

/** «12 canecas de aceite vegetal de veinte litros, 10 bultos de arroz de
    veinticinco kilos y 20 pacas de servilletas»: la misma frase que dice
    Sofi, con la cifra en dígitos porque esto se lee, no se oye. */
export function resumenLineas(c: Cotizacion) {
  const partes = c.lineas.map((l) => `${l.cantidad} ${l.dicho}`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
