"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import RouteMap from "./RouteMap";
import { CLASE_ETIQUETA, DEPOSITO, FLOTA, VENTANAS } from "@/lib/rutas/datos";
import { enlaceGoogleMaps } from "@/lib/rutas/gmaps";
import { planificar, type Contexto } from "@/lib/rutas/motor";
import PEDIDOS from "@/lib/rutas/pedidos.json";
import MATRIZ from "@/lib/rutas/matriz.json";
import GEOMETRIAS from "@/lib/rutas/geometrias.json";
import { dec, kg, km, litros, minLabel, pct, relojReparto } from "@/lib/format";
import type { Evento, Matriz, Pedido, Plan, Ruta } from "@/lib/rutas/tipos";

const pedidos = PEDIDOS as Pedido[];
const matriz = MATRIZ as Matriz;
// TypeScript lee el JSON como number[][] y no puede saber que cada par tiene
// exactamente dos elementos, así que la tupla se afirma aquí. El script de
// congelado es quien garantiza la forma.
const geometrias = GEOMETRIAS as unknown as Record<string, [number, number][]>;

/**
 * Un color por domiciliario, todos sacados de la paleta que ya usa la app: el
 * morado de Logística, el cian del bus, el verde, el ámbar, el rosa de Marketing
 * y un azul. Seis líneas que hay que distinguir de un vistazo sobre un mapa
 * oscuro, y ninguna inventada.
 */
const COLORES: Record<string, string> = {
  "MOTO-1": "#9b7bff",
  "MOTO-2": "#4de1ff",
  "MOTO-3": "#3fe38a",
  "CARRO-1": "#ffc24b",
  "CARRO-2": "#ff5fa2",
  "FURGON-1": "#7ca0ff",
};

const PRIORIDAD_ETIQUETA: Record<string, string> = {
  express: "Express",
  hoy: "Hoy",
  programado: "Tarde",
};

/** Milisegundos por evento a 1x. Con 75 eventos, el reparto dura unos 25 s. */
const MS_POR_EVENTO = 340;

type Fase = "inicial" | "repartiendo" | "listo";

export default function RoutePlanner() {
  // El plan se calcula UNA vez, de forma perezosa, y sobrevive a los remontajes
  // de StrictMode. Tarda unos 150 ms y es determinista, así que no hace falta
  // recalcularlo nunca.
  const [resultado] = useState(() => {
    const ctx: Contexto = { pedidos, flota: FLOTA, matriz, objetivo: "servicio" };
    return planificar(ctx);
  });

  const [fase, setFase] = useState<Fase>("inicial");
  const [cursor, setCursor] = useState(0);
  const [velocidad, setVelocidad] = useState(1);
  const [pausa, setPausa] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<number | null>(null);
  const [comparar, setComparar] = useState<string>("kai");
  /**
   * El plan se calcula también en el servidor al prerenderizar, y allí tarda un
   * tiempo distinto. Pintar esa cifra en el HTML rompe la hidratación, así que
   * solo se muestra la medición del navegador, que además es la que importa.
   */
  const [msCliente, setMsCliente] = useState<number | null>(null);
  useEffect(() => setMsCliente(resultado.ms), [resultado.ms]);

  const eventos = resultado.eventos;

  // Espejo de las props volátiles: así el bucle de reproducción no se
  // desmonta cada vez que cambia la velocidad o se pulsa pausa.
  const velRef = useRef(velocidad);
  velRef.current = velocidad;
  const pausaRef = useRef(pausa);
  pausaRef.current = pausa;

  useEffect(() => {
    if (fase !== "repartiendo") return;
    let vivo = true;
    let anterior = performance.now();
    let acumulado = 0;
    let frame = 0;

    const paso = (ahora: number) => {
      if (!vivo) return;
      frame = requestAnimationFrame(paso);
      const dt = Math.min(120, ahora - anterior);
      anterior = ahora;
      if (pausaRef.current) return;
      acumulado += dt * velRef.current;
      if (acumulado < MS_POR_EVENTO) return;
      acumulado = 0;
      setCursor((c) => {
        if (c + 1 >= eventos.length) {
          setFase("listo");
          return eventos.length;
        }
        return c + 1;
      });
    };

    frame = requestAnimationFrame(paso);
    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
    };
  }, [fase, eventos.length]);

  const arrancar = useCallback(() => {
    setCursor(0);
    setPausa(false);
    setSeleccion(null);
    setComparar("kai");
    setFase("repartiendo");
  }, []);

  const alFinal = useCallback(() => {
    setCursor(eventos.length);
    setFase("listo");
  }, [eventos.length]);

  /** Lo que se ha visto hasta el cursor: qué pedidos están repartidos y cómo van las rutas. */
  const { asignados, rutasVivas } = useMemo(() => {
    if (fase === "inicial") return { asignados: new Set<number>(), rutasVivas: rutasVacias() };
    if (fase === "listo") {
      return { asignados: new Set(pedidos.map((_, i) => i)), rutasVivas: resultado.kai.rutas };
    }
    const vistos = eventos.slice(0, cursor + 1);
    const set = new Set<number>();
    let rutas = rutasVacias();
    for (const e of vistos) {
      if (e.pedidoId && (e.tipo === "insercion:commit" || e.tipo === "semilla:elegida")) set.add(e.pedidoId - 1);
      if (e.rutas) rutas = e.rutas;
    }
    return { asignados: set, rutasVivas: rutas };
  }, [fase, cursor, eventos, resultado.kai.rutas]);

  const planes: Plan[] = useMemo(() => [resultado.kai, ...resultado.bases], [resultado]);
  const planComparado = planes.find((p) => p.metodo === comparar) ?? resultado.kai;
  const rutasEnMapa = fase === "listo" ? planComparado.rutas : rutasVivas;

  /** La línea base justa: mismos vehículos y misma puntualidad que Kai. */
  const honesta = resultado.bases.find((b) => b.metodo === "sectores-prio")!;
  const bruta = resultado.bases.find((b) => b.metodo === "llegada")!;
  const ahorroKm = ((honesta.km - resultado.kai.km) / honesta.km) * 100;
  const ahorroHoras = ((honesta.horasConduccion - resultado.kai.horasConduccion) / honesta.horasConduccion) * 100;
  const ahorroBruto = ((bruta.km - resultado.kai.km) / bruta.km) * 100;

  const vehiculoSeleccionado = seleccion ? FLOTA.find((v) => v.id === seleccion) : null;
  const rutaSeleccionada = seleccion ? rutasEnMapa.find((r) => r.vehiculoId === seleccion) : null;

  const consola = eventos.slice(Math.max(0, cursor - 13), cursor + 1).reverse();

  return (
    <div className="rutas" style={{ "--accent": "#9b7bff" } as React.CSSProperties}>
      <header className="rutas-top">
        <div className="rutas-marca">
          <h1>Kai · Planificador de rutas</h1>
          <p className="rutas-tagline">
            {pedidos.length} pedidos, {FLOTA.length} domiciliarios y un solo día en Medellín. Kilómetros reales de
            calle, no líneas rectas.
          </p>
        </div>

        <div className="rutas-controles">
          {fase === "inicial" ? (
            <button type="button" className="rutas-cta" onClick={arrancar}>
              Optimizar reparto
            </button>
          ) : (
            <>
              <button type="button" className="rutas-secundario" onClick={() => setPausa((p) => !p)}>
                {pausa ? "Seguir" : "Pausa"}
              </button>
              {[1, 2, 4].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`rutas-vel${velocidad === v ? " on" : ""}`}
                  onClick={() => setVelocidad(v)}
                >
                  {v}x
                </button>
              ))}
              {fase === "repartiendo" ? (
                <button type="button" className="rutas-secundario" onClick={alFinal}>
                  Saltar al final
                </button>
              ) : (
                <button type="button" className="rutas-secundario" onClick={arrancar}>
                  Repetir
                </button>
              )}
            </>
          )}
          <Link className="rutas-volver" href="/oficina">
            Ver la oficina
          </Link>
        </div>
      </header>

      <main className="rutas-stage">
        {/* ── Izquierda: los pedidos que entran ── */}
        <aside className="rutas-col rutas-col-pedidos">
          <div className="rutas-col-head">
            <span className="panel-label">
              Pedidos de hoy · {asignados.size}/{pedidos.length} repartidos
            </span>
          </div>
          <ol className="rutas-lista">
            {pedidos.map((p, i) => {
              const ruta = rutasEnMapa.find((r) => r.seq.includes(i));
              const puesto = asignados.has(i) && ruta;
              return (
                <li
                  key={p.id}
                  className={`rutas-pedido${puesto ? " puesto" : ""}${resaltado === i ? " sobre" : ""}`}
                  style={puesto ? ({ "--accent": COLORES[ruta.vehiculoId] } as React.CSSProperties) : undefined}
                  onMouseEnter={() => setResaltado(i)}
                  onMouseLeave={() => setResaltado(null)}
                >
                  <div className="rutas-pedido-top">
                    <strong>#{p.id}</strong>
                    <span className="rutas-pedido-cliente">{p.cliente}</span>
                    <span className={`rutas-tag rutas-tag-${p.prioridad}`}>{PRIORIDAD_ETIQUETA[p.prioridad]}</span>
                  </div>
                  <p className="rutas-pedido-dir">
                    {p.via} {p.placa}
                  </p>
                  <p className="rutas-pedido-meta">
                    {puesto ? <span className="rutas-pedido-veh">{ruta.vehiculoId}</span> : null}
                    {p.barrio} · {p.categoria} · {kg(p.kg)} · {litros(p.litros)}
                  </p>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* ── Centro: el mapa y la consola en directo ── */}
        <section className="rutas-centro">
          <RouteMap
            pedidos={pedidos}
            rutas={rutasEnMapa}
            geometrias={geometrias}
            metodo={fase === "listo" ? comparar : "kai"}
            colores={COLORES}
            seleccion={seleccion}
            asignados={asignados}
            resaltado={resaltado}
            onSeleccionar={setSeleccion}
          />

          <div className="rutas-consola">
            <div className="rutas-col-head">
              <span className="panel-label">
                <i className="dot" /> Razonamiento en directo
              </span>
            </div>
            <ul>
              {consola.map((e) => (
                <li key={e.seq} className={`rutas-linea rutas-linea-${e.marca}`}>
                  <span className="rutas-marca-linea">{MARCA[e.marca]}</span>
                  {e.log}
                </li>
              ))}
              {fase === "inicial" ? (
                <li className="rutas-linea rutas-linea-run">
                  <span className="rutas-marca-linea">▸</span>
                  {pedidos.length} pedidos en cola · pulsa «Optimizar reparto»
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        {/* ── Derecha: la flota, y la ficha del domiciliario que elijas ── */}
        <aside className="rutas-col rutas-col-flota">
          {vehiculoSeleccionado && rutaSeleccionada ? (
            <FichaDomiciliario
              onCerrar={() => setSeleccion(null)}
              color={COLORES[vehiculoSeleccionado.id]}
              nombre={vehiculoSeleccionado.nombre}
              id={vehiculoSeleccionado.id}
              clase={CLASE_ETIQUETA[vehiculoSeleccionado.clase]}
              placa={vehiculoSeleccionado.placa}
              kgMax={vehiculoSeleccionado.kgMax}
              litrosUtiles={vehiculoSeleccionado.litrosMax * vehiculoSeleccionado.eta}
              ruta={rutaSeleccionada}
              esMoto={vehiculoSeleccionado.clase === "moto"}
              onResaltar={setResaltado}
            />
          ) : (
            <>
              <div className="rutas-col-head">
                <span className="panel-label">Domiciliarios · toca uno para ver su ruta</span>
              </div>
              <ul className="rutas-flota-lista">
                {FLOTA.map((v) => {
                  const r = rutasEnMapa.find((x) => x.vehiculoId === v.id);
                  const carga = r ? Math.min(100, (r.litros / (v.litrosMax * v.eta)) * 100) : 0;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        className="rutas-domi"
                        style={{ "--accent": COLORES[v.id] } as React.CSSProperties}
                        onClick={() => setSeleccion(v.id)}
                      >
                        <span className="rutas-domi-top">
                          <i />
                          <strong>{v.nombre}</strong>
                          <span className="rutas-domi-id">{v.id}</span>
                        </span>
                        <span className="rutas-domi-meta">
                          {CLASE_ETIQUETA[v.clase]} · {r?.seq.length ?? 0} paradas · {km(r?.km ?? 0)}
                        </span>
                        <span className="rutas-barra">
                          <span style={{ width: `${carga}%` }} />
                        </span>
                        <span className="rutas-domi-pie">
                          {r?.seq.length
                            ? `${litros(r.litros)} de ${litros(Math.round(v.litrosMax * v.eta))} · termina ${relojReparto(r.finMin)}`
                            : "esperando carga"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>
      </main>

      {/* ── Abajo: el panel de optimización ── */}
      <section className={`rutas-panel${fase === "listo" ? " abierto" : ""}`}>
        <div className="rutas-kpis">
          <Kpi etiqueta="Pedidos despachados" valor={`${asignados.size}/${pedidos.length}`} pie="ninguno sin asignar" />
          <Kpi
            etiqueta="Kilómetros ahorrados"
            valor={km(honesta.km - resultado.kai.km)}
            pie={`${pct(ahorroKm)} frente a un despachador por sectores`}
            acento
          />
          <Kpi
            etiqueta="Horas de conducción ahorradas"
            valor={minLabel((honesta.horasConduccion - resultado.kai.horasConduccion) * 60)}
            pie={`${pct(ahorroHoras)} · ${minLabel(((honesta.horasConduccion - resultado.kai.horasConduccion) * 60) / FLOTA.length)} por domiciliario`}
            acento
          />
          <Kpi
            etiqueta="Entregas a tiempo"
            valor={`${resultado.kai.expressATiempo}/${resultado.kai.expressTotal}`}
            pie={`express · ${resultado.kai.paradasTarde} paradas fuera de ventana`}
          />
          <Kpi
            etiqueta="Tiempo de cálculo"
            valor={msCliente === null ? "—" : `${Math.round(msCliente)} ms`}
            pie="plan completo, en el navegador"
          />
        </div>

        <div className="rutas-tabla-wrap">
          <div className="rutas-col-head">
            <span className="panel-label">Frente a qué se compara · toca una fila para verla en el mapa</span>
          </div>
          <table className="rutas-tabla">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Domiciliarios</th>
                <th>Kilómetros</th>
                <th>Conducción</th>
                <th>Retraso</th>
                <th>Express</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => (
                <tr
                  key={p.metodo}
                  className={`${p.metodo === "kai" ? "rutas-fila-kai" : ""}${comparar === p.metodo ? " on" : ""}`}
                  onClick={() => (fase === "listo" ? setComparar(p.metodo) : undefined)}
                >
                  <td>{p.etiqueta}</td>
                  <td>{p.vehiculosUsados}</td>
                  <td>{km(p.km)}</td>
                  <td>{minLabel(p.horasConduccion * 60)}</td>
                  <td className={p.retrasoMin > 0 ? "rutas-mal" : "rutas-bien"}>
                    {p.retrasoMin > 0 ? `${Math.round(p.retrasoMin)} min` : "0"}
                  </td>
                  <td className={p.expressATiempo < p.expressTotal ? "rutas-mal" : "rutas-bien"}>
                    {p.expressATiempo}/{p.expressTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rutas-notas">
          <p className="rutas-nota">
            El ahorro de arriba se mide contra <strong>«{honesta.etiqueta}»</strong>, que usa los mismos{" "}
            {FLOTA.length} domiciliarios y entrega los {honesta.expressTotal} express a tiempo, igual que Kai. Frente a
            repartir por orden de llegada el ahorro sería del {pct(ahorroBruto)}, pero esa comparación es fácil: ese
            plan llega tarde a {Math.round(bruta.retrasoMin)} minutos de entregas.
          </p>
          <p className="rutas-supuestos">
            Supuestos en pantalla: moto {FLOTA[0].kmh} km/h, carro {FLOTA[3].kmh} km/h, furgón {FLOTA[5].kmh} km/h;{" "}
            {FLOTA[0].servicioMin}–{FLOTA[5].servicioMin} min por parada incluyendo aparcar; jornada 08:00–18:00;
            express antes de las {relojReparto(VENTANAS.express[1])}. Distancias reales de calle (OpenStreetMap vía
            OSRM, congeladas el {matriz.generada}).
          </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const MARCA: Record<Evento["marca"], string> = { run: "▸", ok: "✓", warn: "!", err: "✕" };

function rutasVacias(): Ruta[] {
  return FLOTA.map((v) => ({
    vehiculoId: v.id,
    seq: [],
    km: 0,
    minConduccion: 0,
    minServicio: 0,
    finMin: 0,
    kg: 0,
    litros: 0,
    retrasoMin: 0,
    llegadas: [],
  }));
}

function Kpi({ etiqueta, valor, pie, acento }: { etiqueta: string; valor: string; pie: string; acento?: boolean }) {
  return (
    <div className={`rutas-kpi${acento ? " rutas-kpi-acento" : ""}`}>
      <span className="panel-label">{etiqueta}</span>
      <strong>{valor}</strong>
      <span className="rutas-kpi-pie">{pie}</span>
    </div>
  );
}

function FichaDomiciliario({
  nombre,
  id,
  clase,
  placa,
  color,
  kgMax,
  litrosUtiles,
  ruta,
  esMoto,
  onCerrar,
  onResaltar,
}: {
  nombre: string;
  id: string;
  clase: string;
  placa: string;
  color: string;
  kgMax: number;
  litrosUtiles: number;
  ruta: Ruta;
  esMoto: boolean;
  onCerrar: () => void;
  onResaltar: (i: number | null) => void;
}) {
  const paradas = ruta.seq.map((i) => pedidos[i]);
  const enlace = enlaceGoogleMaps(DEPOSITO, paradas, esMoto ? "two-wheeler" : "driving");

  return (
    <div className="rutas-ficha" style={{ "--accent": color } as React.CSSProperties}>
      <div className="rutas-ficha-head">
        <div>
          <span className="panel-label">
            {id} · {clase} · {placa}
          </span>
          <h2>{nombre}</h2>
        </div>
        <button type="button" className="panel-close" onClick={onCerrar} aria-label="Cerrar ficha">
          ✕
        </button>
      </div>

      <div className="rutas-ficha-cifras">
        <div>
          <span className="panel-label">Paradas</span>
          <strong>{ruta.seq.length}</strong>
        </div>
        <div>
          <span className="panel-label">Recorrido</span>
          <strong>{km(ruta.km)}</strong>
        </div>
        <div>
          <span className="panel-label">Al volante</span>
          <strong>{minLabel(ruta.minConduccion)}</strong>
        </div>
        <div>
          <span className="panel-label">Termina</span>
          <strong>{relojReparto(ruta.finMin)}</strong>
        </div>
      </div>

      <div className="rutas-ficha-carga">
        <span className="panel-label">
          Carga · {kg(ruta.kg)} de {kg(kgMax)} · {litros(ruta.litros)} de {litros(Math.round(litrosUtiles))}
        </span>
        <span className="rutas-barra">
          <span style={{ width: `${Math.min(100, (ruta.litros / litrosUtiles) * 100)}%` }} />
        </span>
      </div>

      {enlace ? (
        <a className="rutas-gmaps" href={enlace} target="_blank" rel="noreferrer">
          Abrir la ruta completa en Google Maps
        </a>
      ) : (
        <p className="rutas-aviso">
          Esta ruta tiene más paradas de las que admite un enlace de Google Maps. La lista de abajo es la buena.
        </p>
      )}

      <ol className="rutas-paradas">
        <li className="rutas-parada rutas-parada-bodega">
          <span className="rutas-parada-num">0</span>
          <div>
            <strong>{DEPOSITO.nombre}</strong>
            <p>
              {DEPOSITO.via} {DEPOSITO.placa} · salida 08:00
            </p>
          </div>
        </li>
        {ruta.seq.map((i, orden) => {
          const p = pedidos[i];
          const cierra = VENTANAS[p.prioridad][1];
          const tarde = ruta.llegadas[orden] > cierra;
          return (
            <li
              key={p.id}
              className="rutas-parada"
              onMouseEnter={() => onResaltar(i)}
              onMouseLeave={() => onResaltar(null)}
            >
              <span className="rutas-parada-num">{orden + 1}</span>
              <div>
                <strong>
                  #{p.id} {p.cliente}
                </strong>
                <p>
                  {p.via} {p.placa} · {p.barrio}
                </p>
                <p className="rutas-parada-meta">
                  {p.categoria} · {kg(p.kg)} · {litros(p.litros)} ·{" "}
                  <span className={tarde ? "rutas-mal" : "rutas-bien"}>
                    llega {relojReparto(ruta.llegadas[orden])}
                  </span>{" "}
                  · {PRIORIDAD_ETIQUETA[p.prioridad].toLowerCase()} hasta {relojReparto(cierra)}
                </p>
              </div>
            </li>
          );
        })}
        <li className="rutas-parada rutas-parada-bodega">
          <span className="rutas-parada-num">↩</span>
          <div>
            <strong>Vuelta a la bodega</strong>
            <p>{relojReparto(ruta.finMin)}</p>
          </div>
        </li>
      </ol>

      <p className="rutas-ficha-pie">
        Distancia y tiempo calculados sobre {dec(ruta.km)} km reales de calle. El enlace de Google Maps respeta este
        mismo orden: no lo reordena.
      </p>
    </div>
  );
}
