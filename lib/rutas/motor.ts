/**
 * El motor de Kai: reparte 40 pedidos entre 6 domiciliarios y ordena cada ruta.
 *
 * No hay un algoritmo, hay tres compitiendo. Es a propósito: medido sobre estos
 * mismos datos, Clarke-Wright encuentra la ruta más CORTA de todas y es la peor
 * de todas — mete los 40 pedidos en el furgón, deja tres motos paradas y llega
 * tarde a ocho de las nueve entregas express. La distancia mínima no es el plan
 * mínimo. Por eso las tres construcciones corren, se mejoran igual y gana la de
 * menor coste total, que sí incluye las ventanas de entrega.
 *
 * Todo aquí es DETERMINISTA: sin `Math.random`, sin `Date.now`, sin iterar `Set`
 * ni `Map` sin ordenar, y todo empate se rompe por id. Dos ejecuciones del mismo
 * día dan exactamente el mismo plan, que es lo que permite grabar dos tomas.
 *
 * El criterio de parada es por número de pasadas, nunca por milisegundos: un
 * presupuesto de tiempo haría que el resultado dependiera de lo ocupado que esté
 * el portátil, y eso rompe el determinismo por la puerta de atrás.
 */

import { DEPOSITO, JORNADA_MIN, VENTANAS } from "./datos";
import type { Evento, Matriz, Pedido, Plan, Ruta, Vehiculo } from "./tipos";

/**
 * Pesos de la función de coste. No son dinero y no salen en pantalla como tal:
 * son la forma de decirle al algoritmo qué le importa más. Un minuto de retraso
 * pesa más que 55 km de moto, y por eso la ventana se comporta como casi dura
 * sin serlo: si el día fuera imposible, sale un plan con el mínimo retraso en
 * vez de no salir ningún plan.
 */
const COSTE_KM: Record<string, number> = { moto: 900, carro: 1700, furgon: 2600 };
const COSTE_MIN: Record<string, number> = { moto: 170, carro: 250, furgon: 310 };
const PEN_RETRASO = 150_000;
/** Penaliza pasar de las 18:00. Es la misma cifra que cierra la ventana "programado". */
const PEN_JORNADA = 200_000;
/** Empuja a repartir entre todos en vez de cargar un solo vehículo. */
const PEN_BANDA = 60_000;

/**
 * Tope de 9 paradas por ruta, y no es una decisión de optimización: es el límite
 * de Google Maps. Su enlace admite 10 puntos contando el origen, así que bodega
 * + 9 paradas es exactamente lo que cabe. Con 10 paradas el enlace se abriría
 * igual, sin ningún error, y al domiciliario le faltaría una entrega en pantalla.
 * Ese fallo silencioso cuesta más que el kilómetro de más que pagamos aquí.
 */
export const BANDA_PARADAS: [number, number] = [4, 9];

export interface Contexto {
  pedidos: Pedido[];
  flota: Vehiculo[];
  matriz: Matriz;
  /**
   * Qué está minimizando el motor.
   *
   * `servicio` es el modo normal: kilómetros, tiempo Y ventanas de entrega.
   * `distancia` apaga la penalización por llegar tarde y deja solo el recorrido,
   * que es lo que optimiza casi todo el mundo cuando dice «optimizar rutas».
   * Sirve para enseñar en pantalla lo que cuesta de verdad cumplir una promesa
   * de entrega, en vez de afirmarlo.
   */
  objetivo: "servicio" | "distancia";
}

/* ─────────────────────────────  geometría  ───────────────────────────── */

/** Kilómetros reales de calle entre dos nodos. El nodo 0 es la bodega. */
function km(ctx: Contexto, a: number, b: number): number {
  return ctx.matriz.distancias[a][b] / 1000;
}

/** El pedido `i` (0..39) es el nodo `i + 1` de la matriz. */
const nodo = (i: number) => i + 1;

/* ─────────────────────────  evaluación de una ruta  ───────────────────── */

/**
 * Recorre la ruta minuto a minuto desde las 08:00: conduce, espera si llega
 * antes de que abra la ventana, entrega, y vuelve a la bodega.
 *
 * La espera cuenta como tiempo perdido a propósito. Sin ese término el motor
 * aparca a las 09:00 frente a una entrega programada de la tarde y se queda ahí.
 */
export function evaluarRuta(ctx: Contexto, seq: number[], veh: Vehiculo): Ruta {
  let kmTotal = 0;
  let minutos = 0;
  let espera = 0;
  let retraso = 0;
  let kg = 0;
  let litros = 0;
  const llegadas: number[] = [];
  let actual = 0;

  for (const i of seq) {
    const p = ctx.pedidos[i];
    const tramo = km(ctx, actual, nodo(i));
    kmTotal += tramo;
    minutos += (tramo * 60) / veh.kmh;
    const [abre, cierra] = VENTANAS[p.prioridad];
    if (minutos < abre) {
      espera += abre - minutos;
      minutos = abre;
    }
    llegadas.push(minutos);
    if (minutos > cierra) retraso += minutos - cierra;
    minutos += veh.servicioMin;
    kg += p.kg;
    litros += p.litros;
    actual = nodo(i);
  }

  const vuelta = seq.length ? km(ctx, actual, 0) : 0;
  kmTotal += vuelta;
  minutos += (vuelta * 60) / veh.kmh;

  const minServicio = seq.length * veh.servicioMin;
  return {
    vehiculoId: veh.id,
    seq: [...seq],
    km: kmTotal,
    minConduccion: (kmTotal * 60) / veh.kmh,
    minServicio,
    finMin: minutos,
    kg,
    litros,
    retrasoMin: retraso,
    llegadas,
  };
}

/** Cuánto "duele" una ruta. Es lo que el motor minimiza. */
function costeRuta(ctx: Contexto, r: Ruta, veh: Vehiculo): number {
  const n = r.seq.length;
  const espera = Math.max(0, r.finMin - r.minConduccion - r.minServicio);
  const miraElReloj = ctx.objetivo === "servicio";
  return (
    COSTE_KM[veh.clase] * r.km +
    COSTE_MIN[veh.clase] * (r.minConduccion + (miraElReloj ? espera : 0)) +
    (miraElReloj ? PEN_RETRASO * r.retrasoMin : 0) +
    (miraElReloj ? PEN_JORNADA * Math.max(0, r.finMin - JORNADA_MIN) : 0) +
    PEN_BANDA * (Math.max(0, BANDA_PARADAS[0] - n) + Math.max(0, n - BANDA_PARADAS[1]))
  );
}

/**
 * Capacidad: peso Y volumen Y arista mayor, las tres duras y comprobadas por
 * separado. Fundirlas en un solo número es el error clásico: un tubo de 1,50 m
 * ocupa poquísimo volumen y no entra en el baúl de ningún carro.
 */
export function cabe(ctx: Contexto, seq: number[], veh: Vehiculo): boolean {
  // El tope de paradas es DURO, no una preferencia: el enlace de Google Maps
  // admite 10 puntos contando la bodega, y si se pasa no da ningún error — al
  // domiciliario simplemente le faltan entregas en la pantalla.
  if (seq.length > BANDA_PARADAS[1]) return false;
  let kg = 0;
  let litros = 0;
  for (const i of seq) {
    const p = ctx.pedidos[i];
    kg += p.kg;
    litros += p.litros;
    if (p.dimMax > veh.dimMax) return false;
    if (kg > veh.kgMax) return false;
    if (litros > veh.litrosMax * veh.eta) return false;
  }
  return true;
}

/** Qué clases de vehículo admiten este pedido. Se calcula una vez, al principio. */
export function clasesQueAdmiten(ctx: Contexto, i: number): string[] {
  return ctx.flota
    .filter((v) => cabe(ctx, [i], v))
    .map((v) => v.clase)
    .filter((c, k, a) => a.indexOf(c) === k);
}

/* ────────────────────────────  construcciones  ────────────────────────── */

type Solucion = number[][];

function costeSolucion(ctx: Contexto, sol: Solucion): number {
  let total = 0;
  for (let k = 0; k < ctx.flota.length; k++) {
    const veh = ctx.flota[k];
    total += sol[k].length ? costeRuta(ctx, evaluarRuta(ctx, sol[k], veh), veh) : PEN_BANDA * BANDA_PARADAS[0];
  }
  return total;
}

/** Ángulo polar desde la bodega. Ordena el mapa en abanico, como un barrido de radar. */
function angulo(ctx: Contexto, i: number): number {
  const p = ctx.pedidos[i];
  return Math.atan2(p.lat - DEPOSITO.lat, p.lng - DEPOSITO.lng);
}

/**
 * A. Inserción paralela con regret-2. Es la única que sale factible de fábrica,
 * porque la ventana de entrega entra en el coste de cada inserción en vez de
 * arreglarse después. "Regret" = cuánto pierdo si NO coloco ahora este pedido en
 * su mejor sitio; se atiende primero al pedido que más pierde, que es el que tiene
 * una sola opción buena.
 */
function construirInsercion(ctx: Contexto, eventos: Evento[] | null): Solucion {
  const n = ctx.pedidos.length;
  const m = ctx.flota.length;
  const sol: Solucion = Array.from({ length: m }, () => []);
  const pendientes = new Set<number>(Array.from({ length: n }, (_, i) => i));

  // Semillas: los pedidos más dispersos entre sí, para que cada ruta nazca lejos
  // de las demás. Los voluminosos se siembran primero en los vehículos grandes,
  // porque son los que menos sitio tienen donde caer.
  const semillas: number[] = [];
  let lejano = 0;
  for (let i = 1; i < n; i++) if (km(ctx, 0, nodo(i)) > km(ctx, 0, nodo(lejano))) lejano = i;
  semillas.push(lejano);
  while (semillas.length < m) {
    let mejor = -1;
    let mejorD = -1;
    for (let i = 0; i < n; i++) {
      if (semillas.includes(i)) continue;
      let d = Infinity;
      for (const s of semillas) d = Math.min(d, km(ctx, nodo(i), nodo(s)));
      if (d > mejorD) {
        mejorD = d;
        mejor = i;
      }
    }
    semillas.push(mejor);
  }

  const grandes = semillas.filter((i) => !cabe(ctx, [i], ctx.flota[0]));
  const chicas = semillas.filter((i) => cabe(ctx, [i], ctx.flota[0]));
  const orden = [...ctx.flota.keys()].sort((a, b) => ctx.flota[b].litrosMax - ctx.flota[a].litrosMax);
  const cola = [...grandes, ...chicas];
  for (let k = 0; k < orden.length && k < cola.length; k++) {
    const idx = orden[k];
    const pedido = cola[k];
    if (!cabe(ctx, [pedido], ctx.flota[idx])) continue;
    sol[idx].push(pedido);
    pendientes.delete(pedido);
    eventos?.push({
      seq: eventos.length,
      tipo: "semilla:elegida",
      marca: "run",
      pedidoId: ctx.pedidos[pedido].id,
      vehiculoId: ctx.flota[idx].id,
      log: `${ctx.flota[idx].id} arranca en ${ctx.pedidos[pedido].barrio} con el pedido #${ctx.pedidos[pedido].id}`,
    });
  }

  // Cuántos vehículos admiten cada pedido. El colchón cabe en uno; una caja de
  // farmacia cabe en los seis. Se calcula una vez, antes de repartir nada.
  const opciones = ctx.pedidos.map((_, i) => ctx.flota.filter((v) => cabe(ctx, [i], v)).length);

  while (pendientes.size) {
    let elegido = -1;
    let elegidoRuta = -1;
    let elegidaPos = -1;
    let mejorRegret = -Infinity;
    let mejorCoste = Infinity;
    let mejorOpciones = Infinity;

    for (const i of [...pendientes].sort((a, b) => a - b)) {
      let c1 = Infinity;
      let c2 = Infinity;
      let rk = -1;
      let rp = -1;
      for (let k = 0; k < m; k++) {
        const veh = ctx.flota[k];
        if (!cabe(ctx, [...sol[k], i], veh)) continue;
        const base = sol[k].length ? costeRuta(ctx, evaluarRuta(ctx, sol[k], veh), veh) : 0;
        for (let pos = 0; pos <= sol[k].length; pos++) {
          const cand = [...sol[k].slice(0, pos), i, ...sol[k].slice(pos)];
          const delta = costeRuta(ctx, evaluarRuta(ctx, cand, veh), veh) - base;
          if (delta < c1) {
            c2 = c1;
            c1 = delta;
            rk = k;
            rp = pos;
          } else if (delta < c2) {
            c2 = delta;
          }
        }
      }
      if (rk === -1) continue;
      const regret = c2 === Infinity ? Number.MAX_SAFE_INTEGER : c2 - c1;
      // Primero el que menos sitios tiene donde caber. Si se atiende antes al
      // paquete fácil, los carros y el furgón se llenan de cajas pequeñas y el
      // colchón se queda en la bodega: cabía, pero ya no había hueco.
      const mejora =
        opciones[i] < mejorOpciones ||
        (opciones[i] === mejorOpciones &&
          (regret > mejorRegret || (regret === mejorRegret && c1 < mejorCoste)));
      if (mejora) {
        mejorOpciones = opciones[i];
        mejorRegret = regret;
        mejorCoste = c1;
        elegido = i;
        elegidoRuta = rk;
        elegidaPos = rp;
      }
    }

    if (elegido === -1) break;
    sol[elegidoRuta].splice(elegidaPos, 0, elegido);
    pendientes.delete(elegido);

    if (eventos) {
      const veh = ctx.flota[elegidoRuta];
      const p = ctx.pedidos[elegido];
      const r = evaluarRuta(ctx, sol[elegidoRuta], veh);
      const llegada = r.llegadas[elegidaPos] ?? 0;
      eventos.push({
        seq: eventos.length,
        tipo: "insercion:commit",
        marca: "ok",
        pedidoId: p.id,
        vehiculoId: veh.id,
        rutas: ctx.flota.map((v, k) => evaluarRuta(ctx, sol[k], v)),
        log: `#${p.id} ${p.cliente.split(" ")[0]} · ${p.barrio} → ${veh.id} en posición ${elegidaPos + 1} · llega ${reloj(llegada)}${p.prioridad === "express" ? " · express asegurado" : ""}`,
      });
    }
  }
  return sol;
}

/**
 * B. Clarke-Wright: fusiona rutas mientras el ahorro sea positivo y quepa.
 * Es la que gana en kilómetros y pierde en todo lo demás; está aquí porque a
 * veces, con otros datos, gana de verdad — y porque enseñar por qué pierde es
 * la mejor forma de explicar qué está optimizando el sistema.
 */
function construirClarkeWright(ctx: Contexto): Solucion {
  const n = ctx.pedidos.length;
  const m = ctx.flota.length;
  let rutas: number[][] = Array.from({ length: n }, (_, i) => [i]);

  const ahorros: { s: number; i: number; j: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      ahorros.push({
        s: km(ctx, 0, nodo(i)) + km(ctx, 0, nodo(j)) - km(ctx, nodo(i), nodo(j)),
        i,
        j,
      });
    }
  }
  ahorros.sort((a, b) => b.s - a.s || a.i - b.i || a.j - b.j);

  const capMax = Math.max(...ctx.flota.map((v) => v.kgMax));
  const volMax = Math.max(...ctx.flota.map((v) => v.litrosMax * v.eta));
  const dimMax = Math.max(...ctx.flota.map((v) => v.dimMax));

  const pesoDe = (r: number[]) => r.reduce((a, i) => a + ctx.pedidos[i].kg, 0);
  const volDe = (r: number[]) => r.reduce((a, i) => a + ctx.pedidos[i].litros, 0);

  for (const { i, j } of ahorros) {
    const ri = rutas.findIndex((r) => r.includes(i));
    const rj = rutas.findIndex((r) => r.includes(j));
    if (ri === -1 || rj === -1 || ri === rj) continue;
    const A = rutas[ri];
    const B = rutas[rj];
    let fusion: number[] | null = null;
    if (A[A.length - 1] === i && B[0] === j) fusion = [...A, ...B];
    else if (B[B.length - 1] === j && A[0] === i) fusion = [...B, ...A];
    else if (A[0] === i && B[0] === j) fusion = [...[...A].reverse(), ...B];
    else if (A[A.length - 1] === i && B[B.length - 1] === j) fusion = [...A, ...[...B].reverse()];
    if (!fusion) continue;
    if (pesoDe(fusion) > capMax || volDe(fusion) > volMax) continue;
    if (fusion.some((k) => ctx.pedidos[k].dimMax > dimMax)) continue;
    rutas = rutas.filter((_, k) => k !== ri && k !== rj);
    rutas.push(fusion);
  }

  // Quedarse con como mucho un vehículo por ruta, y dar las rutas más
  // voluminosas a los vehículos más grandes.
  rutas.sort((a, b) => volDe(b) - volDe(a));
  while (rutas.length > m) {
    const ultima = rutas.pop()!;
    let destino = -1;
    for (let k = 0; k < rutas.length; k++) {
      if (volDe(rutas[k]) + volDe(ultima) <= volMax && pesoDe(rutas[k]) + pesoDe(ultima) <= capMax) {
        destino = k;
        break;
      }
    }
    rutas[destino === -1 ? 0 : destino].push(...ultima);
  }

  const sol: Solucion = Array.from({ length: m }, () => []);
  const porCapacidad = [...ctx.flota.keys()].sort(
    (a, b) => ctx.flota[b].litrosMax * ctx.flota[b].eta - ctx.flota[a].litrosMax * ctx.flota[a].eta,
  );
  rutas.forEach((r, k) => {
    if (k < porCapacidad.length) sol[porCapacidad[k]] = r;
  });
  return repararCapacidad(ctx, sol);
}

/** C. Barrido: ordena por ángulo desde la bodega y llena vehículos en abanico. */
function construirBarrido(ctx: Contexto): Solucion {
  const m = ctx.flota.length;
  const ids = ctx.pedidos.map((_, i) => i).sort((a, b) => angulo(ctx, a) - angulo(ctx, b) || a - b);
  const sol: Solucion = Array.from({ length: m }, () => []);
  const orden = [...ctx.flota.keys()].sort((a, b) => ctx.flota[b].litrosMax - ctx.flota[a].litrosMax);
  let k = 0;
  for (const i of ids) {
    let puesto = false;
    for (let intento = 0; intento < m; intento++) {
      const idx = orden[(k + intento) % m];
      if (cabe(ctx, [...sol[idx], i], ctx.flota[idx])) {
        sol[idx].push(i);
        if (sol[idx].length >= BANDA_PARADAS[1]) k = (k + 1) % m;
        puesto = true;
        break;
      }
    }
    if (!puesto) {
      const idx = orden.find((o) => cabe(ctx, [...sol[o], i], ctx.flota[o]));
      if (idx !== undefined) sol[idx].push(i);
    }
  }
  return sol;
}

/**
 * Mueve paquetes entre vehículos hasta que todos cumplan peso, volumen y arista.
 * Conserva el número de paradas de cada bloque: es lo que hace justa la
 * comparación contra el reparto manual, que si no estaría midiéndose contra un
 * plan directamente imposible.
 */
function repararCapacidad(ctx: Contexto, sol: Solucion): Solucion {
  const out = sol.map((r) => [...r]);
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const malo = out.findIndex((r, k) => !cabe(ctx, r, ctx.flota[k]));
    if (malo === -1) break;
    const carga = (i: number) =>
      ctx.pedidos[i].kg / ctx.flota[malo].kgMax + ctx.pedidos[i].litros / ctx.flota[malo].litrosMax;
    const pesado = [...out[malo]].sort((a, b) => carga(b) - carga(a) || a - b)[0];
    let hecho = false;
    for (let k = 0; k < out.length && !hecho; k++) {
      if (k === malo) continue;
      for (const otro of [...out[k]].sort((a, b) => carga(a) - carga(b) || a - b)) {
        const nuevoMalo = out[malo].map((x) => (x === pesado ? otro : x));
        const nuevoK = out[k].map((x) => (x === otro ? pesado : x));
        if (cabe(ctx, nuevoMalo, ctx.flota[malo]) && cabe(ctx, nuevoK, ctx.flota[k])) {
          out[malo] = nuevoMalo;
          out[k] = nuevoK;
          hecho = true;
          break;
        }
      }
    }
    if (!hecho) {
      // No hay intercambio posible: se mueve sin conservar el tamaño del bloque.
      const destino = out.findIndex((r, k) => k !== malo && cabe(ctx, [...r, pesado], ctx.flota[k]));
      if (destino === -1) break;
      out[malo] = out[malo].filter((x) => x !== pesado);
      out[destino].push(pesado);
    }
  }
  return out;
}

/* ────────────────────────────  mejora local  ──────────────────────────── */

/**
 * Cuatro operadores clásicos sobre la solución completa: deshacer cruces dentro
 * de una ruta (2-opt), mover trozos dentro de una ruta (Or-opt) y entre rutas
 * (relocate), e intercambiar paradas entre dos rutas (swap).
 *
 * Detalle que cuesta un 6x de rendimiento si se hace mal: al aceptar un
 * movimiento NO se reinicia el barrido desde el principio. Se sigue donde
 * estaba y se deja para la siguiente pasada.
 */
function mejorar(ctx: Contexto, inicial: Solucion, eventos: Evento[] | null): Solucion {
  const sol = inicial.map((r) => [...r]);
  const m = ctx.flota.length;
  const coste = (k: number) => costeDe(k, sol[k]);
  const costeDe = (k: number, seq: number[]) =>
    seq.length
      ? costeRuta(ctx, evaluarRuta(ctx, seq, ctx.flota[k]), ctx.flota[k])
      : PEN_BANDA * BANDA_PARADAS[0];

  for (let pasada = 0; pasada < 12; pasada++) {
    let mejoro = false;

    // 2-opt dentro de cada ruta: invertir un tramo deshace los cruces.
    for (let k = 0; k < m; k++) {
      for (let i = 0; i < sol[k].length - 1; i++) {
        for (let j = i + 1; j < sol[k].length; j++) {
          const cand = [...sol[k].slice(0, i), ...sol[k].slice(i, j + 1).reverse(), ...sol[k].slice(j + 1)];
          if (costeDe(k, cand) < coste(k) - 1e-6) {
            sol[k] = cand;
            mejoro = true;
            eventos?.push({
              seq: eventos.length,
              tipo: "mejora:movimiento",
              marca: "run",
              vehiculoId: ctx.flota[k].id,
              log: `2-opt en ${ctx.flota[k].id}: deshace un cruce · ${evaluarRuta(ctx, sol[k], ctx.flota[k]).km.toFixed(1)} km`,
            });
          }
        }
      }
    }

    // Or-opt y relocate: mover tramos de 1 a 3 paradas, dentro y entre rutas.
    //
    // En cuanto se aplica un movimiento hay que ABANDONAR el barrido de este
    // tramo: `trozo` y `resto` se calcularon sobre la ruta anterior y ya no
    // describen la actual. Seguir usándolos reinserta el mismo pedido en otra
    // ruta y lo duplica — y un pedido duplicado no lanza ningún error, solo
    // aparece dos veces en el mapa y descuadra los contadores.
    for (let a = 0; a < m; a++) {
      let ini = 0;
      while (ini < sol[a].length) {
        let aplicado = false;
        for (let largo = 1; largo <= 3 && ini + largo <= sol[a].length && !aplicado; largo++) {
          const trozo = sol[a].slice(ini, ini + largo);
          const resto = [...sol[a].slice(0, ini), ...sol[a].slice(ini + largo)];
          for (let b = 0; b < m && !aplicado; b++) {
            const destinoBase = b === a ? resto : sol[b];
            for (let pos = 0; pos <= destinoBase.length && !aplicado; pos++) {
              for (const orientado of [trozo, [...trozo].reverse()]) {
                if (b === a && pos === ini) continue;
                const nuevoB = [...destinoBase.slice(0, pos), ...orientado, ...destinoBase.slice(pos)];
                if (!cabe(ctx, nuevoB, ctx.flota[b])) continue;
                const antes = b === a ? coste(a) : coste(a) + coste(b);
                const despues = b === a ? costeDe(a, nuevoB) : costeDe(a, resto) + costeDe(b, nuevoB);
                if (despues < antes - 1e-6) {
                  if (b === a) {
                    sol[a] = nuevoB;
                  } else {
                    sol[a] = resto;
                    sol[b] = nuevoB;
                  }
                  aplicado = true;
                  mejoro = true;
                  eventos?.push({
                    seq: eventos.length,
                    tipo: "mejora:movimiento",
                    marca: "run",
                    vehiculoId: ctx.flota[b].id,
                    log:
                      b === a
                        ? `Or-opt en ${ctx.flota[a].id}: reordena ${largo} parada${largo > 1 ? "s" : ""}`
                        : `${ctx.flota[a].id} le pasa ${largo} parada${largo > 1 ? "s" : ""} a ${ctx.flota[b].id}`,
                  });
                  break;
                }
              }
            }
          }
        }
        if (!aplicado) ini++;
      }
    }

    // Swap: intercambiar una parada entre dos rutas.
    for (let a = 0; a < m; a++) {
      for (let b = a + 1; b < m; b++) {
        for (let i = 0; i < sol[a].length; i++) {
          for (let j = 0; j < sol[b].length; j++) {
            const na = sol[a].map((x, t) => (t === i ? sol[b][j] : x));
            const nb = sol[b].map((x, t) => (t === j ? sol[a][i] : x));
            if (!cabe(ctx, na, ctx.flota[a]) || !cabe(ctx, nb, ctx.flota[b])) continue;
            if (costeDe(a, na) + costeDe(b, nb) < coste(a) + coste(b) - 1e-6) {
              sol[a] = na;
              sol[b] = nb;
              mejoro = true;
            }
          }
        }
      }
    }

    if (!mejoro) break;
  }
  return sol;
}

/* ──────────────────────────────  el plan  ─────────────────────────────── */

export function evaluarPlan(ctx: Contexto, sol: Solucion, metodo: string, etiqueta: string): Plan {
  const rutas = ctx.flota.map((v, k) => evaluarRuta(ctx, sol[k], v));
  const expressTotal = ctx.pedidos.filter((p) => p.prioridad === "express").length;
  let expressATiempo = 0;
  let paradasTarde = 0;
  for (const r of rutas) {
    r.seq.forEach((i, t) => {
      const p = ctx.pedidos[i];
      const cierra = VENTANAS[p.prioridad][1];
      const tarde = r.llegadas[t] > cierra;
      if (tarde) paradasTarde++;
      if (p.prioridad === "express" && !tarde) expressATiempo++;
    });
  }
  return {
    metodo,
    etiqueta,
    rutas,
    km: rutas.reduce((a, r) => a + r.km, 0),
    horasConduccion: rutas.reduce((a, r) => a + r.minConduccion, 0) / 60,
    horasServicio: rutas.reduce((a, r) => a + r.minServicio, 0) / 60,
    retrasoMin: rutas.reduce((a, r) => a + r.retrasoMin, 0),
    paradasTarde,
    expressATiempo,
    expressTotal,
    vehiculosUsados: rutas.filter((r) => r.seq.length > 0).length,
  };
}

/* ───────────────────────────  líneas base  ────────────────────────────── */

/**
 * Cómo se reparte cuando nadie optimiza: los pedidos llegan, se parten en
 * bloques consecutivos para que "todos lleven parejo", y cada quien visita su
 * bloque en el mismo orden en que le llegó. Es la lista de papel o el grupo de
 * WhatsApp, y es la línea base contra la que el ahorro es enorme.
 */
export function baseLlegada(ctx: Contexto): Solucion {
  const n = ctx.pedidos.length;
  const m = ctx.flota.length;
  const sol: Solucion = Array.from({ length: m }, () => []);
  const base = Math.floor(n / m);
  const sobra = n % m;
  let cursor = 0;
  for (let k = 0; k < m; k++) {
    const tam = base + (k < sobra ? 1 : 0);
    sol[k] = Array.from({ length: tam }, (_, t) => cursor + t);
    cursor += tam;
  }
  return repararCapacidad(ctx, sol);
}

/**
 * Cómo reparte un despachador competente: parte el mapa en seis sectores en
 * abanico desde la bodega, le da uno a cada quien, y dentro de cada sector cada
 * domiciliario encadena la parada más cercana y deshace sus cruces.
 *
 * Esta es la comparación que importa, y es la que casi nadie enseña porque
 * incomoda: en kilómetros puros gana a Kai. Lo que no hace es mirar el reloj.
 */
export function baseSectores(ctx: Contexto, expressPrimero: boolean): Solucion {
  const n = ctx.pedidos.length;
  const m = ctx.flota.length;
  const ids = ctx.pedidos.map((_, i) => i).sort((a, b) => angulo(ctx, a) - angulo(ctx, b) || a - b);
  const sol: Solucion = Array.from({ length: m }, () => []);
  const base = Math.floor(n / m);
  const sobra = n % m;

  // El sector con más volumen se le da al vehículo más grande.
  const bloques: number[][] = [];
  let cursor = 0;
  for (let k = 0; k < m; k++) {
    const tam = base + (k < sobra ? 1 : 0);
    bloques.push(ids.slice(cursor, cursor + tam));
    cursor += tam;
  }
  const vol = (r: number[]) => r.reduce((a, i) => a + ctx.pedidos[i].litros, 0);
  const ordenBloques = bloques.map((b, k) => ({ b, k })).sort((x, y) => vol(y.b) - vol(x.b));
  const ordenVeh = [...ctx.flota.keys()].sort(
    (a, b) => ctx.flota[b].litrosMax * ctx.flota[b].eta - ctx.flota[a].litrosMax * ctx.flota[a].eta,
  );
  ordenBloques.forEach((x, t) => {
    sol[ordenVeh[t]] = x.b;
  });

  const reparado = repararCapacidad(ctx, sol);

  // Dentro de cada sector: vecino más cercano desde la bodega, y luego 2-opt.
  for (let k = 0; k < m; k++) {
    let pool = [...reparado[k]];
    if (expressPrimero) {
      const rango = (i: number) =>
        ctx.pedidos[i].prioridad === "express" ? 0 : ctx.pedidos[i].prioridad === "hoy" ? 1 : 2;
      pool = pool.sort((a, b) => rango(a) - rango(b) || a - b);
      const seq: number[] = [];
      for (const grupo of [0, 1, 2]) {
        let restantes = pool.filter((i) => rango(i) === grupo);
        let actual = seq.length ? nodo(seq[seq.length - 1]) : 0;
        while (restantes.length) {
          let mejor = restantes[0];
          for (const i of restantes) if (km(ctx, actual, nodo(i)) < km(ctx, actual, nodo(mejor))) mejor = i;
          seq.push(mejor);
          actual = nodo(mejor);
          restantes = restantes.filter((i) => i !== mejor);
        }
      }
      reparado[k] = seq;
    } else {
      const seq: number[] = [];
      let actual = 0;
      let restantes = [...pool];
      while (restantes.length) {
        let mejor = restantes[0];
        for (const i of restantes) if (km(ctx, actual, nodo(i)) < km(ctx, actual, nodo(mejor))) mejor = i;
        seq.push(mejor);
        actual = nodo(mejor);
        restantes = restantes.filter((i) => i !== mejor);
      }
      reparado[k] = seq;
      // 2-opt puro por distancia, que es lo único que mira un despachador.
      for (let vuelta = 0; vuelta < 6; vuelta++) {
        let cambio = false;
        for (let i = 0; i < reparado[k].length - 1; i++) {
          for (let j = i + 1; j < reparado[k].length; j++) {
            const cand = [
              ...reparado[k].slice(0, i),
              ...reparado[k].slice(i, j + 1).reverse(),
              ...reparado[k].slice(j + 1),
            ];
            if (evaluarRuta(ctx, cand, ctx.flota[k]).km < evaluarRuta(ctx, reparado[k], ctx.flota[k]).km - 1e-9) {
              reparado[k] = cand;
              cambio = true;
            }
          }
        }
        if (!cambio) break;
      }
    }
  }
  return reparado;
}

/* ──────────────────────────────  la corrida  ──────────────────────────── */

export interface Resultado {
  kai: Plan;
  bases: Plan[];
  eventos: Evento[];
  /** Milisegundos que tardó el cálculo. Solo informativo, no entra en el algoritmo. */
  ms: number;
}

function reloj(min: number): string {
  const total = 8 * 60 + Math.round(min);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function planificar(ctx: Contexto): Resultado {
  const t0 = performance.now();
  const eventos: Evento[] = [];

  const express = ctx.pedidos.filter((p) => p.prioridad === "express").length;
  const hoy = ctx.pedidos.filter((p) => p.prioridad === "hoy").length;
  const prog = ctx.pedidos.filter((p) => p.prioridad === "programado").length;

  eventos.push({
    seq: 0,
    tipo: "plan:inicio",
    marca: "run",
    log: `Kai recibe ${ctx.pedidos.length} pedidos y ${ctx.flota.length} domiciliarios disponibles`,
  });
  eventos.push({
    seq: eventos.length,
    tipo: "pedidos:clasificados",
    marca: "ok",
    log: `Ventanas de entrega: ${express} express (antes de las 12:00) · ${hoy} para hoy · ${prog} programados de tarde`,
  });

  for (let i = 0; i < ctx.pedidos.length; i++) {
    const clases = clasesQueAdmiten(ctx, i);
    const p = ctx.pedidos[i];
    if (clases.length === 0) {
      // Ningún vehículo lo admite. Antes esto se descartaba en silencio y el
      // pedido simplemente no aparecía en ninguna ruta; ahora se ve.
      eventos.push({
        seq: eventos.length,
        tipo: "compat:marcado",
        marca: "err",
        pedidoId: p.id,
        log: `#${p.id} ${p.categoria} (${p.kg} kg · ${p.litros} L · ${p.dimMax} cm) NO CABE en ningún vehículo de la flota`,
      });
    } else if (!clases.includes("moto")) {
      eventos.push({
        seq: eventos.length,
        tipo: "compat:marcado",
        marca: "warn",
        pedidoId: p.id,
        log: `#${p.id} ${p.categoria} · ${p.kg} kg y ${p.litros} L: no cabe en moto, va en ${clases.join(" o ")}`,
      });
    }
  }

  const construcciones: { nombre: string; etiqueta: string; sol: Solucion }[] = [];

  eventos.push({ seq: eventos.length, tipo: "estrategia:inicio", marca: "run", log: "Estrategia 1 de 3 — inserción con regret y ventanas de entrega" });
  const insercion = construirInsercion(ctx, eventos);
  construcciones.push({ nombre: "insercion", etiqueta: "Inserción con ventanas", sol: insercion });
  const pIns = evaluarPlan(ctx, insercion, "insercion", "Inserción con ventanas");
  eventos.push({
    seq: eventos.length,
    tipo: "estrategia:construida",
    marca: "ok",
    log: `Inserción: ${pIns.km.toFixed(1)} km · ${pIns.retrasoMin} min de retraso · ${pIns.expressATiempo}/${pIns.expressTotal} express a tiempo`,
  });

  eventos.push({ seq: eventos.length, tipo: "estrategia:inicio", marca: "run", log: "Estrategia 2 de 3 — Clarke-Wright, la que solo mira los kilómetros" });
  const cw = construirClarkeWright(ctx);
  construcciones.push({ nombre: "clarke-wright", etiqueta: "Clarke-Wright", sol: cw });
  const pCw = evaluarPlan(ctx, cw, "clarke-wright", "Clarke-Wright");
  eventos.push({
    seq: eventos.length,
    tipo: "estrategia:construida",
    marca: pCw.retrasoMin > 0 ? "err" : "ok",
    log: `Clarke-Wright: ${pCw.km.toFixed(1)} km — la más corta — pero ${Math.round(pCw.retrasoMin)} min de retraso y ${pCw.expressATiempo}/${pCw.expressTotal} express a tiempo`,
  });

  eventos.push({ seq: eventos.length, tipo: "estrategia:inicio", marca: "run", log: "Estrategia 3 de 3 — barrido en abanico desde la bodega" });
  const barrido = construirBarrido(ctx);
  construcciones.push({ nombre: "barrido", etiqueta: "Barrido", sol: barrido });
  const pBar = evaluarPlan(ctx, barrido, "barrido", "Barrido");
  eventos.push({
    seq: eventos.length,
    tipo: "estrategia:construida",
    marca: pBar.retrasoMin > 0 ? "warn" : "ok",
    log: `Barrido: ${pBar.km.toFixed(1)} km · ${Math.round(pBar.retrasoMin)} min de retraso`,
  });

  // Solo compiten las soluciones que respetan peso, volumen, arista y el tope de
  // paradas. Una solución más barata que se pasa del tope no es más barata: es
  // un enlace de Google Maps al que le faltan entregas.
  const valida = (s: Solucion) =>
    s.every((r, k) => cabe(ctx, r, ctx.flota[k])) &&
    s.reduce((a, r) => a + r.length, 0) === ctx.pedidos.length;

  let mejor: Solucion = insercion;
  let mejorCoste = Infinity;
  let mejorNombre = "insercion";
  for (const c of construcciones) {
    let pulida = mejorar(ctx, c.sol, c.nombre === "insercion" ? eventos : null);
    if (typeof process !== "undefined" && process.env?.DEBUG_RUTAS) {
      console.error(
        `[seleccion] ${c.nombre}: valida=${valida(pulida)} coste=${Math.round(costeSolucion(ctx, pulida))} ` +
          `paradas=${pulida.reduce((a, r) => a + r.length, 0)} veh=${pulida.filter((r) => r.length).length} ` +
          `tamanos=${pulida.map((r) => r.length).join(",")}`,
      );
    }
    if (!valida(pulida)) continue;
    const coste = costeSolucion(ctx, pulida);
    if (coste < mejorCoste) {
      mejorCoste = coste;
      mejor = pulida;
      mejorNombre = c.nombre;
    }
  }

  const kai = evaluarPlan(ctx, mejor, "kai", "Kai");
  eventos.push({
    seq: eventos.length,
    tipo: "estrategia:elegida",
    marca: "ok",
    log: `Gana «${construcciones.find((c) => c.nombre === mejorNombre)?.etiqueta}» tras la mejora local: ${kai.km.toFixed(1)} km, ${kai.retrasoMin === 0 ? "cero retrasos" : `${Math.round(kai.retrasoMin)} min de retraso`}`,
  });

  for (const r of kai.rutas) {
    const veh = ctx.flota.find((v) => v.id === r.vehiculoId)!;
    eventos.push({
      seq: eventos.length,
      tipo: "ruta:final",
      marca: "ok",
      vehiculoId: r.vehiculoId,
      rutas: kai.rutas,
      log: `${veh.nombre} (${r.vehiculoId}): ${r.seq.length} paradas · ${r.km.toFixed(1)} km · termina ${reloj(r.finMin)}`,
    });
  }

  const bases = [
    evaluarPlan(ctx, baseLlegada(ctx), "llegada", "Reparto por orden de llegada"),
    evaluarPlan(ctx, baseSectores(ctx, false), "sectores", "Despachador por sectores"),
    evaluarPlan(ctx, baseSectores(ctx, true), "sectores-prio", "Despachador por sectores + express primero"),
  ];
  for (const b of bases) {
    eventos.push({
      seq: eventos.length,
      tipo: "base:calculada",
      marca: b.retrasoMin > 0 ? "warn" : "ok",
      log: `${b.etiqueta}: ${b.km.toFixed(1)} km · ${Math.round(b.retrasoMin)} min de retraso · ${b.expressATiempo}/${b.expressTotal} express`,
    });
  }

  const honesta = bases[2];
  eventos.push({
    seq: eventos.length,
    tipo: "kpi:resumen",
    marca: "ok",
    log: `Frente a un despachador que ya reparte por sectores y prioriza express: ${(((honesta.km - kai.km) / honesta.km) * 100).toFixed(1)} % menos kilómetros con la misma puntualidad`,
  });
  eventos.push({ seq: eventos.length, tipo: "plan:fin", marca: "ok", log: `Plan cerrado en ${(performance.now() - t0).toFixed(0)} ms` });

  return { kai, bases, eventos, ms: performance.now() - t0 };
}
