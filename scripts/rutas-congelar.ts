/**
 * Congela el día de reparto: genera los 40 pedidos, los pega a calles reales de
 * Medellín, pide UNA matriz de distancias de verdad y guarda las geometrías de
 * cada ruta dibujadas sobre el callejero.
 *
 * Por qué congelar en vez de llamar a la API cuando alguien abre la página:
 *
 *  1. El vídeo se graba en varias tomas. Si la matriz cambia entre tomas, la
 *     ruta cambia, y los números de la pantalla dejan de cuadrar con lo que se
 *     acaba de decir en voz alta.
 *  2. El servidor público de OSRM no garantiza ni disponibilidad ni latencia, y
 *     pide como mucho una petición por segundo. Depender de él en directo es
 *     apostar la grabación a un servicio gratuito de terceros.
 *  3. Congelado, la página no hace NINGUNA llamada de red. Abre al instante.
 *
 * Se ejecuta a mano, no en cada build:
 *   node --import ./scripts/resolver-ts.mjs scripts/rutas-congelar.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BARRIOS,
  CATEGORIAS,
  CATEGORIAS_VOLUMINOSAS,
  DEPOSITO,
  FLOTA,
  NOMBRES,
} from "../lib/rutas/datos";
import { baseLlegada, baseSectores, evaluarPlan, planificar, type Contexto } from "../lib/rutas/motor";
import type { Matriz, Pedido, Prioridad } from "../lib/rutas/tipos";

const SALIDA = join(process.cwd(), "lib", "rutas");
const UA = "AIOS-Simulation/1.0 (simulacion de reparto; contacto: molun.store1@gmail.com)";

/** Espejos verificados. El segundo es el de FOSSGIS, misma API y misma cobertura. */
const OSRM = ["https://router.project-osrm.org", "https://routing.openstreetmap.de/routed-car"];

/** La política del servidor público pide una petición por segundo como máximo. */
const PAUSA_MS = 1_100;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Generador determinista. Sin esto, cada corrida daría otro día de reparto. */
function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260901);

/** Box-Muller: dispersa los pedidos alrededor del centro del barrio, no en un anillo. */
function gauss(): number {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

const entre = (a: number, b: number) => a + rnd() * (b - a);
const redondea = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Nueve express, cinco programados de tarde, el resto para hoy. */
const EXPRESS = new Set([1, 5, 9, 13, 18, 22, 27, 31, 36]);
const PROGRAMADO = new Set([3, 11, 20, 29, 38]);
/** Los cuatro que no caben en una moto. Son los que obligan a tener flota mixta. */
const VOLUMINOSOS = [6, 15, 24, 33];

async function osrm(ruta: string): Promise<Record<string, unknown>> {
  let ultimo: unknown = null;
  for (const base of OSRM) {
    try {
      const res = await fetch(base + ruta, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      const tipo = res.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) throw new Error(`respuesta no JSON (${res.status}) de ${base}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (json.code !== "Ok") throw new Error(`${json.code}: ${json.message}`);
      return json;
    } catch (err) {
      ultimo = err;
      console.warn(`  ! ${base} falló: ${(err as Error).message}`);
    }
  }
  throw ultimo;
}

/* ─────────────────────────  1. generar los pedidos  ───────────────────── */

function elegirBarrio() {
  const total = BARRIOS.reduce((a, b) => a + b.peso, 0);
  let t = rnd() * total;
  for (const b of BARRIOS) {
    t -= b.peso;
    if (t <= 0) return b;
  }
  return BARRIOS[0];
}

function generarPedidos(): Pedido[] {
  const pedidos: Pedido[] = [];
  for (let i = 0; i < 40; i++) {
    const barrio = elegirBarrio();
    const esVoluminoso = VOLUMINOSOS.includes(i);
    const cat = esVoluminoso
      ? CATEGORIAS_VOLUMINOSAS[VOLUMINOSOS.indexOf(i)]
      : CATEGORIAS[Math.floor(rnd() * CATEGORIAS.length)];
    const prioridad: Prioridad = EXPRESS.has(i) ? "express" : PROGRAMADO.has(i) ? "programado" : "hoy";
    pedidos.push({
      id: i + 1,
      cliente: NOMBRES[i],
      via: "",
      placa: "",
      barrio: barrio.nombre,
      lat: barrio.lat + gauss() * barrio.sigma,
      lng: barrio.lng + gauss() * barrio.sigma,
      kg: redondea(entre(cat.kg[0], cat.kg[1])),
      litros: Math.round(entre(cat.litros[0], cat.litros[1])),
      dimMax: cat.dimMax,
      categoria: cat.nombre,
      prioridad,
    });
  }
  return pedidos;
}

/* ────────────────────  2. pegar cada punto a una calle  ───────────────── */

/**
 * OSRM devuelve el nombre real de la vía más cercana. Ese nombre es el que va en
 * la dirección: nada de calles inventadas.
 *
 * La placa sí se compone, respetando la regla que delata a las direcciones
 * falsas en Medellín: el número que sigue al # pertenece siempre a la familia
 * PERPENDICULAR. Si la vía es una Carrera, ese número es una Calle; si es una
 * Calle, es una Carrera.
 */
async function pegarACalles(pedidos: Pedido[]) {
  for (const p of pedidos) {
    const j = await osrm(`/nearest/v1/driving/${p.lng.toFixed(6)},${p.lat.toFixed(6)}?number=1`);
    const w = (j.waypoints as { location: [number, number]; name: string }[])[0];
    p.lng = w.location[0];
    p.lat = w.location[1];

    const barrio = BARRIOS.find((b) => b.nombre === p.barrio)!;
    const via = w.name && w.name.trim() ? w.name.trim() : `Carrera ${Math.round(entre(barrio.cra[0], barrio.cra[1]))}`;
    p.via = via;

    const esCarrera = /^(carrera|cra|transversal|diagonal|autopista|avenida)/i.test(via);
    const rango = esCarrera ? barrio.cll : barrio.cra;
    const perpendicular = Math.round(entre(rango[0], rango[1]));
    const sufijo = esCarrera && barrio.sur ? " Sur" : "";
    const numero = Math.round(entre(5, 240));
    p.placa = `# ${perpendicular}${sufijo} - ${String(numero).padStart(2, "0")}`;

    console.log(`  #${String(p.id).padStart(2)} ${p.barrio.padEnd(15)} ${via} ${p.placa}`);
    await dormir(PAUSA_MS);
  }
}

/* ───────────────────────  3. la matriz, una sola vez  ─────────────────── */

async function pedirMatriz(pedidos: Pedido[]): Promise<Matriz> {
  const coords = [DEPOSITO, ...pedidos].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const j = await osrm(`/table/v1/driving/${coords}?annotations=duration,distance`);
  const distancias = j.distances as (number | null)[][];
  const duraciones = j.durations as (number | null)[][];

  let nulos = 0;
  for (const fila of distancias) for (const c of fila) if (c === null) nulos++;
  if (nulos > 0) {
    // Un solo null se convierte en NaN, atraviesa todo el algoritmo sin lanzar
    // ninguna excepción y produce una ruta absurda que nadie sabe explicar.
    throw new Error(`La matriz trae ${nulos} celdas sin ruta. Revisa los puntos de ladera antes de seguir.`);
  }

  return {
    distancias: distancias as number[][],
    duraciones: duraciones as number[][],
    fuente: "osrm",
    generada: new Date().toISOString().slice(0, 10),
  };
}

/* ──────────────────  4. la geometría de cada ruta dibujada  ───────────── */

/**
 * Ramer-Douglas-Peucker: quita los puntos que no cambian la forma de la línea.
 *
 * OSRM devuelve la geometría a resolución de calle —más de mil puntos por ruta,
 * 715 KB en total— y a zoom 16 un píxel son 2,4 metros, así que la mitad de esos
 * puntos caen dentro del mismo píxel. Con una tolerancia de ~6 m la línea se ve
 * idéntica y el fichero baja a una fracción.
 */
function simplificar(puntos: [number, number][], epsilon = 0.00006): [number, number][] {
  if (puntos.length < 3) return puntos;
  let maxD = 0;
  let indice = 0;
  const [ax, ay] = puntos[0];
  const [bx, by] = puntos[puntos.length - 1];
  for (let i = 1; i < puntos.length - 1; i++) {
    const [px, py] = puntos[i];
    const dx = bx - ax;
    const dy = by - ay;
    const norma = Math.hypot(dx, dy);
    const d = norma === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / norma;
    if (d > maxD) {
      maxD = d;
      indice = i;
    }
  }
  if (maxD <= epsilon) return [puntos[0], puntos[puntos.length - 1]];
  return [
    ...simplificar(puntos.slice(0, indice + 1), epsilon).slice(0, -1),
    ...simplificar(puntos.slice(indice), epsilon),
  ];
}

async function pedirGeometria(pedidos: Pedido[], seq: number[]): Promise<[number, number][]> {
  if (!seq.length) return [];
  const puntos = [DEPOSITO, ...seq.map((i) => pedidos[i]), DEPOSITO];
  const coords = puntos.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const j = await osrm(`/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  const g = (j.routes as { geometry: { coordinates: [number, number][] } }[])[0].geometry;
  // OSRM devuelve [lon, lat]; el mapa trabaja en [lat, lng]. Invertir aquí, una
  // sola vez, evita el error más frecuente de todos: rutas en el océano Índico.
  const crudo = g.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  return simplificar(crudo).map(([lat, lng]) => [
    Math.round(lat * 1e5) / 1e5,
    Math.round(lng * 1e5) / 1e5,
  ] as [number, number]);
}

/* ──────────────────────────────  corrida  ─────────────────────────────── */

/**
 * Cada pedido tiene que aparecer exactamente una vez en el plan. Un pedido
 * duplicado por un bug de la mejora local no lanza ninguna excepción: sale dos
 * veces en el mapa y descuadra los contadores («10 de 9 express a tiempo»).
 * Por eso se comprueba aquí, donde todavía se puede parar.
 */
function comprobarCobertura(nombre: string, rutas: { seq: number[] }[], total: number) {
  const vistos = rutas.flatMap((r) => r.seq);
  const unicos = new Set(vistos);
  if (vistos.length !== total || unicos.size !== total) {
    const cuenta = new Map<number, number>();
    for (const i of vistos) cuenta.set(i, (cuenta.get(i) ?? 0) + 1);
    const dobles = [...cuenta.entries()].filter(([, n]) => n > 1).map(([i, n]) => `#${i + 1}×${n}`);
    const faltan = Array.from({ length: total }, (_, i) => i).filter((i) => !unicos.has(i));
    throw new Error(
      `El plan «${nombre}» no cubre los ${total} pedidos: ${vistos.length} asignaciones, ${unicos.size} únicos.` +
        (dobles.length ? ` Duplicados: ${dobles.join(", ")}.` : "") +
        (faltan.length ? ` Sin asignar: ${faltan.map((i) => `#${i + 1}`).join(", ")}.` : ""),
    );
  }
}

async function main() {
  const reusar = process.argv.includes("--reusar");
  console.log("1/4  Generando los 40 pedidos…");
  let pedidos = generarPedidos();
  const sinMoto = pedidos.filter((p) => p.kg > 20 || p.litros > 72 || p.dimMax > 45);
  console.log(`     ${sinMoto.length} pedidos no caben en moto: ${sinMoto.map((p) => `#${p.id} ${p.categoria}`).join(", ")}`);

  const ficheroPedidos = join(SALIDA, "pedidos.json");
  if (reusar && existsSync(ficheroPedidos)) {
    pedidos = JSON.parse(readFileSync(ficheroPedidos, "utf8")) as Pedido[];
    console.log(`2/4  Reutilizando las ${pedidos.length} direcciones ya geocodificadas (--reusar)`);
  } else {
    console.log("2/4  Pegando cada punto a una calle real (OSRM /nearest)…");
    await pegarACalles(pedidos);
  }

  const ficheroMatriz = join(SALIDA, "matriz.json");
  let matriz: Matriz;
  if (reusar && existsSync(ficheroMatriz)) {
    matriz = JSON.parse(readFileSync(ficheroMatriz, "utf8")) as Matriz;
    console.log("3/4  Reutilizando la matriz congelada (--reusar)");
  } else {
    console.log("3/4  Pidiendo la matriz 41x41 de distancias reales…");
    matriz = await pedirMatriz(pedidos);
    console.log(`     matriz lista, ${matriz.distancias.length}x${matriz.distancias[0].length}, sin celdas vacías`);
  }

  const ctx: Contexto = { pedidos, flota: FLOTA, matriz, objetivo: "servicio" };
  const cobertura = planificar(ctx);

  console.log("\n     PLAN            veh    km    h cond  retraso  express");
  const fila = (n: string, p: { vehiculosUsados: number; km: number; horasConduccion: number; retrasoMin: number; expressATiempo: number; expressTotal: number }) =>
    console.log(
      `     ${n.padEnd(15)} ${String(p.vehiculosUsados).padStart(2)}  ${p.km.toFixed(1).padStart(6)}  ${p.horasConduccion.toFixed(2).padStart(6)}  ${String(Math.round(p.retrasoMin)).padStart(6)}  ${p.expressATiempo}/${p.expressTotal}`,
    );
  comprobarCobertura("Kai cobertura", cobertura.kai.rutas, pedidos.length);
  for (const b of cobertura.bases) comprobarCobertura(b.etiqueta, b.rutas, pedidos.length);

  fila("Kai cobertura", cobertura.kai);
  for (const b of cobertura.bases) fila(b.etiqueta.slice(0, 15), b);

  const honesta = cobertura.bases[2];
  console.log(
    `\n     Ahorro honesto vs «${honesta.etiqueta}»: ${(((honesta.km - cobertura.kai.km) / honesta.km) * 100).toFixed(1)} % km · ` +
      `${(((honesta.horasConduccion - cobertura.kai.horasConduccion) / honesta.horasConduccion) * 100).toFixed(1)} % horas`,
  );
  console.log(`     Cálculo en ${cobertura.ms.toFixed(0)} ms`);

  console.log("\n4/4  Pidiendo la geometría de calle de cada ruta…");
  const geometrias: Record<string, [number, number][]> = {};
  const planes: { metodo: string; rutas: { vehiculoId: string; seq: number[] }[] }[] = [
    { metodo: "kai", rutas: cobertura.kai.rutas },
    { metodo: "llegada", rutas: evaluarPlan(ctx, baseLlegada(ctx), "llegada", "").rutas },
    { metodo: "sectores", rutas: evaluarPlan(ctx, baseSectores(ctx, false), "sectores", "").rutas },
    { metodo: "sectores-prio", rutas: evaluarPlan(ctx, baseSectores(ctx, true), "sectores-prio", "").rutas },
  ];
  for (const plan of planes) {
    for (const r of plan.rutas) {
      if (!r.seq.length) continue;
      geometrias[`${plan.metodo}:${r.vehiculoId}`] = await pedirGeometria(pedidos, r.seq);
      console.log(`     ${plan.metodo}:${r.vehiculoId} · ${geometrias[`${plan.metodo}:${r.vehiculoId}`].length} puntos`);
      await dormir(PAUSA_MS);
    }
  }

  writeFileSync(join(SALIDA, "pedidos.json"), JSON.stringify(pedidos, null, 2) + "\n");
  writeFileSync(join(SALIDA, "matriz.json"), JSON.stringify(matriz) + "\n");
  writeFileSync(join(SALIDA, "geometrias.json"), JSON.stringify(geometrias) + "\n");
  console.log("\nListo. pedidos.json, matriz.json y geometrias.json escritos en lib/rutas/.");
}

main().catch((err) => {
  console.error("\nFalló el congelado:", err);
  process.exit(1);
});
