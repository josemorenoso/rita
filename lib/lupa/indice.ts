import type {
  CambioTercero,
  DefinicionRegla,
  Documento,
  Evidencia,
  Hallazgo,
  Item,
  LineaDocumento,
  Libro,
  MovimientoBanco,
  MovimientoInventario,
  Politicas,
  Semaforo,
  Sujeto,
  Tercero,
  TipoDocumento,
} from "./tipos";

/* ───────────────────  EL ÍNDICE Y EL CONTRATO DE UNA REGLA  ───────────────────
   Treinta y una reglas recorren el mismo libro. Si cada una se construye sus
   propios mapas, la auditoría pasa de 40 ms a varios segundos y, peor, cada
   regla acaba resolviendo el nombre de un tercero a su manera. Aquí se
   construye una vez todo lo que hace falta buscar, y se dan los tres o cuatro
   ayudantes que fabrican una línea de evidencia siempre igual.

   Una regla NO calcula su score ni su semáforo: devuelve el hecho y las
   cifras, y el motor decide cuánto pesa. Así la puntuación es una sola
   fórmula en un solo sitio, comparable entre reglas.
   ---------------------------------------------------------------------------- */

export type Indice = {
  libro: Libro;
  politicas: Politicas;

  tercero: Map<string, Tercero>;
  documento: Map<string, Documento>;
  /** Por número visible ("FC-2026-0331"), que es como se citan entre ellos. */
  porNumero: Map<string, Documento>;
  item: Map<string, Item>;

  porTipo: (tipo: TipoDocumento) => Documento[];
  lineasDe: (documentoId: string) => LineaDocumento[];
  docsDeTercero: (terceroId: string) => Documento[];
  movsDeSku: (sku: string) => MovimientoInventario[];
  movsDeDoc: (documentoId: string) => MovimientoInventario[];
  lineasDeSku: (sku: string) => LineaDocumento[];
  cambiosDe: (terceroId: string) => CambioTercero[];
  bancoDeDoc: (documentoId: string) => MovimientoBanco[];

  /** El nombre para enseñar. Nunca devuelve vacío: si no hay tercero, lo dice. */
  nombre: (terceroId: string | null | undefined) => string;
  /** Suma de facturas de venta vigentes: la base contra la que se mide el impacto. */
  facturacion: number;
  compras: number;
};

export function construirIndice(libro: Libro, politicas: Politicas): Indice {
  const tercero = new Map(libro.terceros.map((t) => [t.id, t]));
  const documento = new Map(libro.documentos.map((d) => [d.id, d]));
  const porNumero = new Map(libro.documentos.map((d) => [d.numero, d]));
  const item = new Map(libro.items.map((i) => [i.sku, i]));

  const porTipo = agrupar(libro.documentos, (d) => d.tipo);
  const lineasPorDoc = agrupar(libro.lineas, (l) => l.documentoId);
  const docsPorTercero = agrupar(libro.documentos, (d) => d.terceroId ?? "");
  const movsPorSku = agrupar(libro.inventario, (m) => m.sku);
  const movsPorDoc = agrupar(libro.inventario, (m) => m.documentoId ?? "");
  const lineasPorSku = agrupar(libro.lineas, (l) => l.sku);
  const cambiosPorTercero = agrupar(libro.cambiosTercero, (c) => c.terceroId);
  const bancoPorDoc = agrupar(libro.banco, (b) => b.documentoConciliadoId ?? "");

  const vacio: never[] = [];
  const facturacion = libro.documentos
    .filter((d) => d.tipo === "factura_venta" && d.estado !== "anulado")
    .reduce((s, d) => s + d.montoTotal, 0);
  const compras = libro.documentos
    .filter((d) => d.tipo === "factura_compra" && d.estado !== "anulado")
    .reduce((s, d) => s + d.montoTotal, 0);

  return {
    libro,
    politicas,
    tercero,
    documento,
    porNumero,
    item,
    porTipo: (t) => porTipo.get(t) ?? vacio,
    lineasDe: (id) => lineasPorDoc.get(id) ?? vacio,
    docsDeTercero: (id) => docsPorTercero.get(id) ?? vacio,
    movsDeSku: (sku) => movsPorSku.get(sku) ?? vacio,
    movsDeDoc: (id) => movsPorDoc.get(id) ?? vacio,
    lineasDeSku: (sku) => lineasPorSku.get(sku) ?? vacio,
    cambiosDe: (id) => cambiosPorTercero.get(id) ?? vacio,
    bancoDeDoc: (id) => bancoPorDoc.get(id) ?? vacio,
    nombre: (id) => (id ? (tercero.get(id)?.nombre ?? id) : "sin tercero"),
    facturacion,
    compras,
  };
}

function agrupar<T, K>(lista: T[], clave: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const previo = m.get(k);
    if (previo) previo.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/* ─────────────────────────  Evidencia  ───────────────────────── */

export const NOMBRE_TIPO: Record<TipoDocumento, string> = {
  orden_compra: "Orden de compra",
  factura_compra: "Factura de compra",
  entrada_inventario: "Entrada de inventario",
  factura_venta: "Factura de venta",
  nota_credito: "Nota crédito",
  nota_debito: "Nota débito",
  pago: "Pago a proveedor",
  recibo_caja: "Recibo de caja",
};

export function evidenciaDocumento(ix: Indice, doc: Documento, nota?: string): Evidencia {
  return {
    documento: NOMBRE_TIPO[doc.tipo],
    numero: doc.numero,
    fecha: doc.fecha,
    tercero: ix.nombre(doc.terceroId),
    monto: doc.montoTotal,
    archivo: doc.origen.archivo,
    hoja: doc.origen.hoja,
    fila: doc.origen.fila,
    nota,
  };
}

export function evidenciaBanco(ix: Indice, mov: MovimientoBanco, nota?: string): Evidencia {
  return {
    documento: mov.tipo === "debito" ? "Débito bancario" : "Crédito bancario",
    numero: mov.id,
    fecha: mov.fecha,
    tercero: mov.terceroIdInferido ? ix.nombre(mov.terceroIdInferido) : mov.descripcion,
    monto: mov.monto,
    archivo: mov.origen.archivo,
    hoja: mov.origen.hoja,
    fila: mov.origen.fila,
    nota,
  };
}

export function evidenciaMovimiento(ix: Indice, mov: MovimientoInventario, nota?: string): Evidencia {
  return {
    documento: `Movimiento de inventario · ${mov.tipo}`,
    numero: mov.id,
    fecha: mov.fecha,
    tercero: `${mov.sku} · ${ix.item.get(mov.sku)?.nombre ?? "SKU desconocido"}`,
    monto: null,
    archivo: mov.origen.archivo,
    hoja: mov.origen.hoja,
    fila: mov.origen.fila,
    nota,
  };
}

export function evidenciaTercero(t: Tercero, nota?: string): Evidencia {
  return {
    documento: `Ficha de ${t.tipo}`,
    numero: t.id,
    fecha: t.fechaCreacion,
    tercero: t.nombre,
    monto: null,
    archivo: t.origen.archivo,
    hoja: t.origen.hoja,
    fila: t.origen.fila,
    nota,
  };
}

export function evidenciaCambio(ix: Indice, c: CambioTercero, nota?: string): Evidencia {
  return {
    documento: "Cambio en el maestro de terceros",
    numero: `${c.terceroId} · ${c.campo}`,
    fecha: c.fecha,
    tercero: ix.nombre(c.terceroId),
    monto: null,
    archivo: c.origen.archivo,
    hoja: c.origen.hoja,
    fila: c.origen.fila,
    nota,
  };
}

/* ─────────────────────  Lo que devuelve una regla  ───────────────────── */

/** El hallazgo tal y como lo deja la regla: hechos y cifras, sin puntuar. */
export type HallazgoCrudo = Pick<
  Hallazgo,
  | "titulo"
  | "resumen"
  | "montoEnRiesgo"
  | "montoExacto"
  | "documentos"
  | "evidencia"
  | "quePuedeEstarPasando"
  | "queRevisar"
  | "controlSugerido"
  | "sujeto"
> & {
  serie?: Hallazgo["serie"];
  grafo?: Hallazgo["grafo"];
  /** Cuántas veces se repite el patrón en el período. Alimenta la recurrencia. */
  repeticiones: number;
  /**
   * ¿Queda documentalmente cerrado? Una regla lo pone a false cuando ella misma
   * ve la explicación —dos pagos iguales que resultan ser dos facturas
   * distintas, ambas con soporte—. El motor lo usa para bajar a verde.
   */
  evidenciaCompleta: boolean;
  /** Última palabra cuando la regla sabe algo que la fórmula no puede saber. */
  forzarSemaforo?: Semaforo;
};

export type ResultadoCrudo = {
  estado: "limpia" | "hallazgo" | "no_evaluable";
  /** Cuántos registros miró. Se enseña también cuando no encuentra nada. */
  revisados: number;
  motivo?: string;
  hallazgos: HallazgoCrudo[];
};

export type ContextoRegla = { ix: Indice; def: DefinicionRegla };
export type Regla = (ctx: ContextoRegla) => ResultadoCrudo;

export function limpia(revisados: number): ResultadoCrudo {
  return { estado: "limpia", revisados, hallazgos: [] };
}

export function noEvaluable(motivo: string): ResultadoCrudo {
  return { estado: "no_evaluable", revisados: 0, motivo, hallazgos: [] };
}

export function conHallazgos(revisados: number, hallazgos: HallazgoCrudo[]): ResultadoCrudo {
  return { estado: hallazgos.length ? "hallazgo" : "limpia", revisados, hallazgos };
}

export const sujetoTercero = (t: Tercero): Sujeto => ({ tipo: "tercero", id: t.id, nombre: t.nombre });
export const sujetoUsuario = (u: string, nombre?: string): Sujeto => ({
  tipo: "usuario",
  id: u,
  nombre: nombre ?? u,
});
export const sujetoSku = (sku: string, nombre: string): Sujeto => ({ tipo: "sku", id: sku, nombre });
export const sujetoBodega = (b: string): Sujeto => ({ tipo: "bodega", id: b, nombre: b });
