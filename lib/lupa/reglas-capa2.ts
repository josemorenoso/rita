/* ──────────────────  CAPA 2 · COHERENCIA ECONÓMICA  ──────────────────
   La capa 1 busca un papel que falta. Aquí se busca dinero que no se
   comporta como debería: un precio que sube solo, un margen que se hunde,
   un descuento que nadie autorizó, una merma que vuelve todos los meses.

   Dos cosas separan esta capa de la anterior.

   La primera es que aquí SÍ hay umbrales, y por eso están todos arriba, con
   nombre y comentados. Un número puesto a ojo dentro de una función es
   indefendible en cuanto alguien pregunta «¿y por qué 15 y no 12?».

   La segunda es que tres de estas once reglas NO SE PUEDEN EVALUAR con lo
   que llegó, y eso se dice en voz alta. Una herramienta que calla lo que no
   miró es peor que una que no mira: el panel de cobertura enseña las tres
   con el fichero exacto que haría falta para activarlas. Es la parte del
   informe que más confianza da, así que los motivos están escritos para
   leerse, no para rellenar un campo.

   Ninguna regla puntúa: devuelve el hecho y las cifras. El semáforo y el
   score los pone el motor, en un solo sitio y con una sola fórmula. Lo único
   que estas reglas le dicen sobre la fuerza del hallazgo es `evidenciaCompleta`,
   y aquí va siempre a true porque todas ellas cierran el círculo con filas del
   Excel: la factura, la línea, el ajuste. Iría a false si la propia regla viera
   la explicación del patrón —como hace R01 con los dos pagos que resultan ser
   dos facturas distintas—, y ninguna de estas la ve.
   ------------------------------------------------------------------- */

import {
  conHallazgos,
  evidenciaDocumento,
  evidenciaMovimiento,
  limpia,
  noEvaluable,
  sujetoSku,
  sujetoTercero,
  sujetoUsuario,
  type HallazgoCrudo,
  type Indice,
  type Regla,
} from "./indice";
import { cop, dias, fecha, fechaLarga, numero, pctL, trimestreDe } from "./moneda";
import type { Documento, LineaDocumento, Serie } from "./tipos";

/* ─────────────────────────────  Umbrales  ─────────────────────────────
   Todos discutibles, ninguno escondido. Si el cliente trabaja con otros,
   se cambian aquí y el informe entero se recalcula. */

/** R20 · cuánto se le tolera moverse a un precio dentro de una ventana corta. */
const R20_VARIACION_PCT = 15;
const R20_VENTANA_DIAS = 90;
/** Con menos de cuatro compras no hay serie: hay anécdota. */
const R20_MINIMO_COMPRAS = 4;

/** R21 · cuánto puede un proveedor pasarse de lo que pagas a los demás. */
const R21_SOBRECOSTO_PCT = 20;
const R21_MINIMO_LINEAS = 3;

/** R25 · dos compras muy seguidas suelen ser una entrega partida, no una recompra. */
const R25_DIAS_MINIMOS = 10;

/** R26 · «recurrente» empieza en el cuarto ajuste dentro de la misma ventana. */
const R26_AJUSTES = 3;
const R26_VENTANA_DIAS = 90;

/** R30 · diferencia entre dos proveedores del mismo SKU en el mismo trimestre. */
const R30_DIFERENCIA_PCT = 25;

/**
 * Suelo de materialidad para las reglas de precio. Con 400 SKUs, el ruido de
 * los productos de baja rotación llenaría la pantalla de hallazgos de cien mil
 * pesos y taparía el que importa. Lo que queda por debajo se cuenta en
 * `revisados` —se miró— pero no se enseña como hallazgo.
 */
const SUELO_MATERIAL = 2_000_000;

/** La tabla de evidencia se lee; no se escrolea. Las repeticiones se cuentan todas. */
const MAX_EVIDENCIA = 12;

/* ─────────────────────────────  Ayudantes  ───────────────────────────── */

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (iso: string) => `${MES_CORTO[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

function agrupar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const previo = mapa.get(k);
    if (previo) previo.push(x);
    else mapa.set(k, [x]);
  }
  return mapa;
}

/** Recorrer un Map en orden de inserción es determinista, pero solo si la
    inserción lo fue. Ordenar por clave lo garantiza pase lo que pase. */
const porClave = <T>(mapa: Map<string, T>): [string, T][] =>
  [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const primeras = <T>(lista: T[], n = MAX_EVIDENCIA): T[] => lista.slice(0, n);

/** Una línea de compra ya resuelta: precio unitario real y su documento. */
type LineaCompra = {
  doc: Documento;
  linea: LineaDocumento;
  sku: string;
  terceroId: string;
  fecha: string;
  precio: number;
  cantidad: number;
};

/**
 * El precio unitario sale de `Vlr. Unit.`, pero si el ERP lo exportó vacío se
 * reconstruye desde el valor de la línea. Se prefiere la columna original
 * porque es la que el auditor va a ver cuando abra el Excel en la fila que le
 * decimos.
 */
function lineasDeCompra(ix: Indice): LineaCompra[] {
  const salida: LineaCompra[] = [];
  for (const doc of ix.porTipo("factura_compra")) {
    if (doc.estado === "anulado" || !doc.terceroId) continue;
    for (const linea of ix.lineasDe(doc.id)) {
      if (linea.cantidad <= 0) continue;
      const precio = linea.precioUnitario > 0 ? linea.precioUnitario : linea.total / linea.cantidad;
      if (!(precio > 0) || !Number.isFinite(precio)) continue;
      salida.push({
        doc,
        linea,
        sku: linea.sku,
        terceroId: doc.terceroId,
        fecha: doc.fecha,
        precio,
        cantidad: linea.cantidad,
      });
    }
  }
  salida.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.doc.id.localeCompare(b.doc.id) || a.sku.localeCompare(b.sku),
  );
  return salida;
}

/** Media de precio ponderada por cantidad: comprar 900 litros caros pesa más
    que comprar 3 caros, y una media simple no lo vería. */
function precioMedio(lineas: LineaCompra[]): number {
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  if (unidades <= 0) return 0;
  return lineas.reduce((s, l) => s + l.precio * l.cantidad, 0) / unidades;
}

/** La curva del precio: un punto por fecha, promediando las líneas del día. */
function curvaDePrecio(lineas: LineaCompra[]): { fecha: string; valor: number }[] {
  const porFecha = agrupar(lineas, (l) => l.fecha);
  return porClave(porFecha).map(([f, ls]) => ({
    fecha: f,
    valor: Math.round(precioMedio(ls)),
  }));
}

const nombreItem = (ix: Indice, sku: string) => ix.item.get(sku)?.nombre ?? sku;

/* ══════════════════════════════════════════════════════════════════════
   R20 · Varianza de precio del mismo producto
   ══════════════════════════════════════════════════════════════════════ */

const R20: Regla = ({ ix }) => {
  const lineas = lineasDeCompra(ix);
  const series = agrupar(lineas, (l) => `${l.sku}|${l.terceroId}`);
  const hallazgos: HallazgoCrudo[] = [];

  for (const [, puntos] of porClave(series)) {
    if (puntos.length < R20_MINIMO_COMPRAS) continue;

    // La ventana móvil de 90 días: un producto que sube un 30 % en dos años
    // no dice nada; que suba un 30 % en un trimestre, sí.
    let variacion = 0;
    let desde = puntos[0].fecha;
    let hasta = puntos[0].fecha;
    for (let i = 0; i < puntos.length; i++) {
      let min = puntos[i].precio;
      let max = puntos[i].precio;
      let ultima = puntos[i].fecha;
      for (let j = i; j < puntos.length && dias(puntos[i].fecha, puntos[j].fecha) <= R20_VENTANA_DIAS; j++) {
        min = Math.min(min, puntos[j].precio);
        max = Math.max(max, puntos[j].precio);
        ultima = puntos[j].fecha;
      }
      const v = (max / min - 1) * 100;
      if (v > variacion) {
        variacion = v;
        desde = puntos[i].fecha;
        hasta = ultima;
      }
    }
    if (variacion <= R20_VARIACION_PCT) continue;

    // El precio de referencia es la MEDIANA del primer mes de compras, no la
    // primera factura: una sola línea mal tecleada movería todo el cálculo del
    // sobrecosto. El mes es corto a propósito —con una ventana de dos meses, la
    // referencia se contamina con la subida que estamos midiendo y el
    // porcentaje sale más pequeño de lo que fue—. Si en ese mes no hay dos
    // compras se amplía a un trimestre, y si tampoco, la referencia es el
    // precio más bajo que se pagó en toda la serie.
    const primerMes = puntos.filter((p) => dias(puntos[0].fecha, p.fecha) <= 30);
    const primerTrimestre = puntos.filter((p) => dias(puntos[0].fecha, p.fecha) <= 90);
    const referencia = primerMes.length >= 2 ? primerMes : primerTrimestre.length >= 2 ? primerTrimestre : null;
    const precioBase = referencia ? mediana(referencia.map((p) => p.precio)) : Math.min(...puntos.map((p) => p.precio));
    if (precioBase <= 0) continue;

    const caras = puntos.filter((p) => p.precio > precioBase * (1 + R20_VARIACION_PCT / 100));
    const sobrecosto = caras.reduce((s, p) => s + (p.precio - precioBase) * p.cantidad, 0);
    if (sobrecosto < SUELO_MATERIAL || !caras.length) continue;

    const sku = puntos[0].sku;
    const proveedor = ix.tercero.get(puntos[0].terceroId);
    const nombre = nombreItem(ix, sku);
    const docs = [...new Set(caras.map((p) => p.doc.id))];

    // Dos cifras distintas y las dos verdaderas: la SUBIDA es de punta a punta
    // del período —es la que se narra— y la VARIACIÓN es el peor salto dentro
    // de una ventana de 90 días, que es lo que dispara la regla. Confundirlas
    // sería decir que subió un 34 % en tres meses cuando tardó cinco.
    const cima = puntos.reduce((a, b) => (b.precio > a.precio ? b : a), puntos[0]);
    const subida = (cima.precio / precioBase - 1) * 100;
    const meses = Math.max(1, Math.round(dias(puntos[0].fecha, cima.fecha) / 30));

    const serie: Serie = {
      clase: "precio",
      puntos: curvaDePrecio(puntos),
      referencia: Math.round(precioBase),
      etiqueta: "Precio al inicio del período",
    };

    hallazgos.push({
      titulo: `${nombre} subió un ${pctL(subida)} con ${ix.nombre(puntos[0].terceroId)} en ${meses} ${
        meses === 1 ? "mes" : "meses"
      }: ${cop(sobrecosto)} de sobrecosto`,
      resumen:
        `El precio unitario de ${sku} con ${ix.nombre(puntos[0].terceroId)} pasó de ${cop(precioBase)} al principio del ` +
        `período a ${cop(cima.precio)} el ${fecha(cima.fecha)}, sobre ${numero(puntos.length)} facturas de compra. Solo ` +
        `entre el ${fecha(desde)} y el ${fecha(hasta)} —${R20_VENTANA_DIAS} días— se movió un ${pctL(variacion)}. Frente al ` +
        `precio de referencia, las ${numero(caras.length)} compras posteriores costaron ${cop(sobrecosto)} más.`,
      montoEnRiesgo: Math.round(sobrecosto),
      montoExacto: true,
      documentos: docs,
      evidencia: primeras(caras.map((p) => ({ p, pct: (p.precio / precioBase - 1) * 100 }))).map(({ p, pct }) =>
        evidenciaDocumento(ix, p.doc, `${cop(p.precio)} por unidad · ${pctL(pct)} sobre el precio de referencia`),
      ),
      quePuedeEstarPasando: [
        "El producto subió de verdad en el mercado y el proveedor trasladó el alza; sería lo normal si los demás proveedores del mismo producto se hubieran movido igual.",
        "Se pactó una condición nueva —plazo de pago, entrega en bodega, otra presentación— y el precio la recoge, pero el acuerdo no está en el expediente de compras.",
        "Nadie está comparando: el precio se acepta factura a factura porque no hay un precio de referencia contra el que mirar antes de firmar.",
        "Se está pagando por encima de lo que cuesta el mismo producto y la diferencia no vuelve a la empresa.",
      ],
      queRevisar: [
        `Pide la última lista de precios firmada con ${ix.nombre(puntos[0].terceroId)} y compárala con las facturas del ${fecha(desde)} en adelante.`,
        `Mira si los otros proveedores de ${sku} se movieron en el mismo período o siguieron en su precio.`,
        "Revisa quién autorizó las órdenes de compra desde la fecha en que el precio empezó a subir.",
      ],
      controlSugerido:
        "Precio de referencia por SKU en el ERP y bloqueo de la orden de compra que se salga más de un 10 % de él sin una segunda firma.",
      sujeto: proveedor ? sujetoTercero(proveedor) : sujetoSku(sku, nombre),
      serie,
      repeticiones: caras.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(lineas.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R21 · Sobrecosto frente a otros proveedores
   ══════════════════════════════════════════════════════════════════════ */

const R21: Regla = ({ ix }) => {
  const lineas = lineasDeCompra(ix);
  const porSku = agrupar(lineas, (l) => l.sku);
  const hallazgos: HallazgoCrudo[] = [];

  for (const [sku, todas] of porClave(porSku)) {
    const porProveedor = agrupar(todas, (l) => l.terceroId);
    if (porProveedor.size < 2) continue;

    for (const [terceroId, suyas] of porClave(porProveedor)) {
      if (suyas.length < R21_MINIMO_LINEAS) continue;

      /* La comparación es TRIMESTRE A TRIMESTRE, y esto no es un detalle: un
         proveedor que arranca barato y acaba caro tiene una media de período
         razonable y se escaparía entero. Medir marzo contra la mediana de julio
         es comparar calendarios, no proveedores. */
      const porTrimestre = agrupar(suyas, (l) => trimestreDe(l.fecha));
      let peorExceso = 0;
      let peorReferencia = 0;
      let peorTrimestre = "";
      const caras: LineaCompra[] = [];
      let sobrecosto = 0;
      const comparados = new Set<string>();

      for (const [trimestre, delTrimestre] of porClave(porTrimestre)) {
        // La referencia es la mediana de LOS DEMÁS, no la de todos: si el
        // proveedor caro se lleva la mayor parte del volumen, incluirlo en la
        // mediana sería medirlo contra sí mismo.
        const ajenas = todas.filter((l) => l.terceroId !== terceroId && trimestreDe(l.fecha) === trimestre);
        if (ajenas.length < 2) continue;
        const referencia = mediana(ajenas.map((l) => l.precio));
        if (referencia <= 0) continue;

        const medio = precioMedio(delTrimestre);
        const exceso = (medio / referencia - 1) * 100;
        if (exceso <= R21_SOBRECOSTO_PCT) continue;

        for (const l of delTrimestre) {
          if (l.precio <= referencia) continue;
          caras.push(l);
          sobrecosto += (l.precio - referencia) * l.cantidad;
        }
        for (const l of ajenas) comparados.add(l.terceroId);
        if (exceso > peorExceso) {
          peorExceso = exceso;
          peorReferencia = referencia;
          peorTrimestre = trimestre;
        }
      }
      if (!peorTrimestre || sobrecosto < SUELO_MATERIAL || !caras.length) continue;

      const proveedor = ix.tercero.get(terceroId);
      const nombre = nombreItem(ix, sku);
      const otros = [...comparados].sort().map((id) => ix.nombre(id));

      const serie: Serie = {
        clase: "precio",
        puntos: curvaDePrecio(suyas),
        referencia: Math.round(peorReferencia),
        etiqueta: `Mediana pagada a los otros proveedores en ${peorTrimestre}`,
      };

      hallazgos.push({
        titulo: `${ix.nombre(terceroId)} cobra ${nombre} un ${pctL(peorExceso)} por encima de lo que pagas a los demás: ${cop(sobrecosto)}`,
        resumen:
          `En ${peorTrimestre}, ${sku} se compró a ${ix.nombre(terceroId)} a ${cop(precioMedio(porTrimestre.get(peorTrimestre) ?? []))} ` +
          `de media por unidad, frente a la mediana de ${cop(peorReferencia)} que se pagó por el mismo producto a ` +
          `${numero(otros.length)} ${otros.length === 1 ? "proveedor" : "proveedores"} en esas mismas semanas ` +
          `(${otros.slice(0, 3).join(", ")}). Sobre ${numero(caras.length)} líneas de compra por encima de la mediana de su ` +
          `trimestre, la diferencia acumulada es de ${cop(sobrecosto)}.`,
        montoEnRiesgo: Math.round(sobrecosto),
        montoExacto: true,
        documentos: [...new Set(caras.map((l) => l.doc.id))],
        evidencia: primeras(caras.map((l) => ({ l, pct: (l.precio / peorReferencia - 1) * 100 }))).map(({ l, pct }) =>
          evidenciaDocumento(
            ix,
            l.doc,
            `${cop(l.precio)} por unidad · ${trimestreDe(l.fecha)} · ${pctL(pct)} sobre la mediana interna`,
          ),
        ),
        quePuedeEstarPasando: [
          "Este proveedor entrega otra cosa: otra marca, otra presentación o con transporte incluido, y el precio no es comparable con el de los demás.",
          "Es el proveedor de urgencia —el que responde cuando falta stock— y se le paga la prisa sin que eso esté escrito en ninguna parte.",
          "La compra se dirige por costumbre y hace tiempo que nadie pide una cotización alternativa.",
          "Hay una preferencia por este proveedor que el expediente de compras no explica.",
        ],
        queRevisar: [
          `Compara ficha técnica y condiciones de entrega de ${sku} entre ${ix.nombre(terceroId)} y ${otros[0] ?? "los demás proveedores"}: si es el mismo producto, la diferencia no tiene sustento.`,
          "Pide las cotizaciones que respaldan estas compras. Si no hay más de una, ese es el hallazgo.",
          "Mira si el proveedor caro concentra las compras urgentes o también las programadas.",
        ],
        controlSugerido:
          "Tres cotizaciones obligatorias por SKU una vez al semestre, y comparativo de precio por proveedor visible en el momento de crear la orden de compra.",
        sujeto: proveedor ? sujetoTercero(proveedor) : sujetoSku(sku, nombre),
        serie,
        repeticiones: caras.length,
        evidenciaCompleta: true,
      });
    }
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(lineas.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R22 · Venta por debajo del margen mínimo
   ══════════════════════════════════════════════════════════════════════ */

const R22: Regla = ({ ix }) => {
  const minimo = ix.politicas.margenMinimoPct;
  const ventas = ix.porTipo("factura_venta").filter((d) => d.estado !== "anulado");

  type Flojo = {
    doc: Documento;
    margen: number;
    sacrificado: number;
    ingreso: number;
  };
  const flojas: Flojo[] = [];
  let conCoste = 0;

  for (const doc of ventas) {
    const lineas = ix.lineasDe(doc.id).filter((l) => l.costoUnitario !== null && l.costoUnitario > 0);
    if (!lineas.length) continue;
    conCoste++;

    const ingreso = lineas.reduce((s, l) => s + l.total, 0);
    const coste = lineas.reduce((s, l) => s + (l.costoUnitario ?? 0) * l.cantidad, 0);
    if (ingreso <= 0) continue;

    const margen = ((ingreso - coste) / ingreso) * 100;
    if (margen >= minimo) continue;

    // Lo sacrificado es lo que habría facturado esa misma venta al margen de
    // política, no la pérdida contable: es la cifra que el gerente puede
    // recuperar cambiando el precio, y por eso es la que se enseña.
    const objetivo = coste / (1 - minimo / 100);
    flojas.push({
      doc,
      margen,
      sacrificado: Math.max(0, objetivo - ingreso),
      ingreso,
    });
  }

  if (!conCoste) {
    return noEvaluable(
      "Las líneas de las facturas de venta llegaron sin coste unitario. Con precio pero sin coste se puede ver cuánto se " +
        "vendió, no cuánto se ganó, y el margen es exactamente la resta de los dos. Basta con que la exportación de ventas " +
        "traiga la columna «Costo Unit.» —el ERP la tiene, es la que alimenta el estado de resultados— para que la regla corra.",
    );
  }
  if (!flojas.length) return limpia(conCoste);

  flojas.sort((a, b) => a.margen - b.margen);
  const perdida = flojas.filter((f) => f.margen < 0);
  const total = flojas.reduce((s, f) => s + f.sacrificado, 0);

  // Si el margen flojo se concentra en un vendedor, el sujeto es él; si está
  // repartido, no hay sujeto y el hallazgo es de la política de precios.
  const porVendedor = agrupar(
    flojas.filter((f) => f.doc.usuarioRegistro),
    (f) => f.doc.usuarioRegistro ?? "",
  );
  const ranking = porClave(porVendedor)
    .map(([usuario, lista]) => ({
      usuario,
      monto: lista.reduce((s, f) => s + f.sacrificado, 0),
      n: lista.length,
    }))
    .sort((a, b) => b.monto - a.monto);
  const dominante = ranking.length && total > 0 && ranking[0].monto / total >= 0.5 ? ranking[0] : null;

  const serie: Serie = {
    clase: "barras",
    puntos: primeras(flojas).map((f) => ({
      etiqueta: f.doc.numero,
      valor: Math.round(f.sacrificado),
      marcado: f.margen < 0,
    })),
    unidad: "dinero",
  };

  return conHallazgos(conCoste, [
    {
      titulo:
        `${numero(flojas.length)} facturas de venta por debajo del ${pctL(minimo)} de margen` +
        `${perdida.length ? `, ${numero(perdida.length)} de ellas a pérdida` : ""}: ${cop(total)} dejados de ganar`,
      resumen:
        `De ${numero(conCoste)} facturas de venta con coste, ${numero(flojas.length)} se cerraron por debajo del margen ` +
        `mínimo de política (${pctL(minimo)}); el peor caso es la ${flojas[0].doc.numero}, con un ${pctL(flojas[0].margen)}. ` +
        `Vendidas al margen de política habrían facturado ${cop(total)} más.`,
      montoEnRiesgo: Math.round(total),
      montoExacto: true,
      documentos: flojas.map((f) => f.doc.id),
      evidencia: primeras(flojas).map((f) =>
        evidenciaDocumento(
          ix,
          f.doc,
          `Margen ${pctL(f.margen)}${f.margen < 0 ? " · se vendió por debajo del coste" : ""} · ${cop(f.sacrificado)} dejados de ganar`,
        ),
      ),
      quePuedeEstarPasando: [
        "El coste que tiene cargado el producto está desactualizado y el margen real es mejor de lo que se ve; entonces el problema es el maestro de costes, no la venta.",
        "Son ventas de liquidación o de producto próximo a vencer, y bajar el margen fue la decisión correcta; lo que falta es que quede escrito en algún sitio.",
        "El vendedor cierra al precio que le piden porque el ERP no le enseña el margen en el momento de facturar.",
        "Se están usando precios por debajo de coste de forma sostenida para retener a un cliente que, medido bien, cuesta dinero.",
      ],
      queRevisar: [
        perdida.length
          ? `Empieza por las ${numero(perdida.length)} facturas con margen negativo: comprueba que el coste cargado sea el correcto antes de sacar ninguna conclusión.`
          : `Empieza por la ${flojas[0].doc.numero}, la de peor margen: comprueba que el coste cargado sea el correcto antes de sacar ninguna conclusión.`,
        "Cruza estas facturas con la lista de clientes: si se repiten los mismos, el problema es el acuerdo comercial, no la factura.",
        "Comprueba si estas ventas llevaban autorización de alguien por encima del vendedor.",
      ],
      controlSugerido: `Margen visible en pantalla al facturar y bloqueo por debajo del ${pctL(minimo)} salvo autorización nominal que quede registrada en el documento.`,
      sujeto: dominante ? sujetoUsuario(dominante.usuario) : null,
      serie,
      repeticiones: flojas.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ══════════════════════════════════════════════════════════════════════
   R23 · Descuento fuera de política
   ══════════════════════════════════════════════════════════════════════ */

const R23: Regla = ({ ix }) => {
  const maximo = ix.politicas.descuentoMaximoPct;
  const ventas = ix.porTipo("factura_venta").filter((d) => d.estado !== "anulado");

  type Exceso = { doc: Documento; linea: LineaDocumento; sacrificado: number };
  const excesos: Exceso[] = [];
  let revisadas = 0;

  for (const doc of ventas) {
    for (const linea of ix.lineasDe(doc.id)) {
      revisadas++;
      if (linea.descuentoPct <= maximo || linea.cantidad <= 0) continue;
      // Lo sacrificado es solo el tramo que se pasa de política: el 8 % que sí
      // está autorizado no es una fuga, es la política.
      const bruto = linea.precioUnitario * linea.cantidad;
      excesos.push({
        doc,
        linea,
        sacrificado: (bruto * (linea.descuentoPct - maximo)) / 100,
      });
    }
  }
  if (!excesos.length) return limpia(revisadas);

  const porDoc = agrupar(excesos, (e) => e.doc.id);
  const total = excesos.reduce((s, e) => s + e.sacrificado, 0);
  const maxPct = Math.max(...excesos.map((e) => e.linea.descuentoPct));

  const porVendedor = agrupar(excesos, (e) => e.doc.usuarioRegistro ?? "sin vendedor");
  const ranking = porClave(porVendedor)
    .map(([usuario, lista]) => ({
      usuario,
      monto: lista.reduce((s, e) => s + e.sacrificado, 0),
      docs: new Set(lista.map((e) => e.doc.id)).size,
    }))
    .sort((a, b) => b.monto - a.monto || a.usuario.localeCompare(b.usuario));
  const dominante = ranking[0];
  const concentra = total > 0 ? (dominante.monto / total) * 100 : 0;

  const serie: Serie = {
    clase: "barras",
    puntos: ranking.map((r) => ({
      etiqueta: r.usuario,
      valor: Math.round(r.monto),
      marcado: r.usuario === dominante.usuario,
    })),
    unidad: "dinero",
  };

  const ordenadas = [...excesos].sort((a, b) => b.sacrificado - a.sacrificado);

  return conHallazgos(revisadas, [
    {
      titulo: `${numero(porDoc.size)} facturas con descuentos de hasta el ${pctL(maxPct)}, sobre un máximo de política del ${pctL(maximo)}: ${cop(total)} sacrificados`,
      resumen:
        `${numero(excesos.length)} líneas de venta en ${numero(porDoc.size)} facturas llevan un descuento por encima del ` +
        `${pctL(maximo)} que fija la política. ${
          concentra >= 50
            ? `El ${pctL(concentra)} del dinero sacrificado sale de las ventas de ${dominante.usuario}. `
            : ""
        }El tramo de descuento que se pasa de política suma ${cop(total)}.`,
      montoEnRiesgo: Math.round(total),
      montoExacto: true,
      documentos: [...porDoc.keys()],
      evidencia: primeras(ordenadas).map((e) =>
        evidenciaDocumento(
          ix,
          e.doc,
          `${e.linea.sku} · descuento ${pctL(e.linea.descuentoPct)} · ${cop(e.sacrificado)} por encima de política`,
        ),
      ),
      quePuedeEstarPasando: [
        "Son descuentos por volumen o de campaña que sí estaban aprobados, pero la aprobación vive en un correo y no en el documento.",
        "La política de descuentos está desactualizada: si el 8 % ya no sirve para competir, el problema es el número, no quien lo salta.",
        "El ERP deja teclear cualquier porcentaje sin pedir nada, así que el máximo es una recomendación y no un control.",
        "Se está usando el descuento como moneda de cambio en la negociación personal con el cliente, fuera de lo que la empresa decidió ceder.",
      ],
      queRevisar: [
        `Pide la autorización escrita de las facturas con descuento por encima del ${pctL(maximo)}: si no aparece, ninguna de ellas debió salir.`,
        "Mira si los clientes que reciben estos descuentos son siempre los mismos y qué margen dejan al final del año.",
        "Comprueba si el descuento extra coincide con cierres de mes o de trimestre.",
      ],
      controlSugerido: `Tope duro del ${pctL(maximo)} en el ERP y flujo de autorización nominal para pasarlo, que quede grabado en la propia factura.`,
      sujeto: concentra >= 50 ? sujetoUsuario(dominante.usuario) : null,
      serie,
      repeticiones: excesos.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ══════════════════════════════════════════════════════════════════════
   R24 · Despacho más caro que el margen del pedido — NO EVALUABLE
   ══════════════════════════════════════════════════════════════════════ */

const R24: Regla = () =>
  noEvaluable(
    "Falta el coste de despacho por pedido. En los seis ficheros está la venta y está el inventario, pero no está lo que " +
      "cuesta llevar la mercancía: no hay fichero de fletes ni columna de transporte en las facturas de venta. Sin eso, un " +
      "pedido de 180.000 pesos al centro y uno de 180.000 pesos a Barbosa parecen el mismo negocio, y no lo son. Con un " +
      "listado de despachos que traiga número de pedido, transportadora, destino y valor del flete, esta regla resta el " +
      "flete al margen de cada pedido y saca los que se entregan perdiendo dinero.",
  );

/* ══════════════════════════════════════════════════════════════════════
   R25 · Recompra anómala
   ══════════════════════════════════════════════════════════════════════ */

const R25: Regla = ({ ix }) => {
  const lineas = lineasDeCompra(ix);
  const porSku = agrupar(lineas, (l) => l.sku);
  const hallazgos: HallazgoCrudo[] = [];

  for (const [sku, todas] of porClave(porSku)) {
    // Una compra al día, no una línea: dos líneas del mismo SKU en la misma
    // factura son un solo acto de compra.
    const compras = porClave(agrupar(todas, (l) => l.fecha)).map(([f, ls]) => ({
      fecha: f,
      doc: ls[0].doc,
      valor: ls.reduce((s, l) => s + l.precio * l.cantidad, 0),
      unidades: ls.reduce((s, l) => s + l.cantidad, 0),
    }));
    if (compras.length < 2) continue;

    const movimientos = ix.movsDeSku(sku);
    const anomalas: {
      doc: Documento;
      fecha: string;
      valor: number;
      anterior: string;
      hueco: number;
    }[] = [];

    for (let i = 1; i < compras.length; i++) {
      const previa = compras[i - 1];
      const actual = compras[i];
      const hueco = dias(previa.fecha, actual.fecha);
      if (hueco < R25_DIAS_MINIMOS) continue;

      // Si entre las dos compras no salió ni una unidad —ni venta, ni traslado,
      // ni merma—, el stock que se compró antes seguía entero.
      const salio = movimientos.some((m) => m.cantidad < 0 && m.fecha > previa.fecha && m.fecha <= actual.fecha);
      if (salio) continue;
      anomalas.push({
        doc: actual.doc,
        fecha: actual.fecha,
        valor: actual.valor,
        anterior: previa.fecha,
        hueco,
      });
    }

    // Una sola recompra puede ser un pedido programado; el patrón empieza en dos.
    if (anomalas.length < 2) continue;
    const total = anomalas.reduce((s, a) => s + a.valor, 0);
    if (total < SUELO_MATERIAL) continue;

    const item = ix.item.get(sku);
    const nombre = nombreItem(ix, sku);
    const serie: Serie = {
      clase: "barras",
      puntos: anomalas.map((a) => ({
        etiqueta: fecha(a.fecha),
        valor: Math.round(a.valor),
        marcado: true,
      })),
      unidad: "dinero",
    };

    hallazgos.push({
      titulo: `${numero(anomalas.length)} recompras de ${nombre} sin que el stock hubiera bajado: ${cop(total)}`,
      resumen:
        `${sku} se volvió a comprar ${numero(anomalas.length)} veces sin que entre una compra y la siguiente saliera una ` +
        `sola unidad de bodega. La primera vez fueron ${numero(anomalas[0].hueco)} días sin movimiento entre el ` +
        `${fecha(anomalas[0].anterior)} y el ${fecha(anomalas[0].fecha)}. Las recompras suman ${cop(total)}` +
        `${item ? ` y la existencia actual registrada es de ${numero(item.stockActual)} unidades` : ""}.`,
      montoEnRiesgo: Math.round(total),
      montoExacto: true,
      documentos: anomalas.map((a) => a.doc.id),
      evidencia: primeras(anomalas).map((a) =>
        evidenciaDocumento(
          ix,
          a.doc,
          `Compra anterior el ${fecha(a.anterior)} · ${numero(a.hueco)} días sin una sola salida del SKU`,
        ),
      ),
      quePuedeEstarPasando: [
        "El movimiento de salida existe pero se registró tarde o contra otra bodega, y el inventario no refleja lo que de verdad pasó.",
        "Se compró para una promesa de venta que después no se dio, y la mercancía se quedó en bodega.",
        "El punto de pedido está mal calibrado: el sistema pide reposición sin mirar la existencia real.",
        "Se está comprando mercancía que no hace falta y que después no aparece en el conteo físico.",
      ],
      queRevisar: [
        `Haz conteo físico de ${sku} en las tres bodegas y compáralo con la existencia del sistema.`,
        "Mira quién generó estas órdenes de compra y con qué sustento de necesidad.",
        "Comprueba si hay salidas de este SKU registradas fuera de las fechas que dice el sistema.",
      ],
      controlSugerido:
        "Que la orden de compra enseñe la existencia actual y la rotación de los últimos 90 días del SKU antes de dejar confirmarla.",
      sujeto: sujetoSku(sku, nombre),
      serie,
      repeticiones: anomalas.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(lineas.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R26 · Merma recurrente
   ══════════════════════════════════════════════════════════════════════ */

const R26: Regla = ({ ix }) => {
  const ajustes = ix.libro.inventario
    .filter((m) => m.tipo === "ajuste" && m.cantidad < 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const grupos = agrupar(ajustes, (m) => `${m.sku}|${m.bodega}`);
  const hallazgos: HallazgoCrudo[] = [];

  for (const [, lista] of porClave(grupos)) {
    // Ventana móvil: cuatro ajustes repartidos en año y medio son la vida de
    // una bodega; cuatro en un trimestre son un patrón.
    let pico = 0;
    let desde = lista[0].fecha;
    let hasta = lista[0].fecha;
    for (let i = 0; i < lista.length; i++) {
      let j = i;
      while (j < lista.length && dias(lista[i].fecha, lista[j].fecha) <= R26_VENTANA_DIAS) j++;
      if (j - i > pico) {
        pico = j - i;
        desde = lista[i].fecha;
        hasta = lista[j - 1].fecha;
      }
    }
    if (pico <= R26_AJUSTES) continue;

    const sku = lista[0].sku;
    const bodega = lista[0].bodega;
    const item = ix.item.get(sku);
    const coste = item?.costoPromedio ?? 0;
    const unidades = lista.reduce((s, m) => s + Math.abs(m.cantidad), 0);
    const valor = unidades * coste;

    const porUsuario = agrupar(
      lista.filter((m) => m.usuario),
      (m) => m.usuario ?? "",
    );
    const rankingUsuario = porClave(porUsuario)
      .map(([usuario, ms]) => ({ usuario, n: ms.length }))
      .sort((a, b) => b.n - a.n || a.usuario.localeCompare(b.usuario));
    const mismoUsuario = rankingUsuario.length === 1 ? rankingUsuario[0] : null;

    const porMes = agrupar(lista, (m) => m.fecha.slice(0, 7));
    const serie: Serie = {
      clase: "barras",
      puntos: porClave(porMes).map(([mes, ms]) => ({
        etiqueta: etiquetaMes(`${mes}-01`),
        valor: Math.round(ms.reduce((s, m) => s + Math.abs(m.cantidad), 0) * coste),
        marcado: mes >= desde.slice(0, 7) && mes <= hasta.slice(0, 7),
      })),
      unidad: "dinero",
    };

    const nombre = nombreItem(ix, sku);
    hallazgos.push({
      titulo: `${numero(lista.length)} ajustes negativos de ${nombre} en ${bodega}: ${cop(valor)} a coste`,
      resumen:
        `${sku} acumula ${numero(lista.length)} ajustes de inventario en negativo en ${bodega} entre el ${fecha(lista[0].fecha)} ` +
        `y el ${fecha(lista[lista.length - 1].fecha)}, con ${numero(pico)} de ellos dentro de una misma ventana de ` +
        `${R26_VENTANA_DIAS} días (${fechaLarga(desde)} a ${fechaLarga(hasta, true)}). Son ${numero(unidades)} unidades, ` +
        `${cop(valor)} al coste promedio del producto` +
        `${mismoUsuario ? `, y todos los registró el mismo usuario (${mismoUsuario.usuario})` : ""}.`,
      montoEnRiesgo: Math.round(valor),
      montoExacto: true,
      documentos: [...new Set(lista.map((m) => m.documentoId ?? m.id))],
      evidencia: primeras(lista).map((m) =>
        evidenciaMovimiento(
          ix,
          m,
          `${numero(Math.abs(m.cantidad))} unidades · ${cop(Math.abs(m.cantidad) * coste)}${m.motivo ? ` · «${m.motivo}»` : ""}`,
        ),
      ),
      quePuedeEstarPasando: [
        "El producto se daña o se derrama de verdad: es pesado, se apila y esa bodega puede tener un problema de manipulación o de almacenamiento.",
        "El ajuste está tapando un error de registro anterior —una entrada duplicada, una salida que no se hizo— y la merma es contable, no física.",
        "El conteo cíclico no se hace y los ajustes se usan para cuadrar el sistema con la realidad cada vez que se mira.",
        "Hay mercancía que sale de la bodega sin documento y el ajuste es lo que cuadra el hueco después.",
      ],
      queRevisar: [
        `Pide los soportes de los ${numero(lista.length)} ajustes: acta de destrucción, foto o firma de quien autorizó cada uno.`,
        `Compara la tasa de merma de ${sku} en ${bodega} con la de las otras dos bodegas para el mismo producto.`,
        "Mira si los ajustes caen siempre antes o después de un conteo físico.",
      ],
      controlSugerido: `Autorización de un segundo responsable para cualquier ajuste negativo, y conteo cíclico mensual de los SKU con más de ${R26_AJUSTES} ajustes en el trimestre.`,
      sujeto: sujetoSku(sku, nombre),
      serie,
      repeticiones: lista.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(ix.libro.inventario.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R27 · Consumo teórico frente al real — NO EVALUABLE
   ══════════════════════════════════════════════════════════════════════ */

const R27: Regla = () =>
  noEvaluable(
    "No hay lista de materiales, y en esta empresa es probable que no tenga que haberla: Distribuidora Andina compra y " +
      "revende, no transforma. La regla compara lo que las ventas DEBIERON consumir con lo que de verdad salió de la " +
      "bodega, y para eso hace falta una receta que diga cuántas unidades de cada insumo lleva cada producto vendido. En " +
      "un restaurante, en una panadería o en una planta ese fichero existe y la regla se activa sola en cuanto llega. " +
      "Aquí no existe, y decirlo es más honesto que dar la regla por limpia.",
  );

/* ══════════════════════════════════════════════════════════════════════
   R28 · Crédito fuera de política
   ══════════════════════════════════════════════════════════════════════ */

const R28: Regla = ({ ix }) => {
  const politica = ix.politicas.diasCredito;
  const ventas = ix.porTipo("factura_venta").filter((d) => d.estado !== "anulado");

  // Un recibo de caja anterior a la factura no la cobra: solo cuenta lo que
  // entró después de emitirla.
  const recibosPorFactura = agrupar(
    ix.porTipo("recibo_caja").filter((r) => r.facturaAfectadaId),
    (r) => r.facturaAfectadaId ?? "",
  );

  const expuestas = ventas.filter((fv) => {
    if (fv.diasCredito === null || fv.diasCredito <= politica) return false;
    const recibos = recibosPorFactura.get(fv.id) ?? [];
    return !recibos.some((r) => r.fecha >= fv.fecha);
  });
  if (!expuestas.length) return limpia(ventas.length);

  const total = expuestas.reduce((s, d) => s + d.montoTotal, 0);
  const maxDias = Math.max(...expuestas.map((d) => d.diasCredito ?? 0));
  const porCliente = agrupar(expuestas, (d) => d.terceroId ?? "sin cliente");
  const ranking = porClave(porCliente)
    .map(([id, docs]) => ({
      id,
      nombre: ix.nombre(id),
      monto: docs.reduce((s, d) => s + d.montoTotal, 0),
      n: docs.length,
      dias: Math.max(...docs.map((d) => d.diasCredito ?? 0)),
    }))
    .sort((a, b) => b.monto - a.monto || a.id.localeCompare(b.id));

  const serie: Serie = {
    clase: "barras",
    puntos: ranking.map((c) => ({
      etiqueta: c.nombre,
      valor: Math.round(c.monto),
      marcado: c.dias >= maxDias,
    })),
    unidad: "dinero",
  };

  const ordenadas = [...expuestas].sort((a, b) => (b.diasCredito ?? 0) - (a.diasCredito ?? 0));
  const cliente = ranking[0].id !== "sin cliente" ? ix.tercero.get(ranking[0].id) : undefined;

  return conHallazgos(ventas.length, [
    {
      titulo: `${numero(ranking.length)} clientes con hasta ${numero(maxDias)} días de crédito y sin recibo de caja: ${cop(total)} de cartera expuesta`,
      resumen:
        `${numero(expuestas.length)} facturas de venta se emitieron con más de ${numero(politica)} días de crédito —la ` +
        `política de la empresa— y llegan hasta los ${numero(maxDias)} días, sin que conste ningún recibo de caja posterior ` +
        `que las cobre. El saldo pendiente suma ${cop(total)}, concentrado en ${numero(ranking.length)} ` +
        `${ranking.length === 1 ? "cliente" : "clientes"}; el mayor es ${ranking[0].nombre} con ${cop(ranking[0].monto)}.`,
      // Cartera expuesta, no pérdida: el dinero todavía se puede cobrar. Por
      // eso la regla se queda en amarillo por mucho que sume.
      montoEnRiesgo: Math.round(total),
      montoExacto: true,
      documentos: expuestas.map((d) => d.id),
      evidencia: primeras(ordenadas).map((d) =>
        evidenciaDocumento(
          ix,
          d,
          `${numero(d.diasCredito ?? 0)} días de crédito pactados (política: ${numero(politica)}) · sin recibo de caja posterior`,
        ),
      ),
      quePuedeEstarPasando: [
        "Son clientes grandes con un plazo negociado y aprobado; entonces lo que falta es que ese plazo esté en su ficha y no solo en la factura.",
        "El recibo de caja existe pero se aplicó a otra factura del mismo cliente, y la aplicación de cartera está descuadrada.",
        "El plazo se alarga en el momento de facturar para cerrar la venta, sin que cartera lo sepa hasta que vence.",
        "Se está financiando al cliente con el dinero de la empresa y el coste de ese plazo no lo paga nadie.",
      ],
      queRevisar: [
        `Pide el estado de cuenta de ${ranking[0].nombre} y confirma si el saldo sigue vivo o ya se cobró sin registrar.`,
        "Comprueba si la ficha de estos clientes tiene un cupo y un plazo aprobados, y por quién.",
        "Mira si las facturas con plazo largo se concentran en cierres de mes.",
      ],
      controlSugerido: `Plazo máximo por cliente en su ficha, tope de ${numero(politica)} días por defecto y bloqueo de nueva facturación al cliente con saldo vencido.`,
      sujeto: cliente ? sujetoTercero(cliente) : null,
      serie,
      repeticiones: expuestas.length,
      evidenciaCompleta: true,
      forzarSemaforo: "amarillo",
    },
  ]);
};

/* ══════════════════════════════════════════════════════════════════════
   R29 · Gasto recurrente sin contrapartida — NO EVALUABLE
   ══════════════════════════════════════════════════════════════════════ */

const R29: Regla = () =>
  noEvaluable(
    "No llegó el maestro de contratos. En el extracto bancario hay cargos que se repiten mes a mes —vigilancia, software, " +
      "arriendos, mantenimientos— y la regla busca los que siguen cobrándose después de que el contrato terminó, o los que " +
      "nunca tuvieron uno. Para eso necesita el listado de contratos vigentes con proveedor, objeto, fecha de inicio, " +
      "fecha de fin y valor pactado. Con lo que hay se puede ver la repetición; lo que no se puede es decir si sobra, y " +
      "afirmarlo sin el contrato delante sería inventar.",
  );

/* ══════════════════════════════════════════════════════════════════════
   R30 · El mismo producto a dos precios
   ══════════════════════════════════════════════════════════════════════ */

const R30: Regla = ({ ix }) => {
  const lineas = lineasDeCompra(ix);
  const porSku = agrupar(lineas, (l) => l.sku);
  const hallazgos: HallazgoCrudo[] = [];

  for (const [sku, todas] of porClave(porSku)) {
    // El mismo trimestre, y no el período entero: comparar el precio de enero
    // con el de diciembre no dice nada, lo dice el calendario.
    const porTrimestre = agrupar(todas, (l) => trimestreDe(l.fecha));
    let peorDiferencia = 0;
    let peorTrimestre = "";
    let caroId = "";
    let baratoId = "";
    const afectados: {
      trimestre: string;
      caro: LineaCompra[];
      precioBarato: number;
    }[] = [];

    for (const [trimestre, delTrimestre] of porClave(porTrimestre)) {
      const porProveedor = agrupar(delTrimestre, (l) => l.terceroId);
      if (porProveedor.size < 2) continue;

      const medios = porClave(porProveedor)
        .map(([id, ls]) => ({ id, precio: precioMedio(ls), lineas: ls }))
        .filter((p) => p.precio > 0)
        .sort((a, b) => a.precio - b.precio);
      if (medios.length < 2) continue;

      const barato = medios[0];
      const caro = medios[medios.length - 1];
      const diferencia = (caro.precio / barato.precio - 1) * 100;
      if (diferencia <= R30_DIFERENCIA_PCT) continue;

      afectados.push({
        trimestre,
        caro: caro.lineas,
        precioBarato: barato.precio,
      });
      if (diferencia > peorDiferencia) {
        peorDiferencia = diferencia;
        peorTrimestre = trimestre;
        caroId = caro.id;
        baratoId = barato.id;
      }
    }
    if (!afectados.length) continue;

    // El monto sale de las MISMAS líneas que se señalan como evidencia: las del
    // proveedor caro, cada una contra el precio bajo de SU trimestre.
    const baratoDe = new Map(afectados.map((a) => [a.trimestre, a.precioBarato]));
    const caras = afectados.flatMap((a) => a.caro).filter((l) => l.terceroId === caroId);
    const diferenciaTotal = caras.reduce((s, l) => {
      const barato = baratoDe.get(trimestreDe(l.fecha)) ?? l.precio;
      return s + Math.max(0, l.precio - barato) * l.cantidad;
    }, 0);
    if (diferenciaTotal < SUELO_MATERIAL || !caras.length) continue;

    const delPeor = afectados.find((a) => a.trimestre === peorTrimestre);
    const nombre = nombreItem(ix, sku);
    const proveedorCaro = ix.tercero.get(caroId);

    const delTrimestre = porTrimestre.get(peorTrimestre) ?? [];
    const serie: Serie = {
      clase: "barras",
      puntos: porClave(agrupar(delTrimestre, (l) => l.terceroId))
        .map(([id, ls]) => ({
          etiqueta: ix.nombre(id),
          valor: Math.round(precioMedio(ls)),
          marcado: id === caroId,
        }))
        .sort((a, b) => b.valor - a.valor),
      unidad: "dinero",
    };

    hallazgos.push({
      titulo: `${nombre} se compró a dos precios el mismo trimestre, un ${pctL(peorDiferencia)} de diferencia: ${cop(diferenciaTotal)}`,
      resumen:
        `En ${peorTrimestre}, ${sku} se compró a ${ix.nombre(caroId)} a ${cop(delPeor ? precioMedio(delPeor.caro) : 0)} por ` +
        `unidad y a ${ix.nombre(baratoId)} a ${cop(delPeor?.precioBarato ?? 0)}, un ${pctL(peorDiferencia)} de diferencia por ` +
        `el mismo producto y en las mismas semanas. Comprando todo al precio bajo, las ${numero(caras.length)} líneas del ` +
        `proveedor caro habrían costado ${cop(diferenciaTotal)} menos.`,
      montoEnRiesgo: Math.round(diferenciaTotal),
      montoExacto: true,
      documentos: [...new Set(caras.map((l) => l.doc.id))],
      evidencia: primeras([...caras].sort((a, b) => b.precio * b.cantidad - a.precio * a.cantidad)).map((l) =>
        evidenciaDocumento(
          ix,
          l.doc,
          `${cop(l.precio)} por unidad · ${numero(l.cantidad)} unidades · ${trimestreDe(l.fecha)}`,
        ),
      ),
      quePuedeEstarPasando: [
        "No es el mismo producto aunque comparta código: distinta marca, distinto gramaje o distinta presentación, y el maestro de productos los tiene mezclados.",
        "El proveedor caro entrega en bodega o financia el pago, y esa condición vale dinero; solo que no está escrita.",
        "Las compras se reparten por costumbre o por disponibilidad y nadie mira la tabla comparativa antes de decidir.",
        "Se dirige volumen a un proveedor concreto sabiendo que es más caro.",
      ],
      queRevisar: [
        `Confirma que ${sku} es literalmente el mismo artículo en las facturas de ${ix.nombre(caroId)} y de ${ix.nombre(baratoId)}.`,
        `Pregunta por qué no se llevó todo el volumen del trimestre al proveedor de ${cop(delPeor?.precioBarato ?? 0)}: si la respuesta es capacidad, queda cerrado.`,
        "Revisa si el proveedor barato quedó sin pedidos justo cuando entró el caro.",
      ],
      controlSugerido:
        "Tabla comparativa de precio por SKU y proveedor delante de quien crea la orden de compra, con el diferencial en pesos ya calculado.",
      sujeto: proveedorCaro ? sujetoTercero(proveedorCaro) : sujetoSku(sku, nombre),
      serie,
      repeticiones: caras.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(lineas.length, hallazgos);
};

/* ─────────────────────────────────────────────────────────────────────── */

export const CAPA2: Record<string, Regla> = {
  R20,
  R21,
  R22,
  R23,
  R24,
  R25,
  R26,
  R27,
  R28,
  R29,
  R30,
};
