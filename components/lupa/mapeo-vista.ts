import type { MapeoHoja, RazonMapeo } from "@/lib/lupa/mapeo";

/* El mapeo de columnas, visto desde la pantalla.

   El lector devuelve más de lo que hace falta enseñar —índices, formas de
   hoja, campos que faltan—, así que aquí se queda solo con las cinco cosas
   que se leen en la tabla: cómo se llamaba la columna en el fichero del
   cliente, en qué letra del Excel está, a qué campo fue a parar, con cuánta
   confianza y por qué. */

export type FilaMapeo = {
  encabezado: string;
  letra: string;
  campo: string;
  etiqueta: string;
  confianza: number;
  razon: RazonMapeo;
  porque: string;
};

export type HojaMapeo = {
  archivo: string;
  hoja: string;
  tabla: string;
  columnas: FilaMapeo[];
  /** La confianza más baja de la hoja: es la que decide si hay que mirarla. */
  minima: number;
};

/** Nombre legible de cada campo canónico. Lo que se lee en la columna derecha. */
export const ETIQUETA_CAMPO: Record<string, string> = {
  id: "Identificador",
  tipo: "Tipo",
  nombre: "Nombre",
  nit: "NIT / Cédula",
  telefono: "Teléfono",
  direccion: "Dirección",
  cuentaBancaria: "Cuenta bancaria",
  banco: "Banco",
  fechaCreacion: "Fecha de creación",
  usuarioCreacion: "Usuario que lo creó",
  terceroId: "Tercero",
  campo: "Campo modificado",
  valorAnterior: "Valor anterior",
  valorNuevo: "Valor nuevo",
  fecha: "Fecha del documento",
  fechaRegistro: "Fecha y hora de registro",
  usuario: "Usuario",
  usuarioRegistro: "Usuario que registró",
  numero: "Número de documento",
  consecutivo: "Consecutivo",
  serie: "Serie",
  montoTotal: "Monto total",
  estado: "Estado",
  ordenCompraId: "Orden de compra",
  entradaInventarioId: "Entrada de inventario",
  facturaAfectadaId: "Factura afectada",
  diasCredito: "Días de crédito",
  documentoId: "Documento",
  sku: "Código de producto",
  descripcion: "Descripción",
  cantidad: "Cantidad",
  precioUnitario: "Precio unitario",
  costoUnitario: "Costo unitario",
  descuentoPct: "Descuento (%)",
  total: "Total de la línea",
  bodega: "Bodega",
  motivo: "Motivo",
  monto: "Monto",
  debito: "Débito",
  credito: "Crédito",
  saldo: "Saldo",
  cuenta: "Cuenta bancaria",
  documentoConciliadoId: "Documento conciliado",
  categoria: "Categoría",
  costoPromedio: "Costo promedio",
  stockActual: "Existencia",
  inventariable: "Maneja inventario",
  parametro: "Parámetro",
  valor: "Valor",
};

export const ETIQUETA_TABLA: Record<string, string> = {
  terceros: "Terceros",
  cambiosTercero: "Cambios en terceros",
  documentos: "Documentos",
  lineas: "Líneas de detalle",
  inventario: "Movimientos de inventario",
  banco: "Extracto bancario",
  items: "Catálogo de productos",
  politicas: "Políticas de la empresa",
};

export const ETIQUETA_RAZON: Record<RazonMapeo, string> = {
  exacta: "coincidencia exacta",
  sinonimo: "sinónimo conocido",
  parecido: "por parecido",
  derivada: "derivada",
  ignorada: "no se usa",
  sin_mapeo: "sin equivalente",
};

/** Aplana lo que devuelve `leerLibro` a la forma que pinta la pantalla. */
export function adaptarMapeos(hojas: readonly MapeoHoja[]): HojaMapeo[] {
  return hojas.map((h) => {
    const columnas: FilaMapeo[] = h.columnas.map((c) => ({
      encabezado: c.encabezado,
      letra: c.letra,
      campo: c.campo ?? "",
      etiqueta: c.campo ? (ETIQUETA_CAMPO[c.campo] ?? c.campo) : "",
      confianza: c.confianza,
      razon: c.razon,
      porque: c.porque,
    }));

    // Las columnas que el ERP trae y el esquema no necesita no bajan la nota de
    // la hoja: que sobre una columna no es un problema de reconocimiento.
    const usadas = columnas.filter((c) => c.campo);
    return {
      archivo: h.archivo,
      hoja: h.hoja,
      tabla: h.tabla ? (ETIQUETA_TABLA[h.tabla] ?? h.tabla) : "",
      columnas,
      minima: usadas.length ? Math.min(...usadas.map((c) => c.confianza)) : 1,
    };
  });
}
