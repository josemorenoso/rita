/**
 * Tipos del planificador de rutas de Kai (log-01).
 *
 * Las unidades van en el nombre o en el comentario porque aquí se mezclan
 * metros, kilómetros, minutos y segundos, y confundirlas no lanza ningún error:
 * solo produce una ruta absurda que nadie sabe explicar.
 */

/** Ventana de entrega. Los minutos son desde las 08:00 (t=0). */
export type Prioridad = "express" | "hoy" | "programado";

export type Clase = "moto" | "carro" | "furgon";

export interface Pedido {
  /** 1..40. Es también el orden de llegada del pedido, que usa la línea base. */
  id: number;
  cliente: string;
  /** Nombre real de la vía, tal y como lo devuelve OpenStreetMap. */
  via: string;
  /** La placa colombiana: "# 44 - 27". El primer número es la vía perpendicular. */
  placa: string;
  barrio: string;
  lat: number;
  lng: number;
  kg: number;
  litros: number;
  /** Arista mayor del paquete en cm. Un tubo cabe en volumen y no cabe en el baúl. */
  dimMax: number;
  categoria: string;
  prioridad: Prioridad;
}

export interface Vehiculo {
  /** "MOTO-1", "FURGON-1"… Se usa como etiqueta en la UI. */
  id: string;
  nombre: string;
  clase: Clase;
  /** Placa real colombiana, solo para el aviso de pico y placa. */
  placa: string;
  kgMax: number;
  litrosMax: number;
  /** Factor de aprovechamiento: las cajas no teselan, 90 L de baúl no admiten 90 L de cajas. */
  eta: number;
  dimMax: number;
  kmh: number;
  /** Minutos por parada, incluyendo aparcar y caminar hasta la puerta. */
  servicioMin: number;
}

export interface Deposito {
  nombre: string;
  via: string;
  placa: string;
  barrio: string;
  lat: number;
  lng: number;
}

/** Una ruta ya resuelta: qué vehículo, qué pedidos y en qué orden. */
export interface Ruta {
  vehiculoId: string;
  /** Índices de pedido (id − 1) en el orden en que se visitan. */
  seq: number[];
  km: number;
  /** Minutos de conducción, sin contar el servicio en cada parada. */
  minConduccion: number;
  minServicio: number;
  /** Minuto (desde las 08:00) en que el vehículo vuelve al depósito. */
  finMin: number;
  kg: number;
  litros: number;
  /** Minutos de retraso acumulados sobre las ventanas de entrega. */
  retrasoMin: number;
  /** Hora de llegada a cada parada, en minutos desde las 08:00. */
  llegadas: number[];
}

export interface Plan {
  /** Identificador del método: "kai", "llegada", "sectores", "sectores-prio". */
  metodo: string;
  etiqueta: string;
  rutas: Ruta[];
  km: number;
  horasConduccion: number;
  horasServicio: number;
  retrasoMin: number;
  paradasTarde: number;
  expressATiempo: number;
  expressTotal: number;
  vehiculosUsados: number;
}

/** Matriz real de calle, congelada desde OSRM en tiempo de build. */
export interface Matriz {
  /** distancias[i][j] en METROS. El índice 0 es el depósito. */
  distancias: number[][];
  /** duraciones[i][j] en SEGUNDOS, en coche y sin tráfico. */
  duraciones: number[][];
  fuente: "osrm" | "estimada";
  generada: string;
}

/** Un paso del razonamiento, para narrarlo en pantalla. */
export interface Evento {
  seq: number;
  tipo:
    | "plan:inicio"
    | "pedidos:clasificados"
    | "compat:marcado"
    | "estrategia:inicio"
    | "semilla:elegida"
    | "insercion:commit"
    | "estrategia:construida"
    | "mejora:movimiento"
    | "estrategia:elegida"
    | "ruta:final"
    | "base:calculada"
    | "kpi:resumen"
    | "plan:fin";
  /** Texto ya redactado en español, listo para la consola en directo. */
  log: string;
  marca: "run" | "ok" | "warn" | "err";
  pedidoId?: number;
  vehiculoId?: string;
  /** Estado de las rutas tras este evento, solo en los eventos que las cambian. */
  rutas?: Ruta[];
}
