/**
 * El motor de LUPA: recorre el catálogo, puntúa lo que encuentran las reglas y
 * arma el informe.
 *
 * Las reglas devuelven hechos y cifras; NO deciden su gravedad. Toda la
 * puntuación vive en `puntuar()`, en una sola fórmula, para que un hallazgo de
 * inventario y uno de tesorería sean comparables y para que en cámara se pueda
 * defender por qué uno está en rojo y el otro no.
 *
 * Dos decisiones que sostienen el titular:
 *
 *  1. El total NO es la suma de los hallazgos. Se calcula sobre la UNIÓN de los
 *     documentos señalados: una factura que rompe tres reglas cuenta una vez.
 *     La suma cruda se enseña al lado (`sumaHallazgos`) precisamente para poder
 *     explicar la diferencia.
 *  2. La capa 3 no aporta dinero al titular. Son anomalías, no fugas probadas.
 *
 * Todo aquí es determinista: sin `Math.random`, sin `Date.now`, sin recorrer un
 * `Map` sin ordenar y con todos los empates rotos por id. Lo único medido con
 * reloj es `Informe.ms`, que no entra en ninguna comparación.
 */

import { CATALOGO } from "./catalogo";
import {
  construirIndice,
  type HallazgoCrudo,
  type Indice,
  type Regla,
  type ResultadoCrudo,
} from "./indice";
import { cop, copCorto, numero, pctL } from "./moneda";
import { CAPA1 } from "./reglas-capa1";
import { CAPA2 } from "./reglas-capa2";
import { CAPA3 } from "./reglas-capa3";
import type {
  Capa,
  CategoriaFuga,
  Documento,
  EventoAuditoria,
  Grafo,
  Hallazgo,
  Informe,
  Libro,
  Politicas,
  ResultadoRegla,
  Semaforo,
  Sujeto,
  Tercero,
} from "./tipos";

/* ─────────────────────────  Índice de reglas  ───────────────────────── */

/**
 * Las tres capas llegan en ficheros distintos y se escriben en paralelo. Se
 * normalizan aquí, tolerando que una regla del catálogo todavía no exista: en
 * ese caso queda «no evaluable» y la pantalla arranca igual, en vez de romper
 * la carga entera por una regla que falta.
 */
function indexarReglas(fuentes: unknown[]): Map<string, Regla> {
  const m = new Map<string, Regla>();
  for (const fuente of fuentes) {
    if (!fuente || typeof fuente !== "object") continue;
    for (const [id, valor] of Object.entries(fuente as Record<string, unknown>)) {
      if (typeof valor === "function") m.set(id, valor as Regla);
    }
  }
  return m;
}

const REGLAS = indexarReglas([CAPA1, CAPA2, CAPA3]);

/* ─────────────────────────  Puntuación  ─────────────────────────
   score = impacto (0-40) + confianza (0-40) + recurrencia (0-20)
   ---------------------------------------------------------------- */

/**
 * A partir de aquí el impacto ya no crece. El 1,5 % de la facturación de un
 * período son, en esta empresa, unos 63 millones: una sola fuga de ese tamaño
 * ya es un problema de dirección, y darle más puntos a una de 200 solo serviría
 * para que las demás desaparecieran de la lista. Saturar mantiene el orden
 * legible sin mentir sobre el dinero, que se enseña aparte.
 */
const SATURACION_IMPACTO = 0.015;

/**
 * La confianza la fija la capa, no el monto: una regla dura que cruza dos
 * documentos merece más crédito que una desviación estadística por grande que
 * sea. `evidenciaCompleta` a false baja al suelo del tramo porque significa que
 * la propia regla vio una explicación documental.
 */
const CONFIANZA: Record<Capa, { completa: number; parcial: number }> = {
  1: { completa: 40, parcial: 36 },
  2: { completa: 34, parcial: 24 },
  3: { completa: 22, parcial: 12 },
};

/** Cinco repeticiones ya saturan: lo que importa es «pasa siempre», no cuántas. */
const PUNTOS_POR_REPETICION = 4;

const UMBRAL_ROJO = 70;
const UMBRAL_AMARILLO = 40;

/** Lo que gana un compuesto por estar corroborado desde otra capa. */
const BONO_COMPUESTO = 15;

type Puntuacion = { impacto: number; confianza: number; recurrencia: number; score: number };

function puntuar(crudo: HallazgoCrudo, capa: Capa, facturacion: number): Puntuacion {
  const techo = facturacion * SATURACION_IMPACTO;
  const impacto = techo > 0 ? Math.round(Math.min(40, (40 * crudo.montoEnRiesgo) / techo)) : 0;
  const confianza = CONFIANZA[capa][crudo.evidenciaCompleta ? "completa" : "parcial"];
  const recurrencia = Math.min(20, Math.max(0, Math.round(crudo.repeticiones * PUNTOS_POR_REPETICION)));
  return { impacto, confianza, recurrencia, score: impacto + confianza + recurrencia };
}

/**
 * Dos techos duros por encima de la fórmula:
 *   · un hallazgo de capa 3 nunca pasa de amarillo, valga lo que valga;
 *   · el rojo exige capa 1 o 2 CON la evidencia documental cerrada.
 * `forzarSemaforo` tiene la última palabra: es lo que permite que una regla que
 * ve la explicación completa deje su propio hallazgo en verde.
 */
function semaforoDe(p: Puntuacion, capa: Capa, evidenciaCompleta: boolean, forzar?: Semaforo): Semaforo {
  if (forzar) return forzar;
  let s: Semaforo = p.score >= UMBRAL_ROJO ? "rojo" : p.score >= UMBRAL_AMARILLO ? "amarillo" : "verde";
  if (s === "rojo" && capa === 3) s = "amarillo";
  if (s === "rojo" && !evidenciaCompleta) s = "amarillo";
  return s;
}

/** Solo estos hallazgos ponen dinero en el titular. */
const aportaAlTotal = (h: Hallazgo) => !h.compuesto && h.capa !== 3 && h.semaforo !== "verde";

/* ─────────────────────  Reparto del dinero por documento  ───────────────────
   El titular se calcula documento a documento, no hallazgo a hallazgo. Cada
   hallazgo reparte su monto entre los documentos que señala en proporción a lo
   que vale cada uno, sin pasarse nunca del valor del propio documento; y cada
   documento aporta al total UNA sola vez, la mayor de las cifras que le
   atribuyen las reglas. Así una factura señalada por tres reglas no se cuenta
   tres veces, y un sobrecosto del 34 % sobre una factura no convierte la
   factura entera en fuga.
   ------------------------------------------------------------------------- */

type Cuota = { documentoId: string; monto: number; hallazgo: Hallazgo };

function construirValorador(libro: Libro): (id: string) => number | null {
  const porId = new Map(libro.documentos.map((d) => [d.id, d.montoTotal]));
  const porNumero = new Map(libro.documentos.map((d) => [d.numero, d.montoTotal]));
  const banco = new Map(libro.banco.map((b) => [b.id, b.monto]));
  return (id) => porId.get(id) ?? banco.get(id) ?? porNumero.get(id) ?? null;
}

function cuotasDe(h: Hallazgo, valorDe: (id: string) => number | null): Cuota[] {
  const ids = [...new Set(h.documentos)];
  if (!ids.length) return [];
  const valores = ids.map(valorDe);
  const conocidos = valores.filter((v): v is number => v !== null && v > 0);
  const medio = conocidos.length ? conocidos.reduce((s, v) => s + v, 0) / conocidos.length : 1;
  // Un identificador que no resuelve a ninguna fila (un consecutivo que falta,
  // por ejemplo) pesa como la media de sus hermanos: si no, el hallazgo perdería
  // esa parte de su monto por el camino.
  const pesos = valores.map((v) => (v !== null && v > 0 ? v : medio));
  const suma = pesos.reduce((s, v) => s + v, 0);
  return ids.map((documentoId, k) => {
    const cuota = suma > 0 ? (h.montoEnRiesgo * pesos[k]) / suma : h.montoEnRiesgo / ids.length;
    const tope = valores[k];
    return { documentoId, monto: tope !== null ? Math.min(cuota, tope) : cuota, hallazgo: h };
  });
}

/** Acumulador incremental: sirve para el total y para el contador de la animación. */
class Titular {
  private mejor = new Map<string, Cuota>();
  private valorDe: (id: string) => number | null;
  total = 0;

  constructor(valorDe: (id: string) => number | null) {
    this.valorDe = valorDe;
  }

  anadir(h: Hallazgo): void {
    if (!aportaAlTotal(h)) return;
    for (const c of cuotasDe(h, this.valorDe)) {
      const previa = this.mejor.get(c.documentoId);
      if (previa && previa.monto >= c.monto) continue;
      this.total += c.monto - (previa?.monto ?? 0);
      this.mejor.set(c.documentoId, c);
    }
  }

  /** Cada documento aporta a la categoría del hallazgo que más le atribuye. */
  porCategoria(): Map<CategoriaFuga, number> {
    const m = new Map<CategoriaFuga, number>();
    for (const c of this.mejor.values()) {
      m.set(c.hallazgo.categoria, (m.get(c.hallazgo.categoria) ?? 0) + c.monto);
    }
    return m;
  }
}

/* ─────────────────────────  Disponibilidad de datos  ─────────────────────────
   Una regla es «no evaluable» cuando el material que necesita no llegó, y eso
   se decide aquí a partir de `requiere`, no dentro de la regla: el panel de
   cobertura tiene que poder decir con las mismas palabras qué falta.
   -------------------------------------------------------------------------- */

const FALTA: Record<string, string> = {
  "costos.despachoPorPedido": "el coste de despacho por pedido",
  "recetas.listaDeMateriales": "la lista de materiales (esta empresa distribuye, no transforma)",
  contratos: "el maestro de contratos",
};

function disponible(libro: Libro, token: string): boolean {
  const [raiz, resto] = token.split(".");
  switch (raiz) {
    case "documentos":
      if (!resto) return libro.documentos.length > 0;
      if (resto === "consecutivo") return libro.documentos.some((d) => d.consecutivo !== null);
      if (resto === "fechaRegistro") return libro.documentos.some((d) => d.fechaRegistro !== null);
      if (resto === "usuarioRegistro") return libro.documentos.some((d) => d.usuarioRegistro !== null);
      return libro.documentos.some((d) => d.tipo === resto);
    case "lineas":
      if (resto === "costoUnitario") return libro.lineas.some((l) => l.costoUnitario !== null);
      return libro.lineas.length > 0;
    case "inventario":
      if (resto === "ajuste") return libro.inventario.some((m) => m.tipo === "ajuste");
      return libro.inventario.length > 0;
    case "banco":
      return libro.banco.length > 0;
    case "items":
      return libro.items.length > 0;
    case "cambiosTercero":
      return libro.cambiosTercero.length > 0;
    case "terceros":
      if (resto === "proveedor" || resto === "cliente" || resto === "empleado") {
        return libro.terceros.some((t) => t.tipo === resto);
      }
      if (resto === "cuentaBancaria") return libro.terceros.some((t) => t.cuentaBancaria !== "");
      if (resto === "nit") return libro.terceros.length > 0;
      return libro.terceros.length > 0;
    case "politicas":
      return libro.politicas !== null;
    default:
      return false;
  }
}

function motivoFalta(libro: Libro, requiere: string[]): string | null {
  const falta = requiere.find((t) => !disponible(libro, t));
  if (!falta) return null;
  const etiqueta = FALTA[falta];
  if (etiqueta) return `No llegó ${etiqueta}. Sin ese dato la regla no se puede evaluar.`;
  if (falta.startsWith("politicas.")) {
    return "No llegó el fichero de políticas: la regla necesita el parámetro para tener contra qué comparar.";
  }
  return `Falta \`${falta}\` en los ficheros cargados. La regla no se ejecuta a medias.`;
}

/* ─────────────────────  Líneas de consola de la reproducción  ─────────────────
   El guion de la animación. Cada regla dice en primera persona qué está
   mirando y sobre cuántos registros: es lo que se lee en pantalla mientras el
   contador sube, y tiene que ser verdad.
   -------------------------------------------------------------------------- */

type Plantilla = [texto: string, cuantos: (ix: Indice) => number];

const PLANTILLA_RUN: Record<string, Plantilla> = {
  R01: ["cruzando {n} pagos contra el extracto en ventanas de 60 días", (ix) => ix.porTipo("pago").length],
  R02: [
    "contrastando {n} facturas de compra contra la orden que las autoriza",
    (ix) => ix.porTipo("factura_compra").length,
  ],
  R03: ["aplicando el cruce de tres puntos a {n} facturas de compra", (ix) => ix.porTipo("factura_compra").length],
  R04: ["siguiendo {n} facturas de venta hasta su salida de bodega", (ix) => ix.porTipo("factura_venta").length],
  R05: [
    "buscando la venta que explica cada una de {n} salidas de inventario",
    (ix) => ix.libro.inventario.filter((m) => m.tipo === "salida").length,
  ],
  R06: [
    "recorriendo {n} consecutivos de factura y de recibo de caja",
    (ix) => ix.libro.documentos.filter((d) => d.consecutivo !== null).length,
  ],
  R07: [
    "cotejando {n} cambios en el maestro de terceros con los pagos posteriores",
    (ix) => ix.libro.cambiosTercero.length,
  ],
  R08: ["comparando cuenta, teléfono y dirección de {n} terceros contra la nómina", (ix) => ix.libro.terceros.length],
  R09: ["midiendo las horas entre el alta de {n} terceros y su primera factura", (ix) => ix.libro.terceros.length],
  R10: ["validando el dígito de verificación de {n} NIT contra el algoritmo de la DIAN", (ix) => ix.libro.terceros.length],
  R11: ["cruzando {n} órdenes de compra contra el umbral de aprobación de {umbral}", (ix) => ix.porTipo("orden_compra").length],
  R12: ["buscando entre {n} notas crédito las que borran cartera de más de 90 días", (ix) => ix.porTipo("nota_credito").length],
  R13: ["repartiendo {n} notas crédito y anulaciones entre los usuarios que las firmaron", (ix) => ix.porTipo("nota_credito").length],
  R14: [
    "buscando soporte documental para {n} débitos bancarios por encima de {soporte}",
    (ix) => ix.libro.banco.filter((b) => b.tipo === "debito").length,
  ],
  R20: [
    "midiendo la varianza de precio de {n} líneas de compra, SKU a SKU",
    (ix) => ix.libro.lineas.filter((l) => ix.documento.get(l.documentoId)?.tipo === "factura_compra").length,
  ],
  R21: ["comparando cada proveedor contra la mediana de precio de {n} SKU comprados", (ix) => ix.libro.items.length],
  R22: ["calculando el margen de {n} facturas de venta contra el mínimo de {margen}", (ix) => ix.porTipo("factura_venta").length],
  R23: [
    "revisando {n} líneas de venta contra el descuento máximo de política, {descuento}",
    (ix) => ix.libro.lineas.filter((l) => ix.documento.get(l.documentoId)?.tipo === "factura_venta").length,
  ],
  R24: ["buscando el coste de despacho por pedido en los ficheros cargados", () => 0],
  R25: ["contrastando {n} compras contra el stock que había el día de recomprar", (ix) => ix.porTipo("factura_compra").length],
  R26: [
    "agrupando {n} ajustes de inventario por producto y bodega",
    (ix) => ix.libro.inventario.filter((m) => m.tipo === "ajuste").length,
  ],
  R27: ["buscando la lista de materiales en los ficheros cargados", () => 0],
  R28: ["midiendo los días de crédito reales de {n} facturas de venta contra los {dias} de política", (ix) => ix.porTipo("factura_venta").length],
  R29: ["buscando el maestro de contratos en los ficheros cargados", () => 0],
  R30: ["buscando entre {n} SKU los que se compran a más de un proveedor", (ix) => ix.libro.items.length],
  R40: ["contando el primer dígito de {n} facturas de compra", (ix) => ix.porTipo("factura_compra").length],
  R41: [
    "buscando importes redondos que se paran justo debajo de {umbral} en {n} documentos de compra",
    (ix) => ix.porTipo("orden_compra").length + ix.porTipo("factura_compra").length,
  ],
  R42: [
    "leyendo la hora de registro de {n} documentos: madrugada, fin de semana y festivo",
    (ix) => ix.libro.documentos.filter((d) => d.fechaRegistro !== null).length,
  ],
  R43: ["calculando la z de {n} facturas de compra contra el histórico de su propio tercero", (ix) => ix.porTipo("factura_compra").length],
  R44: ["midiendo trimestre a trimestre el peso de cada proveedor sobre {n} facturas de compra", (ix) => ix.porTipo("factura_compra").length],
  R45: [
    "repartiendo {n} documentos entre los usuarios que los teclearon",
    (ix) => ix.libro.documentos.filter((d) => d.usuarioRegistro !== null).length,
  ],
};

function lineaRun(id: string, nombre: string, ix: Indice, pol: Politicas, hayPoliticas: boolean): string {
  const plantilla = PLANTILLA_RUN[id];
  const n = plantilla ? plantilla[1](ix) : ix.libro.documentos.length;
  const texto = plantilla ? plantilla[0] : `${nombre.toLowerCase()}: revisando {n} registros`;
  const sustituido = texto
    .replace("{n}", numero(n))
    .replace("{umbral}", hayPoliticas ? cop(pol.umbralAprobacion) : "el umbral de política")
    .replace("{soporte}", hayPoliticas ? cop(pol.minimoSoportePago) : "el mínimo de política")
    .replace("{margen}", hayPoliticas ? `${pol.margenMinimoPct} %` : "el margen de política")
    .replace("{descuento}", hayPoliticas ? `${pol.descuentoMaximoPct} %` : "el máximo de política")
    .replace("{dias}", hayPoliticas ? `${pol.diasCredito} días` : "los días de política");
  return `${id} · ${sustituido}`;
}

/* ────────────────────────  Texto de los compuestos  ──────────────────────── */

/** La media frase que aporta cada regla al titular del compuesto. */
function clausulaDe(reglaId: string, hijo: Hallazgo, ix: Indice, sujeto: Sujeto): string {
  switch (reglaId) {
    case "R08": {
      const empleado = empleadoConMismaCuenta(ix, sujeto.id);
      return empleado ? `comparte cuenta bancaria con ${empleado.nombre}` : "comparte datos de contacto con la nómina";
    }
    case "R09": {
      const h = horasHastaPrimeraFactura(ix, sujeto.id);
      return h !== null ? `fue creado y facturó ${numero(h)} horas después` : "fue creado y facturó en menos de 72 horas";
    }
    case "R02":
      return "factura sin orden de compra que la autorice";
    case "R03":
      return "cobra mercancía que no consta que entrara";
    case "R07":
      return "cobró justo después de cambiar de cuenta bancaria";
    case "R11":
      return "fracciona sus compras para no pasar por la firma";
    case "R41":
      return "en importes redondos que se paran bajo el umbral";
    case "R12":
      return "borra cartera vencida a más de 90 días";
    case "R13":
      return "concentra las notas crédito del período";
    case "R45":
      return "concentra un volumen de registro que no le corresponde";
    case "R20":
      return "sube de precio sin nada que lo explique";
    case "R21":
      return "cobra por encima de lo que pagas a los demás";
    case "R30":
      return "deja el mismo producto a dos precios";
    case "R26":
      return "acumula ajustes negativos del mismo producto";
    case "R25":
      return "se recompra con el stock todavía lleno";
    case "R42":
      return "se registra fuera del horario laboral";
    case "R43":
      return "mueve importes fuera de su propio histórico";
    case "R44":
      return "irrumpe de golpe en el gasto del trimestre";
    case "R22":
      return "vende por debajo del margen mínimo";
    case "R23":
      return "concede descuentos fuera de política";
    case "R28":
      return "estira el crédito muy por encima de la política";
    case "R14":
      return "saca dinero del banco sin soporte";
    case "R01":
      return "aparece pagado dos veces";
    default:
      return hijo.titulo.charAt(0).toLowerCase() + hijo.titulo.slice(1);
  }
}

/** "a, b y c" — con la `e` cuando toca, que si no chirría al narrarlo. */
function unirFrases(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  const ultima = xs[xs.length - 1];
  const nexo = /^(i|hi)(?!e)/i.test(ultima) ? " e " : " y ";
  return xs.slice(0, -1).join(", ") + nexo + ultima;
}

const ARTICULO: Record<Sujeto["tipo"], string> = {
  tercero: "El tercero",
  usuario: "El usuario",
  sku: "El producto",
  bodega: "La bodega",
};

function empleadoConMismaCuenta(ix: Indice, terceroId: string): Tercero | null {
  const t = ix.tercero.get(terceroId);
  if (!t || !t.cuentaBancaria) return null;
  const empleado = ix.libro.terceros.find(
    (o) => o.tipo === "empleado" && o.id !== t.id && o.cuentaBancaria === t.cuentaBancaria,
  );
  return empleado ?? null;
}

/** Horas entre el alta del tercero y el registro de su primera factura de compra. */
function horasHastaPrimeraFactura(ix: Indice, terceroId: string): number | null {
  const t = ix.tercero.get(terceroId);
  if (!t) return null;
  const facturas = ix
    .docsDeTercero(terceroId)
    .filter((d) => d.tipo === "factura_compra" && d.fechaRegistro !== null)
    .sort((a, b) => (a.fechaRegistro! < b.fechaRegistro! ? -1 : 1));
  const primera = facturas[0];
  if (!primera || !primera.fechaRegistro) return null;
  const ms = Date.parse(`${primera.fechaRegistro}:00`) - Date.parse(`${t.fechaCreacion.slice(0, 10)}T00:00:00`);
  const horas = Math.round(ms / 3_600_000);
  return horas > 0 && horas < 24 * 30 ? horas : null;
}

/** El usuario del ERP se forma con la inicial y el primer apellido: "Marcela Osorio" → `mosorio`. */
function usuarioProbableDe(nombre: string): string | null {
  const partes = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length < 2) return null;
  return partes[0].charAt(0) + partes[1];
}

/* ──────────────────────────  Grafos del compuesto  ────────────────────────── */

const MAX_NODOS_DOC = 5;

function grafoProveedorEmpleado(ix: Indice, sujeto: Sujeto, documentos: string[]): Grafo | undefined {
  const prov = ix.tercero.get(sujeto.id);
  if (!prov || prov.tipo !== "proveedor") return undefined;
  const empleado = empleadoConMismaCuenta(ix, prov.id);
  if (!empleado) return undefined;

  const facturas = documentos
    .map((id) => ix.documento.get(id))
    .filter((d): d is Documento => !!d && d.tipo === "factura_compra")
    .sort((a, b) => (a.fecha === b.fecha ? a.numero.localeCompare(b.numero) : a.fecha < b.fecha ? -1 : 1))
    .slice(0, MAX_NODOS_DOC);

  const cuenta = `CTA-${prov.cuentaBancaria}`;
  const nodos: Grafo["nodos"] = [
    { id: prov.id, etiqueta: prov.nombre, clase: "proveedor" },
    { id: cuenta, etiqueta: `${prov.banco} · ${prov.cuentaBancaria}`, clase: "banco" },
    { id: empleado.id, etiqueta: `${empleado.nombre} · nómina`, clase: "empleado" },
  ];
  const aristas: Grafo["aristas"] = [
    { de: prov.id, a: cuenta, etiqueta: "cuenta registrada" },
    { de: empleado.id, a: cuenta, etiqueta: "misma cuenta", alerta: true },
  ];

  const usuario = usuarioProbableDe(empleado.nombre);
  const registraElEmpleado = usuario !== null && facturas.some((f) => f.usuarioRegistro === usuario);
  if (usuario !== null && !registraElEmpleado && facturas.some((f) => f.usuarioRegistro)) {
    const u = facturas.find((f) => f.usuarioRegistro)?.usuarioRegistro ?? usuario;
    nodos.push({ id: `USR-${u}`, etiqueta: `${u} · usuario del ERP`, clase: "usuario" });
  }

  for (const f of facturas) {
    nodos.push({ id: f.id, etiqueta: `${f.numero} · ${copCorto(f.montoTotal)}`, clase: "documento" });
    aristas.push({
      de: prov.id,
      a: f.id,
      etiqueta: f.ordenCompraId ? "factura con orden de compra" : "factura sin orden de compra",
      alerta: !f.ordenCompraId,
    });
    if (f.usuarioRegistro) {
      const origen = registraElEmpleado && f.usuarioRegistro === usuario ? empleado.id : `USR-${f.usuarioRegistro}`;
      if (nodos.some((n) => n.id === origen)) {
        aristas.push({ de: origen, a: f.id, etiqueta: "registra", alerta: true });
      }
    }
  }
  return { nodos, aristas };
}

function grafoUsuarioNotas(ix: Indice, sujeto: Sujeto, documentos: string[]): Grafo | undefined {
  const notas = documentos
    .map((id) => ix.documento.get(id))
    .filter((d): d is Documento => !!d && d.tipo === "nota_credito")
    .sort((a, b) => (a.fecha === b.fecha ? a.numero.localeCompare(b.numero) : a.fecha < b.fecha ? -1 : 1))
    .slice(0, MAX_NODOS_DOC);
  if (notas.length < 2) return undefined;

  const nodos: Grafo["nodos"] = [{ id: `USR-${sujeto.id}`, etiqueta: `${sujeto.nombre} · ${sujeto.id}`, clase: "usuario" }];
  const aristas: Grafo["aristas"] = [];
  for (const nc of notas) {
    nodos.push({ id: nc.id, etiqueta: `${nc.numero} · ${copCorto(nc.montoTotal)}`, clase: "documento" });
    aristas.push({ de: `USR-${sujeto.id}`, a: nc.id, etiqueta: "emite", alerta: true });
    const fv = nc.facturaAfectadaId ? ix.documento.get(nc.facturaAfectadaId) : undefined;
    if (fv && !nodos.some((n) => n.id === fv.id)) {
      nodos.push({ id: fv.id, etiqueta: `${fv.numero} · ${ix.nombre(fv.terceroId)}`, clase: "documento" });
      aristas.push({ de: nc.id, a: fv.id, etiqueta: "borra cartera vencida", alerta: true });
    }
  }
  return { nodos, aristas };
}

/* ────────────────────────────────  Motor  ──────────────────────────────── */

const SIN_POLITICAS: Politicas = {
  umbralAprobacion: 0,
  margenMinimoPct: 0,
  descuentoMaximoPct: 0,
  diasCredito: 0,
  horarioInicio: 7,
  horarioFin: 18,
  minimoSoportePago: 0,
  origen: { archivo: "—", hoja: "—", fila: 0 },
};

type Ejecucion = {
  reglaId: string;
  capa: Capa;
  categoria: CategoriaFuga;
  nombre: string;
  crudo: ResultadoCrudo;
  hallazgos: Hallazgo[];
};

export function auditar(libro: Libro): Informe {
  const t0 = performance.now();

  const politicas = libro.politicas ?? SIN_POLITICAS;
  const ix = construirIndice(libro, politicas);
  const hayPoliticas = libro.politicas !== null;

  /* 1 · Ejecutar el catálogo en orden. */
  const ejecuciones: Ejecucion[] = [];
  for (const def of CATALOGO) {
    const motivo = motivoFalta(libro, def.requiere);
    const regla = REGLAS.get(def.id);
    let crudo: ResultadoCrudo;
    if (motivo) {
      crudo = { estado: "no_evaluable", revisados: 0, motivo, hallazgos: [] };
    } else if (!regla) {
      crudo = {
        estado: "no_evaluable",
        revisados: 0,
        motivo: "La regla está en el catálogo pero todavía no tiene implementación.",
        hallazgos: [],
      };
    } else {
      try {
        crudo = regla({ ix, def });
      } catch (e) {
        crudo = {
          estado: "no_evaluable",
          revisados: 0,
          motivo: `La regla se detuvo: ${e instanceof Error ? e.message : String(e)}`,
          hallazgos: [],
        };
      }
    }

    const hallazgos = crudo.hallazgos.map((c) => {
      const p = puntuar(c, def.capa, ix.facturacion);
      const h: Hallazgo = {
        id: "",
        reglaId: def.id,
        capa: def.capa,
        categoria: def.categoria,
        titulo: c.titulo,
        resumen: c.resumen,
        semaforo: semaforoDe(p, def.capa, c.evidenciaCompleta, c.forzarSemaforo),
        score: p.score,
        impacto: p.impacto,
        confianza: p.confianza,
        recurrencia: p.recurrencia,
        montoEnRiesgo: c.montoEnRiesgo,
        montoExacto: c.montoExacto,
        documentos: c.documentos,
        evidencia: c.evidencia,
        quePuedeEstarPasando: c.quePuedeEstarPasando,
        queRevisar: c.queRevisar,
        controlSugerido: c.controlSugerido,
        sujeto: c.sujeto,
      };
      if (c.serie) h.serie = c.serie;
      if (c.grafo) h.grafo = c.grafo;
      return h;
    });

    ejecuciones.push({ reglaId: def.id, capa: def.capa, categoria: def.categoria, nombre: def.nombre, crudo, hallazgos });
  }

  const individuales = ejecuciones.flatMap((e) => e.hallazgos);

  /* 2 · Compuestos: el mismo sujeto señalado desde más de una capa. */
  const composiciones = componer(ix, individuales);
  const compuestos = composiciones.map((c) => c.compuesto);

  /* 3 · Orden final e identificadores. Los compuestos primero: son la historia.
     Los ids se asignan aquí, con el orden ya cerrado, y solo entonces el
     compuesto puede apuntar a sus hijos por id. */
  const hallazgos = [...compuestos, ...individuales].sort(comparar);
  hallazgos.forEach((h, i) => {
    h.id = `H-${String(i + 1).padStart(2, "0")}`;
  });
  for (const c of composiciones) c.compuesto.hijos = c.hijos.map((h) => h.id);

  /* 4 · El titular, sobre la unión de documentos. */
  const valorDe = construirValorador(libro);
  const titular = new Titular(valorDe);
  for (const h of hallazgos) titular.anadir(h);
  const montoEnRiesgo = Math.round(titular.total);
  // La misma lista que el titular, sumada sin cuidado. Sobre esa población y no
  // sobre otra: si aquí entrara el volumen de la capa 3, la comparación de
  // pantalla («esto es lo que sale de sumar, esto es lo que sale de cruzar»)
  // dejaría de significar nada.
  const sumaHallazgos = Math.round(hallazgos.filter(aportaAlTotal).reduce((s, h) => s + h.montoEnRiesgo, 0));
  const pctFacturacion = ix.facturacion > 0 ? (montoEnRiesgo / ix.facturacion) * 100 : 0;

  /* 5 · El guion de la reproducción, con el contador cuadrando al céntimo. */
  const eventos = construirEventos(ix, politicas, hayPoliticas, ejecuciones, composiciones, valorDe, montoEnRiesgo);

  const resultados: ResultadoRegla[] = ejecuciones.map((e) => {
    const r: ResultadoRegla = {
      reglaId: e.reglaId,
      estado: e.crudo.estado === "no_evaluable" ? "no_evaluable" : e.hallazgos.length ? "hallazgo" : "limpia",
      revisados: e.crudo.revisados,
      hallazgos: e.hallazgos,
    };
    if (e.crudo.motivo) r.motivo = e.crudo.motivo;
    return r;
  });

  const montoCategoria = titular.porCategoria();
  const porCategoria = [...montoCategoria.keys()]
    .concat(hallazgos.map((h) => h.categoria))
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((categoria) => ({
      categoria,
      monto: Math.round(montoCategoria.get(categoria) ?? 0),
      hallazgos: hallazgos.filter((h) => h.categoria === categoria).length,
    }))
    .sort((a, b) => b.monto - a.monto || a.categoria.localeCompare(b.categoria));

  const conteo = {
    rojo: hallazgos.filter((h) => h.semaforo === "rojo").length,
    amarillo: hallazgos.filter((h) => h.semaforo === "amarillo").length,
    verde: hallazgos.filter((h) => h.semaforo === "verde").length,
  };

  return {
    empresa: libro.empresa,
    periodo: libro.periodo,
    facturacion: ix.facturacion,
    compras: ix.compras,
    montoEnRiesgo,
    sumaHallazgos,
    pctFacturacion,
    hallazgos,
    resultados,
    eventos,
    porCategoria,
    conteo,
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/** Compuestos primero; luego score y, a igualdad, dinero. Empates rotos por regla e id. */
function comparar(a: Hallazgo, b: Hallazgo): number {
  if (!!b.compuesto !== !!a.compuesto) return a.compuesto ? -1 : 1;
  return (
    b.score - a.score ||
    b.montoEnRiesgo - a.montoEnRiesgo ||
    a.reglaId.localeCompare(b.reglaId) ||
    a.titulo.localeCompare(b.titulo)
  );
}

/* ─────────────────────────  Composición  ───────────────────────── */

/**
 * Un sujeto señalado desde más de una capa deja de ser una lista de incidencias
 * y pasa a ser una historia: es lo que se narra en cámara. La condición es
 * exactamente esa —más de una capa—, porque dos reglas de la misma capa suelen
 * mirar el mismo indicio con dos linternas, y eso no corrobora nada.
 */
type Composicion = { compuesto: Hallazgo; hijos: Hallazgo[] };

function componer(ix: Indice, individuales: Hallazgo[]): Composicion[] {
  const valorDe = construirValorador(ix.libro);
  const grupos = new Map<string, Hallazgo[]>();
  for (const h of individuales) {
    if (!h.sujeto || h.semaforo === "verde") continue;
    const clave = `${h.sujeto.tipo}:${h.sujeto.id}`;
    const previo = grupos.get(clave);
    if (previo) previo.push(h);
    else grupos.set(clave, [h]);
  }

  const compuestos: Composicion[] = [];
  for (const clave of [...grupos.keys()].sort()) {
    const hijos = [...grupos.get(clave)!].sort((a, b) => a.capa - b.capa || b.score - a.score || a.reglaId.localeCompare(b.reglaId));
    if (new Set(hijos.map((h) => h.capa)).size < 2) continue;

    const sujeto = hijos[0].sujeto!;
    const capa = Math.min(...hijos.map((h) => h.capa)) as Capa;
    const dominante = [...hijos].sort((a, b) => b.score - a.score || a.reglaId.localeCompare(b.reglaId))[0];

    // El compuesto no inventa dinero: vale lo que sus hijos aportan al titular,
    // contado una sola vez por documento.
    const aportantes = hijos.filter(aportaAlTotal);
    const porDoc = new Map<string, number>();
    for (const h of aportantes) {
      for (const c of cuotasDe(h, valorDe)) {
        porDoc.set(c.documentoId, Math.max(porDoc.get(c.documentoId) ?? 0, c.monto));
      }
    }
    const monto = Math.round([...porDoc.values()].reduce((s, v) => s + v, 0));
    const documentos = [...new Set(hijos.flatMap((h) => h.documentos))];

    const clausulas = hijos.slice(0, 4).map((h) => clausulaDe(h.reglaId, h, ix, sujeto));
    const capas = [...new Set(hijos.map((h) => h.capa))].sort();
    const titulo = `${sujeto.nombre} ${unirFrases(clausulas)}`;
    const resumen =
      `${ARTICULO[sujeto.tipo]} ${sujeto.nombre} aparece en ${hijos.length} reglas de ${capas.length} capas ` +
      `distintas (${hijos.map((h) => h.reglaId).join(", ")}), sobre ${numero(documentos.length)} documentos ` +
      `y ${cop(monto)} en riesgo. Ninguna de esas reglas, por separado, cuenta esta historia.`;

    // El bono no es un atajo al rojo: el compuesto pasa por el mismo semáforo
    // que los demás, solo que con la capa más dura de sus hijos.
    const p: Puntuacion = {
      impacto: dominante.impacto,
      confianza: dominante.confianza,
      recurrencia: dominante.recurrencia,
      score: Math.min(100, dominante.score + BONO_COMPUESTO),
    };

    const compuesto: Hallazgo = {
      id: "",
      // Hereda la regla que más pesa: así cualquier pantalla que resuelva el
      // nombre de la regla sigue encontrando algo que enseñar.
      reglaId: dominante.reglaId,
      capa,
      categoria: dominante.categoria,
      titulo,
      resumen,
      semaforo: semaforoDe(p, capa, true),
      score: p.score,
      impacto: p.impacto,
      confianza: p.confianza,
      recurrencia: p.recurrencia,
      montoEnRiesgo: monto,
      montoExacto: aportantes.every((h) => h.montoExacto),
      documentos,
      evidencia: dedupEvidencia(hijos.flatMap((h) => h.evidencia)).slice(0, 12),
      quePuedeEstarPasando: unicos(hijos.flatMap((h) => h.quePuedeEstarPasando)).slice(0, 5),
      queRevisar: unicos(hijos.flatMap((h) => h.queRevisar)).slice(0, 6),
      controlSugerido: dominante.controlSugerido,
      sujeto,
      hijos: [],
      compuesto: true,
    };

    const grafo =
      sujeto.tipo === "tercero"
        ? grafoProveedorEmpleado(ix, sujeto, documentos)
        : sujeto.tipo === "usuario"
          ? grafoUsuarioNotas(ix, sujeto, documentos)
          : undefined;
    if (grafo) compuesto.grafo = grafo;
    const serie = hijos.find((h) => h.serie)?.serie;
    if (serie) compuesto.serie = serie;

    compuestos.push({ compuesto, hijos });
  }
  return compuestos;
}

function unicos(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()))].filter(Boolean);
}

function dedupEvidencia(xs: Hallazgo["evidencia"]): Hallazgo["evidencia"] {
  const vistos = new Set<string>();
  const out: Hallazgo["evidencia"] = [];
  for (const e of xs) {
    const k = `${e.archivo}|${e.hoja}|${e.fila}|${e.numero}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(e);
  }
  return out;
}

/* ─────────────────────────  Eventos  ───────────────────────── */

/**
 * El contador de la pantalla sube leyendo `acumulado`, así que se calcula con
 * el mismo acumulador que el titular: cada hallazgo entra una vez, en el orden
 * en que corre su regla, y el último evento cierra exactamente en la cifra del
 * titular. No hay dos aritméticas.
 */
function construirEventos(
  ix: Indice,
  politicas: Politicas,
  hayPoliticas: boolean,
  ejecuciones: Ejecucion[],
  composiciones: Composicion[],
  valorDe: (id: string) => number | null,
  montoEnRiesgo: number,
): EventoAuditoria[] {
  const eventos: EventoAuditoria[] = [];
  const titular = new Titular(valorDe);
  let seq = 0;
  const push = (e: Omit<EventoAuditoria, "seq" | "acumulado">) => {
    eventos.push({ seq: seq++, acumulado: Math.round(titular.total), ...e });
  };

  for (const e of ejecuciones) {
    push({ reglaId: e.reglaId, marca: "run", log: lineaRun(e.reglaId, e.nombre, ix, politicas, hayPoliticas) });

    if (e.crudo.estado === "no_evaluable") {
      push({ reglaId: e.reglaId, marca: "skip", log: `${e.reglaId} · no evaluable · ${e.crudo.motivo ?? "faltan datos"}` });
      continue;
    }
    if (!e.hallazgos.length) {
      push({
        reglaId: e.reglaId,
        marca: "ok",
        log: `${e.reglaId} · limpio · ${numero(e.crudo.revisados)} registros revisados, nada que señalar`,
      });
      continue;
    }
    for (const h of e.hallazgos) {
      titular.anadir(h);
      const cifra = h.semaforo === "verde" ? "no suma: hay explicación documental" : cop(h.montoEnRiesgo);
      eventos.push({
        seq: seq++,
        reglaId: e.reglaId,
        marca: "hit",
        log: `${e.reglaId} · ${h.titulo} · ${cifra} · acumulado ${copCorto(titular.total)}`,
        acumulado: Math.round(titular.total),
        hallazgoId: h.id,
        categoria: h.categoria,
      });
    }
  }

  /* Fase de composición: aquí es donde las piezas sueltas se convierten en caso. */
  push({
    reglaId: "COMP",
    marca: "run",
    log: `COMP · cruzando ${numero(ejecuciones.reduce((s, e) => s + e.hallazgos.length, 0))} hallazgos por sujeto para ver quién se repite entre capas`,
  });
  for (const { compuesto: c, hijos } of composiciones) {
    const capas = new Set(hijos.map((h) => h.capa)).size;
    eventos.push({
      seq: seq++,
      reglaId: "COMP",
      marca: "hit",
      log:
        `COMP · ${c.sujeto?.nombre ?? c.titulo} · ${hijos.length} reglas de ${capas} capas ` +
        `(${hijos.map((h) => h.reglaId).join(" + ")}) · score ${c.score}`,
      acumulado: montoEnRiesgo,
      hallazgoId: c.id,
      categoria: c.categoria,
    });
  }
  eventos.push({
    seq: seq++,
    reglaId: "COMP",
    marca: "ok",
    log: `Cierre · ${cop(montoEnRiesgo)} en riesgo, ${pctL(ix.facturacion > 0 ? (montoEnRiesgo / ix.facturacion) * 100 : 0)} de la facturación del período`,
    acumulado: montoEnRiesgo,
  });

  return eventos;
}
