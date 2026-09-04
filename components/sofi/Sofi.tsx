"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AgentAvatar from "@/components/AgentAvatar";
import Onda from "./Onda";
import { COTIZACIONES, resumenLineas } from "@/lib/sofi/cotizaciones";
import { GUIONES } from "@/lib/sofi/guion";
import { LlamadaEnVivo } from "@/lib/sofi/envivo";
import { Reproductor, type Motor, type Oyente } from "@/lib/sofi/reproductor";
import { ROSTER, VOICE_CLOSER_ID } from "@/lib/roster";
import {
  ACCIONES,
  CAMPOS,
  RESULTADOS,
  haceTexto,
  pesos,
  pesosCortos,
  totalCotizacion,
  type Accion,
  type Campo,
  type Cierre,
  type Quien,
} from "@/lib/sofi/tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   El teléfono de Sofi. A la izquierda la cola de cotizaciones que nadie
   convirtió; en el centro la llamada (quién es, la onda, lo que se va
   diciendo); a la derecha lo que Sofi anota mientras habla y lo que deja
   agendado al colgar.

   La pantalla no sabe si la voz sale del guion grabado o del agente en vivo:
   los dos motores hablan por la misma interfaz `Oyente`. Y como en LUPA, los
   mandos que delatarían la grabación viven detrás de la tecla «a».
   ------------------------------------------------------------------ */

type Fase = "lista" | "marcando" | "en_llamada" | "colgada";
type Modo = "auto" | "vivo" | "muestra";

interface Linea {
  quien: Quien;
  texto: string;
  progreso?: number;
}

const CLAVE_MODO = "sofi-modo";

const estadosIniciales = () =>
  Object.fromEntries(COTIZACIONES.filter((c) => c.cerrada).map((c) => [c.id, c.cerrada as Cierre])) as Record<
    string,
    Cierre
  >;

const SOFI = ROSTER.find((a) => a.id === VOICE_CLOSER_ID)!;

export default function Sofi() {
  const [estados, setEstados] = useState<Record<string, Cierre>>(estadosIniciales);
  const [seleccion, setSeleccion] = useState(() => COTIZACIONES.find((c) => !c.cerrada)!.id);
  const [fase, setFase] = useState<Fase>("lista");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ficha, setFicha] = useState<Partial<Record<Campo, string>>>({});
  const [recien, setRecien] = useState<Campo | null>(null);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [hablando, setHablando] = useState<Quien | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [modo, setModo] = useState<Modo>("auto");
  const [vivoDisponible, setVivoDisponible] = useState<boolean | null>(null);
  const [timbre, setTimbre] = useState(true);
  const [panelOculto, setPanelOculto] = useState(false);

  const motorRef = useRef<Motor | null>(null);
  const cierreRef = useRef<Cierre | null>(null);
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;
  const estadosRef = useRef(estados);
  estadosRef.current = estados;

  const actual = useMemo(() => COTIZACIONES.find((c) => c.id === seleccion)!, [seleccion]);
  const pendientes = useMemo(() => COTIZACIONES.filter((c) => !estados[c.id]), [estados]);
  const hechas = useMemo(() => COTIZACIONES.filter((c) => estados[c.id]), [estados]);
  const sinCerrar = useMemo(() => pendientes.reduce((s, c) => s + totalCotizacion(c), 0), [pendientes]);
  const recuperado = useMemo(() => hechas.reduce((s, c) => s + (estados[c.id].monto ?? 0), 0), [hechas, estados]);
  const recuperadoAnimado = useContador(recuperado);

  /* ── ¿Hay voz en vivo? Se pregunta una vez al abrir. ── */

  useEffect(() => {
    fetch("/api/sofi/session")
      .then((r) => r.json())
      .then((j: { configurado?: boolean }) => setVivoDisponible(Boolean(j.configurado)))
      .catch(() => setVivoDisponible(false));
    try {
      const guardado = window.localStorage.getItem(CLAVE_MODO) as Modo | null;
      if (guardado === "vivo" || guardado === "muestra" || guardado === "auto") setModo(guardado);
    } catch {
      /* sin almacenamiento: se queda en automático */
    }
  }, []);

  const elegirModo = useCallback((m: Modo) => {
    setModo(m);
    try {
      window.localStorage.setItem(CLAVE_MODO, m);
    } catch {
      /* da igual */
    }
  }, []);

  /* ── Reloj de la llamada ── */

  useEffect(() => {
    if (fase !== "en_llamada") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [fase]);

  /* ── El destello de «recién anotado» dura un momento ── */

  useEffect(() => {
    if (!recien) return;
    const t = setTimeout(() => setRecien(null), 1500);
    return () => clearTimeout(t);
  }, [recien]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ── Colgar: se apunta el resultado y la pantalla se queda en él, con la
        ficha llena, hasta que quien presenta pasa a la siguiente. ── */

  const terminar = useCallback(() => {
    motorRef.current = null;
    setHablando(null);
    setFase("colgada");
    const c = cierreRef.current;
    if (c) setEstados((prev) => ({ ...prev, [seleccionRef.current]: c }));
  }, []);

  const limpiar = useCallback(() => {
    setLineas([]);
    setFicha({});
    setAcciones([]);
    setCierre(null);
    cierreRef.current = null;
    setSegundos(0);
  }, []);

  /** Elegir otra cotización de la cola: borra lo de la anterior. */
  const elegir = useCallback(
    (id: string) => {
      if (motorRef.current) return;
      limpiar();
      setSeleccion(id);
      setFase("lista");
    },
    [limpiar],
  );

  const siguiente = useCallback(() => {
    const pend = COTIZACIONES.filter((x) => !estadosRef.current[x.id]);
    if (!pend.length) return;
    const i = pend.findIndex((x) => x.id === seleccionRef.current);
    elegir(pend[(i + 1) % pend.length]?.id ?? pend[0].id);
  }, [elegir]);

  const proxima = useMemo(() => {
    const i = pendientes.findIndex((x) => x.id === seleccion);
    return pendientes[(i + 1) % Math.max(1, pendientes.length)] ?? pendientes[0] ?? null;
  }, [pendientes, seleccion]);

  const llamar = useCallback(async () => {
    if (motorRef.current) return;
    const c = COTIZACIONES.find((x) => x.id === seleccionRef.current);
    if (!c) return;

    limpiar();
    setAviso(null);

    const oyente: Oyente = {
      onFase: (f) => (f === "colgada" ? terminar() : setFase(f)),
      onTurno: (t) =>
        setLineas((prev) => {
          const ultimo = prev[prev.length - 1];
          if (ultimo && ultimo.quien === t.quien && ultimo.texto === t.texto) return [...prev.slice(0, -1), t];
          return [...prev.slice(-5), t];
        }),
      onEvento: (e) => {
        if (e.tipo === "dato") {
          setFicha((f) => ({ ...f, [e.dato.campo]: e.dato.valor }));
          setRecien(e.dato.campo);
        } else if (e.tipo === "accion") {
          setAcciones((a) => [...a, e.accion]);
        } else {
          setCierre(e.cierre);
          cierreRef.current = e.cierre;
        }
      },
      onHablando: setHablando,
      onError: (m) => setAviso(m),
    };

    const guion = GUIONES[c.id];
    const usarMuestra = modo === "muestra" || (modo === "auto" && !vivoDisponible);

    if (usarMuestra && !guion) {
      setAviso("La llamada grabada es la de Sancho Paisa. A los demás solo se les puede llamar en vivo.");
      return;
    }

    const motor: Motor = usarMuestra ? new Reproductor(guion, oyente, { timbre }) : new LlamadaEnVivo(c.id, oyente);
    motorRef.current = motor;
    try {
      await motor.iniciar();
    } catch (e) {
      motorRef.current = null;
      if (!usarMuestra && guion) {
        // Sin conexión en vivo delante de la cámara: que suene la grabada.
        setAviso("La voz en vivo no respondió: suena la llamada grabada.");
        const respaldo = new Reproductor(guion, oyente, { timbre });
        motorRef.current = respaldo;
        respaldo.iniciar().catch(() => terminar());
      } else {
        setAviso(e instanceof Error ? e.message : String(e));
        terminar();
      }
    }
  }, [modo, vivoDisponible, timbre, terminar, limpiar]);

  const colgar = useCallback(() => {
    motorRef.current?.colgar();
  }, []);

  const reiniciar = useCallback(() => {
    motorRef.current?.colgar();
    motorRef.current = null;
    setEstados(estadosIniciales());
    limpiar();
    setSeleccion(COTIZACIONES.find((c) => !c.cerrada)!.id);
    setFase("lista");
  }, [limpiar]);

  /* ── «a» abre los mandos, Escape los cierra ── */

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "a" || e.key === "A") setPanelOculto((p) => !p);
      if (e.key === "Escape") setPanelOculto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  const frecuencias = useCallback(() => motorRef.current?.frecuencias() ?? null, []);

  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  const estadoTexto =
    fase === "marcando"
      ? "marcando…"
      : fase === "en_llamada"
        ? hablando === "sofi"
          ? `hablando · ${reloj}`
          : `escuchando · ${reloj}`
        : fase === "colgada"
          ? `colgó · ${reloj}`
          : pendientes.length
            ? "lista para llamar"
            : "no queda nadie por llamar";

  const nombrePila = actual.contacto.split(" ")[0];
  const enCurso = fase === "marcando" || fase === "en_llamada";

  return (
    <div className={`sofi fase-${fase}`}>
      <header className="sofi-top">
        <div className="sofi-marca">
          <h1>SOFI</h1>
          <p className="sofi-tagline">
            Llama a quien pidió una cotización y nunca compró. Cuelga con el pedido cerrado y la ficha del cliente
            llena.
          </p>
        </div>

        <div className="sofi-cifras">
          <div className="sofi-cifra">
            <span className="panel-label">Cotizaciones frías</span>
            <strong>{pendientes.length}</strong>
            <span className="sofi-cifra-pie">{pesosCortos(sinCerrar)} sin cerrar</span>
          </div>
          <div className="sofi-cifra sofi-cifra-plata">
            <span className="panel-label">Recuperado hoy</span>
            <strong>{pesos(recuperadoAnimado)}</strong>
            <span className="sofi-cifra-pie">
              {hechas.length} {hechas.length === 1 ? "llamada" : "llamadas"}
            </span>
          </div>
          <div className="sofi-cifra sofi-cifra-estado">
            <span className="panel-label">Sofi</span>
            <strong>
              <i className="dot" /> {estadoTexto}
            </strong>
            <span className="sofi-cifra-pie">Distribuidora Andina · Medellín</span>
          </div>
        </div>

        <div className="sofi-firma">
          <span className="panel-label">Agente</span>
          <strong>{SOFI.name}</strong>
          <Link href="/oficina">Ventas ↗</Link>
        </div>
      </header>

      <main className="sofi-stage">
        {/* ── La cola ── */}
        <aside className="sofi-cola">
          <div className="sofi-cola-cab">
            <h3>Sin cerrar</h3>
            <span>{pendientes.length}</span>
          </div>
          <ul className="sofi-lista">
            {pendientes.map((c) => (
              <li key={c.id} className={c.id === seleccion ? "activa" : undefined}>
                <button type="button" disabled={enCurso} onClick={() => elegir(c.id)}>
                  <span className="sofi-item-negocio">{c.negocio}</span>
                  <span className="sofi-item-meta">
                    {c.contacto} · {c.hace} días
                  </span>
                  <span className="sofi-item-total">{pesos(totalCotizacion(c))}</span>
                  {GUIONES[c.id] && c.id === seleccion && enCurso && <i className="sofi-item-punto" />}
                </button>
              </li>
            ))}
          </ul>

          <div className="sofi-cola-cab sofi-cola-cab-hechas">
            <h3>Llamadas hoy</h3>
            <span>{hechas.length}</span>
          </div>
          <ul className="sofi-lista sofi-lista-hechas">
            {hechas.map((c) => {
              const r = RESULTADOS[estados[c.id].resultado];
              return (
                <li key={c.id} className={`tono-${r.tono}`}>
                  <span className="sofi-item-negocio">{c.negocio}</span>
                  <span className="sofi-item-chip">
                    {r.etiqueta}
                    {estados[c.id].monto ? ` · ${pesos(estados[c.id].monto!)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── La llamada ── */}
        <section className="sofi-llamada">
          <div className="sofi-sofi">
            <AgentAvatar
              palette={SOFI.palette}
              mode={fase === "en_llamada" ? (hablando === "sofi" ? "sync" : "think") : "work"}
              size={58}
            />
            <div className="sofi-sofi-texto">
              <strong>Sofi</strong>
              <span className={`sofi-sofi-estado ${fase}`}>
                <i className="dot" />
                {estadoTexto}
              </span>
            </div>
          </div>

          <div className="sofi-centro">
            <div className="sofi-quien">
              <h2>{actual.negocio}</h2>
              <p className="sofi-contacto">
                {actual.contacto}, {actual.cargo.toLowerCase()} · {actual.barrio}
              </p>
              <p className="sofi-cotizo">
                <strong>{pesos(totalCotizacion(actual))}</strong> cotizados {haceTexto(actual.hace)} por{" "}
                {actual.canal === "Llamada" ? "teléfono" : actual.canal}. No volvió a escribir.
              </p>
              <p className="sofi-lineas">{resumenLineas(actual)}</p>
            </div>

            <Onda frecuencias={frecuencias} activa={fase === "en_llamada"} />

            <div className="sofi-subs" aria-live="polite">
              {lineas.length === 0 ? (
                <p className="sofi-subs-vacio">
                  {fase === "marcando"
                    ? "Timbrando…"
                    : fase === "lista"
                      ? "Al llamar, aquí se lee lo que van diciendo. La ficha de la derecha se llena sola."
                      : ""}
                </p>
              ) : null}
              {lineas.slice(-3).map((l, i, arr) => (
                <p
                  key={`${arr.length - i}-${l.texto.slice(0, 24)}`}
                  className={`sofi-sub ${l.quien} ${i === arr.length - 1 ? "actual" : "pasada"}`}
                >
                  <span className="sofi-sub-quien">{l.quien === "sofi" ? "Sofi" : nombrePila}</span>
                  <Palabras texto={l.texto} progreso={l.progreso} />
                </p>
              ))}
            </div>

            {fase === "colgada" && cierre ? (
              <div className={`sofi-cierre tono-${RESULTADOS[cierre.resultado].tono}`}>
                <strong>
                  {RESULTADOS[cierre.resultado].etiqueta}
                  {cierre.monto ? ` · ${pesos(cierre.monto)}` : ""}
                </strong>
                <span>{cierre.resumen}</span>
              </div>
            ) : null}

            <div className="sofi-boton">
              {fase === "lista" ? (
                <button type="button" className="sofi-llamar" onClick={llamar} disabled={!pendientes.length}>
                  <Telefono /> Llamar a {actual.trato}
                </button>
              ) : fase === "colgada" ? (
                proxima && proxima.id !== seleccion ? (
                  <button type="button" className="sofi-siguiente" onClick={siguiente}>
                    Pasar a la siguiente · {proxima.trato}
                  </button>
                ) : (
                  <span className="sofi-colgado">No queda nadie por llamar</span>
                )
              ) : (
                <button type="button" className="sofi-colgar" onClick={colgar}>
                  <Telefono colgar /> Colgar
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── La ficha ── */}
        <aside className="sofi-ficha">
          <section className="sofi-bloque">
            <h3>Lo que Sofi va anotando</h3>
            <dl className="sofi-campos">
              {CAMPOS.map((cmp) => {
                const valor = ficha[cmp.id];
                return (
                  <div
                    key={cmp.id}
                    className={`sofi-campo${valor ? " lleno" : ""}${recien === cmp.id ? " recien" : ""}`}
                  >
                    <dt>{cmp.titulo}</dt>
                    <dd>{valor ?? <span className="sofi-vacio">—</span>}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="sofi-bloque">
            <h3>Queda agendado</h3>
            {acciones.length === 0 ? (
              <p className="sofi-ficha-vacio">
                {enCurso ? "Se va llenando mientras hablan." : "Cada compromiso de la llamada aparece aquí con su hora."}
              </p>
            ) : (
              <ol className="sofi-acciones">
                {acciones.map((a, i) => (
                  <li key={`${a.tipo}-${i}`} className={`sofi-accion tipo-${a.tipo}`}>
                    <span className="sofi-accion-tipo">{ACCIONES[a.tipo]}</span>
                    <span className="sofi-accion-cuando">{a.cuando}</span>
                    <span className="sofi-accion-detalle">{a.detalle}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </main>

      {aviso && (
        <button type="button" className="sofi-aviso" onClick={() => setAviso(null)}>
          {aviso}
        </button>
      )}

      {panelOculto ? (
        <div className="sofi-mandos">
          <span className="panel-label">Mandos · «a» los oculta</span>
          <div className="sofi-mandos-fila">
            <button type="button" className={modo === "auto" ? "on" : ""} onClick={() => elegirModo("auto")}>
              Automático
            </button>
            <button
              type="button"
              className={modo === "vivo" ? "on" : ""}
              disabled={!vivoDisponible}
              onClick={() => elegirModo("vivo")}
            >
              En vivo
            </button>
            <button type="button" className={modo === "muestra" ? "on" : ""} onClick={() => elegirModo("muestra")}>
              Llamada grabada
            </button>
          </div>
          <div className="sofi-mandos-fila">
            <button type="button" onClick={() => setTimbre((t) => !t)}>
              Timbre: {timbre ? "sí" : "no"}
            </button>
            <button type="button" onClick={reiniciar}>
              Reiniciar el día
            </button>
          </div>
          <p className="sofi-mandos-nota">
            {vivoDisponible === null
              ? "comprobando la voz en vivo…"
              : vivoDisponible
                ? "voz en vivo lista (ElevenLabs)"
                : "sin llave de ElevenLabs: solo la llamada grabada"}
          </p>
        </div>
      ) : (
        <button type="button" className="sofi-pista" onClick={() => setPanelOculto(true)} aria-label="Mandos">
          a
        </button>
      )}
    </div>
  );
}

/** Las palabras se van encendiendo al ritmo del audio. Sin progreso (en
    vivo) se muestran todas de una vez. */
function Palabras({ texto, progreso }: { texto: string; progreso?: number }) {
  const palabras = texto.split(" ");
  const visibles = progreso === undefined ? palabras.length : Math.ceil(palabras.length * Math.min(1, progreso));
  return (
    <span className="sofi-sub-texto">
      {palabras.map((p, i) => (
        <span key={i} className={`sofi-palabra${i < visibles ? " vista" : ""}`}>
          {p}{" "}
        </span>
      ))}
    </span>
  );
}

function Telefono({ colgar }: { colgar?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={colgar ? { transform: "rotate(135deg)" } : undefined}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/** Un número que se desliza hasta su nuevo valor en vez de saltar. */
function useContador(valor: number) {
  const [mostrado, setMostrado] = useState(valor);
  const desdeRef = useRef(valor);
  useEffect(() => {
    const desde = desdeRef.current;
    if (desde === valor) return;
    const inicio = performance.now();
    const dur = 1100;
    let raf = 0;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setMostrado(Math.round(desde + (valor - desde) * e));
      if (t < 1) raf = requestAnimationFrame(paso);
      else desdeRef.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return mostrado;
}
