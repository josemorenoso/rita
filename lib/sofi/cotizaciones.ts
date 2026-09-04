import type { Cotizacion, Linea } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   Las cotizaciones que Distribuidora Andina mandó y nadie convirtió en
   pedido. Aquí no hay cuentas corporativas: son personas —la señora de los
   almuerzos, el del granero, la de las arepas— que pidieron precio por
   WhatsApp y nunca contestaron. Pedidos pequeños, entre cincuenta mil y
   ochocientos mil pesos, que es lo que de verdad compra un negocio de barrio
   cada semana y lo que ningún vendedor alcanza a perseguir uno por uno.

   Los productos y precios salen del mismo catálogo que audita LUPA
   (Excel Distribuidora Andina/04 Inventario.xlsx), así los tres agentes
   hablan de la misma empresa. Nombres y teléfonos son inventados.

   Sofi las llama en este orden, de arriba abajo. Las cinco del final ya se
   llamaron hoy antes de abrir la pantalla, para que la cabecera no arranque
   en cero.
   ------------------------------------------------------------------ */

/** Un producto del catálogo. Se declara como lo diría Sofi con uno solo
    («una caneca de aceite vegetal de veinte litros») y de ahí salen la
    unidad y el plural, que aquí hay pedidos de una caneca y de veinte. */
const P = (producto: string, precio: number, uno: string) => {
  const [, unidad, ...resto] = uno.split(" ");
  const dicho = [`${unidad}s`, ...resto].join(" ");
  return (cantidad: number): Linea => ({ producto, cantidad, unidad, precio, dicho, uno });
};

const ACEITE_20 = P("Aceite vegetal 20 L", 112_400, "una caneca de aceite vegetal de veinte litros");
const ARROZ_25 = P("Arroz blanco 25 kg", 139_000, "un bulto de arroz de veinticinco kilos");
const SERVILLETA = P("Servilleta cuadrada ×1000", 32_500, "una paca de servilletas");
const SOYA_3 = P("Aceite de soya 3 L", 20_900, "una garrafa de aceite de soya");
const MIEL = P("Miel de abejas 12 × 330 g", 85_500, "una caja de miel");
const CHORIZO = P("Chorizo santarrosano 500 g", 11_300, "un paquete de chorizo santarrosano");
const DETERGENTE = P("Detergente en polvo 15 kg", 148_500, "un bulto de detergente");
const MANTECA = P("Manteca vegetal 500 g", 3_900, "una manteca de quinientos gramos");
const AZUCAR_50 = P("Azúcar blanca 50 kg", 189_000, "un bulto de azúcar");
const PANELA = P("Panela pastilla ×24", 58_000, "una caja de panela");
const FRIJOL = P("Fríjol cargamanto 12,5 kg", 118_000, "un bulto de fríjol cargamanto");
const PAPEL = P("Papel higiénico jumbo ×12", 64_000, "una paca de papel higiénico");
const CAFE = P("Café molido 2,5 kg", 96_000, "una bolsa de café molido");
const HARINA_50 = P("Harina de trigo 50 kg", 132_000, "un bulto de harina");
const HUEVOS = P("Huevos AA ×30", 16_500, "una cubeta de huevos");
const QUESO = P("Queso campesino 2,5 kg", 54_000, "un bloque de queso campesino");

export const COTIZACIONES: Cotizacion[] = [
  /* ── La cola de hoy, en el orden en que Sofi va llamando ── */
  {
    id: "cot-137",
    contacto: "Luis Reinaldo Moreno Solis",
    trato: "don Luis",
    negocio: "Asadero El Portal",
    tipo: "Asadero",
    cargo: "Dueño",
    barrio: "La América",
    telefono: "304 218 63 05",
    canal: "WhatsApp",
    hace: 14,
    lineas: [ACEITE_20(2), CHORIZO(25), SERVILLETA(4), PAPEL(1)],
    descuento: 0.1,
    incentivo: "diez por ciento y el envío gratis hasta La América",
  },
  {
    id: "cot-118",
    contacto: "Marta Ocampo",
    trato: "doña Marta",
    negocio: "Almuerzos donde Marta",
    tipo: "Almuerzos caseros",
    cargo: "Dueña",
    barrio: "Aranjuez",
    telefono: "310 452 88 17",
    canal: "WhatsApp",
    hace: 23,
    lineas: [ARROZ_25(2), ACEITE_20(1), FRIJOL(1), HUEVOS(3)],
    descuento: 0.1,
    incentivo: "diez por ciento y el envío gratis hasta Aranjuez",
  },
  {
    id: "cot-121",
    contacto: "Jhon Fredy Vélez",
    trato: "don Jhon",
    negocio: "Tienda La 33",
    tipo: "Tienda de barrio",
    cargo: "Dueño",
    barrio: "Belén",
    telefono: "312 209 55 31",
    canal: "Llamada",
    hace: 18,
    lineas: [PANELA(2), ARROZ_25(1), SOYA_3(6), PAPEL(2)],
    descuento: 0.08,
    incentivo: "ocho por ciento y quince días para pagar",
  },
  {
    id: "cot-114",
    contacto: "Yuliana Restrepo",
    trato: "Yuliana",
    negocio: "Arepas y algo más",
    tipo: "Puesto de arepas",
    cargo: "Dueña",
    barrio: "Robledo",
    telefono: "320 604 12 58",
    canal: "Instagram",
    hace: 31,
    lineas: [QUESO(4), MANTECA(20), HUEVOS(6)],
    descuento: 0.1,
    incentivo: "diez por ciento y el queso entregado los martes y los viernes",
  },
  {
    id: "cot-126",
    contacto: "Hernán Ospina",
    trato: "don Hernán",
    negocio: "Cafetería del Parque",
    tipo: "Cafetería",
    cargo: "Dueño",
    barrio: "Envigado",
    telefono: "301 776 24 90",
    canal: "Web",
    hace: 12,
    lineas: [CAFE(3), AZUCAR_50(1), SERVILLETA(4)],
    descuento: 0.07,
    incentivo: "siete por ciento y el envío gratis",
  },
  {
    id: "cot-109",
    contacto: "Leidy Johana Cardona",
    trato: "Leidy",
    negocio: "Fritanga La Esquina",
    tipo: "Fritanga",
    cargo: "Dueña",
    barrio: "Manrique",
    telefono: "313 720 96 41",
    canal: "WhatsApp",
    hace: 35,
    lineas: [ACEITE_20(2), CHORIZO(20), SERVILLETA(3), PAPEL(1)],
    descuento: 0.1,
    incentivo: "diez por ciento y el envío gratis",
  },
  {
    id: "cot-123",
    contacto: "Sandra Milena Higuita",
    trato: "Sandra",
    negocio: "Panadería La Espiga",
    tipo: "Panadería",
    cargo: "Dueña",
    barrio: "Castilla",
    telefono: "311 385 77 04",
    canal: "WhatsApp",
    hace: 9,
    lineas: [HARINA_50(2), MANTECA(24), AZUCAR_50(1), HUEVOS(5)],
    descuento: 0.08,
    incentivo: "ocho por ciento y la harina entregada mañana mismo",
  },
  {
    id: "cot-131",
    contacto: "Cristian Zapata",
    trato: "Cristian",
    negocio: "Perros del Estadio",
    tipo: "Comidas rápidas",
    cargo: "Dueño",
    barrio: "Estadio",
    telefono: "300 918 40 62",
    canal: "Instagram",
    hace: 6,
    lineas: [CHORIZO(30), SERVILLETA(6), PAPEL(2)],
    descuento: 0.1,
    incentivo: "diez por ciento y el envío gratis los jueves",
  },
  {
    id: "cot-102",
    contacto: "Gloria Elena Pérez",
    trato: "doña Gloria",
    negocio: "Almuerzos Gloria",
    tipo: "Almuerzos caseros",
    cargo: "Dueña",
    barrio: "Villa Hermosa",
    telefono: "604 263 18 75",
    canal: "Llamada",
    hace: 44,
    lineas: [ARROZ_25(1), ACEITE_20(1), HUEVOS(4), PANELA(1)],
    descuento: 0.08,
    incentivo: "ocho por ciento y entrega fija los lunes",
  },
  {
    id: "cot-116",
    contacto: "Rosalba Muñoz",
    trato: "doña Rosalba",
    negocio: "Tienda Doña Rosalba",
    tipo: "Tienda de barrio",
    cargo: "Dueña",
    barrio: "San Javier",
    telefono: "318 357 41 88",
    canal: "WhatsApp",
    hace: 27,
    lineas: [DETERGENTE(1), PAPEL(3), SERVILLETA(2), MANTECA(15)],
    descuento: 0.07,
    incentivo: "siete por ciento y el envío gratis",
  },
  {
    id: "cot-134",
    contacto: "Yeison Marín",
    trato: "Yeison",
    negocio: "Cigarrería La 70",
    tipo: "Cigarrería",
    cargo: "Dueño",
    barrio: "Laureles",
    telefono: "315 118 70 03",
    canal: "Web",
    hace: 15,
    lineas: [SOYA_3(2), MANTECA(5)],
    descuento: 0.1,
    incentivo: "diez por ciento en el primer pedido",
  },

  /* ── Ya llamadas hoy, antes de abrir la pantalla ── */
  {
    id: "cot-097",
    contacto: "Duván Ríos",
    trato: "Duván",
    negocio: "Frutería La Playa",
    tipo: "Frutería",
    cargo: "Dueño",
    barrio: "Centro",
    telefono: "302 445 60 19",
    canal: "WhatsApp",
    hace: 21,
    lineas: [MIEL(2), SOYA_3(3), HUEVOS(3), QUESO(2)],
    descuento: 0.08,
    incentivo: "ocho por ciento",
    cerrada: { resultado: "pedido_cerrado", resumen: "Pedido completo · despacho mañana 10:00", monto: 359_904 },
  },
  {
    id: "cot-104",
    contacto: "Estiven Agudelo",
    trato: "Estiven",
    negocio: "Empanadas El Poblado",
    tipo: "Empanadas",
    cargo: "Dueño",
    barrio: "El Poblado",
    telefono: "314 890 23 76",
    canal: "Instagram",
    hace: 26,
    lineas: [ACEITE_20(3), HARINA_50(1), QUESO(3), SERVILLETA(2)],
    descuento: 0.1,
    incentivo: "diez por ciento y envío gratis",
    cerrada: { resultado: "pedido_cerrado", resumen: "Pedido completo · recoge en bodega el sábado", monto: 626_580 },
  },
  {
    id: "cot-091",
    contacto: "Álvaro Betancur",
    trato: "don Álvaro",
    negocio: "Granero El Vecino",
    tipo: "Granero",
    cargo: "Dueño",
    barrio: "Buenos Aires",
    telefono: "315 402 66 19",
    canal: "Llamada",
    hace: 40,
    lineas: [AZUCAR_50(1), PANELA(3), FRIJOL(2)],
    descuento: 0.07,
    incentivo: "siete por ciento",
    cerrada: { resultado: "seguimiento_agendado", resumen: "Lo decide con la esposa · llamar mañana 8:30" },
  },
  {
    id: "cot-088",
    contacto: "Paula Andrea Giraldo",
    trato: "Paula",
    negocio: "Tienda La Milagrosa",
    tipo: "Tienda de barrio",
    cargo: "Dueña",
    barrio: "Santa Cruz",
    telefono: "317 226 08 44",
    canal: "Web",
    hace: 30,
    lineas: [SOYA_3(4), PANELA(2), HUEVOS(4)],
    descuento: 0.07,
    incentivo: "siete por ciento",
    cerrada: { resultado: "cotizacion_reenviada", resumen: "Cotización nueva por WhatsApp · confirma el lunes" },
  },
  {
    id: "cot-079",
    contacto: "Ricardo Múnera",
    trato: "don Ricardo",
    negocio: "Cafetería Los Colores",
    tipo: "Cafetería",
    cargo: "Dueño",
    barrio: "Laureles",
    telefono: "604 365 49 12",
    canal: "Web",
    hace: 52,
    lineas: [CAFE(2), AZUCAR_50(1), SERVILLETA(3)],
    descuento: 0.1,
    incentivo: "diez por ciento",
    cerrada: { resultado: "no_interesado", resumen: "Le compra al hermano · no cambia de proveedor" },
  },
];

export const porId = (id: string) => COTIZACIONES.find((c) => c.id === id);

/** Las que tocan llamar, en el orden de la cola. */
export const PENDIENTES = COTIZACIONES.filter((c) => !c.cerrada);

/** «2 bultos de arroz de veinticinco kilos, 1 caneca de aceite… y 3 cubetas
    de huevos»: la misma frase que dice Sofi, con la cifra en dígitos porque
    esto se lee, no se oye. */
export function resumenLineas(c: Cotizacion) {
  const partes = c.lineas.map((l) => (l.cantidad === 1 ? `1 ${l.uno.replace(/^una? /, "")}` : `${l.cantidad} ${l.dicho}`));
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
