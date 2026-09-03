/* ─────────────────────────────  LUPA  ─────────────────────────────
   El esquema canónico y la forma de un hallazgo.

   Todo fichero que entra —venga del ERP que venga— se normaliza a estas
   estructuras. Es la pieza que hace la herramienta independiente del ERP:
   las reglas no saben nada de Excel, solo de este modelo.

   Regla de oro del proyecto: los números los calcula el código. Aquí no hay
   nada que un modelo tenga que estimar.
   ------------------------------------------------------------------ */

/** De dónde salió cada dato. Sin esto un hallazgo no es trazable y no se muestra. */
export type Origen = {
  archivo: string;
  hoja: string;
  /** Fila del Excel tal y como la numera Excel: la 1 es la de encabezados. */
  fila: number;
};

/* ─────────────────────────  Esquema canónico  ───────────────────────── */

export type TipoTercero = "proveedor" | "cliente" | "empleado";

export type Tercero = {
  id: string;
  tipo: TipoTercero;
  nombre: string;
  nit: string;
  telefono: string;
  direccion: string;
  cuentaBancaria: string;
  banco: string;
  fechaCreacion: string; // ISO "2026-04-16"
  usuarioCreacion: string | null;
  origen: Origen;
};

/** El histórico de cambios en el maestro de terceros. Lo que hace posible R07. */
export type CambioTercero = {
  terceroId: string;
  campo: "cuenta_bancaria" | "telefono" | "direccion" | "nombre";
  valorAnterior: string;
  valorNuevo: string;
  fecha: string; // ISO
  usuario: string | null;
  origen: Origen;
};

export type TipoDocumento =
  | "orden_compra"
  | "factura_compra"
  | "entrada_inventario"
  | "factura_venta"
  | "nota_credito"
  | "nota_debito"
  | "pago"
  | "recibo_caja";

export type EstadoDocumento = "vigente" | "pagado" | "pendiente" | "anulado";

export type Documento = {
  id: string;
  tipo: TipoDocumento;
  numero: string;
  /** Número dentro de su serie. Lo que permite ver huecos (R06). */
  consecutivo: number | null;
  serie: string;
  terceroId: string | null;
  fecha: string; // ISO "2026-04-16"
  /** Cuándo se tecleó, con hora. ISO "2026-04-16T23:41". Alimenta R42. */
  fechaRegistro: string | null;
  usuarioRegistro: string | null;
  montoTotal: number;
  estado: EstadoDocumento;
  /** Enlaces del cruce de tres puntos y de las notas crédito. */
  ordenCompraId: string | null;
  entradaInventarioId: string | null;
  facturaAfectadaId: string | null;
  /** Solo en facturas de venta: los días de crédito pactados en el documento. */
  diasCredito: number | null;
  origen: Origen;
};

export type LineaDocumento = {
  documentoId: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number | null;
  descuentoPct: number;
  total: number;
  origen: Origen;
};

export type TipoMovimiento = "entrada" | "salida" | "ajuste" | "traslado";

export type MovimientoInventario = {
  id: string;
  sku: string;
  bodega: string;
  tipo: TipoMovimiento;
  /** Firmada: negativa en salidas y en ajustes de merma. */
  cantidad: number;
  fecha: string;
  documentoId: string | null;
  usuario: string | null;
  motivo: string | null;
  origen: Origen;
};

export type MovimientoBanco = {
  id: string;
  fecha: string;
  descripcion: string;
  /** Siempre positivo; el signo lo lleva `tipo`. */
  monto: number;
  tipo: "debito" | "credito";
  cuenta: string;
  terceroIdInferido: string | null;
  documentoConciliadoId: string | null;
  origen: Origen;
};

export type Item = {
  sku: string;
  nombre: string;
  categoria: string;
  costoPromedio: number;
  stockActual: number;
  inventariable: boolean;
  origen: Origen;
};

export type Politicas = {
  umbralAprobacion: number;
  margenMinimoPct: number;
  descuentoMaximoPct: number;
  diasCredito: number;
  horarioInicio: number; // hora local, 7 = 07:00
  horarioFin: number;
  minimoSoportePago: number;
  origen: Origen;
};

/** Un fichero tal y como llegó, con lo que se supo de él al leerlo. */
export type ArchivoCargado = {
  nombre: string;
  hojas: string[];
  filas: number;
  bytes: number;
  /** Qué tablas canónicas alimentó. */
  aporta: string[];
};

/** Todo el material del cliente, ya normalizado. La entrada del motor. */
export type Libro = {
  empresa: string;
  nit: string;
  periodo: { desde: string; hasta: string };
  terceros: Tercero[];
  cambiosTercero: CambioTercero[];
  documentos: Documento[];
  lineas: LineaDocumento[];
  inventario: MovimientoInventario[];
  banco: MovimientoBanco[];
  items: Item[];
  politicas: Politicas | null;
  archivos: ArchivoCargado[];
};

/* ────────────────────────────  Hallazgos  ──────────────────────────── */

export type Capa = 1 | 2 | 3;
export type Semaforo = "rojo" | "amarillo" | "verde";

export type CategoriaFuga = "compras" | "tesoreria" | "inventario" | "ventas" | "maestros";

export type Evidencia = {
  /** "Factura de compra", "Débito bancario"… en lenguaje llano. */
  documento: string;
  numero: string;
  fecha: string;
  tercero: string;
  monto: number | null;
  archivo: string;
  hoja: string;
  fila: number;
  /** Media línea que explica por qué esta fila está aquí. */
  nota?: string;
};

export type Sujeto = {
  tipo: "tercero" | "usuario" | "sku" | "bodega";
  id: string;
  nombre: string;
};

/** Datos ya calculados para el gráfico que acompaña a un hallazgo. */
export type Serie =
  | { clase: "benford"; observado: number[]; esperado: number[]; chi2: number; n: number }
  | { clase: "precio"; puntos: { fecha: string; valor: number }[]; referencia: number; etiqueta: string }
  | { clase: "barras"; puntos: { etiqueta: string; valor: number; marcado?: boolean }[]; unidad: "dinero" | "conteo" }
  | { clase: "reloj"; horas: number[]; laboral: [number, number] };

/** El grafo del hallazgo compuesto: quién está conectado con quién y por qué. */
export type Grafo = {
  nodos: {
    id: string;
    etiqueta: string;
    clase: "proveedor" | "empleado" | "usuario" | "documento" | "sku" | "banco";
  }[];
  aristas: { de: string; a: string; etiqueta: string; alerta?: boolean }[];
};

export type Hallazgo = {
  id: string;
  reglaId: string;
  /** El compuesto hereda la capa más baja (la más dura) de sus hijos. */
  capa: Capa;
  categoria: CategoriaFuga;
  titulo: string;
  /** Una frase: el hecho observado, con sus cifras. Sin adjetivos. */
  resumen: string;
  semaforo: Semaforo;
  score: number;
  impacto: number;
  confianza: number;
  recurrencia: number;
  montoEnRiesgo: number;
  montoExacto: boolean;
  /** Documentos señalados. El total del informe se calcula sobre la UNIÓN de
      estos identificadores, no sumando montos: así una factura que rompe tres
      reglas cuenta una sola vez. */
  documentos: string[];
  evidencia: Evidencia[];
  quePuedeEstarPasando: string[];
  queRevisar: string[];
  controlSugerido: string;
  sujeto: Sujeto | null;
  serie?: Serie;
  grafo?: Grafo;
  /** Ids de los hallazgos que agrupa (solo en compuestos). */
  hijos?: string[];
  compuesto?: boolean;
};

/* ──────────────────────────  Motor y cobertura  ────────────────────── */

export type EstadoRegla = "pendiente" | "limpia" | "hallazgo" | "no_evaluable";

export type DefinicionRegla = {
  id: string;
  capa: Capa;
  nombre: string;
  categoria: CategoriaFuga;
  /** Qué mira, en una línea, para el panel de cobertura. */
  mira: string;
  /** Campos canónicos sin los cuales no se puede evaluar. */
  requiere: string[];
};

export type ResultadoRegla = {
  reglaId: string;
  estado: EstadoRegla;
  /** Cuántos registros revisó. Se enseña aunque no encuentre nada. */
  revisados: number;
  /** Por qué no se pudo evaluar, en lenguaje llano. */
  motivo?: string;
  hallazgos: Hallazgo[];
};

/** Un paso de la auditoría, para la reproducción en pantalla. */
export type EventoAuditoria = {
  seq: number;
  reglaId: string;
  marca: "run" | "ok" | "hit" | "skip";
  log: string;
  /** Monto acumulado del informe hasta este paso: alimenta el contador. */
  acumulado: number;
  hallazgoId?: string;
  categoria?: CategoriaFuga;
};

export type Informe = {
  empresa: string;
  periodo: { desde: string; hasta: string };
  /** Ventas del período. La base contra la que se mide todo lo demás. */
  facturacion: number;
  compras: number;
  /** Unión de documentos señalados. Ninguno cuenta dos veces. */
  montoEnRiesgo: number;
  /** Suma cruda de los hallazgos, que sí solapa. Se enseña al lado del total. */
  sumaHallazgos: number;
  pctFacturacion: number;
  hallazgos: Hallazgo[];
  resultados: ResultadoRegla[];
  eventos: EventoAuditoria[];
  porCategoria: { categoria: CategoriaFuga; monto: number; hallazgos: number }[];
  conteo: { rojo: number; amarillo: number; verde: number };
  /** Milisegundos que tardó el motor. Medido, no inventado. */
  ms: number;
};
