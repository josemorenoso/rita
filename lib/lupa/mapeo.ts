/* ─────────────────────────  MAPEO DE COLUMNAS  ─────────────────────────
   Ningún ERP exporta una columna llamada `montoTotal`: exporta «Vlr. Total»,
   y el del cliente de al lado exporta «VR TOTAL» o «Importe». Este fichero es
   el sitio exacto donde LUPA deja de depender del ERP: normaliza el
   encabezado, lo busca en un diccionario de sinónimos y, si no aparece, mide
   cuánto se parece.

   La confianza que sale de aquí se enseña en pantalla, así que tiene que
   aguantar una pregunta incómoda. Por eso solo hay tres formas de ganársela:

     1,00        el encabezado ES el nombre del campo («Bodega» → bodega)
     0,95        coincide con un sinónimo del diccionario («Vlr. Total»)
     0,70-0,85   se resolvió por parecido, y decimos con qué y cuánto

   No hay una cuarta. Un 0,9 puesto a ojo no se sostiene delante de nadie.

   Dos hojas rompen la forma «una columna, un campo» y se resuelven aquí: el
   extracto bancario trae Débito y Crédito en dos columnas (van a monto + tipo)
   y las políticas vienen en filas Parámetro/Valor.
   ---------------------------------------------------------------------- */

import type { Politicas } from "./tipos";

export type TablaCanonica =
  | "terceros"
  | "cambiosTercero"
  | "documentos"
  | "lineas"
  | "inventario"
  | "items"
  | "banco"
  | "politicas";

export const TABLAS: TablaCanonica[] = [
  "terceros",
  "cambiosTercero",
  "documentos",
  "lineas",
  "inventario",
  "items",
  "banco",
  "politicas",
];

export const ETIQUETA_TABLA: Record<TablaCanonica, string> = {
  terceros: "Maestro de terceros",
  cambiosTercero: "Cambios en el maestro",
  documentos: "Documentos",
  lineas: "Líneas de documento",
  inventario: "Movimientos de inventario",
  items: "Catálogo de productos",
  banco: "Extracto bancario",
  politicas: "Políticas de la empresa",
};

export type RazonMapeo = "exacta" | "sinonimo" | "parecido" | "derivada" | "ignorada" | "sin_mapeo";

/** Cómo está puesta la información en la hoja, no qué contiene. */
export type FormaHoja = "columnas" | "debito_credito" | "parametro_valor";

export type MapeoColumna = {
  /** El encabezado tal y como venía. Se enseña sin tocar: es la prueba. */
  encabezado: string;
  normalizado: string;
  indice: number;
  /** «A», «B», «C»… para poder señalar la columna en el Excel del cliente. */
  letra: string;
  campo: string | null;
  confianza: number;
  razon: RazonMapeo;
  /** Media línea que justifica la decisión. Es lo que se lee en pantalla. */
  porque: string;
};

export type MapeoHoja = {
  archivo: string;
  hoja: string;
  tabla: TablaCanonica | null;
  forma: FormaHoja;
  /** Cuánto se cree que la hoja es esa tabla, no cuánto se cree cada columna. */
  confianza: number;
  columnas: MapeoColumna[];
  /** Campos sin los cuales la tabla no se puede construir y nadie resolvió. */
  faltan: string[];
  indicePorCampo: Record<string, number | undefined>;
};

/* ─────────────────────────  Normalización  ───────────────────────── */

/**
 * «Vlr. Unit.» → «vlr unit», «Nit / Cédula» → «nit cedula», «Margen mínimo (%)»
 * → «margen minimo pct». El porcentaje se convierte en palabra antes de barrer
 * la puntuación porque es lo único que distingue «% Desc.» de «Descripción».
 */
export function normalizarEncabezado(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `montoTotal` → «monto total», para poder comparar el campo con el encabezado. */
const enPalabras = (campo: string) => normalizarEncabezado(campo.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));

/** Las abreviaturas del ERP colombiano. Solo intervienen al medir parecido. */
const ABREVIATURA: Record<string, string> = {
  vlr: "valor",
  vr: "valor",
  val: "valor",
  cant: "cantidad",
  ctd: "cantidad",
  nro: "numero",
  num: "numero",
  no: "numero",
  cod: "codigo",
  doc: "documento",
  docto: "documento",
  desc: "descuento",
  dcto: "descuento",
  consec: "consecutivo",
  cta: "cuenta",
  prom: "promedio",
  mov: "movimiento",
  movto: "movimiento",
  unit: "unitario",
  und: "unidad",
  f: "fecha",
  fec: "fecha",
  cto: "costo",
  pct: "porcentaje",
  porc: "porcentaje",
  ref: "referencia",
  tel: "telefono",
  dir: "direccion",
  obs: "observacion",
};

const expandir = (texto: string) => texto.split(" ").map((t) => ABREVIATURA[t] ?? t);

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let comunes = 0;
  for (const t of sa) if (sb.has(t)) comunes += 1;
  const union = sa.size + sb.size - comunes;
  return union === 0 ? 0 : comunes / union;
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let previa = new Array<number>(n + 1);
  let actual = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) previa[j] = j;
  for (let i = 1; i <= m; i += 1) {
    actual[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const coste = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, previa[j] + 1, previa[j - 1] + coste);
    }
    const intercambio = previa;
    previa = actual;
    actual = intercambio;
  }
  return previa[n];
}

/**
 * Mitad palabras, mitad letras. Solo con palabras, «cant» y «cantidad» no se
 * parecen en nada; solo con letras, «valor total» y «valor unitario» se parecen
 * demasiado. Juntas se comportan.
 */
function similitud(a: string, b: string): number {
  const ta = expandir(a);
  const tb = expandir(b);
  const sa = ta.join(" ");
  const sb = tb.join(" ");
  const letras = 1 - distancia(sa, sb) / Math.max(sa.length, sb.length, 1);
  return 0.6 * jaccard(ta, tb) + 0.4 * Math.max(letras, 0);
}

/** Por debajo de esto no hay parecido, hay imaginación. */
const UMBRAL_PARECIDO = 0.55;
/** Y por debajo de esto la hoja no es esa tabla. */
const UMBRAL_TABLA = 0.45;

const dos = (v: number) => v.toFixed(2).replace(".", ",");
const redondear = (v: number) => Math.round(v * 100) / 100;

/** Índice 0 → «A», 26 → «AA». Para señalar la columna en el Excel del cliente. */
export function letraColumna(indice: number): string {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/* ─────────────────────────  El diccionario  ───────────────────────── */

type CampoCanonico = {
  campo: string;
  etiqueta: string;
  /** Ya normalizados: el diccionario se escribe en el idioma del normalizador. */
  sinonimos: string[];
  /** Pesa al decidir qué tabla es la hoja. */
  clave?: boolean;
  /** Sin él la tabla no se puede construir. */
  obligatorio?: boolean;
  /** No sale tal cual del Excel: hay que transformar la forma de la hoja. */
  derivada?: boolean;
};

type TablaDef = {
  tabla: TablaCanonica;
  campos: CampoCanonico[];
  /** Columnas que se reconocen y NO se guardan: el dato ya viene por otra. */
  informativas: { encabezado: string; porque: string }[];
  /** Número exacto de columnas, cuando la forma de la hoja lo impone. */
  columnasExactas?: number;
};

const SKU = [
  "cod producto",
  "codigo producto",
  "sku",
  "producto",
  "referencia",
  "cod item",
  "item",
  "cod prod",
  "ref producto",
];

const DICCIONARIO: TablaDef[] = [
  {
    tabla: "terceros",
    campos: [
      {
        campo: "id",
        etiqueta: "Código del tercero",
        clave: true,
        obligatorio: true,
        sinonimos: ["cod tercero", "codigo tercero", "id tercero", "nro tercero", "codigo de tercero", "cod"],
      },
      {
        campo: "tipo",
        etiqueta: "Tipo de tercero",
        clave: true,
        sinonimos: ["tipo", "tipo tercero", "clase", "clase tercero", "tipo de tercero"],
      },
      {
        campo: "nombre",
        etiqueta: "Razón social",
        clave: true,
        obligatorio: true,
        sinonimos: ["razon social", "nombre", "nombre tercero", "razon", "nombre o razon social"],
      },
      {
        campo: "nit",
        etiqueta: "NIT",
        clave: true,
        sinonimos: [
          "nit",
          "nit cedula",
          "identificacion",
          "documento",
          "cedula",
          "num identificacion",
          "numero identificacion",
          "doc identidad",
          "nit o cedula",
        ],
      },
      { campo: "telefono", etiqueta: "Teléfono", sinonimos: ["telefono", "tel", "celular", "contacto", "fono"] },
      { campo: "direccion", etiqueta: "Dirección", sinonimos: ["direccion", "dir", "domicilio"] },
      {
        campo: "cuentaBancaria",
        etiqueta: "Cuenta bancaria",
        clave: true,
        sinonimos: ["cta bancaria", "cuenta bancaria", "cuenta", "cta", "nro cuenta", "numero de cuenta", "no cuenta"],
      },
      { campo: "banco", etiqueta: "Banco", sinonimos: ["banco", "entidad bancaria", "entidad"] },
      {
        campo: "fechaCreacion",
        etiqueta: "Fecha de creación",
        clave: true,
        sinonimos: ["f creacion", "fecha creacion", "fecha de creacion", "creado", "fecha alta", "f alta", "alta"],
      },
      {
        campo: "usuarioCreacion",
        etiqueta: "Usuario que lo creó",
        sinonimos: ["usuario creo", "usuario creacion", "creado por", "usuario", "usuario alta", "registrado por"],
      },
    ],
    informativas: [],
  },
  {
    tabla: "cambiosTercero",
    campos: [
      {
        campo: "terceroId",
        etiqueta: "Código del tercero",
        clave: true,
        obligatorio: true,
        sinonimos: ["cod tercero", "codigo tercero", "tercero", "id tercero", "cod"],
      },
      {
        campo: "campo",
        etiqueta: "Campo modificado",
        clave: true,
        obligatorio: true,
        sinonimos: ["campo", "atributo", "campo modificado", "campo cambiado"],
      },
      {
        campo: "valorAnterior",
        etiqueta: "Valor anterior",
        clave: true,
        sinonimos: ["valor anterior", "anterior", "valor previo", "antes", "valor viejo"],
      },
      {
        campo: "valorNuevo",
        etiqueta: "Valor nuevo",
        clave: true,
        sinonimos: ["valor nuevo", "nuevo", "nuevo valor", "despues", "valor actual"],
      },
      {
        campo: "fecha",
        etiqueta: "Fecha del cambio",
        clave: true,
        obligatorio: true,
        sinonimos: ["fecha cambio", "fecha", "f cambio", "fecha modificacion", "fecha de cambio", "fecha mod"],
      },
      {
        campo: "usuario",
        etiqueta: "Usuario",
        sinonimos: ["usuario", "usuario modifico", "modificado por", "responsable"],
      },
    ],
    informativas: [],
  },
  {
    tabla: "documentos",
    campos: [
      {
        campo: "tipo",
        etiqueta: "Tipo de documento",
        clave: true,
        obligatorio: true,
        sinonimos: ["tipo doc", "tipo documento", "tipo", "clase doc", "tipo de documento", "clase"],
      },
      {
        campo: "numero",
        etiqueta: "Número",
        clave: true,
        obligatorio: true,
        sinonimos: [
          "nro",
          "numero",
          "nro doc",
          "numero documento",
          "no documento",
          "numero de documento",
          "num doc",
          "nro documento",
          "folio",
        ],
      },
      {
        campo: "consecutivo",
        etiqueta: "Consecutivo",
        sinonimos: ["consec", "consecutivo", "nro consecutivo", "secuencia", "numero consecutivo"],
      },
      {
        campo: "terceroId",
        etiqueta: "Código del tercero",
        clave: true,
        sinonimos: [
          "cod tercero",
          "codigo tercero",
          "nit tercero",
          "id tercero",
          "cod cliente",
          "cod proveedor",
          "codigo cliente",
          "codigo proveedor",
        ],
      },
      {
        campo: "fecha",
        etiqueta: "Fecha del documento",
        clave: true,
        obligatorio: true,
        sinonimos: ["fecha doc", "fecha documento", "fecha", "f doc", "fecha emision", "fecha de documento"],
      },
      {
        campo: "fechaRegistro",
        etiqueta: "Fecha de registro",
        sinonimos: [
          "fecha registro",
          "f registro",
          "fecha grabacion",
          "fecha captura",
          "fecha sistema",
          "fecha de registro",
        ],
      },
      {
        campo: "usuarioRegistro",
        etiqueta: "Usuario que registró",
        sinonimos: [
          "usuario",
          "vendedor",
          "usuario registro",
          "digitado por",
          "asesor",
          "usuario creo",
          "registrado por",
        ],
      },
      {
        campo: "montoTotal",
        etiqueta: "Monto total",
        clave: true,
        obligatorio: true,
        sinonimos: [
          "vlr total",
          "valor total",
          "total",
          "importe",
          "vr total",
          "monto",
          "valor",
          "total documento",
          "vlr doc",
          "valor documento",
          "importe total",
        ],
      },
      { campo: "estado", etiqueta: "Estado", sinonimos: ["estado", "status", "situacion", "estado doc"] },
      {
        campo: "ordenCompraId",
        etiqueta: "Orden de compra",
        sinonimos: ["doc ref oc", "orden compra", "ref oc", "oc", "documento oc", "orden de compra", "nro oc", "doc oc"],
      },
      {
        campo: "entradaInventarioId",
        etiqueta: "Entrada de inventario",
        sinonimos: [
          "doc ref entrada",
          "ref entrada",
          "entrada",
          "documento entrada",
          "entrada inventario",
          "nro entrada",
          "doc entrada",
        ],
      },
      {
        campo: "facturaAfectadaId",
        etiqueta: "Documento afectado",
        sinonimos: ["doc afectado", "documento afectado", "factura afectada", "afecta a", "ref factura", "doc ref"],
      },
      {
        campo: "diasCredito",
        etiqueta: "Días de crédito",
        sinonimos: ["dias credito", "plazo", "dias de credito", "plazo credito", "dias plazo"],
      },
    ],
    informativas: [
      { encabezado: "tercero", porque: "el nombre ya se resuelve por «Cod. Tercero»" },
      { encabezado: "cliente", porque: "el nombre ya se resuelve por «Cod. Tercero»" },
      { encabezado: "proveedor", porque: "el nombre ya se resuelve por «Cod. Tercero»" },
      { encabezado: "razon social", porque: "el nombre ya se resuelve por «Cod. Tercero»" },
      { encabezado: "nombre tercero", porque: "el nombre ya se resuelve por «Cod. Tercero»" },
    ],
  },
  {
    tabla: "lineas",
    campos: [
      {
        campo: "documentoId",
        etiqueta: "Documento",
        clave: true,
        obligatorio: true,
        sinonimos: [
          "nro doc",
          "numero documento",
          "documento",
          "nro",
          "doc",
          "nro factura",
          "numero factura",
          "factura",
        ],
      },
      { campo: "sku", etiqueta: "Producto", clave: true, obligatorio: true, sinonimos: SKU },
      {
        campo: "descripcion",
        etiqueta: "Descripción",
        sinonimos: ["descripcion", "detalle", "nombre producto", "concepto", "descripcion producto"],
      },
      {
        campo: "cantidad",
        etiqueta: "Cantidad",
        clave: true,
        obligatorio: true,
        sinonimos: ["cant", "cantidad", "unidades", "qty"],
      },
      {
        campo: "precioUnitario",
        etiqueta: "Valor unitario",
        clave: true,
        sinonimos: ["vlr unit", "valor unitario", "precio unitario", "vr unit", "precio", "unitario", "vlr unitario"],
      },
      {
        campo: "costoUnitario",
        etiqueta: "Costo unitario",
        sinonimos: ["costo unit", "costo unitario", "costo", "cto unit"],
      },
      {
        campo: "descuentoPct",
        etiqueta: "Descuento (%)",
        sinonimos: ["pct desc", "desc", "descuento", "pct descuento", "porcentaje descuento", "dcto", "pct dcto"],
      },
      {
        campo: "total",
        etiqueta: "Total de la línea",
        clave: true,
        sinonimos: ["vlr linea", "valor linea", "total linea", "subtotal", "importe linea", "vr linea", "total"],
      },
    ],
    informativas: [],
  },
  {
    tabla: "inventario",
    campos: [
      {
        campo: "id",
        etiqueta: "Consecutivo",
        clave: true,
        obligatorio: true,
        sinonimos: ["consecutivo", "consec", "id mov", "nro mov", "numero movimiento", "nro movimiento", "secuencia"],
      },
      { campo: "sku", etiqueta: "Producto", clave: true, obligatorio: true, sinonimos: SKU },
      {
        campo: "bodega",
        etiqueta: "Bodega",
        clave: true,
        sinonimos: ["bodega", "almacen", "centro", "deposito", "sede"],
      },
      {
        campo: "tipo",
        etiqueta: "Tipo de movimiento",
        clave: true,
        obligatorio: true,
        sinonimos: ["tipo mov", "tipo movimiento", "tipo", "clase mov", "tipo de movimiento", "naturaleza"],
      },
      {
        campo: "cantidad",
        etiqueta: "Cantidad",
        clave: true,
        obligatorio: true,
        sinonimos: ["cantidad", "cant", "unidades", "qty"],
      },
      {
        campo: "fecha",
        etiqueta: "Fecha",
        clave: true,
        obligatorio: true,
        sinonimos: ["fecha", "f mov", "fecha movimiento", "fecha mov", "f movimiento"],
      },
      {
        campo: "documentoId",
        etiqueta: "Documento soporte",
        sinonimos: ["doc soporte", "documento soporte", "documento", "soporte", "doc", "nro doc"],
      },
      { campo: "usuario", etiqueta: "Usuario", sinonimos: ["usuario", "responsable", "registrado por", "digitado por"] },
      {
        campo: "motivo",
        etiqueta: "Motivo",
        sinonimos: ["motivo", "observacion", "concepto", "nota", "obs", "comentario"],
      },
    ],
    informativas: [],
  },
  {
    tabla: "items",
    campos: [
      { campo: "sku", etiqueta: "Código del producto", clave: true, obligatorio: true, sinonimos: SKU },
      {
        campo: "nombre",
        etiqueta: "Nombre",
        clave: true,
        obligatorio: true,
        sinonimos: ["nombre", "descripcion", "nombre producto", "descripcion producto", "detalle"],
      },
      {
        campo: "categoria",
        etiqueta: "Categoría",
        clave: true,
        sinonimos: ["categoria", "linea", "familia", "grupo", "clasificacion"],
      },
      {
        campo: "costoPromedio",
        etiqueta: "Costo promedio",
        clave: true,
        sinonimos: ["costo prom", "costo promedio", "costo", "cto prom", "costo unitario", "costo ultimo"],
      },
      {
        campo: "stockActual",
        etiqueta: "Existencia",
        clave: true,
        sinonimos: ["existencia", "existencias", "stock", "saldo", "stock actual", "disponible"],
      },
      {
        campo: "inventariable",
        etiqueta: "¿Maneja inventario?",
        clave: true,
        sinonimos: ["maneja inventario", "inventariable", "controla inventario", "maneja stock", "controla stock"],
      },
    ],
    informativas: [],
  },
  {
    tabla: "banco",
    campos: [
      {
        campo: "fecha",
        etiqueta: "Fecha",
        clave: true,
        obligatorio: true,
        sinonimos: ["fecha", "f mov", "fecha movimiento", "fecha operacion"],
      },
      {
        campo: "descripcion",
        etiqueta: "Descripción",
        clave: true,
        sinonimos: ["descripcion", "detalle", "concepto", "referencia", "glosa"],
      },
      {
        campo: "debito",
        etiqueta: "Débito",
        clave: true,
        derivada: true,
        sinonimos: ["debito", "debitos", "cargo", "cargos", "salida", "egreso", "retiro", "valor debito"],
      },
      {
        campo: "credito",
        etiqueta: "Crédito",
        clave: true,
        derivada: true,
        sinonimos: ["credito", "creditos", "abono", "abonos", "entrada", "ingreso", "consignacion", "valor credito"],
      },
      { campo: "monto", etiqueta: "Monto", sinonimos: ["monto", "valor", "importe", "vlr", "valor movimiento"] },
      { campo: "tipo", etiqueta: "Naturaleza", sinonimos: ["tipo", "naturaleza", "tipo movimiento", "tipo mov"] },
      {
        campo: "cuenta",
        etiqueta: "Cuenta",
        clave: true,
        sinonimos: ["cuenta", "cta", "cuenta bancaria", "nro cuenta", "numero de cuenta", "cta bancaria"],
      },
      {
        campo: "documentoConciliadoId",
        etiqueta: "Documento conciliado",
        sinonimos: ["doc conciliado", "documento conciliado", "conciliado", "referencia doc", "doc soporte", "doc ref"],
      },
    ],
    informativas: [{ encabezado: "saldo", porque: "el saldo corriente del banco no entra en el modelo" }],
  },
  {
    tabla: "politicas",
    columnasExactas: 2,
    campos: [
      {
        campo: "parametro",
        etiqueta: "Parámetro",
        clave: true,
        obligatorio: true,
        derivada: true,
        sinonimos: ["parametro", "concepto", "politica", "variable", "nombre", "descripcion"],
      },
      {
        campo: "valor",
        etiqueta: "Valor",
        clave: true,
        obligatorio: true,
        derivada: true,
        sinonimos: ["valor", "dato", "monto", "cantidad", "importe"],
      },
    ],
    informativas: [],
  },
];

/* ─────────────────────  Una columna contra un campo  ───────────────────── */

type Veredicto = { confianza: number; razon: RazonMapeo; porque: string };

function comparar(normalizado: string, def: CampoCanonico): Veredicto | null {
  const canonico = enPalabras(def.campo);
  if (normalizado === canonico) {
    return {
      confianza: 1,
      razon: def.derivada ? "derivada" : "exacta",
      porque: `el encabezado es el nombre del campo «${canonico}»`,
    };
  }
  for (const sinonimo of def.sinonimos) {
    if (normalizado === sinonimo) {
      return {
        confianza: 0.95,
        razon: def.derivada ? "derivada" : "sinonimo",
        porque: `«${sinonimo}» está en el diccionario como ${def.etiqueta.toLowerCase()}`,
      };
    }
  }

  let mejor = 0;
  let contra = canonico;
  for (const candidato of [canonico, ...def.sinonimos]) {
    const s = similitud(normalizado, candidato);
    if (s > mejor) {
      mejor = s;
      contra = candidato;
    }
  }
  if (mejor < UMBRAL_PARECIDO) return null;

  // 0,55 → 0,70 y 1,00 → 0,85: un parecido nunca se disfraza de coincidencia.
  const confianza = redondear(0.7 + (0.15 * (mejor - UMBRAL_PARECIDO)) / (1 - UMBRAL_PARECIDO));
  // Cuando el parecido es perfecto es que las dos abreviaturas se desarrollan
  // igual («tipo docto» y «tipo doc»). Se dice así en vez de enseñar un 1,00 al
  // lado de un 0,85, que en pantalla parece una contradicción.
  const porque =
    mejor > 0.999
      ? `no coincide literalmente, pero desarrollando abreviaturas es lo mismo que «${contra}»`
      : `no coincide con nada conocido; se parece a «${contra}» (${dos(mejor)})`;
  return { confianza, razon: def.derivada ? "derivada" : "parecido", porque };
}

/* ───────────────────  Una hoja contra una tabla candidata  ─────────────── */

type Reparto = { columnas: MapeoColumna[]; puntos: number; faltan: string[] };

function repartir(encabezados: string[], normalizados: string[], def: TablaDef): Reparto {
  const columnas: MapeoColumna[] = encabezados.map((encabezado, indice) => ({
    encabezado,
    normalizado: normalizados[indice],
    indice,
    letra: letraColumna(indice),
    campo: null,
    confianza: 0,
    razon: "sin_mapeo",
    porque: "ningún campo canónico se le parece",
  }));

  const tomada = new Array<boolean>(encabezados.length).fill(false);

  // Las informativas se apartan antes de repartir: si «Tercero» compitiera por
  // `terceroId` se llevaría un parecido que no le corresponde.
  for (let i = 0; i < normalizados.length; i += 1) {
    const info = def.informativas.find((x) => x.encabezado === normalizados[i]);
    if (!info) continue;
    columnas[i].razon = "ignorada";
    columnas[i].porque = `se reconoce pero no hace falta: ${info.porque}`;
    tomada[i] = true;
  }

  type Candidata = { col: number; campo: number; veredicto: Veredicto };
  const candidatas: Candidata[] = [];
  for (let col = 0; col < normalizados.length; col += 1) {
    if (tomada[col] || normalizados[col] === "") continue;
    for (let campo = 0; campo < def.campos.length; campo += 1) {
      const veredicto = comparar(normalizados[col], def.campos[campo]);
      if (veredicto) candidatas.push({ col, campo, veredicto });
    }
  }

  // Orden total y explícito: sin él, dos columnas que empatan podrían repartirse
  // distinto entre dos ejecuciones y la grabación dejaría de ser reproducible.
  candidatas.sort((a, b) => b.veredicto.confianza - a.veredicto.confianza || a.campo - b.campo || a.col - b.col);

  const campoTomado = new Array<boolean>(def.campos.length).fill(false);
  for (const c of candidatas) {
    if (tomada[c.col] || campoTomado[c.campo]) continue;
    tomada[c.col] = true;
    campoTomado[c.campo] = true;
    const columna = columnas[c.col];
    columna.campo = def.campos[c.campo].campo;
    columna.confianza = c.veredicto.confianza;
    columna.razon = c.veredicto.razon;
    columna.porque = c.veredicto.porque;
  }

  const claves = def.campos.filter((c) => c.clave);
  const cubiertas = def.campos.filter((c, i) => c.clave && campoTomado[i]).length;
  const suma = columnas.reduce((s, c) => s + (c.campo ? c.confianza : 0), 0);
  const puntos =
    0.6 * (claves.length ? cubiertas / claves.length : 0) + 0.4 * (suma / Math.max(encabezados.length, 1));

  const faltan = def.campos.filter((c, i) => c.obligatorio && !campoTomado[i]).map((c) => c.etiqueta);

  return { columnas, puntos: redondear(puntos), faltan };
}

/**
 * Decide qué tabla canónica es una hoja y qué campo aporta cada columna.
 *
 * Deliberadamente NO mira el nombre del fichero ni el de la hoja: el cliente
 * los renombra, los parte en dos y los manda como «Copia de copia (2)». Lo
 * único que no puede cambiar sin cambiar el dato son los encabezados.
 */
export function proponerMapeo(archivo: string, hoja: string, encabezados: string[]): MapeoHoja {
  const normalizados = encabezados.map(normalizarEncabezado);

  let mejor: { def: TablaDef; reparto: Reparto } | null = null;
  for (const def of DICCIONARIO) {
    if (def.columnasExactas !== undefined && encabezados.length !== def.columnasExactas) continue;
    const reparto = repartir(encabezados, normalizados, def);
    if (!mejor || reparto.puntos > mejor.reparto.puntos) mejor = { def, reparto };
  }

  if (!mejor || mejor.reparto.puntos < UMBRAL_TABLA) {
    return {
      archivo,
      hoja,
      tabla: null,
      forma: "columnas",
      confianza: mejor ? mejor.reparto.puntos : 0,
      columnas: encabezados.map((encabezado, indice) => ({
        encabezado,
        normalizado: normalizados[indice],
        indice,
        letra: letraColumna(indice),
        campo: null,
        confianza: 0,
        razon: "sin_mapeo",
        porque: "la hoja no se parece a ninguna tabla conocida",
      })),
      faltan: [],
      indicePorCampo: {},
    };
  }

  const { def, reparto } = mejor;
  const indicePorCampo: Record<string, number | undefined> = {};
  for (const c of reparto.columnas) if (c.campo) indicePorCampo[c.campo] = c.indice;

  const dosColumnasDeImporte = indicePorCampo.debito !== undefined && indicePorCampo.credito !== undefined;
  const forma: FormaHoja =
    def.tabla === "politicas" ? "parametro_valor" : dosColumnasDeImporte ? "debito_credito" : "columnas";

  if (forma === "debito_credito") {
    for (const c of reparto.columnas) {
      if (c.campo !== "debito" && c.campo !== "credito") continue;
      c.porque = `${c.porque}; Débito y Crédito vienen en dos columnas y se unen en monto + tipo`;
    }
  }
  if (forma === "parametro_valor") {
    for (const c of reparto.columnas) {
      if (!c.campo) continue;
      c.porque = `${c.porque}; la hoja viene en filas: cada fila es una política`;
    }
  }

  return {
    archivo,
    hoja,
    tabla: def.tabla,
    forma,
    confianza: reparto.puntos,
    columnas: reparto.columnas,
    faltan: reparto.faltan,
    indicePorCampo,
  };
}

/* ─────────────────────  La hoja de políticas, por filas  ───────────────── */

export type ClavePolitica = keyof Omit<Politicas, "origen">;

type PoliticaDef = { clave: ClavePolitica; etiqueta: string; sinonimos: string[] };

const POLITICAS: PoliticaDef[] = [
  {
    clave: "umbralAprobacion",
    etiqueta: "Umbral de aprobación de compra",
    sinonimos: [
      "umbral de aprobacion de compra",
      "umbral de aprobacion",
      "umbral aprobacion",
      "monto que exige aprobacion",
      "tope sin aprobacion",
    ],
  },
  {
    clave: "margenMinimoPct",
    etiqueta: "Margen mínimo (%)",
    sinonimos: ["margen minimo pct", "margen minimo", "margen minimo porcentaje", "margen de contribucion minimo"],
  },
  {
    clave: "descuentoMaximoPct",
    etiqueta: "Descuento máximo (%)",
    sinonimos: ["descuento maximo pct", "descuento maximo", "maximo descuento", "tope de descuento"],
  },
  {
    clave: "diasCredito",
    etiqueta: "Días de crédito",
    sinonimos: ["dias de credito", "dias credito", "plazo de credito", "plazo credito"],
  },
  {
    clave: "horarioInicio",
    etiqueta: "Hora de inicio de jornada",
    sinonimos: ["hora de inicio de jornada", "hora inicio jornada", "inicio de jornada", "hora de inicio"],
  },
  {
    clave: "horarioFin",
    etiqueta: "Hora de fin de jornada",
    sinonimos: ["hora de fin de jornada", "hora fin jornada", "fin de jornada", "hora de fin"],
  },
  {
    clave: "minimoSoportePago",
    etiqueta: "Monto mínimo que exige soporte de pago",
    sinonimos: [
      "monto minimo que exige soporte de pago",
      "minimo soporte pago",
      "monto minimo soporte",
      "monto minimo con soporte",
    ],
  },
];

/**
 * Las políticas no vienen en columnas sino en filas Parámetro/Valor, así que lo
 * que hay que reconocer es una frase entera («Monto mínimo que exige soporte de
 * pago»). Mismo criterio de confianza que las columnas.
 */
export function proponerPolitica(
  etiqueta: string,
): { clave: ClavePolitica; confianza: number; razon: RazonMapeo; porque: string } | null {
  const normalizado = normalizarEncabezado(etiqueta);
  if (!normalizado) return null;

  for (const def of POLITICAS) {
    if (normalizado === normalizarEncabezado(def.etiqueta)) {
      return { clave: def.clave, confianza: 1, razon: "exacta", porque: `es literalmente «${def.etiqueta}»` };
    }
  }
  for (const def of POLITICAS) {
    if (def.sinonimos.includes(normalizado)) {
      return {
        clave: def.clave,
        confianza: 0.95,
        razon: "sinonimo",
        porque: `«${normalizado}» está en el diccionario como ${def.etiqueta.toLowerCase()}`,
      };
    }
  }

  let mejor: { def: PoliticaDef; s: number; contra: string } | null = null;
  for (const def of POLITICAS) {
    for (const candidato of [normalizarEncabezado(def.etiqueta), ...def.sinonimos]) {
      const s = similitud(normalizado, candidato);
      if (!mejor || s > mejor.s) mejor = { def, s, contra: candidato };
    }
  }
  if (!mejor || mejor.s < UMBRAL_PARECIDO) return null;

  return {
    clave: mejor.def.clave,
    confianza: redondear(0.7 + (0.15 * (mejor.s - UMBRAL_PARECIDO)) / (1 - UMBRAL_PARECIDO)),
    razon: "parecido",
    porque: `no coincide con nada conocido; se parece a «${mejor.contra}» (${dos(mejor.s)})`,
  };
}

export const campoPolitica = (etiqueta: string): ClavePolitica | null => proponerPolitica(etiqueta)?.clave ?? null;
