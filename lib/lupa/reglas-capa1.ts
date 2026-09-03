/**
 * Capa 1: las catorce reglas duras. Aquí no se opina sobre si un precio está
 * caro ni sobre si la forma de los datos llama la atención: o el documento
 * está o no está.
 *
 * Tres decisiones valen para las catorce, y son el producto, no un detalle:
 *
 * 1. Ninguna regla acusa a nadie. Devuelve el hecho, la evidencia con fichero
 *    y fila, dos o tres explicaciones posibles ordenadas de la más inocente a
 *    la más grave, y qué habría que mirar para saber cuál es. Quien decide es
 *    la persona que revisa; el programa solo le ahorra encontrarlo.
 * 2. Un hallazgo sin evidencia trazable no se emite. Si no se puede señalar la
 *    fila del Excel, el hallazgo no existe: en una reunión con el cliente,
 *    "el sistema lo detectó" no es una respuesta.
 * 3. La regla no puntúa ni pinta semáforos: devuelve hechos y cifras y el
 *    motor aplica una sola fórmula para todas. Así los hallazgos son
 *    comparables entre sí.
 *
 * El falso positivo de R01 es deliberado y también es el producto: dos pagos
 * iguales al mismo proveedor son exactamente la forma de un pago duplicado, y
 * cuando la cadena documental los separa la regla lo dice y los deja en verde.
 * Una herramienta que solo sabe encender alarmas no sirve para revisar nada.
 */

import { cop, dias, fechaLarga, masDias, numero, pctL } from "./moneda";
import {
  conHallazgos,
  evidenciaBanco,
  evidenciaCambio,
  evidenciaDocumento,
  evidenciaMovimiento,
  evidenciaTercero,
  limpia,
  noEvaluable,
  sujetoTercero,
  sujetoUsuario,
  type HallazgoCrudo,
  type Indice,
  type Regla,
  type ResultadoCrudo,
} from "./indice";
import type { Documento, Evidencia, Grafo, MovimientoBanco, MovimientoInventario, Tercero } from "./tipos";

/* ═══════════════════════════  utilidades comunes  ═══════════════════════════ */

/** La tabla de evidencia se lee en pantalla: más de doce filas no se leen, se
    ojean. Las que no caben siguen contando en `repeticiones` y en `documentos`. */
const TOPE_EVIDENCIA = 12;

const recortar = (filas: Evidencia[]) => filas.slice(0, TOPE_EVIDENCIA);

const soloDigitos = (s: string) => s.replace(/\D+/g, "");

/** Sin tildes, sin mayúsculas y sin espacios de más: comparar textos de un ERP
    de cualquier otra forma da falsos negativos el primer día. */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Agrupa manteniendo el orden de llegada; las claves se recorren ordenadas
    siempre que importe, para que dos ejecuciones den el mismo informe. */
function agrupar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const previo = m.get(k);
    if (previo) previo.push(x);
    else m.set(k, [x]);
  }
  return m;
}

const porClave = <T>(m: Map<string, T[]>) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

const ordenarDocs = (ds: Documento[]) =>
  [...ds].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1));

const vivos = (ds: Documento[]) => ds.filter((d) => d.estado !== "anulado");

/** Une dos fechas en la frase que se narra: "entre el 6 de noviembre y el 14 de julio". */
function rango(desde: string, hasta: string) {
  return desde === hasta
    ? `el ${fechaLarga(desde, true)}`
    : `entre el ${fechaLarga(desde, true)} y el ${fechaLarga(hasta, true)}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** "1 factura" / "7 facturas". Un titular que dice "1 facturas" se cae solo. */
const cuantos = (n: number, uno: string, varios: string) => `${numero(n)} ${plural(n, uno, varios)}`;

/** "dos veces" se lee mejor que "2 veces" en un titular. Por encima de cinco ya
    no hay palabra que ayude y vuelve la cifra. */
const CARDINAL = ["cero", "una", "dos", "tres", "cuatro", "cinco"];
const cardinal = (n: number) => CARDINAL[n] ?? numero(n);
const vecesTexto = (n: number) => `${cardinal(n)} ${n === 1 ? "vez" : "veces"}`;
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "A, B y C": una lista que se pueda leer en voz alta. */
const listar = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/* ── Dígito de verificación de la DIAN ──────────────────────────────────────
   Es la única validación de este fichero que no sale de los datos del cliente
   sino de una norma externa, y por eso está aislada y con su tabla a la vista.
   Comprobada contra NIT reales (Ecopetrol 899.999.068-1, Bancolombia
   890.903.938-8, Sura 800.197.268-4): con la fórmula mal, R10 marcaría medio
   maestro de terceros y el hallazgo se caería en la primera pregunta. */
const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function digitoVerificacion(base: string): number | null {
  if (!/^\d+$/.test(base) || base.length === 0 || base.length > PESOS_DIAN.length) return null;
  let acumulado = 0;
  for (let i = 0; i < base.length; i++) {
    acumulado += Number(base[base.length - 1 - i]) * PESOS_DIAN[i];
  }
  const resto = acumulado % 11;
  return resto > 1 ? 11 - resto : resto;
}

/* ── Índice auxiliar ────────────────────────────────────────────────────────
   Los enlaces entre documentos (qué pago cancela qué factura, qué entrada
   respalda qué compra) los usan cinco reglas distintas. Resolverlos una vez y
   guardarlos colgando del índice evita que cada regla los resuelva a su
   manera, que es como se acaba con dos cifras distintas para el mismo hecho. */

type Auxiliar = {
  /** Facturas de compra que cancela cada pago. */
  facturasDePago: Map<string, Documento[]>;
  /** Pagos aplicados a cada factura de compra. */
  pagosDeFactura: Map<string, Documento[]>;
  tieneOrden: (factura: Documento) => boolean;
  tieneEntrada: (factura: Documento) => boolean;
  /** Coste de un movimiento de inventario según el maestro de productos. */
  costeMovimiento: (mov: MovimientoInventario) => number;
};

const CACHE = new WeakMap<Indice, Auxiliar>();

function aux(ix: Indice): Auxiliar {
  const guardado = CACHE.get(ix);
  if (guardado) return guardado;

  const resolver = (id: string | null): Documento | null => {
    if (!id) return null;
    return ix.documento.get(id) ?? ix.porNumero.get(id) ?? null;
  };

  /* Un ERP colombiano no siempre trae una columna "factura pagada": el pago cita
     el documento en la casilla de referencia que tenga a mano. Se miran las tres
     y se queda con las que de verdad son facturas de compra. */
  const facturasDePago = new Map<string, Documento[]>();
  const pagosDeFactura = new Map<string, Documento[]>();
  for (const pago of ix.porTipo("pago")) {
    const candidatos = [pago.facturaAfectadaId, pago.ordenCompraId, pago.entradaInventarioId];
    const facturas: Documento[] = [];
    for (const ref of candidatos) {
      const doc = resolver(ref);
      if (doc && doc.tipo === "factura_compra" && !facturas.some((f) => f.id === doc.id)) facturas.push(doc);
    }
    if (facturas.length) {
      facturasDePago.set(pago.id, facturas);
      for (const f of facturas) {
        const previo = pagosDeFactura.get(f.id);
        if (previo) previo.push(pago);
        else pagosDeFactura.set(f.id, [pago]);
      }
    }
  }

  /* La entrada de mercancía se puede haber registrado contra la factura o contra
     la orden de compra: las dos formas son válidas y las dos cierran el cruce. */
  const entradasPorReferencia = new Map<string, Documento[]>();
  for (const entrada of ix.porTipo("entrada_inventario")) {
    for (const ref of [entrada.facturaAfectadaId, entrada.ordenCompraId]) {
      if (!ref) continue;
      const previo = entradasPorReferencia.get(ref);
      if (previo) previo.push(entrada);
      else entradasPorReferencia.set(ref, [entrada]);
    }
  }

  const tieneOrden = (factura: Documento) => {
    const ref = factura.ordenCompraId;
    if (!ref) return false;
    const doc = resolver(ref);
    // Referencia que no resuelve: se le concede. Un enlace roto es un problema de
    // datos, no una compra sin autorizar, y aquí un falso positivo cuesta caro.
    return doc === null || doc.tipo === "orden_compra";
  };

  const tieneEntrada = (factura: Documento) => {
    if (factura.entradaInventarioId) return true;
    if (entradasPorReferencia.has(factura.id)) return true;
    if (factura.ordenCompraId && entradasPorReferencia.has(factura.ordenCompraId)) return true;
    if (ix.movsDeDoc(factura.id).some((m) => m.tipo === "entrada")) return true;
    if (factura.ordenCompraId && ix.movsDeDoc(factura.ordenCompraId).some((m) => m.tipo === "entrada")) return true;
    return false;
  };

  const costeMovimiento = (mov: MovimientoInventario) => {
    const item = ix.item.get(mov.sku);
    return Math.abs(mov.cantidad) * (item?.costoPromedio ?? 0);
  };

  const nuevo: Auxiliar = { facturasDePago, pagosDeFactura, tieneOrden, tieneEntrada, costeMovimiento };
  CACHE.set(ix, nuevo);
  return nuevo;
}

/** ¿La factura toca productos que el maestro dice que se inventarían? Sin esto,
    un servicio facturado como línea de producto sale como fuga de inventario. */
function tocaInventario(ix: Indice, documentoId: string): boolean {
  return ix.lineasDe(documentoId).some((l) => ix.item.get(l.sku)?.inventariable === true);
}

/* ═══════════════════════════  R01 · Pago duplicado  ═══════════════════════════ */

const R01: Regla = ({ ix }): ResultadoCrudo => {
  const pagos = vivos(ix.porTipo("pago")).filter((p) => p.terceroId);
  if (pagos.length === 0) return limpia(0);

  const minimo = ix.politicas.minimoSoportePago;
  const hallazgos: HallazgoCrudo[] = [];

  for (const [, delTercero] of porClave(agrupar(pagos, (p) => p.terceroId ?? ""))) {
    for (const [, mismoImporte] of porClave(agrupar(delTercero, (p) => String(Math.round(p.montoTotal))))) {
      if (mismoImporte.length < 2) continue;
      // Por debajo del mínimo de soporte la empresa ni siquiera exige documento:
      // levantar ahí un duplicado es ruido, y el ruido se lleva la credibilidad.
      if (mismoImporte[0].montoTotal < minimo) continue;

      // Grupos dentro de una ventana de 60 días: dos pagos iguales en enero y en
      // noviembre son el mismo servicio mensual, no un duplicado.
      const ordenados = ordenarDocs(mismoImporte);
      let grupo: Documento[] = [];
      const cerrar = () => {
        if (grupo.length >= 2 && !esCargoPeriodico(grupo, ordenados)) {
          hallazgos.push(analizarDuplicado(ix, grupo));
        }
        grupo = [];
      };
      for (const pago of ordenados) {
        if (grupo.length && dias(grupo[0].fecha, pago.fecha) > 60) cerrar();
        grupo.push(pago);
      }
      cerrar();
    }
  }

  return conHallazgos(pagos.length, hallazgos);
};

/**
 * Un arriendo, una póliza o un servicio se pagan todos los meses por el mismo
 * importe al mismo proveedor, y dos meses seguidos caben de sobra en la ventana
 * de 60 días. No es un duplicado: es una cuota. Se reconoce porque todos los
 * saltos son de un mes y porque el importe se repite tres veces o más en el
 * período, más allá del grupo que se está mirando.
 */
function esCargoPeriodico(grupo: Documento[], todosDelImporte: Documento[]): boolean {
  if (todosDelImporte.length < 3) return false;
  for (let i = 1; i < grupo.length; i++) {
    const salto = dias(grupo[i - 1].fecha, grupo[i].fecha);
    if (salto < 26 || salto > 35) return false;
  }
  return true;
}

function analizarDuplicado(ix: Indice, grupo: Documento[]): HallazgoCrudo {
  const a = aux(ix);
  const monto = grupo[0].montoTotal;
  const proveedor = ix.nombre(grupo[0].terceroId);
  const separacion = dias(grupo[0].fecha, grupo[grupo.length - 1].fecha);
  const debitos = grupo.flatMap((p) => ix.bancoDeDoc(p.id).filter((b) => b.tipo === "debito"));

  // Camino 1: los pagos citan la misma factura. No hay nada que interpretar.
  const referidas = grupo.map((p) => a.facturasDePago.get(p.id) ?? []);
  const cuentaPorFactura = new Map<string, number>();
  for (const lista of referidas) {
    for (const f of lista) cuentaPorFactura.set(f.id, (cuentaPorFactura.get(f.id) ?? 0) + 1);
  }
  const repetida = [...cuentaPorFactura.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1])[0];
  const facturaRepetida = repetida ? (ix.documento.get(repetida[0]) ?? null) : null;

  // Camino 2: cada pago cancela una factura distinta y todas tienen su cadena
  // completa. Es el caso que la regla tiene que saber dejar en verde.
  const distintas: Documento[] = [];
  for (const lista of referidas) {
    for (const f of lista) if (!distintas.some((d) => d.id === f.id)) distintas.push(f);
  }
  const facturasDelImporte = ordenarDocs(
    vivos(ix.docsDeTercero(grupo[0].terceroId ?? "")).filter(
      (d) => d.tipo === "factura_compra" && Math.round(d.montoTotal) === Math.round(monto),
    ),
  );
  const candidatas = distintas.length >= grupo.length ? ordenarDocs(distintas) : facturasDelImporte;
  const soportadas = candidatas.filter((f) => a.tieneOrden(f) && a.tieneEntrada(f));
  const todosConciliados = grupo.every((p) => ix.bancoDeDoc(p.id).length > 0);
  const explicado = !facturaRepetida && soportadas.length >= grupo.length && todosConciliados;

  if (explicado) return duplicadoExplicado(ix, grupo, soportadas.slice(0, grupo.length), separacion);

  const excedentes = grupo.slice(1);
  const enRiesgo = monto * excedentes.length;
  const evidencia: Evidencia[] = [];
  if (facturaRepetida) {
    evidencia.push(
      evidenciaDocumento(ix, facturaRepetida, `una sola factura de ${cop(facturaRepetida.montoTotal)}`),
    );
  } else if (facturasDelImporte.length === 1) {
    evidencia.push(
      evidenciaDocumento(ix, facturasDelImporte[0], "es la única factura de ese importe en el período"),
    );
  }
  grupo.forEach((p, i) =>
    evidencia.push(evidenciaDocumento(ix, p, i === 0 ? "primer pago" : `pago ${i + 1} por el mismo importe`)),
  );
  for (const d of debitos) evidencia.push(evidenciaBanco(ix, d, "el dinero salió del banco"));

  const dineroSalioDosVeces = debitos.length >= grupo.length;
  const unaSola = facturasDelImporte.length === 1;
  const titulo = facturaRepetida
    ? `La factura ${facturaRepetida.numero}, de ${cop(monto)}, se pagó ${vecesTexto(grupo.length)} con ${separacion} días de diferencia`
    : `${cop(monto)} salieron ${vecesTexto(grupo.length)} hacia ${proveedor} en ${separacion} días${unaSola ? " y solo hay una factura de ese importe" : " sin que los documentos los separen"}`;

  const resumen = facturaRepetida
    ? `La factura ${facturaRepetida.numero} de ${proveedor} tiene ${numero(grupo.length)} pagos aplicados de ${cop(monto)} cada uno, el ${fechaLarga(grupo[0].fecha, true)} y el ${fechaLarga(grupo[grupo.length - 1].fecha, true)}, y el extracto muestra ${numero(debitos.length)} ${plural(debitos.length, "débito", "débitos")} por ese importe.`
    : `${proveedor} recibió ${numero(grupo.length)} pagos de ${cop(monto)} en ${separacion} días, ${rango(grupo[0].fecha, grupo[grupo.length - 1].fecha)}, y en el período hay ${numero(facturasDelImporte.length)} ${plural(facturasDelImporte.length, "factura suya", "facturas suyas")} de ese importe${facturasDelImporte.length < grupo.length ? ", menos que pagos" : " sin la cadena de orden y entrada completa"}.`;

  const quePuedeEstarPasando = dineroSalioDosVeces
    ? [
        "El proveedor pudo reclamar la factura como pendiente y tesorería la volvió a pagar sin mirar si ya había salido.",
        "Puede que la factura entrara dos veces al sistema, con dos números internos distintos, y cada copia siguiera su curso hasta el banco.",
        "Puede que alguien haya vuelto a enviar a pago una factura ya pagada, contando con que nadie cruza los pagos contra el histórico.",
      ]
    : [
        "Puede que el pago esté duplicado solo en el registro contable y el dinero haya salido una sola vez: el extracto muestra menos débitos que pagos.",
        "Puede que uno de los dos pagos se anulara en el banco y en el ERP quedara vivo.",
        "Puede que se haya pagado dos veces y uno de los dos movimientos no esté en el extracto que se entregó.",
      ];

  return {
    titulo,
    resumen,
    montoEnRiesgo: enRiesgo,
    montoExacto: true,
    // Solo los pagos que sobran: el primero es dinero bien gastado. Así el total
    // del informe, que suma la unión de estos identificadores, no cuenta de más.
    documentos: excedentes.map((p) => p.id),
    evidencia: recortar(evidencia),
    quePuedeEstarPasando,
    queRevisar: [
      "Pedir al banco el comprobante de los dos débitos y confirmar que los dos llegaron a la cuenta del proveedor.",
      "Pedir al proveedor su estado de cuenta a la fecha y ver si la factura le figura pagada una vez o dos.",
      `Si el dinero salió dos veces, reclamar la devolución o dejar los ${cop(enRiesgo)} como saldo a favor por escrito antes de la siguiente compra.`,
    ],
    controlSugerido:
      "Que el ERP no deje aplicar un segundo pago a una factura que ya tiene pago, y que todo pago cite el número de factura obligatoriamente.",
    sujeto: terceroSujeto(ix, grupo[0].terceroId),
    repeticiones: grupo.length,
    evidenciaCompleta: true,
  };
}

function duplicadoExplicado(
  ix: Indice,
  grupo: Documento[],
  facturas: Documento[],
  separacion: number,
): HallazgoCrudo {
  const monto = grupo[0].montoTotal;
  const proveedor = ix.nombre(grupo[0].terceroId);
  const evidencia: Evidencia[] = [];
  for (const f of facturas) {
    evidencia.push(evidenciaDocumento(ix, f, "factura distinta, con orden de compra y entrada de inventario"));
  }
  for (const p of grupo) {
    evidencia.push(evidenciaDocumento(ix, p, "pago aplicado a una sola de las facturas"));
    for (const b of ix.bancoDeDoc(p.id)) evidencia.push(evidenciaBanco(ix, b, "débito conciliado con ese pago"));
  }

  return {
    titulo: `${mayuscula(cardinal(grupo.length))} pagos de ${cop(monto)} a ${proveedor} en ${separacion} días: son ${cardinal(facturas.length)} facturas distintas y cada una tiene su soporte completo`,
    resumen: `${proveedor} recibió ${numero(grupo.length)} pagos de ${cop(monto)} con ${separacion} días de diferencia; cada uno cancela una factura distinta (${listar(facturas.map((f) => f.numero))}), y todas tienen orden de compra, entrada de inventario y su débito conciliado en el extracto.`,
    montoEnRiesgo: 0,
    montoExacto: true,
    documentos: [],
    evidencia: recortar(evidencia),
    quePuedeEstarPasando: [
      "Varios pagos iguales al mismo proveedor en la misma semana son exactamente la forma que tiene un pago duplicado, y por eso la regla los levanta.",
      "Al abrir los documentos se separan solos: son compras distintas del mismo tamaño, cada una con su orden, su entrada y su débito en el banco.",
      "No hay dinero en riesgo. Queda registrado para que la próxima revisión no vuelva a gastar una mañana en los mismos pagos.",
    ],
    queRevisar: [
      "Nada pendiente: la cadena documental está completa en todos los pagos.",
      `Si se quiere confirmar en un minuto, comparar los números de factura de cada pago: ${listar(facturas.map((f) => f.numero))}, distintos.`,
    ],
    controlSugerido:
      "Mantener la exigencia de citar el número de factura en cada pago: es justo lo que permite descartar este caso en un minuto en vez de en una mañana.",
    sujeto: terceroSujeto(ix, grupo[0].terceroId),
    repeticiones: grupo.length,
    // La regla misma ve la explicación, así que el motor lo baja a verde.
    evidenciaCompleta: false,
    forzarSemaforo: "verde",
  };
}

function terceroSujeto(ix: Indice, terceroId: string | null) {
  const t = terceroId ? ix.tercero.get(terceroId) : undefined;
  return t ? sujetoTercero(t) : null;
}

/* ══════════════  R02 · Factura de compra sin orden de compra  ══════════════ */

const R02: Regla = ({ ix }): ResultadoCrudo => {
  const facturas = vivos(ix.porTipo("factura_compra"));
  if (facturas.length === 0) return limpia(0);

  const a = aux(ix);
  const umbral = ix.politicas.umbralAprobacion;
  const sinOrden = facturas.filter((f) => !a.tieneOrden(f));
  const hallazgos: HallazgoCrudo[] = [];

  for (const [terceroId, grupo] of porClave(agrupar(sinOrden, (f) => f.terceroId ?? ""))) {
    const total = suma(grupo.map((f) => f.montoTotal));
    // Una factura suelta por debajo del umbral de aprobación no necesitaba
    // orden previa: exigirla sería inventarse una política que la empresa no tiene.
    if (grupo.length < 2 || total < umbral) continue;

    const ordenadas = ordenarDocs(grupo);
    const proveedor = ix.nombre(terceroId);
    const todas = vivos(ix.docsDeTercero(terceroId)).filter((d) => d.tipo === "factura_compra");
    const usuarios = agrupar(
      ordenadas.filter((f) => f.usuarioRegistro),
      (f) => f.usuarioRegistro ?? "",
    );
    const dominante = [...usuarios.entries()].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))[0];
    const mismoUsuario = dominante && dominante[1].length === ordenadas.length ? dominante[0] : null;

    hallazgos.push({
      titulo: `${cuantos(ordenadas.length, "factura", "facturas")} de ${proveedor} por ${cop(total)} entraron sin orden de compra`,
      resumen: `${proveedor} facturó ${vecesTexto(ordenadas.length)} ${rango(ordenadas[0].fecha, ordenadas[ordenadas.length - 1].fecha)} por ${cop(total)} y ninguna de esas facturas tiene orden de compra asociada${
        ordenadas.length === todas.length ? "; son todas las facturas suyas del período" : ""
      }${mismoUsuario ? `, y todas las registró el usuario ${mismoUsuario}` : ""}.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: ordenadas.map((f) => f.id),
      evidencia: recortar(
        ordenadas.map((f) =>
          evidenciaDocumento(
            ix,
            f,
            `sin orden de compra${f.usuarioRegistro ? ` · registró ${f.usuarioRegistro}` : ""}`,
          ),
        ),
      ),
      quePuedeEstarPasando: [
        "Pueden ser compras urgentes que se autorizaron por teléfono o por correo y que nadie volvió a cargar en el sistema como orden.",
        "Puede ser un proveedor que entra por fuera del circuito de compras porque alguien lo tramita directamente con el área que lo necesita.",
        "Pueden ser facturas por bienes o servicios que no se recibieron: sin orden previa no hay nada contra lo que contrastar lo que llegó.",
      ],
      queRevisar: [
        "Tomar tres de estas facturas y pedir la prueba de que alguien autorizó la compra antes de que llegara: cotización, correo o acta.",
        "Confirmar con bodega que la mercancía de esas facturas entró y contra qué documento se recibió.",
        `Revisar quién dio de alta a ${proveedor} y con qué papeles: RUT, cámara de comercio y certificación bancaria.`,
      ],
      controlSugerido: `Bloquear el registro de facturas de compra sin orden previa por encima de ${cop(ix.politicas.minimoSoportePago)}, y que la excepción la tenga que aprobar un segundo usuario dejando el motivo.`,
      sujeto: terceroSujeto(ix, terceroId),
      repeticiones: ordenadas.length,
      evidenciaCompleta: true,
    });
  }

  return conHallazgos(facturas.length, ordenarPorMonto(hallazgos));
};

const ordenarPorMonto = (hs: HallazgoCrudo[]) =>
  [...hs].sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo || (a.titulo < b.titulo ? -1 : 1));

/* ═══════  R03 · Factura de compra pagada sin entrada de inventario  ═══════ */

const R03: Regla = ({ ix }): ResultadoCrudo => {
  const facturas = vivos(ix.porTipo("factura_compra"));
  if (facturas.length === 0) return limpia(0);

  const a = aux(ix);
  const senaladas = ordenarDocs(
    facturas.filter((f) => {
      const pagada = f.estado === "pagado" || (a.pagosDeFactura.get(f.id)?.length ?? 0) > 0;
      // Si la factura no toca productos inventariables no puede tener entrada, y
      // reclamarla sería reclamar un documento que no existe en ningún ERP.
      return pagada && tocaInventario(ix, f.id) && !a.tieneEntrada(f);
    }),
  );
  if (senaladas.length === 0) return limpia(facturas.length);

  const total = suma(senaladas.map((f) => f.montoTotal));
  const proveedores = new Set(senaladas.map((f) => f.terceroId ?? ""));

  return conHallazgos(facturas.length, [
    {
      titulo: `${cuantos(senaladas.length, "factura de compra", "facturas de compra")} por ${cop(total)} se ${plural(senaladas.length, "pagó", "pagaron")} sin que conste la entrada de la mercancía`,
      resumen: `Entre ${numero(facturas.length)} facturas de compra hay ${numero(senaladas.length)} que se pagaron ${rango(senaladas[0].fecha, senaladas[senaladas.length - 1].fecha)} por ${cop(total)} y que no tienen entrada de inventario ni movimiento de bodega asociado, repartidas entre ${numero(proveedores.size)} ${plural(proveedores.size, "proveedor", "proveedores")}.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: senaladas.map((f) => f.id),
      evidencia: recortar(
        senaladas.map((f) =>
          evidenciaDocumento(ix, f, `pagada${a.tieneOrden(f) ? " y con orden" : " y sin orden"}, sin entrada`),
        ),
      ),
      quePuedeEstarPasando: [
        "Puede que la mercancía llegara y bodega no registrara la entrada, que es lo que pasa casi siempre cuando se recibe fuera de horario o en una bodega distinta a la del documento.",
        "Puede que sean compras de servicio cargadas con código de producto: entonces nunca va a existir una entrada, y lo que hay que corregir es el maestro.",
        "Puede que se haya pagado mercancía que no llegó, que es exactamente lo que el cruce entre orden, entrada y factura existe para evitar.",
      ],
      queRevisar: [
        "Tomar las tres facturas de mayor monto y buscar la remisión firmada del transportador o la entrada física en bodega.",
        "Contar en bodega el producto de la factura más grande y compararlo con lo que dice el kardex.",
        "Mirar si un mismo proveedor concentra estos casos: si es así, revisar toda su relación antes que las facturas una a una.",
      ],
      controlSugerido:
        "No liberar el pago de una factura de compra hasta que exista entrada de inventario asociada: el cruce de tres puntos automático en el ERP.",
      sujeto: null,
      repeticiones: senaladas.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ═══════════════  R04 · Venta sin salida de inventario  ═══════════════ */

const R04: Regla = ({ ix }): ResultadoCrudo => {
  const ventas = vivos(ix.porTipo("factura_venta"));
  if (ventas.length === 0) return limpia(0);

  const senaladas = ordenarDocs(
    ventas.filter((v) => tocaInventario(ix, v.id) && !ix.movsDeDoc(v.id).some((m) => m.tipo === "salida")),
  );
  if (senaladas.length === 0) return limpia(ventas.length);

  const total = suma(senaladas.map((v) => v.montoTotal));
  const unidades = suma(
    senaladas.flatMap((v) => ix.lineasDe(v.id).filter((l) => ix.item.get(l.sku)?.inventariable).map((l) => l.cantidad)),
  );

  return conHallazgos(ventas.length, [
    {
      titulo: `${cuantos(senaladas.length, "factura de venta", "facturas de venta")} por ${cop(total)} no ${plural(senaladas.length, "descargó", "descargaron")} el inventario`,
      resumen: `${cuantos(senaladas.length, "factura de venta emitida", "facturas de venta emitidas")} ${rango(senaladas[0].fecha, senaladas[senaladas.length - 1].fecha)}, por ${cop(total)} y ${numero(unidades)} unidades de producto inventariable, no tienen ningún movimiento de salida de bodega asociado.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: senaladas.map((v) => v.id),
      evidencia: recortar(
        senaladas.map((v) =>
          evidenciaDocumento(ix, v, `${numero(ix.lineasDe(v.id).length)} líneas facturadas, ninguna salida`),
        ),
      ),
      quePuedeEstarPasando: [
        "Puede que la salida se registrara más tarde o contra otro documento y se quedara sin enlazar a la factura.",
        "Puede que la mercancía se entregara sin descargarla del sistema, y entonces el stock en pantalla es mayor que el real y las compras se están calculando sobre una cifra falsa.",
        "Puede que el producto saliera de la bodega sin que nadie lo descontara, que es la forma que tiene de verse una salida no autorizada.",
      ],
      queRevisar: [
        "Contar físicamente dos de los productos de estas facturas y compararlos con la existencia del sistema.",
        "Preguntar a bodega si estas entregas se despacharon y con qué remisión.",
        "Revisar si las facturas son del mismo vendedor o de la misma bodega.",
      ],
      controlSugerido:
        "Que la facturación descargue inventario en el mismo asiento: si el producto maneja inventario, no debería poder facturarse sin generar la salida.",
      sujeto: null,
      repeticiones: senaladas.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ═══════════════  R05 · Salida de inventario huérfana  ═══════════════ */

const R05: Regla = ({ ix }): ResultadoCrudo => {
  const salidas = ix.libro.inventario.filter((m) => m.tipo === "salida");
  if (salidas.length === 0) return limpia(0);

  const a = aux(ix);
  const huerfanas = salidas
    // Solo la salida que no cita ningún documento, o cuyo documento no existe en
    // el libro. La que cuelga de una factura anulada tiene una explicación —la
    // anulación— y mezclarla aquí convierte el hallazgo en una lista larga que
    // ya no señala nada.
    .filter((m) => !m.documentoId || !(ix.documento.get(m.documentoId) ?? ix.porNumero.get(m.documentoId)))
    .sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.id < y.id ? -1 : 1));
  if (huerfanas.length === 0) return limpia(salidas.length);

  const coste = suma(huerfanas.map((m) => a.costeMovimiento(m)));
  const unidades = suma(huerfanas.map((m) => Math.abs(m.cantidad)));
  const bodegas = [...new Set(huerfanas.map((m) => m.bodega))].sort();

  return conHallazgos(salidas.length, [
    {
      titulo: `${cuantos(huerfanas.length, "salida de bodega", "salidas de bodega")} por ${cop(coste)} a coste no ${plural(huerfanas.length, "tiene", "tienen")} venta detrás`,
      resumen: `${cuantos(huerfanas.length, "movimiento de salida", "movimientos de salida")} ${rango(huerfanas[0].fecha, huerfanas[huerfanas.length - 1].fecha)}, ${numero(unidades)} unidades valoradas en ${cop(coste)} al coste promedio del maestro, no citan ningún documento que las explique; salen de ${bodegas.join(", ")}.`,
      montoEnRiesgo: coste,
      montoExacto: true,
      // Un movimiento de inventario no es un documento, pero sí es un registro con
      // identificador propio: el motor lo necesita para que este coste entre en el
      // total una sola vez aunque otra regla señale los mismos movimientos.
      documentos: huerfanas.map((m) => m.id),
      evidencia: recortar(
        huerfanas.map((m) =>
          evidenciaMovimiento(
            ix,
            m,
            `${numero(Math.abs(m.cantidad))} unidades · ${cop(a.costeMovimiento(m))} · ${m.motivo ?? "sin motivo"}${m.usuario ? ` · ${m.usuario}` : ""}`,
          ),
        ),
      ),
      quePuedeEstarPasando: [
        "Pueden ser traslados entre bodegas que se registraron como salida en vez de como traslado: el producto sigue en la empresa.",
        "Pueden ser muestras comerciales, garantías o averías que se sacaron sin dejar el documento que las justifica.",
        "Puede ser mercancía que salió de la bodega y no se facturó a nadie.",
      ],
      queRevisar: [
        "Pedir el motivo de las cinco salidas de mayor valor a quien las registró.",
        "Cruzar las fechas con las remisiones de esas jornadas y con las guías del transportador.",
        "Comprobar si en la bodega de destino existe la entrada que debería tener un traslado.",
      ],
      controlSugerido:
        "Motivo obligatorio de una lista cerrada y documento de respaldo en toda salida que no venga de una factura, con un responsable que la autorice.",
      sujeto: bodegas.length === 1 ? { tipo: "bodega", id: bodegas[0], nombre: bodegas[0] } : null,
      repeticiones: huerfanas.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ═══════════════  R06 · Huecos en los consecutivos  ═══════════════ */

const R06: Regla = ({ ix }): ResultadoCrudo => {
  const series = ix.libro.documentos.filter(
    (d) => (d.tipo === "factura_venta" || d.tipo === "recibo_caja") && d.consecutivo !== null,
  );
  if (series.length === 0) return noEvaluable("los documentos no traen número consecutivo dentro de su serie");

  const hallazgos: HallazgoCrudo[] = [];

  for (const [clave, docs] of porClave(agrupar(series, (d) => `${d.tipo}·${d.serie}`))) {
    const usados = new Set(docs.map((d) => d.consecutivo as number));
    const numeros = [...usados].sort((a, b) => a - b);
    const faltan: number[] = [];
    for (let n = numeros[0]; n <= numeros[numeros.length - 1]; n++) if (!usados.has(n)) faltan.push(n);
    if (faltan.length === 0) continue;

    const serie = clave.split("·")[1];
    const esCaja = docs[0].tipo === "recibo_caja";
    const etiquetaUno = esCaja ? "recibo de caja" : "factura de venta";
    const etiqueta = esCaja ? "recibos de caja" : "facturas de venta";
    // El número que falta se reconstruye con el formato de sus vecinos: decir
    // "falta el RC-2026-0188" es una frase que se puede buscar en el ERP; decir
    // "falta el consecutivo 188" no lo es.
    const numeroDeHueco = reconstructor(serie, docs);
    // El monto es una estimación honesta: del documento que falta no se sabe
    // nada más que el hueco, así que se le pone el promedio de sus vecinos.
    const promedio = suma(docs.map((d) => d.montoTotal)) / docs.length;
    const estimado = promedio * faltan.length;
    const rachas = agruparCorrelativos(faltan);
    const mayor = rachas.reduce((a, b) => (b.length > a.length ? b : a), rachas[0]);

    // Se enseñan los documentos que rodean cada hueco: son la prueba de que el
    // número existió en la serie y de que nadie lo usó.
    const vecinos: Evidencia[] = [];
    for (const racha of rachas) {
      const antes = docs.filter((d) => (d.consecutivo as number) === racha[0] - 1)[0];
      const despues = docs.filter((d) => (d.consecutivo as number) === racha[racha.length - 1] + 1)[0];
      if (antes) vecinos.push(evidenciaDocumento(ix, antes, `último número antes del hueco (${racha[0] - 1})`));
      if (despues)
        vecinos.push(
          evidenciaDocumento(
            ix,
            despues,
            `siguiente número existente: faltan ${racha.length} entre medias (${racha.join(", ")})`,
          ),
        );
    }

    hallazgos.push({
      titulo: `${plural(faltan.length, "Falta", "Faltan")} ${cuantos(faltan.length, etiquetaUno, etiqueta)} en la serie ${serie}${mayor.length > 1 ? ` y ${numero(mayor.length)} llevan números seguidos` : ""}: unos ${cop(estimado)} sin rastro`,
      resumen: `La serie ${serie} va del ${numeros[0]} al ${numeros[numeros.length - 1]} y no tiene ${numero(faltan.length)} números: ${listar(faltan.slice(0, 8).map(numeroDeHueco))}${faltan.length > 8 ? " y otros más" : ""}. Al promedio de la propia serie, ${cop(promedio)} por documento, son unos ${cop(estimado)} sin rastro.`,
      montoEnRiesgo: estimado,
      // Del documento que falta no se conoce el importe: la cifra es un orden de
      // magnitud, y el informe tiene que decirlo.
      montoExacto: false,
      // Los identificadores que faltan. No resuelven a ninguna fila —de eso va el
      // hallazgo—, pero le dan al motor algo con lo que repartir el estimado.
      documentos: faltan.map(numeroDeHueco),
      evidencia: recortar(vecinos),
      quePuedeEstarPasando: [
        "Pueden ser documentos anulados que el ERP borró en lugar de dejarlos marcados como anulados en cero.",
        "Puede ser un salto de numeración del sistema, o dos talonarios en paralelo que se repartieron los números.",
        `Pueden ser ${etiqueta} emitidos y retirados después del sistema: ${docs[0].tipo === "recibo_caja" ? "un recibo de caja que no aparece es dinero cobrado que puede no haber entrado" : "una factura que no aparece es una venta que no se declaró"}.`,
      ],
      queRevisar: [
        `Pedir al ERP el reporte de anulados de la serie ${serie} y cruzarlo con estos números.`,
        `Preguntar por los ${numero(mayor.length)} números seguidos (${listar(mayor.map(numeroDeHueco))}) a quien tiene asignada la serie: un salto correlativo no suele ser un error del sistema.`,
        docs[0].tipo === "recibo_caja"
          ? "Comparar el arqueo de caja y las consignaciones de esos días con lo recibido según el sistema."
          : "Cruzar los despachos de esos días con las facturas existentes: si salió mercancía, tiene que haber factura.",
      ],
      controlSugerido:
        "Activar el control de consecutivos del ERP: que no se pueda saltar un número y que la anulación deje el documento visible en cero en vez de borrarlo.",
      sujeto: null,
      repeticiones: faltan.length,
      evidenciaCompleta: true,
    });
  }

  return conHallazgos(series.length, ordenarPorMonto(hallazgos));
};

/**
 * Devuelve cómo se habría llamado el documento que falta, copiando el formato de
 * los que sí están. Solo se atreve cuando el sufijo del número coincide con el
 * consecutivo en toda la serie; si no coincide, se queda en el consecutivo pelado
 * antes que inventarse un número de documento que no existió.
 */
function reconstructor(serie: string, docs: Documento[]): (n: number) => string {
  const sufijo = (d: Documento) => d.numero.slice(d.numero.lastIndexOf("-") + 1);
  const coherente = docs.every((d) => Number(sufijo(d)) === d.consecutivo);
  if (!coherente) return (n) => `${serie} · ${n}`;
  const anchura = Math.max(...docs.map((d) => sufijo(d).length));
  return (n) => `${serie}-${String(n).padStart(anchura, "0")}`;
}

/** [188,189,190,192] → [[188,189,190],[192]]. Cinco seguidos no se explican igual que cinco sueltos. */
function agruparCorrelativos(ns: number[]): number[][] {
  const rachas: number[][] = [];
  for (const n of ns) {
    const ultima = rachas[rachas.length - 1];
    if (ultima && n === ultima[ultima.length - 1] + 1) ultima.push(n);
    else rachas.push([n]);
  }
  return rachas;
}

/* ═════════  R07 · Pago tras un cambio de cuenta bancaria  ═════════ */

const VENTANA_CUENTA = 30;

const R07: Regla = ({ ix }): ResultadoCrudo => {
  const cambios = ix.libro.cambiosTercero.filter((c) => c.campo === "cuenta_bancaria");
  if (cambios.length === 0) return noEvaluable("el maestro de terceros no trae histórico de cambios de cuenta");

  const hallazgos: HallazgoCrudo[] = [];
  const ordenados = [...cambios].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.terceroId < b.terceroId ? -1 : 1));

  for (const cambio of ordenados) {
    const limite = masDias(cambio.fecha, VENTANA_CUENTA);
    const pagos = ordenarDocs(
      vivos(ix.docsDeTercero(cambio.terceroId)).filter(
        (d) => d.tipo === "pago" && d.fecha >= cambio.fecha && d.fecha <= limite,
      ),
    );
    if (pagos.length === 0) continue;

    const total = suma(pagos.map((p) => p.montoTotal));
    const proveedor = ix.nombre(cambio.terceroId);
    const separacion = dias(cambio.fecha, pagos[0].fecha);
    const evidencia: Evidencia[] = [
      evidenciaCambio(ix, cambio, `de la cuenta ${cambio.valorAnterior} a la ${cambio.valorNuevo}`),
    ];
    for (const p of pagos) {
      evidencia.push(evidenciaDocumento(ix, p, `${separacionTexto(dias(cambio.fecha, p.fecha))} del cambio`));
      for (const b of ix.bancoDeDoc(p.id)) evidencia.push(evidenciaBanco(ix, b, "salida del banco"));
    }

    hallazgos.push({
      titulo: `${cop(total)} salieron hacia ${proveedor} ${separacionTexto(separacion)} de que le cambiaran la cuenta bancaria`,
      resumen: `La cuenta registrada de ${proveedor} pasó de ${cambio.valorAnterior} a ${cambio.valorNuevo} el ${fechaLarga(cambio.fecha, true)}${cambio.usuario ? `, cambio hecho por ${cambio.usuario}` : ""}, y el ${fechaLarga(pagos[0].fecha, true)} salió ${plural(pagos.length, "un pago", "el primero de varios pagos")} por ${cop(pagos[0].montoTotal)}${pagos.length > 1 ? `, ${cop(total)} en total` : ""}.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: pagos.map((p) => p.id),
      evidencia: recortar(evidencia),
      quePuedeEstarPasando: [
        "Puede ser una actualización legítima que el proveedor notificó por escrito y que alguien registró sin dejar el soporte adjunto.",
        "Puede ser un cambio digitado por error, con dígitos cambiados de sitio, y el dinero estar parado en una cuenta ajena.",
        "Puede ser una suplantación del correo del proveedor pidiendo que se le pague a otra cuenta, que es uno de los fraudes más frecuentes y más caros en Colombia.",
      ],
      queRevisar: [
        "Llamar al proveedor a un teléfono conocido de antes, no al que venga en el correo del cambio, y confirmar la cuenta con él.",
        "Pedir la certificación bancaria a nombre del NIT del proveedor y comprobar que el titular coincide.",
        `Buscar el correo o la carta que originó el cambio del ${fechaLarga(cambio.fecha, true)} y mirar el dominio del remitente letra por letra.`,
      ],
      controlSugerido:
        "Congelar los pagos a un tercero durante 48 horas después de cambiarle la cuenta, y exigir que una persona distinta a quien registra el cambio lo confirme por teléfono.",
      sujeto: terceroSujeto(ix, cambio.terceroId),
      repeticiones: pagos.length,
      evidenciaCompleta: true,
    });
  }

  return conHallazgos(cambios.length, ordenarPorMonto(hallazgos));
};

const separacionTexto = (d: number) =>
  d === 0 ? "el mismo día" : d === 1 ? "un día después" : `${numero(d)} días después`;

/* ═══════════  R08 · Proveedor con datos de empleado  ═══════════ */

type Coincidencia = {
  campo: string;
  valor: string;
  /** "La cuenta bancaria", para abrir una frase. */
  etiqueta: string;
  /** "Cuenta bancaria", para una etiqueta de gráfico. */
  corta: string;
  /** "la misma cuenta bancaria" / "el mismo teléfono": el género lo lleva el dato. */
  laMisma: string;
  /** "registrada" o "registrado", para la misma razón. */
  participio: string;
};

const R08: Regla = ({ ix }): ResultadoCrudo => {
  const proveedores = ix.libro.terceros.filter((t) => t.tipo === "proveedor");
  const empleados = ix.libro.terceros.filter((t) => t.tipo === "empleado");
  if (empleados.length === 0) return noEvaluable("el maestro no distingue empleados, así que no hay con qué cruzar");

  // Un teléfono o una dirección que aparecen en media docena de fichas son la
  // centralita o la sede de la propia empresa, no un vínculo entre dos personas.
  // La cuenta bancaria no necesita este filtro: compartirla nunca es normal.
  const comunes = valoresRepetidos(ix.libro.terceros);
  const hallazgos: HallazgoCrudo[] = [];

  for (const p of proveedores) {
    for (const e of empleados) {
      const coincidencias = compararFichas(p, e, comunes);
      if (coincidencias.length === 0) continue;

      const facturas = ordenarDocs(vivos(ix.docsDeTercero(p.id)).filter((d) => d.tipo === "factura_compra"));
      const total = suma(facturas.map((f) => f.montoTotal));
      const pagos = vivos(ix.docsDeTercero(p.id)).filter((d) => d.tipo === "pago");
      const cabecera = coincidencias[0];

      const evidencia: Evidencia[] = [
        evidenciaTercero(p, `${cabecera.etiqueta} ${cabecera.participio} en la ficha: ${cabecera.valor}`),
        evidenciaTercero(e, `${cabecera.laMisma}: ${cabecera.valor}`),
        ...facturas.map((f) =>
          evidenciaDocumento(ix, f, `facturada por el proveedor${f.usuarioRegistro ? ` · registró ${f.usuarioRegistro}` : ""}`),
        ),
      ];

      hallazgos.push({
        titulo: `El proveedor ${p.nombre} y ${e.nombre}, de nómina, tienen ${cabecera.participio} ${cabecera.laMisma}`,
        resumen: `${cabecera.etiqueta} ${cabecera.valor} figura a la vez en la ficha del proveedor ${p.nombre} (${p.id}) y en la del empleado ${e.nombre} (${e.id})${coincidencias.length > 1 ? `, y además comparten ${listar(coincidencias.slice(1).map((c) => c.laMisma))}` : ""}. En el período ese proveedor facturó ${numero(facturas.length)} veces por ${cop(total)}.`,
        montoEnRiesgo: total,
        montoExacto: true,
        documentos: facturas.map((f) => f.id),
        evidencia: recortar(evidencia),
        quePuedeEstarPasando: [
          "Puede ser un error de digitación al crear la ficha del proveedor: se copió la cuenta de la fila de al lado del maestro.",
          "Puede que el empleado sea de verdad proveedor de la empresa y que nadie haya declarado el conflicto de interés, que es legal si está documentado y aprobado.",
          "Puede ser un proveedor creado desde dentro para facturar bienes o servicios que no se prestan y cobrarlos a una cuenta propia.",
        ],
        queRevisar: [
          "Pedir la certificación bancaria del proveedor emitida por el banco y comparar el titular de la cuenta con el NIT.",
          `Sacar el certificado de cámara de comercio de ${p.nombre} y ver quién figura como representante legal y socio.`,
          `Revisar quién creó la ficha del proveedor${p.usuarioCreacion ? ` (aparece ${p.usuarioCreacion})` : ""} y quién registró sus ${numero(facturas.length)} facturas y sus ${numero(pagos.length)} pagos.`,
          "Comprobar si existe declaración de conflicto de interés firmada por el empleado.",
        ],
        controlSugerido:
          "Validar en el alta de proveedores que la cuenta bancaria no exista ya en el maestro de empleados, y exigir certificación bancaria a nombre del NIT antes del primer pago.",
        sujeto: sujetoTercero(p),
        repeticiones: facturas.length,
        evidenciaCompleta: true,
        grafo: grafoProveedorEmpleado(p, e, cabecera, facturas, total),
      });
    }
  }

  return conHallazgos(proveedores.length + empleados.length, ordenarPorMonto(hallazgos));
};

/** Los valores de teléfono y dirección que llevan tres o más fichas del maestro:
    son datos de la propia empresa repetidos, y no relacionan a nadie con nadie. */
function valoresRepetidos(terceros: Tercero[]): Set<string> {
  const cuenta = new Map<string, number>();
  const anotar = (v: string) => {
    if (!v) return;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  };
  for (const t of terceros) {
    anotar(`tel:${soloDigitos(t.telefono)}`);
    anotar(`dir:${plano(t.direccion)}`);
  }
  return new Set([...cuenta.entries()].filter(([, n]) => n > 2).map(([v]) => v));
}

function compararFichas(p: Tercero, e: Tercero, comunes: Set<string>): Coincidencia[] {
  const salida: Coincidencia[] = [];
  const cuentaP = soloDigitos(p.cuentaBancaria);
  const cuentaE = soloDigitos(e.cuentaBancaria);
  if (cuentaP.length >= 6 && cuentaP === cuentaE) {
    salida.push({
      campo: "cuenta",
      valor: p.cuentaBancaria,
      etiqueta: "La cuenta bancaria",
      corta: "Cuenta bancaria",
      laMisma: "la misma cuenta bancaria",
      participio: "registrada",
    });
  }
  const telP = soloDigitos(p.telefono);
  const telE = soloDigitos(e.telefono);
  if (telP.length >= 7 && telP === telE && !comunes.has(`tel:${telP}`)) {
    salida.push({
      campo: "telefono",
      valor: p.telefono,
      etiqueta: "El teléfono",
      corta: "Teléfono",
      laMisma: "el mismo teléfono",
      participio: "registrado",
    });
  }
  const dirP = plano(p.direccion);
  const dirE = plano(e.direccion);
  if (dirP.length >= 10 && dirP === dirE && !comunes.has(`dir:${dirP}`)) {
    salida.push({
      campo: "direccion",
      valor: p.direccion,
      etiqueta: "La dirección",
      corta: "Dirección",
      laMisma: "la misma dirección",
      participio: "registrada",
    });
  }
  return salida;
}

function grafoProveedorEmpleado(
  p: Tercero,
  e: Tercero,
  cabecera: Coincidencia,
  facturas: Documento[],
  total: number,
) {
  const porUsuario = agrupar(
    facturas.filter((f) => f.usuarioRegistro),
    (f) => f.usuarioRegistro ?? "",
  );
  const dominante = [...porUsuario.entries()].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))[0];

  const nodos: Grafo["nodos"] = [
    { id: p.id, etiqueta: p.nombre, clase: "proveedor" },
    { id: e.id, etiqueta: `${e.nombre} · nómina`, clase: "empleado" },
    { id: `cuenta:${cabecera.valor}`, etiqueta: `${cabecera.corta} ${cabecera.valor}`, clase: "banco" },
  ];
  const aristas: Grafo["aristas"] = [
    { de: p.id, a: `cuenta:${cabecera.valor}`, etiqueta: "cuenta registrada" },
    { de: e.id, a: `cuenta:${cabecera.valor}`, etiqueta: "la misma cuenta", alerta: true },
  ];

  if (dominante) {
    nodos.push({ id: `usuario:${dominante[0]}`, etiqueta: dominante[0], clase: "usuario" });
    aristas.push({
      de: `usuario:${dominante[0]}`,
      a: p.id,
      etiqueta: `registró ${numero(dominante[1].length)} de ${numero(facturas.length)} facturas · ${cop(total)}`,
      alerta: dominante[1].length === facturas.length,
    });
    if (p.usuarioCreacion === dominante[0]) {
      aristas.push({ de: `usuario:${dominante[0]}`, a: p.id, etiqueta: "y creó la ficha", alerta: true });
    }
  }
  return { nodos, aristas };
}

/* ═══════════════════  R09 · Proveedor exprés  ═══════════════════ */

const HORAS_EXPRES = 72;

/** Solo se habla de horas cuando la fecha de registro las trae. El maestro de
    terceros da la fecha del alta sin hora, así que la cuenta arranca a las 00:00
    de ese día: es la lectura más conservadora, la que da MÁS horas. */
function horasDesdeElAlta(alta: string, registro: string | null): number | null {
  if (!registro || registro.length < 16) return null;
  const t = Date.parse(registro.length === 16 ? `${registro}:00` : registro);
  const t0 = Date.parse(`${alta.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t) || Number.isNaN(t0)) return null;
  const horas = Math.round((t - t0) / 3_600_000);
  return horas > 0 ? horas : null;
}

const R09: Regla = ({ ix }): ResultadoCrudo => {
  const proveedores = ix.libro.terceros.filter((t) => t.tipo === "proveedor" && t.fechaCreacion);
  if (proveedores.length === 0) return limpia(0);

  const hallazgos: HallazgoCrudo[] = [];

  for (const p of proveedores) {
    const facturas = ordenarDocs(vivos(ix.docsDeTercero(p.id)).filter((d) => d.tipo === "factura_compra"));
    if (facturas.length === 0) continue;
    const primera = facturas[0];
    const distancia = dias(p.fechaCreacion, primera.fecha);
    if (distancia < 0 || distancia > Math.floor(HORAS_EXPRES / 24)) continue;

    // Con hora de registro se puede decir "26 horas"; sin ella solo "al día
    // siguiente". Nunca se inventa la precisión que el dato no tiene.
    const horas = horasDesdeElAlta(p.fechaCreacion, primera.fechaRegistro);
    const cuanto = horas !== null ? `${numero(horas)} horas` : separacionTexto(distancia);

    const total = suma(facturas.map((f) => f.montoTotal));
    const evidencia: Evidencia[] = [
      evidenciaTercero(p, `ficha creada el ${fechaLarga(p.fechaCreacion, true)}${p.usuarioCreacion ? ` por ${p.usuarioCreacion}` : ""}`),
      ...facturas.map((f, i) =>
        evidenciaDocumento(
          ix,
          f,
          i === 0
            ? `primera factura, ${horas !== null ? `${numero(horas)} h` : `${numero(distancia)} d`} después del alta`
            : `factura posterior${f.usuarioRegistro ? ` · registró ${f.usuarioRegistro}` : ""}`,
        ),
      ),
    ];

    hallazgos.push({
      titulo: `${p.nombre} se dio de alta como proveedor y facturó ${horas !== null ? `${numero(horas)} horas después` : separacionTexto(distancia)}`,
      resumen: `La ficha de ${p.nombre} (${p.id}) se creó el ${fechaLarga(p.fechaCreacion, true)}${p.usuarioCreacion ? ` por ${p.usuarioCreacion}` : ""} y su primera factura, ${primera.numero} por ${cop(primera.montoTotal)}, es del ${fechaLarga(primera.fecha, true)}: ${cuanto}. Desde entonces facturó ${numero(facturas.length)} veces por ${cop(total)}.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: facturas.map((f) => f.id),
      evidencia: recortar(evidencia),
      quePuedeEstarPasando: [
        "Puede ser una compra urgente a un proveedor nuevo, que se dio de alta el mismo día para poder pagarle.",
        "Puede ser un alta hecha después de los hechos: la factura ya existía y la ficha se creó para poder cargarla en el sistema.",
        "Puede ser un proveedor creado para una operación concreta y no para comprarle de verdad, que es como empieza casi siempre un proveedor de conveniencia.",
      ],
      queRevisar: [
        `Pedir la carpeta de alta de ${p.nombre}: RUT, cámara de comercio, certificación bancaria y las cotizaciones que compitieron.`,
        "Confirmar que la empresa existe: dirección real, teléfono que contesta y actividad económica que coincide con lo que factura.",
        `Preguntar a quien creó la ficha por qué se necesitaba ese proveedor y quién lo pidió.`,
      ],
      controlSugerido:
        "Separar quién da de alta a un proveedor de quién le registra facturas, y no permitir la primera factura hasta que un segundo responsable haya validado los documentos del alta.",
      sujeto: sujetoTercero(p),
      repeticiones: facturas.length,
      evidenciaCompleta: true,
    });
  }

  return conHallazgos(proveedores.length, ordenarPorMonto(hallazgos));
};

/* ═══════  R10 · Tercero sin identificación válida  ═══════ */

const R10: Regla = ({ ix }): ResultadoCrudo => {
  const terceros = ix.libro.terceros;
  if (terceros.length === 0) return limpia(0);

  const sinNit: Tercero[] = [];
  const dvMalo: { t: Tercero; esperado: number; trae: string }[] = [];

  for (const t of terceros) {
    const bruto = (t.nit ?? "").trim();
    if (bruto === "") {
      sinNit.push(t);
      continue;
    }
    const guion = bruto.lastIndexOf("-");
    // Sin guion es una cédula, y la cédula no lleva dígito de verificación:
    // validarla contra la fórmula del NIT daría tres cuartas partes de falsos.
    if (guion <= 0) continue;
    const base = soloDigitos(bruto.slice(0, guion));
    const trae = soloDigitos(bruto.slice(guion + 1));
    const esperado = digitoVerificacion(base);
    if (esperado === null || trae.length !== 1) continue;
    if (Number(trae) !== esperado) dvMalo.push({ t, esperado, trae });
  }

  const total = sinNit.length + dvMalo.length;
  if (total === 0) return limpia(terceros.length);

  const evidencia: Evidencia[] = [
    ...dvMalo.map((x) =>
      evidenciaTercero(x.t, `NIT ${x.t.nit}: el dígito de verificación tendría que ser ${x.esperado}, no ${x.trae}`),
    ),
    ...sinNit.map((t) => evidenciaTercero(t, "la ficha no trae NIT ni cédula")),
  ];

  const partes: string[] = [];
  if (dvMalo.length) partes.push(`${numero(dvMalo.length)} con un dígito de verificación que no cuadra`);
  if (sinNit.length) partes.push(`${numero(sinNit.length)} sin identificación`);

  return conHallazgos(terceros.length, [
    {
      titulo: `${cuantos(total, "tercero", "terceros")} no se ${plural(total, "puede", "pueden")} identificar ante la DIAN: ${partes.join(" y ")}`,
      resumen: `De ${numero(terceros.length)} terceros del maestro, ${partes.join(" y ")}. El dígito de verificación se calcula con la fórmula de la DIAN sobre el propio NIT, así que el error se ve sin consultar nada por fuera.`,
      montoEnRiesgo: 0,
      montoExacto: true,
      documentos: [],
      evidencia: recortar(evidencia),
      quePuedeEstarPasando: [
        "Casi siempre son errores de digitación al crear la ficha: un dígito cambiado de sitio.",
        "Pueden ser fichas creadas con datos provisionales para poder seguir trabajando, que nunca se corrigieron.",
        "Puede haber terceros que no se pueden verificar ante la DIAN y con los que, sin embargo, se está moviendo dinero.",
      ],
      queRevisar: [
        "Consultar el RUT de cada uno en la DIAN y corregir el maestro con el número correcto.",
        "Mirar cuánto movimiento tiene cada una de estas fichas: una sin movimiento es papeleo, una con pagos es otra cosa.",
        "Bloquear las fichas hasta que aporten el RUT, sobre todo las que ya han recibido pagos.",
      ],
      controlSugerido:
        "Validar el dígito de verificación en el momento del alta. Son diez líneas de código en el ERP y eliminan el 100 % de estos casos.",
      sujeto: null,
      repeticiones: total,
      evidenciaCompleta: true,
    },
  ]);
};

/* ═══════════════════  R11 · Compra fraccionada  ═══════════════════ */

/**
 * Dos cosas tienen que pasar a la vez para que esto sea fraccionamiento y no la
 * operación normal de compras.
 *
 * La primera es la ráfaga. Un proveedor de esta empresa recibe una orden cada
 * siete u ocho semanas; cuatro en quince días es treinta veces su ritmo, y es lo
 * único que distingue una compra partida de varias compras seguidas. Sin este
 * filtro la regla saca veinte hallazgos, y veinte hallazgos son cero hallazgos.
 *
 * La segunda es el umbral: dentro de esa ráfaga se señalan las órdenes que se
 * quedan por debajo de la firma y que juntas la superan. Si alguna de la ráfaga
 * sí pasó por aprobación, esa no se señala —fue aprobada— pero se cuenta en el
 * relato, porque forma parte de la misma compra.
 */
const VENTANA_FRACCION = 15;
const RAFAGA_MINIMA = 4;
const PARTES_MINIMAS = 3;
/** Y la ráfaga tiene que pesar dentro de lo que ese proveedor recibe: cuatro
    órdenes en quince días a quien recibe treinta y tres al año es una semana
    movida; seis en un día a quien recibe doce en año y medio es otra cosa. */
const PESO_MINIMO = 0.2;

const R11: Regla = ({ ix }): ResultadoCrudo => {
  const ordenes = vivos(ix.porTipo("orden_compra"));
  if (ordenes.length === 0) return limpia(0);
  const umbral = ix.politicas.umbralAprobacion;
  if (!umbral) return noEvaluable("las políticas no traen umbral de aprobación de compra");

  const hallazgos: HallazgoCrudo[] = [];

  for (const [terceroId, delTercero] of porClave(agrupar(ordenes, (d) => d.terceroId ?? ""))) {
    const ordenadas = ordenarDocs(delTercero);
    let rafaga: Documento[] = [];
    const cerrar = () => {
      if (rafaga.length >= RAFAGA_MINIMA && rafaga.length >= PESO_MINIMO * delTercero.length) {
        const bajoUmbral = rafaga.filter((d) => d.montoTotal < umbral);
        if (bajoUmbral.length >= PARTES_MINIMAS && suma(bajoUmbral.map((d) => d.montoTotal)) >= umbral) {
          hallazgos.push(fraccionada(ix, terceroId, bajoUmbral, rafaga, umbral));
        }
      }
      rafaga = [];
    };
    for (const oc of ordenadas) {
      if (rafaga.length && dias(rafaga[0].fecha, oc.fecha) > VENTANA_FRACCION) cerrar();
      rafaga.push(oc);
    }
    cerrar();
  }

  return conHallazgos(ordenes.length, ordenarPorMonto(hallazgos));
};

function fraccionada(
  ix: Indice,
  terceroId: string,
  grupo: Documento[],
  rafaga: Documento[],
  umbral: number,
): HallazgoCrudo {
  const total = suma(grupo.map((d) => d.montoTotal));
  const proveedor = ix.nombre(terceroId);
  const mismoDia = grupo[0].fecha === grupo[grupo.length - 1].fecha;
  const importes = [...new Set(grupo.map((d) => Math.round(d.montoTotal)))];
  const usuarios = [...new Set(grupo.map((d) => d.usuarioRegistro).filter((u): u is string => !!u))].sort();
  const aprobadas = rafaga.length - grupo.length;
  const totalRafaga = suma(rafaga.map((d) => d.montoTotal));
  const delPeriodo = vivos(ix.docsDeTercero(terceroId)).filter((d) => d.tipo === "orden_compra").length;

  return {
    titulo: `${cuantos(grupo.length, "orden", "órdenes")} ${mismoDia ? "del mismo día" : `en ${dias(rafaga[0].fecha, rafaga[rafaga.length - 1].fecha)} días`} a ${proveedor} suman ${cop(total)} y ninguna llegó a necesitar aprobación`,
    resumen: `${mismoDia ? `El ${fechaLarga(grupo[0].fecha, true)}` : `Entre el ${fechaLarga(rafaga[0].fecha, true)} y el ${fechaLarga(rafaga[rafaga.length - 1].fecha, true)}`} se emitieron ${numero(rafaga.length)} órdenes de compra a ${proveedor} —${numero(rafaga.length)} de las ${numero(delPeriodo)} que recibió en todo el período—, ${numero(grupo.length)} de ellas por debajo del umbral de aprobación de ${cop(umbral)}${importes.length === 1 ? `, todas de ${cop(importes[0])} (un ${pctL((importes[0] / umbral) * 100)} del umbral)` : ""}, que juntas suman ${cop(total)}${aprobadas > 0 ? `; las otras ${numero(aprobadas)} sí pasaron por aprobación y suman ${cop(totalRafaga - total)}` : ""}${usuarios.length === 1 ? `, y las registró ${usuarios[0]}` : ""}.`,
    montoEnRiesgo: total,
    montoExacto: true,
    documentos: grupo.map((d) => d.id),
    evidencia: recortar(
      rafaga.map((d) =>
        evidenciaDocumento(
          ix,
          d,
          `${pctL((d.montoTotal / umbral) * 100)} del umbral${d.montoTotal >= umbral ? ", sí necesitó firma" : ""}${d.usuarioRegistro ? ` · registró ${d.usuarioRegistro}` : ""}`,
        ),
      ),
    ),
    quePuedeEstarPasando: [
      "Puede que la compra se partiera por comodidad operativa: varias bodegas, varias entregas o varios centros de coste, sin ninguna intención de saltarse nada.",
      "Puede que se partiera para no esperar la firma de aprobación, que es lo que tarda, y sacar la mercancía a tiempo.",
      "Puede que se partiera para que la operación completa no llegara a la mesa de quien tenía que aprobarla.",
    ],
    queRevisar: [
      `Mirar si las ${numero(grupo.length)} órdenes tienen la misma fecha de entrega y el mismo destino: si es una sola compra, tenía que ir con aprobación.`,
      "Preguntar a quien las emitió por qué no se consolidaron en una sola orden.",
      `Pedir las cotizaciones que compitieron con ${proveedor} para una compra de ${cop(total)}.`,
    ],
    controlSugerido: `Evaluar el umbral de ${cop(umbral)} sobre el acumulado por proveedor en una ventana de 30 días, no sobre el documento suelto: es el cambio que hace inútil fraccionar.`,
    sujeto: terceroSujeto(ix, terceroId),
    repeticiones: grupo.length,
    evidenciaCompleta: true,
    serie: {
      clase: "barras",
      puntos: grupo.map((d) => ({ etiqueta: d.numero, valor: d.montoTotal, marcado: true })),
      unidad: "dinero",
    },
  };
}

/* ═════════  R12 · Nota crédito sobre cartera vieja  ═════════ */

const DIAS_CARTERA_VIEJA = 90;

const R12: Regla = ({ ix }): ResultadoCrudo => {
  const notas = vivos(ix.porTipo("nota_credito"));
  if (notas.length === 0) return limpia(0);

  const plazoPorDefecto = ix.politicas.diasCredito;
  const senaladas: { nc: Documento; fv: Documento; vencida: number }[] = [];

  for (const nc of ordenarDocs(notas)) {
    const ref = nc.facturaAfectadaId;
    const fv = ref ? (ix.documento.get(ref) ?? ix.porNumero.get(ref) ?? null) : null;
    if (!fv || fv.tipo !== "factura_venta") continue;
    const vencimiento = masDias(fv.fecha, fv.diasCredito ?? plazoPorDefecto);
    const vencida = dias(vencimiento, nc.fecha);
    if (vencida > DIAS_CARTERA_VIEJA) senaladas.push({ nc, fv, vencida });
  }
  if (senaladas.length === 0) return limpia(notas.length);

  const total = suma(senaladas.map((x) => Math.abs(x.nc.montoTotal)));
  const usuarios = [...new Set(senaladas.map((x) => x.nc.usuarioRegistro).filter((u): u is string => !!u))].sort();
  const mayor = senaladas.reduce((a, b) => (b.vencida > a.vencida ? b : a), senaladas[0]);
  const clientes = new Set(senaladas.map((x) => x.nc.terceroId ?? ""));

  const evidencia: Evidencia[] = [];
  for (const x of senaladas) {
    evidencia.push(
      evidenciaDocumento(
        ix,
        x.nc,
        `borra cartera vencida hace ${numero(x.vencida)} días${x.nc.usuarioRegistro ? ` · ${x.nc.usuarioRegistro}` : ""}`,
      ),
    );
    evidencia.push(evidenciaDocumento(ix, x.fv, `factura afectada, del ${fechaLarga(x.fv.fecha, true)}`));
  }

  return conHallazgos(notas.length, [
    {
      titulo: `${cuantos(senaladas.length, "nota crédito", "notas crédito")} por ${cop(total)} ${plural(senaladas.length, "borró", "borraron")} facturas vencidas hace más de ${DIAS_CARTERA_VIEJA} días`,
      resumen: `De ${numero(notas.length)} notas crédito del período, ${numero(senaladas.length)} anulan facturas de venta que ya estaban vencidas a más de ${DIAS_CARTERA_VIEJA} días —la mayor, ${numero(mayor.vencida)} días— por ${cop(total)} en total, sobre ${numero(clientes.size)} ${plural(clientes.size, "cliente", "clientes")}${usuarios.length === 1 ? `, y todas las registró ${usuarios[0]}` : ""}.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: senaladas.map((x) => x.nc.id),
      evidencia: recortar(evidencia),
      quePuedeEstarPasando: [
        "Pueden ser acuerdos comerciales con clientes —una devolución, un descuento pactado tarde— que no se documentaron cuando tocaba.",
        "Puede ser cartera incobrable que se está limpiando por nota crédito en vez de castigarse con la aprobación que exige un castigo.",
        "Puede ser que esas facturas se cobraran y el dinero no entrara a la empresa, y que la nota crédito cierre el hueco en la cartera.",
      ],
      queRevisar: [
        "Pedir el soporte comercial de cada nota crédito: quién la autorizó, por qué motivo y con qué documento del cliente.",
        "Llamar a dos de esos clientes y confirmar que la devolución o el descuento existió de verdad.",
        "Cruzar la fecha de cada nota crédito con los recibos de caja de ese cliente en los días anteriores.",
      ],
      controlSugerido: `Exigir aprobación de un segundo responsable para toda nota crédito sobre factura vencida a más de 60 días, con motivo obligatorio de una lista cerrada.`,
      sujeto: usuarios.length === 1 ? sujetoUsuario(usuarios[0]) : null,
      repeticiones: senaladas.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ═════════  R13 · Concentración de anulaciones  ═════════ */

const CONCENTRACION = 40;

const R13: Regla = ({ ix }): ResultadoCrudo => {
  const universo = ix.libro.documentos.filter(
    (d) => (d.tipo === "nota_credito" || d.estado === "anulado") && d.usuarioRegistro,
  );
  if (universo.length < 5) return limpia(universo.length);

  const porUsuario = agrupar(universo, (d) => d.usuarioRegistro ?? "");
  const hallazgos: HallazgoCrudo[] = [];

  const totalNotas = universo.filter((d) => d.tipo === "nota_credito").length;
  const totalAnulados = universo.length - totalNotas;

  for (const [usuario, docs] of porClave(porUsuario)) {
    const pct = (docs.length / universo.length) * 100;
    if (pct <= CONCENTRACION) continue;

    const ordenados = ordenarDocs(docs);
    const total = suma(ordenados.map((d) => Math.abs(d.montoTotal)));
    const notas = ordenados.filter((d) => d.tipo === "nota_credito");
    const anulados = ordenados.filter((d) => d.tipo !== "nota_credito");
    // El titular lleva la cifra de la familia donde de verdad se concentra. Decir
    // "el 54 % de las notas crédito y anulaciones" cuando lo que ha hecho es el
    // 62 % de las notas crédito y ninguna anulación es una frase más floja y,
    // sobre todo, más difícil de defender delante de quien tiene los datos.
    const dominaNotas = notas.length >= anulados.length;
    const pctFamilia = dominaNotas
      ? (notas.length / Math.max(1, totalNotas)) * 100
      : (anulados.length / Math.max(1, totalAnulados)) * 100;
    const familia = dominaNotas ? "las notas crédito" : "las anulaciones";
    const nFamilia = dominaNotas ? notas.length : anulados.length;
    const nTotalFamilia = dominaNotas ? totalNotas : totalAnulados;

    hallazgos.push({
      titulo: `El usuario ${usuario} hizo ${pctL(pctFamilia)} de ${familia} del período: ${numero(nFamilia)} de ${numero(nTotalFamilia)}, por ${cop(total)}`,
      resumen: `De ${numero(nTotalFamilia)} ${familia === "las notas crédito" ? "notas crédito" : "anulaciones"} del período, ${numero(nFamilia)} las registró ${usuario} (${pctL(pctFamilia)}), por ${cop(total)}. Contando juntas notas crédito y anulaciones son ${numero(docs.length)} de ${numero(universo.length)} documentos, un ${pctL(pct)} del total, frente al ${pctL(100 / Math.max(1, porUsuario.size))} que le tocaría si el trabajo estuviera repartido entre los ${numero(porUsuario.size)} usuarios que hacen este tipo de documento.`,
      montoEnRiesgo: total,
      montoExacto: true,
      documentos: ordenados.map((d) => d.id),
      evidencia: recortar(
        ordenados.map((d) =>
          evidenciaDocumento(ix, d, `${d.tipo === "nota_credito" ? "nota crédito" : "anulado"} · ${usuario}`),
        ),
      ),
      quePuedeEstarPasando: [
        `Puede que ${usuario} sea el responsable de cartera y le corresponda por función hacer todas: en un equipo pequeño es lo normal.`,
        "Puede que no haya separación de funciones y la misma persona factura, cobra y anula, que es el punto donde un error no lo ve nadie.",
        "Puede que la concentración esté ocultando anulaciones que no responden a una devolución real.",
      ],
      queRevisar: [
        `Revisar con su soporte una de cada tres de las ${numero(docs.length)}: quién la autorizó, con qué motivo y qué documento del cliente la respalda.`,
        `Comprobar si ${usuario} puede además registrar recibos de caja de los mismos clientes.`,
        "Comparar con lo que hacen los demás usuarios: si el reparto del resto es parejo, la concentración no viene del volumen de trabajo.",
      ],
      controlSugerido:
        "Que quien registra el cobro no pueda anular ni emitir notas crédito sobre las mismas facturas, y que toda anulación quede con motivo y aprobador en el log.",
      sujeto: sujetoUsuario(usuario),
      repeticiones: docs.length,
      evidenciaCompleta: true,
      serie: {
        clase: "barras",
        puntos: porClave(porUsuario).map(([u, ds]) => ({
          etiqueta: u,
          valor: ds.length,
          marcado: u === usuario,
        })),
        unidad: "conteo",
      },
    });
  }

  return conHallazgos(universo.length, ordenarPorMonto(hallazgos));
};

/* ═══════════════════  R14 · Pago sin soporte  ═══════════════════ */

const R14: Regla = ({ ix }): ResultadoCrudo => {
  const debitos = ix.libro.banco.filter((b) => b.tipo === "debito");
  if (debitos.length === 0) return noEvaluable("el extracto bancario no trae movimientos de salida");

  const minimo = ix.politicas.minimoSoportePago;
  const senalados = debitos
    .filter((b) => {
      if (b.monto < minimo) return false;
      const ref = b.documentoConciliadoId;
      if (!ref) return true;
      // Conciliado contra un documento que no existe en el libro: el soporte no
      // está, aunque la casilla del extracto no esté vacía.
      return !(ix.documento.get(ref) ?? ix.porNumero.get(ref));
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1));
  if (senalados.length === 0) return limpia(debitos.length);

  const total = suma(senalados.map((b) => b.monto));
  const porBeneficiario = agrupar(senalados, (b) => claveBeneficiario(ix, b));
  const repetidos = porClave(porBeneficiario).filter(([, ms]) => ms.length >= 2);
  const masRepetido = repetidos.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0];

  const detalleRepetido = masRepetido
    ? ` ${numero(masRepetido[1].length)} de ellos van al mismo beneficiario, «${nombreBeneficiario(ix, masRepetido[1][0])}», por ${cop(suma(masRepetido[1].map((m) => m.monto)))}.`
    : "";

  return conHallazgos(debitos.length, [
    {
      titulo: `${cuantos(senalados.length, "salida de dinero", "salidas de dinero")} por ${cop(total)} no ${plural(senalados.length, "tiene", "tienen")} ningún documento que ${plural(senalados.length, "la", "las")} respalde`,
      resumen: `${mayuscula(rango(senalados[0].fecha, senalados[senalados.length - 1].fecha))} salieron del banco ${numero(senalados.length)} débitos por encima de ${cop(minimo)} —el mínimo que la propia empresa exige soportar— sin documento conciliado, por ${cop(total)} en total.${detalleRepetido}`,
      montoEnRiesgo: total,
      montoExacto: true,
      // No hay documento que señalar —ese es justo el hallazgo—, así que se señala
      // la línea del extracto, que sí tiene identificador y valor propio.
      documentos: senalados.map((b) => b.id),
      evidencia: recortar(
        senalados.map((b) => evidenciaBanco(ix, b, "sin documento conciliado en el extracto")),
      ),
      quePuedeEstarPasando: [
        "Puede que sean pagos reales cuyo documento no se cargó al ERP, o que la conciliación de esos meses esté sin terminar.",
        "Pueden ser gastos que se pagan por costumbre —servicios, arriendos, honorarios— y que nadie ha vuelto a mirar desde hace años.",
        "Pueden ser salidas de dinero que no corresponden a ninguna obligación de la empresa, que es lo que permite justamente no tener soporte.",
      ],
      queRevisar: [
        masRepetido
          ? `Empezar por «${nombreBeneficiario(ix, masRepetido[1][0])}»: pedir el contrato, la factura y qué se recibió a cambio de esos ${cop(suma(masRepetido[1].map((m) => m.monto)))}.`
          : "Empezar por los tres débitos de mayor monto y pedir el soporte de cada uno.",
        "Pedir al banco el detalle del beneficiario de cada transferencia: nombre y cuenta de destino.",
        "Comprobar quién autorizó cada salida en la banca electrónica y con qué firma.",
      ],
      controlSugerido: `Conciliar el extracto todos los meses y exigir documento para todo pago por encima de ${cop(minimo)}, con bloqueo de la banca electrónica cuando no exista.`,
      sujeto: null,
      repeticiones: senalados.length,
      evidenciaCompleta: true,
      serie: {
        clase: "barras",
        puntos: porClave(porBeneficiario)
          .map(([, ms]) => ({
            etiqueta: nombreBeneficiario(ix, ms[0]),
            valor: suma(ms.map((m) => m.monto)),
            marcado: ms.length >= 2,
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10),
        unidad: "dinero",
      },
    },
  ]);
};

/** El extracto escribe "TRANSF SERVICIOS INTEGRALES JR 4471". Para agrupar hay
    que quitarle el verbo y los números; el nombre del maestro, si se pudo
    inferir, siempre gana. */
const RUIDO_BANCO = /^(transf(erencia)?|pago|abono|retiro|cheque|nota debito|pse|ach|interbancaria|db|deb)\s+/;

/** Para agrupar: sin el verbo del banco, sin los números de referencia y sin
    tildes, que es lo que hace que tres transferencias al mismo destinatario se
    reconozcan como tres y no como una cada una. */
function claveBeneficiario(ix: Indice, mov: MovimientoBanco): string {
  if (mov.terceroIdInferido) return `t:${mov.terceroIdInferido}`;
  let texto = plano(mov.descripcion).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  let previo = "";
  while (texto !== previo) {
    previo = texto;
    texto = texto.replace(RUIDO_BANCO, "");
  }
  return `d:${texto || plano(mov.descripcion)}`;
}

/** Para enseñar: el nombre del maestro si se pudo inferir y, si no, el texto del
    extracto tal cual lo escribió el banco. Recortarlo o rehacerlo en minúsculas
    quedaría más bonito y sería menos defendible: en pantalla tiene que salir la
    misma cadena que hay en la celda. */
function nombreBeneficiario(ix: Indice, mov: MovimientoBanco): string {
  if (mov.terceroIdInferido) return ix.nombre(mov.terceroIdInferido);
  return mov.descripcion.trim() || "beneficiario sin identificar en el extracto";
}

/* ═══════════════════════════  el catálogo  ═══════════════════════════ */

export const CAPA1: Record<string, Regla> = {
  R01,
  R02,
  R03,
  R04,
  R05,
  R06,
  R07,
  R08,
  R09,
  R10,
  R11,
  R12,
  R13,
  R14,
};
