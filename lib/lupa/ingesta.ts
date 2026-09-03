/* ───────────────────────────────  INGESTA  ───────────────────────────────
   Lo que ocurre cuando alguien suelta seis Excel encima de la pantalla.

   Corre EN EL NAVEGADOR: entra un ArrayBuffer y sale un `Libro`. Aquí no hay
   `fs`, no hay red y no hay nada que subir a ningún sitio — que es, de paso,
   la respuesta a la primera pregunta que hace cualquier cliente.

   Dos cosas mandan sobre el resto:

   1. LA TRAZA. Cada registro se lleva su `origen` con la fila REAL del Excel
      (la 1 son los encabezados, el primer dato es la 2). Sin eso, un hallazgo
      es una afirmación; con eso, es un sitio al que ir a mirar. Todo lo demás
      del fichero está subordinado a no perder ese número.

   2. NO INVENTAR. Si un dato no se entiende, no se rellena a ojo: se anota una
      incidencia con archivo, hoja y fila. Las incidencias NO son hallazgos —
      los hallazgos los produce el motor sobre datos ya limpios—; son el parte
      de lo que venía mal en la exportación.

   El orden de lectura se fuerza por nombre de fichero porque un navegador
   entrega los ficheros soltados en el orden que le da la gana, y hay un dato
   —la numeración del extracto— que depende del orden. Sin esto, dos tomas del
   vídeo darían identificadores distintos.
   ------------------------------------------------------------------------ */

import * as XLSX from "xlsx";
import {
  normalizarEncabezado as normalizar,
  proponerMapeo,
  proponerPolitica,
  TABLAS,
  type ClavePolitica,
  type MapeoHoja,
  type TablaCanonica,
} from "./mapeo";
import type {
  ArchivoCargado,
  CambioTercero,
  Documento,
  EstadoDocumento,
  Item,
  LineaDocumento,
  Libro,
  MovimientoBanco,
  MovimientoInventario,
  Origen,
  Politicas,
  Tercero,
  TipoDocumento,
  TipoMovimiento,
  TipoTercero,
} from "./tipos";

export type ArchivoEntrada = { nombre: string; bytes: ArrayBuffer };

export type Incidencia = {
  gravedad: "aviso" | "error";
  archivo: string;
  hoja: string;
  fila: number | null;
  texto: string;
};

export type Lectura = { libro: Libro; mapeos: MapeoHoja[]; incidencias: Incidencia[] };

/* El export del ERP son listados de tablas: no trae cabecera con la empresa.
   El nombre y el NIT vienen de la ficha del cliente, no del Excel, y por eso
   son constantes y no un dato leído. */
const EMPRESA = "Distribuidora Andina S.A.S.";
const NIT_EMPRESA = "900.482.157-3";

/** La ventana que el cliente dice haber exportado. Solo se usa para avisar. */
const PERIODO_DECLARADO = { desde: "2025-03-01", hasta: "2026-08-31" };

/** Un peso de tolerancia al cuadrar un documento con sus líneas: es redondeo. */
const TOLERANCIA_CUADRE = 1;

/* ─────────────────────────  Conversión de celdas  ─────────────────────────
   SheetJS devuelve `any` en el borde y aquí se acaba: de estas funciones para
   dentro todo tiene tipo. */

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  return s === "" ? null : s;
}

/**
 * «1.234.567» son un millón doscientos mil, no 1,23. Un ERP colombiano exporta
 * el punto como separador de miles y la coma como decimal, pero medio mundo
 * hace lo contrario, así que se decide por la forma del número y no por una
 * suposición de configuración regional.
 */
function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = aTexto(v);
  if (s === null) return null;
  const limpio = s.replace(/[$\s]/g, "");
  if (limpio === "" || limpio === "-") return null;

  let normal = limpio;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) normal = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(limpio)) normal = limpio.replace(/,/g, "");
  else normal = limpio.replace(",", ".");

  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** El día 0 de Excel es el 30/12/1899 por el bisiesto de 1900 que nunca existió. */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function deFecha(d: Date, conHora: boolean): string {
  const dia = `${d.getUTCFullYear()}-${dosCifras(d.getUTCMonth() + 1)}-${dosCifras(d.getUTCDate())}`;
  return conHora ? `${dia}T${dosCifras(d.getUTCHours())}:${dosCifras(d.getUTCMinutes())}` : dia;
}

/**
 * «14/03/2026» y «14/03/2026 23:41» → ISO. Es lo que exporta el ERP: texto, no
 * fechas de Excel. Se aceptan igual las de verdad y los seriales por si el
 * cliente reguarda el fichero desde Excel antes de mandarlo.
 */
function aFecha(v: unknown): string | null {
  if (v instanceof Date) return deFecha(v, v.getUTCHours() !== 0 || v.getUTCMinutes() !== 0);
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null;
    const ms = EPOCA_EXCEL + Math.round(v * 86400000);
    const fraccion = v - Math.floor(v);
    return deFecha(new Date(ms), fraccion > 0);
  }
  const s = aTexto(v);
  if (s === null) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  if (iso) return armarFecha(iso[1], iso[2], iso[3], iso[4], iso[5]);
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  if (dmy) return armarFecha(dmy[3], dmy[2], dmy[1], dmy[4], dmy[5]);
  return null;
}

function armarFecha(a: string, m: string, d: string, h?: string, min?: string): string | null {
  const mes = Number(m);
  const dia = Number(d);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const base = `${a}-${dosCifras(mes)}-${dosCifras(dia)}`;
  if (h === undefined || min === undefined) return base;
  return `${base}T${dosCifras(Number(h))}:${dosCifras(Number(min))}`;
}

/** «07:00», «7» o el 0,29166 de una hora de Excel. Todo acaba en 7. */
function aHora(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v <= 1 ? v * 24 : v) : null;
  const s = aTexto(v);
  if (s === null) return null;
  const partes = s.split(":");
  const n = Number(partes[0]);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* ─────────────────────  Vocabulario del ERP → canónico  ───────────────────
   Las claves están normalizadas, así que «FC», «fc» y «F.C.» entran por la
   misma puerta. */

const TIPO_DOCUMENTO: Record<string, TipoDocumento> = {
  oc: "orden_compra",
  "orden compra": "orden_compra",
  "orden de compra": "orden_compra",
  fc: "factura_compra",
  "factura compra": "factura_compra",
  "factura de compra": "factura_compra",
  ent: "entrada_inventario",
  entrada: "entrada_inventario",
  "entrada inventario": "entrada_inventario",
  fv: "factura_venta",
  "factura venta": "factura_venta",
  "factura de venta": "factura_venta",
  nc: "nota_credito",
  "nota credito": "nota_credito",
  nd: "nota_debito",
  "nota debito": "nota_debito",
  pago: "pago",
  pg: "pago",
  "pago proveedor": "pago",
  rc: "recibo_caja",
  "recibo caja": "recibo_caja",
  "recibo de caja": "recibo_caja",
};

const TIPO_TERCERO: Record<string, TipoTercero> = {
  proveedor: "proveedor",
  proveedores: "proveedor",
  cliente: "cliente",
  clientes: "cliente",
  empleado: "empleado",
  empleados: "empleado",
  nomina: "empleado",
};

const TIPO_MOVIMIENTO: Record<string, TipoMovimiento> = {
  entrada: "entrada",
  ent: "entrada",
  salida: "salida",
  sal: "salida",
  ajuste: "ajuste",
  aju: "ajuste",
  traslado: "traslado",
  tras: "traslado",
};

const ESTADO: Record<string, EstadoDocumento> = {
  vigente: "vigente",
  activo: "vigente",
  abierto: "vigente",
  pagado: "pagado",
  pagada: "pagado",
  cancelado: "pagado",
  pendiente: "pendiente",
  "por pagar": "pendiente",
  anulado: "anulado",
  anulada: "anulado",
};

const CAMPO_CAMBIO: Record<string, CambioTercero["campo"]> = {
  "cuenta bancaria": "cuenta_bancaria",
  cuenta: "cuenta_bancaria",
  "cta bancaria": "cuenta_bancaria",
  telefono: "telefono",
  tel: "telefono",
  direccion: "direccion",
  dir: "direccion",
  nombre: "nombre",
  "razon social": "nombre",
};

const SI_NO: Record<string, boolean> = {
  si: true,
  s: true,
  true: true,
  x: true,
  "1": true,
  no: false,
  n: false,
  false: false,
  "0": false,
};

/* ─────────────────────────  El parte de incidencias  ───────────────────── */

/** Si el ERP exporta mal una columna entera salen miles de líneas iguales; la
    pantalla no aguanta eso y el que mira tampoco. Se listan las 25 primeras de
    cada clase y al final se dice cuántas quedaron fuera. */
const TOPE_POR_CLASE = 25;

function abrirParte() {
  const lista: Incidencia[] = [];
  const cuenta = new Map<string, number>();

  const anotar = (
    clase: string,
    gravedad: Incidencia["gravedad"],
    archivo: string,
    hoja: string,
    fila: number | null,
    texto: string,
  ) => {
    const n = (cuenta.get(clase) ?? 0) + 1;
    cuenta.set(clase, n);
    if (n <= TOPE_POR_CLASE) lista.push({ gravedad, archivo, hoja, fila, texto });
  };

  const cerrar = () => {
    for (const [clase, n] of cuenta) {
      if (n <= TOPE_POR_CLASE) continue;
      lista.push({
        gravedad: "aviso",
        archivo: "(resumen)",
        hoja: "(resumen)",
        fila: null,
        texto: `«${clase}»: ${n - TOPE_POR_CLASE} casos más que no se listan uno a uno`,
      });
    }
    return lista;
  };

  return { anotar, cerrar };
}

type Parte = ReturnType<typeof abrirParte>;

/* ─────────────────────────  Acceso a una fila  ───────────────────────── */

function bruto(m: MapeoHoja, fila: unknown[], campo: string): unknown {
  const i = m.indicePorCampo[campo];
  if (i === undefined) return null;
  const v = fila[i];
  return v === undefined ? null : v;
}

const txt = (m: MapeoHoja, f: unknown[], campo: string) => aTexto(bruto(m, f, campo));
const num = (m: MapeoHoja, f: unknown[], campo: string) => aNumero(bruto(m, f, campo));
const fch = (m: MapeoHoja, f: unknown[], campo: string) => aFecha(bruto(m, f, campo));

const vacia = (fila: unknown[]) => fila.every((c) => c === null || c === undefined || c === "");

/* ─────────────────────  Identificadores que el Excel no trae  ───────────── */

/** «FC-2026-0331» → «FC». La serie sale del prefijo del propio número porque es
    lo que R06 recorre buscando huecos, y un hueco solo existe dentro de una
    serie: los consecutivos de facturación no se reinician con el año. */
function serieDe(numero: string): string {
  const corte = numero.indexOf("-");
  return corte > 0 ? numero.slice(0, corte) : numero;
}

/** El extracto no numera sus movimientos: el banco los ordena por saldo. Se
    numeran en orden de fichero para que la evidencia tenga a qué apuntar. */
const idBanco = (n: number) => `BAN-${String(n).padStart(4, "0")}`;

/* ────────────────────────────────  Lectura  ──────────────────────────── */

export function leerLibro(archivos: ArchivoEntrada[]): Lectura {
  const parte = abrirParte();
  const mapeos: MapeoHoja[] = [];
  const cargados: ArchivoCargado[] = [];

  const terceros: Tercero[] = [];
  const cambiosTercero: CambioTercero[] = [];
  const documentos: Documento[] = [];
  const lineas: LineaDocumento[] = [];
  const inventario: MovimientoInventario[] = [];
  const banco: MovimientoBanco[] = [];
  const items: Item[] = [];

  const recogidas = new Map<ClavePolitica, number>();
  let origenPoliticas: Origen | null = null;

  const ordenados = [...archivos].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));

  for (const archivo of ordenados) {
    let libroXlsx: XLSX.WorkBook;
    try {
      libroXlsx = XLSX.read(new Uint8Array(archivo.bytes), { type: "array" });
    } catch {
      parte.anotar("fichero ilegible", "error", archivo.nombre, "", null, "no se pudo abrir como libro de Excel");
      continue;
    }

    const aporta = new Set<TablaCanonica>();
    let filasArchivo = 0;

    for (const nombreHoja of libroXlsx.SheetNames) {
      const hoja = libroXlsx.Sheets[nombreHoja];
      const referencia = hoja?.["!ref"];
      if (!hoja || !referencia) {
        parte.anotar("hoja vacía", "aviso", archivo.nombre, nombreHoja, null, "la hoja no tiene ninguna celda");
        continue;
      }

      const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
        header: 1,
        raw: true,
        blankrows: true,
        defval: null,
      });
      if (matriz.length === 0) {
        parte.anotar("hoja vacía", "aviso", archivo.nombre, nombreHoja, null, "la hoja no tiene ninguna fila");
        continue;
      }

      // La fila de Excel se calcula desde el rango real, no desde el índice del
      // array: si la exportación empieza en la fila 3, la traza tiene que decir 3.
      const primeraFila = XLSX.utils.decode_range(referencia).s.r + 1;
      const encabezados = (matriz[0] ?? []).map((c) => aTexto(c) ?? "");
      const mapeo = proponerMapeo(archivo.nombre, nombreHoja, encabezados);
      mapeos.push(mapeo);

      if (mapeo.tabla === null) {
        parte.anotar(
          "hoja no reconocida",
          "aviso",
          archivo.nombre,
          nombreHoja,
          primeraFila,
          `sus columnas no se parecen a ninguna tabla conocida: ${encabezados.join(" · ")}`,
        );
        continue;
      }
      if (mapeo.faltan.length > 0) {
        parte.anotar(
          "columnas obligatorias ausentes",
          "error",
          archivo.nombre,
          nombreHoja,
          primeraFila,
          `falta ${mapeo.faltan.join(", ")}: la hoja no se puede cargar`,
        );
        continue;
      }

      aporta.add(mapeo.tabla);
      const en = (fila: number): Origen => ({ archivo: archivo.nombre, hoja: nombreHoja, fila });

      for (let i = 1; i < matriz.length; i += 1) {
        const fila = matriz[i] ?? [];
        if (vacia(fila)) continue;
        const nFila = primeraFila + i;
        filasArchivo += 1;

        switch (mapeo.tabla) {
          case "terceros":
            leerTercero(mapeo, fila, en(nFila), parte, terceros);
            break;
          case "cambiosTercero":
            leerCambio(mapeo, fila, en(nFila), parte, cambiosTercero);
            break;
          case "documentos":
            leerDocumento(mapeo, fila, en(nFila), parte, documentos);
            break;
          case "lineas":
            leerLinea(mapeo, fila, en(nFila), parte, lineas);
            break;
          case "inventario":
            leerMovimiento(mapeo, fila, en(nFila), parte, inventario);
            break;
          case "items":
            leerItem(mapeo, fila, en(nFila), parte, items);
            break;
          case "banco":
            leerBanco(mapeo, fila, en(nFila), parte, banco);
            break;
          case "politicas":
            if (origenPoliticas === null) origenPoliticas = en(nFila);
            leerPolitica(mapeo, fila, en(nFila), parte, recogidas);
            break;
        }
      }
    }

    cargados.push({
      nombre: archivo.nombre,
      hojas: [...libroXlsx.SheetNames],
      filas: filasArchivo,
      bytes: archivo.bytes.byteLength,
      aporta: TABLAS.filter((t) => aporta.has(t)),
    });
  }

  const politicas = armarPoliticas(recogidas, origenPoliticas, parte);

  /* ─── Integridad. Nada de esto es un hallazgo: es el estado del fichero. ─── */

  const terceroPorId = unicos(terceros, (t) => t.id, "código de tercero repetido", parte);
  const documentoPorId = unicos(documentos, (d) => d.id, "número de documento repetido", parte);
  const itemPorSku = unicos(items, (i) => i.sku, "código de producto repetido", parte);
  unicos(inventario, (m) => m.id, "consecutivo de inventario repetido", parte);

  const vivos = {
    terceros: terceros.filter((t) => terceroPorId.get(t.id) === t),
    documentos: documentos.filter((d) => documentoPorId.get(d.id) === d),
    items: items.filter((i) => itemPorSku.get(i.sku) === i),
  };

  colocarReferencias(vivos.documentos, documentoPorId);
  cuadrarDocumentos(vivos.documentos, lineas, parte);
  revisarFechas(vivos.documentos, inventario, banco, cambiosTercero, parte);
  revisarReferencias(vivos, lineas, inventario, banco, cambiosTercero, terceroPorId, documentoPorId, itemPorSku, parte);
  inferirTerceroDelBanco(banco, vivos.terceros, documentoPorId);

  const libro: Libro = {
    empresa: EMPRESA,
    nit: NIT_EMPRESA,
    periodo: deducirPeriodo(vivos.documentos),
    terceros: vivos.terceros,
    cambiosTercero,
    documentos: vivos.documentos,
    lineas,
    inventario,
    banco,
    items: vivos.items,
    politicas,
    archivos: cargados,
  };

  return { libro, mapeos, incidencias: parte.cerrar() };
}

/* ──────────────────────────  Una fila de cada tabla  ─────────────────────── */

function leerTercero(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: Tercero[]) {
  const id = txt(m, f, "id");
  if (!id) {
    parte.anotar("fila sin identificador", "error", origen.archivo, origen.hoja, origen.fila, "tercero sin código");
    return;
  }
  const tipoBruto = txt(m, f, "tipo");
  const tipo = TIPO_TERCERO[normalizar(tipoBruto ?? "")];
  if (!tipo) {
    parte.anotar(
      "tipo de tercero desconocido",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${tipoBruto ?? "vacío"}» no es proveedor, cliente ni empleado; se trata como proveedor`,
    );
  }
  const fechaCreacion = fch(m, f, "fechaCreacion");
  if (!fechaCreacion) {
    parte.anotar(
      "fecha ilegible",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      "la fecha de creación del tercero no se entiende",
    );
  }

  salida.push({
    id,
    tipo: tipo ?? "proveedor",
    nombre: txt(m, f, "nombre") ?? id,
    nit: txt(m, f, "nit") ?? "",
    telefono: txt(m, f, "telefono") ?? "",
    direccion: txt(m, f, "direccion") ?? "",
    cuentaBancaria: txt(m, f, "cuentaBancaria") ?? "",
    banco: txt(m, f, "banco") ?? "",
    fechaCreacion: (fechaCreacion ?? "").slice(0, 10),
    usuarioCreacion: txt(m, f, "usuarioCreacion"),
    origen,
  });
}

function leerCambio(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: CambioTercero[]) {
  const terceroId = txt(m, f, "terceroId");
  if (!terceroId) {
    parte.anotar("fila sin identificador", "error", origen.archivo, origen.hoja, origen.fila, "cambio sin tercero");
    return;
  }
  const campoBruto = txt(m, f, "campo");
  const campo = CAMPO_CAMBIO[normalizar(campoBruto ?? "")];
  if (!campo) {
    parte.anotar(
      "campo modificado desconocido",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${campoBruto ?? "vacío"}» no es un campo del maestro; el cambio se descarta`,
    );
    return;
  }
  const fecha = fch(m, f, "fecha");
  if (!fecha) {
    parte.anotar(
      "fecha ilegible",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      "el cambio no trae fecha entendible; se descarta",
    );
    return;
  }

  salida.push({
    terceroId,
    campo,
    valorAnterior: txt(m, f, "valorAnterior") ?? "",
    valorNuevo: txt(m, f, "valorNuevo") ?? "",
    fecha: fecha.slice(0, 10),
    usuario: txt(m, f, "usuario"),
    origen,
  });
}

function leerDocumento(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: Documento[]) {
  const numero = txt(m, f, "numero");
  if (!numero) {
    parte.anotar("fila sin identificador", "error", origen.archivo, origen.hoja, origen.fila, "documento sin número");
    return;
  }
  const tipoBruto = txt(m, f, "tipo");
  const tipo = TIPO_DOCUMENTO[normalizar(tipoBruto ?? "")];
  if (!tipo) {
    parte.anotar(
      "tipo de documento desconocido",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${tipoBruto ?? "vacío"}» no es un tipo conocido; ${numero} se descarta`,
    );
    return;
  }
  const fecha = fch(m, f, "fecha");
  if (!fecha) {
    parte.anotar(
      "fecha ilegible",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `${numero} no trae fecha entendible; se descarta`,
    );
    return;
  }
  const montoTotal = num(m, f, "montoTotal");
  if (montoTotal === null) {
    parte.anotar(
      "documento sin importe",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `${numero} no trae valor total; se carga en cero`,
    );
  }

  const estadoBruto = txt(m, f, "estado");
  const estado = estadoBruto === null ? "vigente" : ESTADO[normalizar(estadoBruto)];
  if (estadoBruto !== null && !estado) {
    parte.anotar(
      "estado desconocido",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${estadoBruto}» no es un estado conocido; ${numero} se trata como vigente`,
    );
  }

  const consecutivo = num(m, f, "consecutivo");
  const diasCredito = num(m, f, "diasCredito");

  salida.push({
    id: numero,
    tipo,
    numero,
    consecutivo: consecutivo === null ? null : Math.round(consecutivo),
    serie: serieDe(numero),
    terceroId: txt(m, f, "terceroId"),
    fecha: fecha.slice(0, 10),
    fechaRegistro: fch(m, f, "fechaRegistro"),
    usuarioRegistro: txt(m, f, "usuarioRegistro"),
    montoTotal: montoTotal ?? 0,
    estado: estado ?? "vigente",
    ordenCompraId: txt(m, f, "ordenCompraId"),
    entradaInventarioId: txt(m, f, "entradaInventarioId"),
    facturaAfectadaId: txt(m, f, "facturaAfectadaId"),
    diasCredito: diasCredito === null ? null : Math.round(diasCredito),
    origen,
  });
}

function leerLinea(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: LineaDocumento[]) {
  const documentoId = txt(m, f, "documentoId");
  const sku = txt(m, f, "sku");
  if (!documentoId || !sku) {
    parte.anotar(
      "fila sin identificador",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `línea sin ${!documentoId ? "documento" : "producto"}`,
    );
    return;
  }

  const cantidad = num(m, f, "cantidad");
  const precioUnitario = num(m, f, "precioUnitario");
  const costoUnitario = num(m, f, "costoUnitario");
  const descuentoPct = num(m, f, "descuentoPct");
  const total = num(m, f, "total");

  salida.push({
    documentoId,
    sku,
    descripcion: txt(m, f, "descripcion") ?? "",
    cantidad: cantidad ?? 0,
    precioUnitario: precioUnitario ?? 0,
    costoUnitario,
    descuentoPct: descuentoPct ?? 0,
    total: total ?? 0,
    origen,
  });
}

function leerMovimiento(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: MovimientoInventario[]) {
  const id = txt(m, f, "id");
  const sku = txt(m, f, "sku");
  if (!id || !sku) {
    parte.anotar(
      "fila sin identificador",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `movimiento sin ${!id ? "consecutivo" : "producto"}`,
    );
    return;
  }
  const tipoBruto = txt(m, f, "tipo");
  const tipo = TIPO_MOVIMIENTO[normalizar(tipoBruto ?? "")];
  if (!tipo) {
    parte.anotar(
      "tipo de movimiento desconocido",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${tipoBruto ?? "vacío"}» no es entrada, salida, ajuste ni traslado; ${id} se descarta`,
    );
    return;
  }
  const fecha = fch(m, f, "fecha");
  if (!fecha) {
    parte.anotar(
      "fecha ilegible",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `${id} no trae fecha entendible; se descarta`,
    );
    return;
  }

  salida.push({
    id,
    sku,
    bodega: txt(m, f, "bodega") ?? "",
    tipo,
    cantidad: num(m, f, "cantidad") ?? 0,
    fecha: fecha.slice(0, 10),
    documentoId: txt(m, f, "documentoId"),
    usuario: txt(m, f, "usuario"),
    motivo: txt(m, f, "motivo"),
    origen,
  });
}

function leerItem(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: Item[]) {
  const sku = txt(m, f, "sku");
  if (!sku) {
    parte.anotar("fila sin identificador", "error", origen.archivo, origen.hoja, origen.fila, "producto sin código");
    return;
  }
  const inventariableBruto = txt(m, f, "inventariable");
  const inventariable = inventariableBruto === null ? undefined : SI_NO[normalizar(inventariableBruto)];
  if (inventariableBruto !== null && inventariable === undefined) {
    parte.anotar(
      "valor sí/no no entendido",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${inventariableBruto}» no es SI ni NO; ${sku} se trata como inventariable`,
    );
  }

  salida.push({
    sku,
    nombre: txt(m, f, "nombre") ?? sku,
    categoria: txt(m, f, "categoria") ?? "",
    costoPromedio: num(m, f, "costoPromedio") ?? 0,
    stockActual: num(m, f, "stockActual") ?? 0,
    inventariable: inventariable ?? true,
    origen,
  });
}

function leerBanco(m: MapeoHoja, f: unknown[], origen: Origen, parte: Parte, salida: MovimientoBanco[]) {
  const fecha = fch(m, f, "fecha");
  if (!fecha) {
    parte.anotar(
      "fecha ilegible",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      "movimiento de banco sin fecha entendible; se descarta",
    );
    return;
  }

  // Aquí se resuelve la forma del extracto: dos columnas de importe, una vacía
  // en cada fila, se convierten en un monto siempre positivo más su signo.
  const debito = num(m, f, "debito");
  const credito = num(m, f, "credito");
  let monto: number | null = null;
  let tipo: MovimientoBanco["tipo"] | null = null;

  if (debito !== null && debito !== 0 && credito !== null && credito !== 0) {
    parte.anotar(
      "fila con débito y crédito a la vez",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      "la fila trae importe en las dos columnas; se toma el débito",
    );
  }
  if (debito !== null && debito !== 0) {
    monto = Math.abs(debito);
    tipo = "debito";
  } else if (credito !== null && credito !== 0) {
    monto = Math.abs(credito);
    tipo = "credito";
  } else {
    // Extracto de una sola columna: manda la naturaleza si viene, y si no el
    // signo del propio importe.
    const suelto = num(m, f, "monto");
    const naturaleza = normalizar(txt(m, f, "tipo") ?? "");
    if (suelto !== null && suelto !== 0) {
      monto = Math.abs(suelto);
      if (/^(cred|abon|ingres|consign)/.test(naturaleza)) tipo = "credito";
      else if (/^(deb|carg|egres|retir)/.test(naturaleza)) tipo = "debito";
      else tipo = suelto < 0 ? "debito" : "credito";
    }
  }

  if (monto === null || tipo === null) {
    parte.anotar(
      "fila del extracto sin importe",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      "ni débito ni crédito traen valor; se descarta",
    );
    return;
  }

  salida.push({
    id: idBanco(salida.length + 1),
    fecha: fecha.slice(0, 10),
    descripcion: txt(m, f, "descripcion") ?? "",
    monto,
    tipo,
    cuenta: txt(m, f, "cuenta") ?? "",
    terceroIdInferido: null,
    documentoConciliadoId: txt(m, f, "documentoConciliadoId"),
    origen,
  });
}

function leerPolitica(
  m: MapeoHoja,
  f: unknown[],
  origen: Origen,
  parte: Parte,
  recogidas: Map<ClavePolitica, number>,
) {
  const etiqueta = txt(m, f, "parametro");
  if (!etiqueta) return;
  const propuesta = proponerPolitica(etiqueta);
  if (!propuesta) {
    parte.anotar(
      "política no reconocida",
      "aviso",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${etiqueta}» no corresponde a ninguna política que las reglas usen`,
    );
    return;
  }

  const celda = bruto(m, f, "valor");
  const valor =
    propuesta.clave === "horarioInicio" || propuesta.clave === "horarioFin" ? aHora(celda) : aNumero(celda);
  if (valor === null) {
    parte.anotar(
      "política sin valor",
      "error",
      origen.archivo,
      origen.hoja,
      origen.fila,
      `«${etiqueta}» no trae un número entendible`,
    );
    return;
  }
  recogidas.set(propuesta.clave, valor);
}

/**
 * O están las siete o no hay políticas. Rellenar la que falte con un valor por
 * defecto sería inventarse el umbral de aprobación de una empresa, y las reglas
 * que dependen de él se enseñan en pantalla como no evaluables, que es la
 * verdad.
 */
function armarPoliticas(
  recogidas: Map<ClavePolitica, number>,
  origen: Origen | null,
  parte: Parte,
): Politicas | null {
  const claves: ClavePolitica[] = [
    "umbralAprobacion",
    "margenMinimoPct",
    "descuentoMaximoPct",
    "diasCredito",
    "horarioInicio",
    "horarioFin",
    "minimoSoportePago",
  ];
  const faltan = claves.filter((c) => !recogidas.has(c));
  if (origen === null) {
    parte.anotar("sin políticas", "aviso", "(resumen)", "(resumen)", null, "no llegó la hoja de políticas");
    return null;
  }
  if (faltan.length > 0) {
    parte.anotar(
      "políticas incompletas",
      "error",
      origen.archivo,
      origen.hoja,
      null,
      `faltan ${faltan.join(", ")}: las reglas que dependen de ellas no se pueden evaluar`,
    );
    return null;
  }

  return {
    umbralAprobacion: recogidas.get("umbralAprobacion") ?? 0,
    margenMinimoPct: recogidas.get("margenMinimoPct") ?? 0,
    descuentoMaximoPct: recogidas.get("descuentoMaximoPct") ?? 0,
    diasCredito: recogidas.get("diasCredito") ?? 0,
    horarioInicio: recogidas.get("horarioInicio") ?? 0,
    horarioFin: recogidas.get("horarioFin") ?? 0,
    minimoSoportePago: recogidas.get("minimoSoportePago") ?? 0,
    origen,
  };
}

/* ────────────────────────────  Integridad  ──────────────────────────── */

/**
 * El ERP exporta UNA sola columna de referencia por documento, y lo que lleva
 * depende del documento: en una factura de compra es la orden que la autorizó;
 * en un pago, la factura que cancela. La columna se llama «Doc. Ref. OC» en las
 * dos, así que el encabezado no lo distingue — pero el documento al que apunta
 * sí. Se coloca además en el campo que le corresponde por tipo, para que una
 * regla encuentre la referencia busque donde busque.
 */
function colocarReferencias(documentos: Documento[], porId: Map<string, Documento>) {
  for (const d of documentos) {
    const ref = d.ordenCompraId === null ? undefined : porId.get(d.ordenCompraId);
    if (!ref || ref.tipo === "orden_compra") continue;
    if (ref.tipo === "entrada_inventario") {
      if (d.entradaInventarioId === null) d.entradaInventarioId = ref.id;
    } else if (ref.tipo === "factura_compra" || ref.tipo === "factura_venta") {
      if (d.facturaAfectadaId === null) d.facturaAfectadaId = ref.id;
    }
  }
}

/** Se queda con la primera aparición: la segunda ya no se puede distinguir. */
function unicos<T>(lista: T[], clave: (x: T) => string, clase: string, parte: Parte): Map<string, T> {
  const mapa = new Map<string, T>();
  for (const x of lista) {
    const k = clave(x);
    const previo = mapa.get(k);
    if (previo === undefined) {
      mapa.set(k, x);
      continue;
    }
    const o = (x as { origen: Origen }).origen;
    const anterior = (previo as { origen: Origen }).origen;
    parte.anotar(
      clase,
      "error",
      o.archivo,
      o.hoja,
      o.fila,
      `«${k}» ya venía en la fila ${anterior.fila} de ${anterior.hoja}; esta se descarta`,
    );
  }
  return mapa;
}

function cuadrarDocumentos(documentos: Documento[], lineas: LineaDocumento[], parte: Parte) {
  const suma = new Map<string, number>();
  for (const l of lineas) suma.set(l.documentoId, (suma.get(l.documentoId) ?? 0) + l.total);

  for (const d of documentos) {
    const total = suma.get(d.id);
    if (total === undefined) continue; // Pagos, entradas y recibos no llevan líneas.
    const diferencia = d.montoTotal - total;
    if (Math.abs(diferencia) <= TOLERANCIA_CUADRE) continue;
    parte.anotar(
      "el documento no cuadra con sus líneas",
      "aviso",
      d.origen.archivo,
      d.origen.hoja,
      d.origen.fila,
      `${d.numero}: cabecera ${Math.round(d.montoTotal)} frente a ${Math.round(total)} en líneas (${
        diferencia > 0 ? "+" : ""
      }${Math.round(diferencia)})`,
    );
  }
}

function revisarFechas(
  documentos: Documento[],
  inventario: MovimientoInventario[],
  banco: MovimientoBanco[],
  cambios: CambioTercero[],
  parte: Parte,
) {
  const fuera = (iso: string) => iso < PERIODO_DECLARADO.desde || iso > PERIODO_DECLARADO.hasta;
  const anotar = (o: Origen, que: string, iso: string) =>
    parte.anotar(
      "fecha fuera del período",
      "aviso",
      o.archivo,
      o.hoja,
      o.fila,
      `${que} con fecha ${iso}, fuera de ${PERIODO_DECLARADO.desde} a ${PERIODO_DECLARADO.hasta}`,
    );

  // La creación de un tercero puede ser de hace diez años y es normal: no se mira.
  for (const d of documentos) if (fuera(d.fecha)) anotar(d.origen, d.numero, d.fecha);
  for (const m of inventario) if (fuera(m.fecha)) anotar(m.origen, `movimiento ${m.id}`, m.fecha);
  for (const b of banco) if (fuera(b.fecha)) anotar(b.origen, `movimiento de banco ${b.id}`, b.fecha);
  for (const c of cambios) if (fuera(c.fecha)) anotar(c.origen, `cambio en ${c.terceroId}`, c.fecha);
}

function revisarReferencias(
  vivos: { terceros: Tercero[]; documentos: Documento[]; items: Item[] },
  lineas: LineaDocumento[],
  inventario: MovimientoInventario[],
  banco: MovimientoBanco[],
  cambios: CambioTercero[],
  terceroPorId: Map<string, Tercero>,
  documentoPorId: Map<string, Documento>,
  itemPorSku: Map<string, Item>,
  parte: Parte,
) {
  const colgada = (o: Origen, texto: string) =>
    parte.anotar("referencia a algo que no existe", "aviso", o.archivo, o.hoja, o.fila, texto);

  for (const d of vivos.documentos) {
    if (d.terceroId && !terceroPorId.has(d.terceroId))
      colgada(d.origen, `${d.numero} apunta al tercero ${d.terceroId}, que no está en el maestro`);
    if (d.ordenCompraId && !documentoPorId.has(d.ordenCompraId))
      colgada(d.origen, `${d.numero} apunta a la orden ${d.ordenCompraId}, que no llegó`);
    if (d.entradaInventarioId && !documentoPorId.has(d.entradaInventarioId))
      colgada(d.origen, `${d.numero} apunta a la entrada ${d.entradaInventarioId}, que no llegó`);
    if (d.facturaAfectadaId && !documentoPorId.has(d.facturaAfectadaId))
      colgada(d.origen, `${d.numero} afecta a ${d.facturaAfectadaId}, que no llegó`);
  }
  for (const l of lineas) {
    if (!documentoPorId.has(l.documentoId))
      colgada(l.origen, `línea del documento ${l.documentoId}, que no está en la hoja de documentos`);
    if (!itemPorSku.has(l.sku)) colgada(l.origen, `línea del producto ${l.sku}, que no está en el catálogo`);
  }
  for (const m of inventario) {
    if (!itemPorSku.has(m.sku)) colgada(m.origen, `movimiento del producto ${m.sku}, que no está en el catálogo`);
    if (m.documentoId && !documentoPorId.has(m.documentoId))
      colgada(m.origen, `movimiento ${m.id} soportado en ${m.documentoId}, que no llegó`);
  }
  for (const b of banco) {
    if (b.documentoConciliadoId && !documentoPorId.has(b.documentoConciliadoId))
      colgada(b.origen, `${b.id} concilia con ${b.documentoConciliadoId}, que no llegó`);
  }
  for (const c of cambios) {
    if (!terceroPorId.has(c.terceroId))
      colgada(c.origen, `cambio sobre el tercero ${c.terceroId}, que no está en el maestro`);
  }
}

/* ─────────────────  De quién es cada movimiento del banco  ───────────────── */

/** Formas societarias: lo único que sobra al comparar el nombre del maestro con
    el texto libre que escribe el banco. */
const FORMA_SOCIETARIA = /\s+(s a s|sas|ltda|s a|sa|e u|eu|s c a|sca|s en c)$/;

const nucleo = (nombre: string) => normalizar(nombre).replace(FORMA_SOCIETARIA, "").trim();

/**
 * El extracto no dice a quién se pagó: dice «TRANSF EMPAQUES DEL NORTE». Si hay
 * documento conciliado el tercero sale de ahí y no hay nada que adivinar; si no,
 * se busca el nombre dentro de la descripción. El campo se llama
 * `terceroIdInferido` justamente porque lo segundo es una inferencia, y las
 * reglas que la usan lo saben.
 */
function inferirTerceroDelBanco(banco: MovimientoBanco[], terceros: Tercero[], documentos: Map<string, Documento>) {
  const candidatos = terceros
    .map((t) => ({ id: t.id, nucleo: nucleo(t.nombre) }))
    .filter((c) => c.nucleo.length >= 8)
    .sort((a, b) => b.nucleo.length - a.nucleo.length || (a.id < b.id ? -1 : 1));

  for (const mov of banco) {
    if (mov.documentoConciliadoId) {
      const doc = documentos.get(mov.documentoConciliadoId);
      if (doc?.terceroId) {
        mov.terceroIdInferido = doc.terceroId;
        continue;
      }
    }
    const texto = normalizar(mov.descripcion);
    if (!texto) continue;
    const encontrado = candidatos.find((c) => texto.includes(c.nucleo));
    if (encontrado) mov.terceroIdInferido = encontrado.id;
  }
}

/** El período es el que dicen los datos, no el que dice nadie. */
function deducirPeriodo(documentos: Documento[]): { desde: string; hasta: string } {
  if (documentos.length === 0) return { ...PERIODO_DECLARADO };
  let desde = documentos[0].fecha;
  let hasta = documentos[0].fecha;
  for (const d of documentos) {
    if (d.fecha < desde) desde = d.fecha;
    if (d.fecha > hasta) hasta = d.fecha;
  }
  return { desde, hasta };
}
