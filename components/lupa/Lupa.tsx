"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PanelIngesta from "./PanelIngesta";
import PanelInforme from "./PanelInforme";
import { leerLibro, type ArchivoEntrada, type Incidencia } from "@/lib/lupa/ingesta";
import { auditar } from "@/lib/lupa/motor";
import type { Informe, Libro } from "@/lib/lupa/tipos";
import { adaptarMapeos, type HojaMapeo } from "./mapeo-vista";

/* ─────────────────────────────  LUPA  ─────────────────────────────
   La pantalla entera: arrastrar los ficheros, ver cómo se reconocen las
   columnas, mirar correr la auditoría y leer el informe.

   Cinco fases y ni una pantalla de carga: el paso de una a otra es lo que
   se narra. Y una decisión que parece un detalle y no lo es —los controles
   de reproducción (pausa, velocidad, repetir) NO están a la vista—: un
   botón de «2x» delata que lo que se ve es una animación y no un motor
   calculando. Viven detrás de la tecla «a», con una pista mínima abajo a
   la derecha para quien la conozca.
   ------------------------------------------------------------------ */

export type Fase = "espera" | "leyendo" | "mapeo" | "auditando" | "informe";

/** Los seis ficheros que se le dan al cliente. El atajo de emergencia los
    carga de `public/datos/` si arrastrarlos falla delante de la cámara. */
const EJEMPLO = [
  "01 Terceros.xlsx",
  "02 Compras.xlsx",
  "03 Ventas.xlsx",
  "04 Inventario.xlsx",
  "05 Banco.xlsx",
  "06 Politicas.xlsx",
];

/** Milisegundos por evento a 1x. Con ~100 eventos, la auditoría dura unos 18 s. */
const MS_POR_EVENTO = 180;

/** Lo que tarda en aparecer cada tarjeta de fichero. La lectura es más rápida
    que esto: la pausa existe para que se vea, no para simular trabajo. */
const MS_POR_ARCHIVO = 260;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Lupa() {
  const [fase, setFase] = useState<Fase>("espera");
  const [leidos, setLeidos] = useState(0);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [mapeos, setMapeos] = useState<HojaMapeo[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cursor, setCursor] = useState(0);
  const [velocidad, setVelocidad] = useState(1);
  const [pausa, setPausa] = useState(false);
  const [panelOculto, setPanelOculto] = useState(false);

  const velRef = useRef(velocidad);
  velRef.current = velocidad;
  const pausaRef = useRef(pausa);
  pausaRef.current = pausa;

  /* ── Leer los ficheros ── */

  const cargar = useCallback(async (entradas: ArchivoEntrada[]) => {
    setError(null);
    setFase("leyendo");
    setLeidos(0);
    // Un fotograma antes de bloquear el hilo con SheetJS, para que la pantalla
    // llegue a pintar la fase de lectura.
    await esperar(60);
    try {
      const r = leerLibro(entradas);
      setLibro(r.libro);
      setMapeos(adaptarMapeos(r.mapeos));
      setIncidencias(r.incidencias);
      for (let i = 1; i <= r.libro.archivos.length; i++) {
        setLeidos(i);
        await esperar(MS_POR_ARCHIVO);
      }
      await esperar(320);
      setFase("mapeo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFase("espera");
    }
  }, []);

  const soltarFicheros = useCallback(
    async (lista: FileList | File[]) => {
      const files = Array.from(lista);
      if (!files.length) return;
      const entradas = await Promise.all(
        files.map(async (f) => ({ nombre: f.name, bytes: await f.arrayBuffer() })),
      );
      cargar(entradas);
    },
    [cargar],
  );

  const cargarEjemplo = useCallback(async () => {
    const entradas = await Promise.all(
      EJEMPLO.map(async (nombre) => {
        const res = await fetch(`/datos/${encodeURIComponent(nombre)}`);
        if (!res.ok) throw new Error(`No está ${nombre} en public/datos/`);
        return { nombre, bytes: await res.arrayBuffer() };
      }),
    );
    cargar(entradas);
  }, [cargar]);

  /* ── Auditar ── */

  const auditarAhora = useCallback(() => {
    if (!libro) return;
    const inf = auditar(libro);
    setInforme(inf);
    setCursor(0);
    setPausa(false);
    setFase("auditando");
  }, [libro]);

  const eventos = informe?.eventos ?? [];

  useEffect(() => {
    if (fase !== "auditando" || !eventos.length) return;
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
          setFase("informe");
          return eventos.length - 1;
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

  const alFinal = useCallback(() => {
    if (!eventos.length) return;
    setCursor(eventos.length - 1);
    setFase("informe");
  }, [eventos.length]);

  const reiniciar = useCallback(() => {
    setFase("espera");
    setLibro(null);
    setInforme(null);
    setMapeos([]);
    setIncidencias([]);
    setLeidos(0);
    setCursor(0);
  }, []);

  /* ── El panel escondido: «a» lo abre, Escape lo cierra ── */

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const dentroDeCampo = e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName);
      if (dentroDeCampo) return;
      if (e.key === "a" || e.key === "A") setPanelOculto((p) => !p);
      if (e.key === "Escape") setPanelOculto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  const periodo = libro?.periodo ?? informe?.periodo ?? null;

  const estadoCabecera = useMemo(() => {
    if (fase === "espera") return "esperando ficheros";
    if (fase === "leyendo") return "leyendo";
    if (fase === "mapeo") return "columnas reconocidas";
    if (fase === "auditando") return `auditando · ${cursor + 1}/${eventos.length}`;
    return "informe listo";
  }, [fase, cursor, eventos.length]);

  return (
    <div className="lupa">
      <header className="lupa-top">
        <div className="lupa-marca">
          <h1>LUPA</h1>
          <p className="lupa-tagline">
            Auditor de fugas e incoherencias financieras. Lee las exportaciones de tu ERP y te dice, con la fila
            exacta delante, dónde se está yendo el dinero.
          </p>
        </div>

        <div className="lupa-contexto">
          <div className="lupa-dato">
            <span className="panel-label">Empresa</span>
            <strong>{libro?.empresa ?? "—"}</strong>
            <span className="lupa-dato-pie">{libro?.nit ?? "sin datos cargados"}</span>
          </div>
          <div className="lupa-dato">
            <span className="panel-label">Período</span>
            <strong>{periodo ? `${periodo.desde.slice(0, 7)} → ${periodo.hasta.slice(0, 7)}` : "—"}</strong>
            <span className="lupa-dato-pie">
              {libro ? `${libro.documentos.length.toLocaleString("es-CO")} documentos` : "18 meses de operación"}
            </span>
          </div>
          <div className="lupa-dato lupa-dato-estado">
            <span className="panel-label">Estado</span>
            <strong>
              <i className="dot" /> {estadoCabecera}
            </strong>
            <span className="lupa-dato-pie">
              {informe ? `motor: ${Math.round(informe.ms)} ms en el navegador` : "31 reglas en tres capas"}
            </span>
          </div>
        </div>

        <div className="lupa-firma">
          <span className="panel-label">Agente</span>
          <strong>Ruth Alcaraz</strong>
          <Link href="/oficina">Control de Costes ↗</Link>
        </div>
      </header>

      {fase === "espera" || fase === "leyendo" || fase === "mapeo" ? (
        <PanelIngesta
          fase={fase}
          libro={libro}
          leidos={leidos}
          mapeos={mapeos}
          incidencias={incidencias}
          error={error}
          onSoltar={soltarFicheros}
          onAuditar={auditarAhora}
        />
      ) : informe ? (
        <PanelInforme informe={informe} cursor={cursor} enVivo={fase === "auditando"} />
      ) : null}

      {panelOculto ? (
        <div className="lupa-mandos">
          <span className="panel-label">Mandos · «a» los oculta</span>
          <div className="lupa-mandos-fila">
            <button type="button" onClick={() => setPausa((p) => !p)} disabled={fase !== "auditando"}>
              {pausa ? "Seguir" : "Pausa"}
            </button>
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                type="button"
                className={velocidad === v ? "on" : ""}
                onClick={() => setVelocidad(v)}
              >
                {v}x
              </button>
            ))}
            <button type="button" onClick={alFinal} disabled={fase !== "auditando"}>
              Al final
            </button>
          </div>
          <div className="lupa-mandos-fila">
            <button type="button" onClick={cargarEjemplo}>
              Cargar los Excel de ejemplo
            </button>
            <button type="button" onClick={auditarAhora} disabled={!libro}>
              Auditar otra vez
            </button>
            <button type="button" onClick={reiniciar}>
              Empezar de cero
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="lupa-pista" onClick={() => setPanelOculto(true)} aria-label="Mandos">
          a
        </button>
      )}
    </div>
  );
}
