import type { CategoriaFuga, DefinicionRegla } from "./tipos";

/* ─────────────────────  EL CATÁLOGO DE REGLAS  ─────────────────────
   Las 31 reglas, en el orden en que se ejecutan y se pintan en pantalla.
   Es la única lista: el motor la recorre y la interfaz la dibuja, así que
   nunca puede haber una regla que corra y no salga, ni al revés.

   Tres capas, y la capa decide cuánta confianza se le concede al hallazgo:

     Capa 1 · reglas duras          — algo no cuadra documentalmente
     Capa 2 · coherencia económica  — el dinero no se comporta como debería
     Capa 3 · anomalías estadísticas— la forma de los datos llama la atención

   Una regla de capa 3 sola nunca pasa de amarillo, por grande que sea el monto.
   ------------------------------------------------------------------- */

export const ETIQUETA_CATEGORIA: Record<CategoriaFuga, string> = {
  compras: "Compras y proveedores",
  tesoreria: "Pagos y tesorería",
  inventario: "Inventario y merma",
  ventas: "Ventas, márgenes y cartera",
  maestros: "Datos maestros y control",
};

export const COLOR_CATEGORIA: Record<CategoriaFuga, string> = {
  compras: "#ff6b6b",
  tesoreria: "#ffc24b",
  inventario: "#4de1ff",
  ventas: "#c08bff",
  maestros: "#3fe38a",
};

export const ETIQUETA_CAPA: Record<1 | 2 | 3, string> = {
  1: "Reglas duras",
  2: "Coherencia económica",
  3: "Anomalías estadísticas",
};

export const CATALOGO: DefinicionRegla[] = [
  /* ── Capa 1 · lo que no cuadra documentalmente ── */
  {
    id: "R01",
    capa: 1,
    nombre: "Pago duplicado",
    categoria: "tesoreria",
    mira: "Mismo tercero y mismo importe exacto en una ventana de 60 días, o una factura pagada dos veces.",
    requiere: ["documentos.pago", "banco"],
  },
  {
    id: "R02",
    capa: 1,
    nombre: "Factura de compra sin orden de compra",
    categoria: "compras",
    mira: "Facturas que entraron sin que nadie hubiera autorizado antes la compra.",
    requiere: ["documentos.factura_compra", "documentos.orden_compra"],
  },
  {
    id: "R03",
    capa: 1,
    nombre: "Factura pagada sin entrada de inventario",
    categoria: "compras",
    mira: "El cruce de tres puntos: orden ↔ recepción ↔ factura. Se paga lo que no consta que llegara.",
    requiere: ["documentos.factura_compra", "documentos.entrada_inventario"],
  },
  {
    id: "R04",
    capa: 1,
    nombre: "Venta sin salida de inventario",
    categoria: "inventario",
    mira: "Se facturó mercancía inventariable que nunca salió de la bodega en el sistema.",
    requiere: ["documentos.factura_venta", "inventario", "items"],
  },
  {
    id: "R05",
    capa: 1,
    nombre: "Salida de inventario huérfana",
    categoria: "inventario",
    mira: "Mercancía que salió sin venta detrás ni ajuste que la explique.",
    requiere: ["inventario", "documentos.factura_venta"],
  },
  {
    id: "R06",
    capa: 1,
    nombre: "Huecos en los consecutivos",
    categoria: "maestros",
    mira: "Números que faltan en las series de facturación y de recibos de caja.",
    requiere: ["documentos.consecutivo"],
  },
  {
    id: "R07",
    capa: 1,
    nombre: "Pago tras un cambio de cuenta bancaria",
    categoria: "tesoreria",
    mira: "Pagos a un tercero cuya cuenta se cambió en los 30 días anteriores.",
    requiere: ["cambiosTercero", "documentos.pago"],
  },
  {
    id: "R08",
    capa: 1,
    nombre: "Proveedor con datos de empleado",
    categoria: "maestros",
    mira: "Cuenta bancaria, teléfono o dirección compartidos entre un proveedor y alguien de nómina.",
    requiere: ["terceros.cuentaBancaria", "terceros.empleado"],
  },
  {
    id: "R09",
    capa: 1,
    nombre: "Proveedor exprés",
    categoria: "maestros",
    mira: "Terceros creados y facturando en menos de 72 horas.",
    requiere: ["terceros.fechaCreacion", "documentos.factura_compra"],
  },
  {
    id: "R10",
    capa: 1,
    nombre: "Tercero sin identificación válida",
    categoria: "maestros",
    mira: "NIT ausente o que no pasa el dígito de verificación de la DIAN.",
    requiere: ["terceros.nit"],
  },
  {
    id: "R11",
    capa: 1,
    nombre: "Compra fraccionada",
    categoria: "compras",
    mira: "Varias compras al mismo proveedor que solas quedan bajo el umbral de aprobación y juntas lo superan.",
    requiere: ["documentos.orden_compra", "politicas.umbralAprobacion"],
  },
  {
    id: "R12",
    capa: 1,
    nombre: "Nota crédito sobre cartera vieja",
    categoria: "ventas",
    mira: "Notas crédito que borran facturas vencidas hace más de 90 días.",
    requiere: ["documentos.nota_credito", "documentos.factura_venta"],
  },
  {
    id: "R13",
    capa: 1,
    nombre: "Concentración de anulaciones",
    categoria: "ventas",
    mira: "Un usuario que concentra más del 40 % de las anulaciones y notas crédito del período.",
    requiere: ["documentos.usuarioRegistro", "documentos.nota_credito"],
  },
  {
    id: "R14",
    capa: 1,
    nombre: "Pago sin soporte",
    categoria: "tesoreria",
    mira: "Salidas de dinero del banco sin ningún documento que las respalde.",
    requiere: ["banco", "politicas.minimoSoportePago"],
  },

  /* ── Capa 2 · el dinero no se comporta como debería ── */
  {
    id: "R20",
    capa: 2,
    nombre: "Varianza de precio del mismo producto",
    categoria: "compras",
    mira: "El mismo SKU al mismo proveedor moviéndose más de un 15 % en 90 días.",
    requiere: ["lineas.precioUnitario", "documentos.factura_compra"],
  },
  {
    id: "R21",
    capa: 2,
    nombre: "Sobrecosto frente a otros proveedores",
    categoria: "compras",
    mira: "Un proveedor por encima del 20 % de la mediana que pagas por ese mismo producto.",
    requiere: ["lineas.precioUnitario", "terceros.proveedor"],
  },
  {
    id: "R22",
    capa: 2,
    nombre: "Venta por debajo del margen mínimo",
    categoria: "ventas",
    mira: "Facturas vendidas por debajo de la política de margen, o directamente a pérdida.",
    requiere: ["lineas.costoUnitario", "politicas.margenMinimoPct"],
  },
  {
    id: "R23",
    capa: 2,
    nombre: "Descuento fuera de política",
    categoria: "ventas",
    mira: "Descuentos manuales por encima del máximo, con el dinero sacrificado por vendedor.",
    requiere: ["lineas.descuentoPct", "politicas.descuentoMaximoPct"],
  },
  {
    id: "R24",
    capa: 2,
    nombre: "Despacho más caro que el margen del pedido",
    categoria: "ventas",
    mira: "Pedidos cuyo coste de envío se come lo que se gana con ellos.",
    requiere: ["costos.despachoPorPedido"],
  },
  {
    id: "R25",
    capa: 2,
    nombre: "Recompra anómala",
    categoria: "inventario",
    mira: "Se vuelve a comprar un producto cuyo stock no bajó desde la compra anterior.",
    requiere: ["inventario", "documentos.factura_compra"],
  },
  {
    id: "R26",
    capa: 2,
    nombre: "Merma recurrente",
    categoria: "inventario",
    mira: "Más de tres ajustes negativos del mismo producto o bodega en 90 días.",
    requiere: ["inventario.ajuste"],
  },
  {
    id: "R27",
    capa: 2,
    nombre: "Consumo teórico frente al real",
    categoria: "inventario",
    mira: "Lo que las ventas debieron consumir frente a lo que de verdad salió de inventario.",
    requiere: ["recetas.listaDeMateriales"],
  },
  {
    id: "R28",
    capa: 2,
    nombre: "Crédito fuera de política",
    categoria: "ventas",
    mira: "Clientes con más días de crédito de los que permite la política y sin gestión de cobro.",
    requiere: ["documentos.factura_venta", "documentos.recibo_caja", "politicas.diasCredito"],
  },
  {
    id: "R29",
    capa: 2,
    nombre: "Gasto recurrente sin contrapartida",
    categoria: "tesoreria",
    mira: "Cargos que se repiten cada mes sin contrato ni uso que los justifique.",
    requiere: ["contratos", "banco"],
  },
  {
    id: "R30",
    capa: 2,
    nombre: "El mismo producto a dos precios",
    categoria: "compras",
    mira: "Dos proveedores del mismo SKU con más de un 25 % de diferencia en el mismo período.",
    requiere: ["lineas.precioUnitario", "terceros.proveedor"],
  },

  /* ── Capa 3 · la forma de los datos ── */
  {
    id: "R40",
    capa: 3,
    nombre: "Ley de Benford",
    categoria: "compras",
    mira: "El primer dígito de las compras contra la distribución que aparece sola en los datos naturales.",
    requiere: ["documentos.factura_compra"],
  },
  {
    id: "R41",
    capa: 3,
    nombre: "Montos redondos bajo el umbral",
    categoria: "compras",
    mira: "Importes sospechosamente redondos que se paran justo antes de necesitar una firma.",
    requiere: ["politicas.umbralAprobacion"],
  },
  {
    id: "R42",
    capa: 3,
    nombre: "Registros fuera de horario",
    categoria: "maestros",
    mira: "Documentos tecleados de madrugada, en fin de semana o en festivo.",
    requiere: ["documentos.fechaRegistro"],
  },
  {
    id: "R43",
    capa: 3,
    nombre: "Importes atípicos",
    categoria: "compras",
    mira: "Transacciones que se salen del histórico del propio tercero (z ≥ 3).",
    requiere: ["documentos.factura_compra", "terceros"],
  },
  {
    id: "R44",
    capa: 3,
    nombre: "Cambio brusco de peso de un proveedor",
    categoria: "compras",
    mira: "Proveedores que ganan o pierden participación en el gasto de un trimestre a otro.",
    requiere: ["documentos.factura_compra"],
  },
  {
    id: "R45",
    capa: 3,
    nombre: "Concentración de volumen en un usuario",
    categoria: "maestros",
    mira: "Un usuario o una caja que acumula una parte del movimiento que no le corresponde.",
    requiere: ["documentos.usuarioRegistro"],
  },
];

export const REGLA = new Map(CATALOGO.map((r) => [r.id, r]));

/** Las reglas que se pintan juntas en la rejilla, por capas. */
export const POR_CAPA: { capa: 1 | 2 | 3; reglas: DefinicionRegla[] }[] = [1, 2, 3].map((capa) => ({
  capa: capa as 1 | 2 | 3,
  reglas: CATALOGO.filter((r) => r.capa === capa),
}));
