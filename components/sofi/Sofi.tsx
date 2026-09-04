"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Onda from "./Onda";
import { COTIZACIONES, resumenLineas } from "@/lib/sofi/cotizaciones";
import { LlamadaEnVivo } from "@/lib/sofi/envivo";
import type { Motor, Oyente } from "@/lib/sofi/motor";
import {
  ACCIONES,
  CAMPOS,
  RESULTADOS,
  haceTexto,
  pesos,
  totalCotizacion,
  type Accion,
  type Campo,
  type Cierre,
  type Quien,
} from "@/lib/sofi/tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   El teléfono de Sofi, en la misma línea sobria del centro de cobros:
   fondo claro, tres tarjetas blancas y una sola tinta. A la izquierda la
   cola de clientes que pidieron precio y no volvieron; en el centro la
   llamada (a quién, la onda, lo que se va diciendo); a la derecha lo que
   Sofi anota mientras habla y lo que deja agendado al colgar.

   Aquí no hay demostración enlatada: lo que suena es una llamada de verdad
   con ElevenLabs y quien contesta es quien esté delante del micrófono. Al
   colgar, Sofi pasa sola a la siguiente de la lista y vuelve a marcar. Los
   mandos viven detrás de la tecla «a».
   ------------------------------------------------------------------ */

type Fase = "lista" | "marcando" | "en_llamada" | "colgada";

interface Linea {
  quien: Quien;
  texto: string;
}

const CLAVE_LLAVE = "sofi-llave-elevenlabs";
/** Cuánto se queda el resultado en pantalla antes de pasar al siguiente. */
const MOSTRAR_RESULTADO = 5000;
/** Y cuánto respira Sofi entre una llamada y la otra. */
const ENTRE_LLAMADAS = 5;

const estadosIniciales = () =>
  Object.fromEntries(COTIZACIONES.filter((c) => c.cerrada).map((c) => [c.id, c.cerrada as Cierre])) as Record<
    string,
    Cierre
  >;

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

  const [servidorConLlave, setServidorConLlave] = useState<boolean | null>(null);
  const [llave, setLlave] = useState("");
  const [timbre, setTimbre] = useState(true);
  const [encadenar, setEncadenar] = useState(true);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [panelOculto, setPanelOculto] = useState(false);

  const motorRef = useRef<Motor | null>(null);
  const cierreRef = useRef<Cierre | null>(null);
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;

  const hayVoz = servidorConLlave === null ? null : servidorConLlave || llave.trim().length > 0;

  const actual = useMemo(() => COTIZACIONES.find((c) => c.id === seleccion)!, [seleccion]);
  const pendientes = useMemo(() => COTIZACIONES.filter((c) => !estados[c.id]), [estados]);
  const hechas = useMemo(() => COTIZACIONES.filter((c) => estados[c.id]), [estados]);
  const sinCerrar = useMemo(() => pendientes.reduce((s, c) => s + totalCotizacion(c), 0), [pendientes]);
  const recuperado = useMemo(() => hechas.reduce((s, c) => s + (estados[c.id].monto ?? 0), 0), [hechas, estados]);
  const recuperadoAnimado = useContador(recuperado);

  /** La siguiente de la cola después de la que está en pantalla. */
  const proxima = useMemo(() => {
    if (!pendientes.length) return null;
    const i = COTIZACIONES.findIndex((c) => c.id === seleccion);
    return pendientes.find((c) => COTIZACIONES.indexOf(c) > i) ?? pendientes[0];
  }, [pendientes, seleccion]);

  /* ── ¿Hay llave para llamar? Se pregunta una vez al abrir. ── */

  useEffect(() => {
    fetch("/api/sofi/session")
      .then((r) => r.json())
      .then((j: { configurado?: boolean }) => setServidorConLlave(Boolean(j.configurado)))
      .catch(() => setServidorConLlave(false));
    try {
      // Una llave guardada que no empiece por «sk_» es la ID, no la llave: se
      // tira en vez de dejar que reviente la llamada.
      const guardada = window.localStorage.getItem(CLAVE_LLAVE) ?? "";
      if (guardada && !guardada.startsWith("sk_")) window.localStorage.removeItem(CLAVE_LLAVE);
      else setLlave(guardada);
    } catch {
      /* sin almacenamiento: se pide la llave cada vez */
    }
  }, []);

  const guardarLlave = useCallback((v: string) => {
    setLlave(v);
    try {
      if (v.trim()) window.localStorage.setItem(CLAVE_LLAVE, v.trim());
      else window.localStorage.removeItem(CLAVE_LLAVE);
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
        ficha llena, hasta que pasa a la siguiente. ── */

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

  /** Poner a otra persona en la cabina: borra lo de la anterior. */
  const elegir = useCallback(
    (id: string) => {
      if (motorRef.current) return;
      setCuenta(null);
      limpiar();
      setSeleccion(id);
      setFase("lista");
    },
    [limpiar],
  );

  const llamar = useCallback(async () => {
    if (motorRef.current) return;
    const c = COTIZACIONES.find((x) => x.id === seleccionRef.current);
    if (!c) return;

    setCuenta(null);
    limpiar();
    setAviso(null);

    const oyente: Oyente = {
      onFase: (f) => (f === "colgada" ? terminar() : setFase(f)),
      onTurno: (t) =>
        setLineas((prev) => {
          const ultimo = prev[prev.length - 1];
          if (ultimo && ultimo.quien === t.quien && ultimo.texto === t.texto) return prev;
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

    const motor = new LlamadaEnVivo(c.id, oyente, { timbre, llave: servidorConLlave ? undefined : llave.trim() });
    motorRef.current = motor;
    try {
      await motor.iniciar();
    } catch (e) {
      motorRef.current = null;
      setAviso(e instanceof Error ? e.message : String(e));
      terminar();
    }
  }, [servidorConLlave, llave, timbre, terminar, limpiar]);

  const colgar = useCallback(() => {
    motorRef.current?.colgar();
  }, []);

  const siguiente = useCallback(() => {
    if (proxima) elegir(proxima.id);
  }, [proxima, elegir]);

  /* ── Sofi no espera a que le digan: al colgar pasa a la siguiente y
        vuelve a marcar. Se puede parar en cualquier momento. ── */

  useEffect(() => {
    if (fase !== "colgada" || !encadenar || !proxima || proxima.id === seleccion) return;
    const t = setTimeout(() => {
      elegir(proxima.id);
      setCuenta(ENTRE_LLAMADAS);
    }, MOSTRAR_RESULTADO);
    return () => clearTimeout(t);
  }, [fase, encadenar, proxima, seleccion, elegir]);

  useEffect(() => {
    if (cuenta === null) return;
    if (cuenta <= 0) {
      setCuenta(null);
      void llamar();
      return;
    }
    const t = setTimeout(() => setCuenta((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cuenta, llamar]);

  const reiniciar = useCallback(() => {
    motorRef.current?.colgar();
    motorRef.current = null;
    setCuenta(null);
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
  const estadoLlamada =
    fase === "marcando"
      ? `Marcando al ${actual.telefono}…`
      : fase === "en_llamada"
        ? hablando === "sofi"
          ? `Sofi hablando · ${reloj}`
          : `Escuchando · ${reloj}`
        : fase === "colgada"
          ? `Llamada terminada · ${reloj}`
          : "Lista para llamar";

  const nombrePila = actual.contacto.split(" ")[0];
  const enCurso = fase === "marcando" || fase === "en_llamada";

  return (
    <div className={`sofi fase-${fase}`}>
      <header className="sofi-top">
        <div className="sofi-marca">
          <div className="sofi-logo">DA</div>
          <div>
            <div className="sofi-marca-nombre">Distribuidora Andina</div>
            <div className="sofi-marca-sub">Sofi · Recuperación de cotizaciones</div>
          </div>
        </div>

        <div className="sofi-cifras">
          <div className="sofi-cifra">
            <div className="sofi-cifra-label">Por llamar</div>
            <div className="sofi-cifra-valor">{pendientes.length}</div>
          </div>
          <div className="sofi-cifra">
            <div className="sofi-cifra-label">Sin cerrar</div>
            <div className="sofi-cifra-valor">{pesos(sinCerrar)}</div>
          </div>
          <div className="sofi-cifra">
            <div className="sofi-cifra-label">Recuperado hoy</div>
            <div className="sofi-cifra-valor sofi-cifra-plata">{pesos(recuperadoAnimado)}</div>
          </div>
          <div className="sofi-cifra">
            <div className="sofi-cifra-label">Llamadas</div>
            <div className="sofi-cifra-valor">{hechas.length}</div>
          </div>
          <div className="sofi-vivo">
            <span className={`sofi-punto${enCurso ? " activo" : ""}`} /> {enCurso ? "En llamada" : "En línea"}
          </div>
        </div>
      </header>

      <main className="sofi-main">
        {/* ── La cola ── */}
        <section className="sofi-tarjeta sofi-cola">
          <div className="sofi-tarjeta-cab">
            <h2>Cotizaron y no volvieron</h2>
            <span className="sofi-cuenta">{pendientes.length}</span>
          </div>
          <div className="sofi-cols">
            <span>Cliente</span>
            <span>Negocio</span>
            <span className="der">Cotizado</span>
            <span className="cen">Hace</span>
          </div>
          <ul className="sofi-lista">
            {pendientes.map((c) => (
              <li key={c.id} className={c.id === seleccion ? "activa" : undefined}>
                <button type="button" disabled={enCurso} onClick={() => elegir(c.id)}>
                  <span className="sofi-item-negocio">
                    {c.contacto}
                    <small>{c.telefono}</small>
                  </span>
                  <span className="sofi-item-contacto">
                    {c.negocio}
                    <small>
                      {c.tipo} · {c.barrio}
                    </small>
                  </span>
                  <span className="sofi-item-total">{pesos(totalCotizacion(c))}</span>
                  <span className="sofi-item-dias">{c.hace} d</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="sofi-tarjeta-cab sofi-cab-hechas">
            <h2>Llamadas de hoy</h2>
            <span className="sofi-cuenta">{hechas.length}</span>
          </div>
          <ul className="sofi-lista sofi-hechas">
            {hechas.map((c) => {
              const r = RESULTADOS[estados[c.id].resultado];
              return (
                <li key={c.id}>
                  <span className="sofi-item-negocio">
                    {c.contacto}
                    <small>{estados[c.id].resumen}</small>
                  </span>
                  <span className={`sofi-chip tono-${r.tono}`}>
                    {r.etiqueta}
                    {estados[c.id].monto ? ` · ${pesos(estados[c.id].monto!)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── La llamada ── */}
        <section className="sofi-tarjeta sofi-llamada">
          <div className="sofi-tarjeta-cab">
            <h2>Cabina de llamada</h2>
            <span className="sofi-agente">Agente · Sofi</span>
          </div>

          <div className="sofi-centro">
            <div className="sofi-estado">{estadoLlamada}</div>

            <div className={`sofi-telefono ${fase}`}>
              <span className="sofi-anillo" />
              <span className="sofi-anillo a2" />
              <span className="sofi-anillo a3" />
              <Telefono colgar={fase === "colgada"} />
            </div>

            <h3 className="sofi-negocio">{actual.contacto}</h3>
            <p className="sofi-contacto">
              {actual.cargo} de {actual.negocio} · {actual.barrio}
            </p>
            <p className="sofi-cotizo">
              Cotizó <strong>{pesos(totalCotizacion(actual))}</strong> {haceTexto(actual.hace)} por{" "}
              {actual.canal === "Llamada" ? "teléfono" : actual.canal} y no volvió a escribir.
            </p>
            <p className="sofi-lineas">{resumenLineas(actual)}</p>

            <Onda frecuencias={frecuencias} activa={fase === "en_llamada"} color="#111111" colorReposo="#d9d9de" />

            <div className="sofi-subs" aria-live="polite">
              <div className="sofi-subs-hilo">
                {lineas.length === 0 && fase !== "en_llamada" ? (
                  <p className="sofi-subs-vacio">
                    {hayVoz === false
                      ? "Falta la llave de ElevenLabs: pulsa «a» y pégala para poder llamar."
                      : "Al llamar, contestas tú por el micrófono. Aquí se lee lo que van diciendo y la ficha de la derecha se llena sola."}
                  </p>
                ) : null}
                {lineas.slice(-3).map((l, i, arr) => (
                  <p
                    key={`${arr.length - i}-${l.texto.slice(0, 24)}`}
                    className={`sofi-sub ${l.quien} ${i === arr.length - 1 ? "actual" : "pasada"}`}
                  >
                    <span className="sofi-sub-quien">{l.quien === "sofi" ? "Sofi" : nombrePila}</span>
                    <span className="sofi-sub-texto">{l.texto}</span>
                  </p>
                ))}
              </div>
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
              {cuenta !== null ? (
                <div className="sofi-cuenta-atras">
                  <button type="button" className="sofi-btn sofi-llamar" onClick={() => void llamar()}>
                    Llamando a {actual.trato} en {cuenta}…
                  </button>
                  <button type="button" className="sofi-parar" onClick={() => setCuenta(null)}>
                    Parar
                  </button>
                </div>
              ) : fase === "lista" ? (
                <button
                  type="button"
                  className="sofi-btn sofi-llamar"
                  onClick={() => void llamar()}
                  disabled={!pendientes.length || hayVoz === false}
                >
                  Llamar a {actual.trato}
                </button>
              ) : fase === "colgada" ? (
                proxima && proxima.id !== seleccion ? (
                  <button type="button" className="sofi-btn sofi-siguiente" onClick={siguiente}>
                    Pasar a {proxima.trato}
                  </button>
                ) : (
                  <span className="sofi-colgado">No queda nadie por llamar</span>
                )
              ) : (
                <button type="button" className="sofi-btn sofi-colgar" onClick={colgar}>
                  Colgar
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── La ficha ── */}
        <section className="sofi-tarjeta sofi-ficha">
          <div className="sofi-tarjeta-cab">
            <h2>Lo que Sofi va anotando</h2>
            <span className="sofi-cuenta">
              {Object.keys(ficha).length}/{CAMPOS.length}
            </span>
          </div>
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

          <div className="sofi-tarjeta-cab sofi-cab-agenda">
            <h2>Queda agendado</h2>
            <span className="sofi-cuenta">{acciones.length}</span>
          </div>
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
          <Link className="sofi-oficina" href="/oficina">
            Ver a Sofi en la oficina
          </Link>
        </section>
      </main>

      {aviso && (
        <button type="button" className="sofi-aviso" onClick={() => setAviso(null)}>
          {aviso}
        </button>
      )}

      {panelOculto ? (
        <div className="sofi-mandos">
          <div className="sofi-mandos-titulo">Mandos · «a» los oculta</div>
          <div className="sofi-mandos-fila">
            <button type="button" className={encadenar ? "on" : ""} onClick={() => setEncadenar((e) => !e)}>
              Encadenar llamadas: {encadenar ? "sí" : "no"}
            </button>
            <button type="button" onClick={() => setTimbre((t) => !t)}>
              Timbre: {timbre ? "sí" : "no"}
            </button>
            <button type="button" onClick={reiniciar}>
              Reiniciar el día
            </button>
          </div>
          {servidorConLlave === false ? (
            <label className="sofi-mandos-llave">
              <span>Llave de ElevenLabs (se guarda solo en este navegador)</span>
              <input
                type="password"
                value={llave}
                placeholder="sk_…"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => guardarLlave(e.target.value)}
              />
            </label>
          ) : null}
          <p className="sofi-mandos-nota">
            {hayVoz === null
              ? "Comprobando la línea…"
              : hayVoz
                ? servidorConLlave
                  ? "Línea lista (llave del servidor). Contestas tú por el micrófono."
                  : "Línea lista con tu llave. Contestas tú por el micrófono."
                : "Sin llave de ElevenLabs no hay llamada: pégala aquí arriba."}
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

function Telefono({ colgar }: { colgar?: boolean }) {
  return (
    <svg
      className="sofi-telefono-icono"
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
